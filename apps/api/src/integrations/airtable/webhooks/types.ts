import type { AirtableSecretCipher } from "../d1/adapters";

export type AirtableWebhookRegistrationStatus =
  | "creating"
  | "active"
  | "refreshing"
  | "expired"
  | "invalid"
  | "deleting"
  | "deleted";

export interface AirtableWebhookRegistrationRecord {
  id: string;
  organizationId: string;
  connectionId: string;
  providerWebhookId: string | null;
  macSecretCiphertext: string | null;
  expiresAt: string | null;
  specificationHash: string;
  status: AirtableWebhookRegistrationStatus;
  refreshOwner: string | null;
  refreshToken: string | null;
  refreshLeaseExpiresAt: string | null;
  registrationVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface AirtableWebhookDueRegistration extends AirtableWebhookRegistrationRecord {
  credentialReference: string;
  baseId: string;
}

export interface AirtableWebhookMacSecretCipher extends AirtableSecretCipher {}

export type AirtableWebhookD1Value = string | number | null;

export interface AirtableWebhookD1Result<T = Record<string, unknown>> {
  results?: T[];
  meta?: { changes?: number };
}

export interface AirtableWebhookD1Statement {
  bind(...values: AirtableWebhookD1Value[]): AirtableWebhookD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<AirtableWebhookD1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<AirtableWebhookD1Result<T>>;
}

export interface AirtableWebhookD1Database {
  prepare(sql: string): AirtableWebhookD1Statement;
  batch<T = Record<string, unknown>>(
    statements: AirtableWebhookD1Statement[],
  ): Promise<AirtableWebhookD1Result<T>[]>;
}
