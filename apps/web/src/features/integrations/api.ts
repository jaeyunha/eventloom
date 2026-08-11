import type { ApiScope, WebhookEventType } from "@open-sessionboard/contracts";
import type { IntegrationAdminSnapshot, IntegrationErrorBody, OneTimeSecret } from "./types";

export class IntegrationAdminApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: string, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "IntegrationAdminApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}

export interface IntegrationAdminApi {
  getSnapshot(eventId: string, signal?: AbortSignal): Promise<IntegrationAdminSnapshot>;
  saveCredential(input: { eventId: string; provider: "opensend"; secret: string }): Promise<void>;
  createApiKey(input: {
    eventId: string;
    label: string;
    scopes: readonly ApiScope[];
    expiresAt: string | null;
  }): Promise<OneTimeSecret>;
  revokeApiKey(eventId: string, apiKeyId: string): Promise<void>;
  createWebhook(input: {
    eventId: string;
    endpointUrl: string;
    events: readonly WebhookEventType[];
  }): Promise<OneTimeSecret>;
  setWebhookActive(eventId: string, subscriptionId: string, active: boolean): Promise<void>;
  rotateWebhookSecret(eventId: string, subscriptionId: string): Promise<OneTimeSecret>;
  deleteWebhook(eventId: string, subscriptionId: string): Promise<void>;
  retryCalendarDelivery(eventId: string, deliveryId: string): Promise<void>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

async function toApiError(response: Response): Promise<IntegrationAdminApiError> {
  const body = (await response.json().catch(() => undefined)) as IntegrationErrorBody | undefined;
  return new IntegrationAdminApiError(
    body?.error?.code ?? "INTEGRATION_REQUEST_FAILED",
    body?.error?.message ?? "The integration request could not be completed.",
    response.status,
    body?.error?.traceId,
  );
}

function idempotencyKey(): string {
  return `web-${crypto.randomUUID()}`;
}

export function createIntegrationAdminApi(
  baseUrl: string,
  fetcher: Fetcher = fetch,
): IntegrationAdminApi {
  const adminBaseUrl = `${trimTrailingSlash(baseUrl)}/api/admin/events`;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const response = await fetcher(`${adminBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const body = (await response.json()) as { data: T };
    return body.data;
  }

  function eventPath(eventId: string): string {
    return `/${segment(eventId)}`;
  }

  return {
    getSnapshot(eventId, signal) {
      return request<IntegrationAdminSnapshot>(`${eventPath(eventId)}/integrations`, {
        cache: "no-store",
        ...(signal === undefined ? {} : { signal }),
      });
    },

    saveCredential(input) {
      const secret = input.secret.trim();
      if (!secret) {
        return Promise.reject(
          new IntegrationAdminApiError("SECRET_REQUIRED", "Enter a credential before saving.", 400),
        );
      }
      return request<void>(
        `${eventPath(input.eventId)}/integrations/${segment(input.provider)}/credential`,
        {
          method: "PUT",
          headers: { "idempotency-key": idempotencyKey() },
          body: JSON.stringify({ secret }),
        },
      );
    },

    createApiKey(input) {
      return request<OneTimeSecret>(`${eventPath(input.eventId)}/api-keys`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey() },
        body: JSON.stringify({
          label: input.label.trim(),
          scopes: input.scopes,
          expiresAt: input.expiresAt,
        }),
      });
    },

    revokeApiKey(eventId, apiKeyId) {
      return request<void>(`${eventPath(eventId)}/api-keys/${segment(apiKeyId)}`, {
        method: "DELETE",
        headers: { "idempotency-key": idempotencyKey() },
      });
    },

    createWebhook(input) {
      return request<OneTimeSecret>(`${eventPath(input.eventId)}/webhooks`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey() },
        body: JSON.stringify({
          endpointUrl: input.endpointUrl.trim(),
          events: input.events,
        }),
      });
    },

    setWebhookActive(eventId, subscriptionId, active) {
      return request<void>(`${eventPath(eventId)}/webhooks/${segment(subscriptionId)}`, {
        method: "PATCH",
        headers: { "idempotency-key": idempotencyKey() },
        body: JSON.stringify({ active }),
      });
    },

    rotateWebhookSecret(eventId, subscriptionId) {
      return request<OneTimeSecret>(
        `${eventPath(eventId)}/webhooks/${segment(subscriptionId)}/rotate-secret`,
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey() },
          body: JSON.stringify({}),
        },
      );
    },

    deleteWebhook(eventId, subscriptionId) {
      return request<void>(`${eventPath(eventId)}/webhooks/${segment(subscriptionId)}`, {
        method: "DELETE",
        headers: { "idempotency-key": idempotencyKey() },
      });
    },

    retryCalendarDelivery(eventId, deliveryId) {
      return request<void>(
        `${eventPath(eventId)}/integrations/calendar/deliveries/${segment(deliveryId)}/retry`,
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey() },
          body: JSON.stringify({}),
        },
      );
    },
  };
}
