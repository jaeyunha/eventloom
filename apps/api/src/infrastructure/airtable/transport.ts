import type {
  AirtableQueryValue,
  AirtableRequest,
  AirtableResponse,
  AirtableTransport,
} from "./types";

const DEFAULT_API_ORIGIN = "https://api.airtable.com";

export interface FetchAirtableTransportOptions {
  readonly token: string;
  readonly apiOrigin?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export class FetchAirtableTransport implements AirtableTransport {
  readonly #token: string;
  readonly #apiOrigin: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: FetchAirtableTransportOptions) {
    const token = options.token.trim();
    if (token.length === 0) {
      throw new TypeError("An Airtable access token is required.");
    }

    this.#token = token;
    this.#apiOrigin = (options.apiOrigin ?? DEFAULT_API_ORIGIN).replace(/\/$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async request<TBody = unknown>(request: AirtableRequest): Promise<AirtableResponse<TBody>> {
    const url = buildRequestUrl(this.#apiOrigin, request);
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${this.#token}`,
    });
    const init: RequestInit = { method: request.method, headers };

    if (request.body !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(request.body);
    }
    if (request.signal !== undefined) {
      init.signal = request.signal;
    }

    const response = await this.#fetch(url, init);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: body as TBody,
    };
  }
}

function buildRequestUrl(apiOrigin: string, request: AirtableRequest): string {
  const path = ["v0", request.baseId, request.table, request.recordId]
    .filter((part): part is string => part !== undefined)
    .map(encodeURIComponent)
    .join("/");
  const url = new URL(`${apiOrigin}/${path}`);

  if (request.query !== undefined) {
    for (const [key, value] of Object.entries(request.query)) {
      appendQueryValue(url, key, value);
    }
  }

  return url.toString();
}

function appendQueryValue(url: URL, key: string, value: AirtableQueryValue | undefined): void {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      url.searchParams.append(key, item);
    }
    return;
  }
  url.searchParams.set(key, String(value));
}
