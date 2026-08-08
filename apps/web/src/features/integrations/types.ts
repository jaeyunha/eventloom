import type { ApiScope, WebhookEventType } from "@open-sessionboard/contracts";

export type IntegrationSection =
  | "overview"
  | "accelevents"
  | "api-keys"
  | "webhooks"
  | "delivery";

export type ConnectionState = "connected" | "degraded" | "not_configured";

export interface EventIntegrationIdentity {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly publishedAgendaRevisionId: string | null;
}

export interface ApiKeySummary {
  readonly id: string;
  readonly label: string;
  readonly prefix: string;
  readonly scopes: readonly ApiScope[];
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export interface WebhookSubscriptionSummary {
  readonly id: string;
  readonly endpointUrl: string;
  readonly events: readonly WebhookEventType[];
  readonly active: boolean;
  readonly signingSecretLastFour: string;
  readonly createdAt: string;
  readonly lastDelivery: {
    readonly status: "pending" | "delivering" | "retrying" | "succeeded" | "failed";
    readonly attemptedAt: string;
    readonly responseStatus: number | null;
  } | null;
}

export interface DeliveryStatus {
  readonly openSend: {
    readonly state: ConnectionState;
    readonly credentialLastFour: string | null;
    readonly senderChecks: readonly {
      readonly address: string;
      readonly status: "verified" | "pending" | "failed";
    }[];
    readonly deliveredLast24Hours: number;
    readonly failedLast24Hours: number;
    readonly lastDeliveryAt: string | null;
  };
  readonly calendar: {
    readonly state: ConnectionState;
    readonly sentLast24Hours: number;
    readonly failedLast24Hours: number;
    readonly lastInvitationAt: string | null;
    readonly lastFailure: {
      readonly deliveryId: string;
      readonly summary: string;
      readonly occurredAt: string;
      readonly retryable: boolean;
    } | null;
  };
}

export interface AcceleventsStatus {
  readonly state: ConnectionState;
  readonly accountLabel: string | null;
  readonly credentialLastFour: string | null;
  readonly lastPublication: {
    readonly publicationId: string;
    readonly status: "preview" | "queued" | "publishing" | "succeeded" | "partially_failed" | "failed";
    readonly completedAt: string | null;
    readonly errorCount: number;
  } | null;
}

export interface IntegrationAdminSnapshot {
  readonly event: EventIntegrationIdentity;
  readonly accelevents: AcceleventsStatus;
  readonly delivery: DeliveryStatus;
  readonly apiKeys: readonly ApiKeySummary[];
  readonly webhooks: readonly WebhookSubscriptionSummary[];
}

export type AcceleventsDiffOperation = "create" | "update" | "unchanged";

export interface AcceleventsAdminPreview {
  readonly publicationId: string;
  readonly agendaRevisionId: string;
  readonly snapshotHash: string;
  readonly confirmationToken: string;
  readonly createdAt: string;
  readonly speakers: readonly {
    readonly externalId: string;
    readonly name: string;
    readonly email: string;
  }[];
  readonly sessions: readonly {
    readonly externalId: string;
    readonly title: string;
    readonly startsAt: string;
    readonly room: string;
    readonly track: string | null;
  }[];
  readonly diff: {
    readonly summary: Readonly<Record<AcceleventsDiffOperation, number>>;
    readonly records: readonly {
      readonly kind: "speaker" | "session";
      readonly externalId: string;
      readonly label: string;
      readonly operation: AcceleventsDiffOperation;
      readonly changedFields: readonly string[];
    }[];
  };
  readonly validationErrors: readonly {
    readonly externalId: string;
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  }[];
}

export interface AcceleventsPublishResult {
  readonly publicationId: string;
  readonly status: "succeeded" | "partially_failed" | "failed";
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly errors: readonly {
    readonly externalId: string;
    readonly message: string;
    readonly retryable: boolean;
  }[];
  readonly completedAt: string;
}

export interface OneTimeSecret {
  readonly id: string;
  readonly secret: string;
}

export interface IntegrationErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly traceId?: string;
  };
}
