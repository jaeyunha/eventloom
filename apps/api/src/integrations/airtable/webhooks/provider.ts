export interface AirtableWebhookSpecification {
  readonly options: {
    readonly filters: Record<string, unknown>;
  };
}

export interface AirtableWebhookProviderRegistration {
  id: string;
  macSecret: string;
  expiresAt: string;
}

export interface AirtableWebhookProvider {
  create(input: {
    credential: string;
    baseId: string;
    notificationUrl: string;
    specification: AirtableWebhookSpecification;
  }): Promise<AirtableWebhookProviderRegistration>;
  refresh(input: {
    credential: string;
    baseId: string;
    webhookId: string;
  }): Promise<{ expiresAt: string }>;
  delete(input: { credential: string; baseId: string; webhookId: string }): Promise<void>;
}

export class AirtableWebhookProviderError extends Error {
  constructor(
    readonly operation: "create" | "refresh" | "delete",
    readonly status: number,
    message = `Airtable webhook ${operation} failed (${status}).`,
  ) {
    super(message);
    this.name = "AirtableWebhookProviderError";
  }

  get requiresRecreation(): boolean {
    return this.operation === "refresh" && (this.status === 404 || this.status === 410);
  }
}

export interface AirtableHttpWebhookProviderOptions {
  fetch?: typeof fetch;
  apiOrigin?: string;
}

export class AirtableHttpWebhookProvider implements AirtableWebhookProvider {
  private readonly fetcher: typeof fetch;
  private readonly apiOrigin: string;

  constructor(options: AirtableHttpWebhookProviderOptions = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.apiOrigin = (options.apiOrigin ?? "https://api.airtable.com").replace(/\/$/, "");
  }

  async create(input: {
    credential: string;
    baseId: string;
    notificationUrl: string;
    specification: AirtableWebhookSpecification;
  }): Promise<AirtableWebhookProviderRegistration> {
    const response = await this.request(
      "create",
      `/v0/bases/${encodeURIComponent(input.baseId)}/webhooks`,
      input.credential,
      {
        method: "POST",
        body: JSON.stringify({
          notificationUrl: input.notificationUrl,
          specification: input.specification,
        }),
      },
    );
    const body = await jsonObject(response);
    return {
      id: requiredString(body, "id"),
      macSecret: requiredString(body, "macSecretBase64"),
      expiresAt: requiredTimestamp(body, "expirationTime"),
    };
  }

  async refresh(input: {
    credential: string;
    baseId: string;
    webhookId: string;
  }): Promise<{ expiresAt: string }> {
    const response = await this.request(
      "refresh",
      `/v0/bases/${encodeURIComponent(input.baseId)}/webhooks/${encodeURIComponent(input.webhookId)}/refresh`,
      input.credential,
      { method: "POST" },
    );
    const body = await jsonObject(response);
    return { expiresAt: requiredTimestamp(body, "expirationTime") };
  }

  async delete(input: { credential: string; baseId: string; webhookId: string }): Promise<void> {
    await this.request(
      "delete",
      `/v0/bases/${encodeURIComponent(input.baseId)}/webhooks/${encodeURIComponent(input.webhookId)}`,
      input.credential,
      { method: "DELETE" },
    );
  }

  private async request(
    operation: "create" | "refresh" | "delete",
    path: string,
    credential: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${credential}`);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await this.fetcher(`${this.apiOrigin}${path}`, { ...init, headers });
    if (!response.ok) throw new AirtableWebhookProviderError(operation, response.status);
    return response;
  }
}

async function jsonObject(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as unknown;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Airtable returned an invalid webhook response.");
  }
  return body as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Airtable webhook response is missing ${key}.`);
  }
  return value;
}

function requiredTimestamp(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Airtable webhook response has an invalid ${key}.`);
  }
  return value;
}
