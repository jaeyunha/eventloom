import { decodeAirtableMacSecret } from "../inbound/mac";
import type { AirtableWebhookRegistration } from "../inbound/webhook";
import type {
  AirtableWebhookD1Database,
  AirtableWebhookDueRegistration,
  AirtableWebhookMacSecretCipher,
  AirtableWebhookRegistrationRecord,
  AirtableWebhookRegistrationStatus,
} from "./types";

type Row = Record<string, unknown>;

export interface CreateAirtableWebhookRegistrationInput {
  id: string;
  organizationId: string;
  connectionId: string;
  specificationHash: string;
  createdAt: string;
}

export interface CompleteAirtableWebhookRegistrationInput {
  registrationId: string;
  expectedVersion: number;
  providerWebhookId: string;
  macSecret: string;
  expiresAt: string;
  updatedAt: string;
}

export interface ClaimAirtableWebhookRefreshInput {
  registrationId: string;
  expectedVersion: number;
  workerId: string;
  refreshToken: string;
  claimedAt: string;
  leaseExpiresAt: string;
}

export interface FinishAirtableWebhookRefreshInput {
  registrationId: string;
  refreshToken: string;
  expiresAt: string;
  updatedAt: string;
}

export interface ReplaceAirtableWebhookRegistrationInput {
  registrationId: string;
  refreshToken: string;
  providerWebhookId: string;
  macSecret: string;
  expiresAt: string;
  specificationHash: string;
  updatedAt: string;
}

export class D1AirtableWebhookRegistrationRepository {
  constructor(
    private readonly db: AirtableWebhookD1Database,
    private readonly cipher: AirtableWebhookMacSecretCipher,
  ) {}

  async findById(registrationId: string): Promise<AirtableWebhookRegistrationRecord | null> {
    return mapRegistration(
      await this.db
        .prepare("SELECT * FROM airtable_webhook_registrations WHERE id = ?")
        .bind(registrationId)
        .first<Row>(),
    );
  }

  async resolveActive(registrationId: string): Promise<AirtableWebhookRegistration | null> {
    const row = await this.db
      .prepare(`SELECT * FROM airtable_webhook_registrations
        WHERE id = ? AND status IN ('active', 'refreshing')
          AND provider_webhook_id IS NOT NULL AND mac_secret_ciphertext IS NOT NULL`)
      .bind(registrationId)
      .first<Row>();
    const registration = mapRegistration(row);
    if (registration === null || registration.macSecretCiphertext === null) return null;

    const encodedSecret = await this.cipher.decrypt(registration.macSecretCiphertext);
    const macSecret = decodeAirtableMacSecret(encodedSecret);
    if (macSecret === null) throw new Error("The Airtable webhook MAC secret is invalid.");
    return {
      id: registration.id,
      organizationId: registration.organizationId,
      connectionId: registration.connectionId,
      macSecret,
    };
  }

  async create(input: CreateAirtableWebhookRegistrationInput): Promise<void> {
    await this.db
      .prepare(`INSERT INTO airtable_webhook_registrations (
        id, organization_id, connection_id, provider_webhook_id,
        mac_secret_ciphertext, expires_at, specification_hash, status,
        refresh_owner, refresh_token, refresh_lease_expires_at,
        registration_version, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, NULL, NULL, ?, 'creating', NULL, NULL, NULL, 1, ?, ?)`)
      .bind(
        input.id,
        input.organizationId,
        input.connectionId,
        input.specificationHash,
        input.createdAt,
        input.createdAt,
      )
      .run();
  }

  async completeCreate(
    input: CompleteAirtableWebhookRegistrationInput,
  ): Promise<AirtableWebhookRegistrationRecord | null> {
    const ciphertext = await this.cipher.encrypt(input.macSecret);
    return mapRegistration(
      await this.db
        .prepare(`UPDATE airtable_webhook_registrations SET
          provider_webhook_id = ?, mac_secret_ciphertext = ?, expires_at = ?,
          status = 'active', registration_version = registration_version + 1, updated_at = ?
        WHERE id = ? AND status = 'creating' AND registration_version = ? RETURNING *`)
        .bind(
          input.providerWebhookId,
          ciphertext,
          input.expiresAt,
          input.updatedAt,
          input.registrationId,
          input.expectedVersion,
        )
        .first<Row>(),
    );
  }

  async listDue(input: {
    refreshBefore: string;
    now: string;
    limit: number;
  }): Promise<AirtableWebhookDueRegistration[]> {
    const result = await this.db
      .prepare(`SELECT r.*, c.credential_reference, c.base_id
        FROM airtable_webhook_registrations r
        JOIN airtable_connections c ON c.id = r.connection_id AND c.organization_id = r.organization_id
        WHERE c.status = 'connected' AND c.credential_reference IS NOT NULL AND c.base_id IS NOT NULL
          AND (
            (r.status = 'active' AND r.expires_at <= ?)
            OR (r.status IN ('expired', 'invalid'))
            OR (r.status = 'refreshing' AND r.refresh_lease_expires_at <= ?)
          )
        ORDER BY COALESCE(r.expires_at, r.updated_at), r.id
        LIMIT ?`)
      .bind(input.refreshBefore, input.now, input.limit)
      .all<Row>();
    return (result.results ?? []).map(mapDueRegistration);
  }

  async claimRefresh(
    input: ClaimAirtableWebhookRefreshInput,
  ): Promise<AirtableWebhookDueRegistration | null> {
    const row = await this.db
      .prepare(`UPDATE airtable_webhook_registrations SET
        status = 'refreshing', refresh_owner = ?, refresh_token = ?,
        refresh_lease_expires_at = ?, registration_version = registration_version + 1,
        updated_at = ?
      WHERE id = ? AND registration_version = ? AND (
        status IN ('active', 'expired', 'invalid')
        OR (status = 'refreshing' AND refresh_lease_expires_at <= ?)
      ) RETURNING *`)
      .bind(
        input.workerId,
        input.refreshToken,
        input.leaseExpiresAt,
        input.claimedAt,
        input.registrationId,
        input.expectedVersion,
        input.claimedAt,
      )
      .first<Row>();
    if (row === null) return null;

    const connection = await this.db
      .prepare(`SELECT credential_reference, base_id FROM airtable_connections
        WHERE id = ? AND organization_id = ? AND status = 'connected'
          AND credential_reference IS NOT NULL AND base_id IS NOT NULL`)
      .bind(text(row.connection_id), text(row.organization_id))
      .first<Row>();
    if (connection === null) return null;
    return mapDueRegistration({ ...row, ...connection });
  }

  async finishRefresh(
    input: FinishAirtableWebhookRefreshInput,
  ): Promise<AirtableWebhookRegistrationRecord | null> {
    return mapRegistration(
      await this.db
        .prepare(`UPDATE airtable_webhook_registrations SET
          expires_at = ?, status = 'active', refresh_owner = NULL, refresh_token = NULL,
          refresh_lease_expires_at = NULL, registration_version = registration_version + 1,
          updated_at = ?
        WHERE id = ? AND status = 'refreshing' AND refresh_token = ?
          AND refresh_lease_expires_at > ? RETURNING *`)
        .bind(
          input.expiresAt,
          input.updatedAt,
          input.registrationId,
          input.refreshToken,
          input.updatedAt,
        )
        .first<Row>(),
    );
  }

  async replace(
    input: ReplaceAirtableWebhookRegistrationInput,
  ): Promise<AirtableWebhookRegistrationRecord | null> {
    const ciphertext = await this.cipher.encrypt(input.macSecret);
    return mapRegistration(
      await this.db
        .prepare(`UPDATE airtable_webhook_registrations SET
          provider_webhook_id = ?, mac_secret_ciphertext = ?, expires_at = ?,
          specification_hash = ?, status = 'active', refresh_owner = NULL,
          refresh_token = NULL, refresh_lease_expires_at = NULL,
          registration_version = registration_version + 1, updated_at = ?
        WHERE id = ? AND status = 'refreshing' AND refresh_token = ?
          AND refresh_lease_expires_at > ? RETURNING *`)
        .bind(
          input.providerWebhookId,
          ciphertext,
          input.expiresAt,
          input.specificationHash,
          input.updatedAt,
          input.registrationId,
          input.refreshToken,
          input.updatedAt,
        )
        .first<Row>(),
    );
  }

  async disable(input: {
    registrationId: string;
    status?: "invalid" | "expired" | "deleted";
    updatedAt: string;
    refreshToken?: string;
  }): Promise<boolean> {
    const status = input.status ?? "invalid";
    const tokenPredicate = input.refreshToken === undefined ? "" : " AND refresh_token = ?";
    const statement = this.db.prepare(`UPDATE airtable_webhook_registrations SET
      status = ?, refresh_owner = NULL, refresh_token = NULL,
      refresh_lease_expires_at = NULL, registration_version = registration_version + 1,
      updated_at = ? WHERE id = ?${tokenPredicate}`);
    const values = [status, input.updatedAt, input.registrationId];
    if (input.refreshToken !== undefined) values.push(input.refreshToken);
    const result = await statement.bind(...values).run();
    return (result.meta?.changes ?? 0) > 0;
  }
}

function mapDueRegistration(row: Row): AirtableWebhookDueRegistration {
  const registration = mapRegistration(row);
  if (registration === null) throw new Error("Expected an Airtable webhook registration row.");
  return {
    ...registration,
    credentialReference: text(row.credential_reference),
    baseId: text(row.base_id),
  };
}

function mapRegistration(row: Row | null): AirtableWebhookRegistrationRecord | null {
  if (row === null) return null;
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    connectionId: text(row.connection_id),
    providerWebhookId: nullableText(row.provider_webhook_id),
    macSecretCiphertext: nullableText(row.mac_secret_ciphertext),
    expiresAt: nullableText(row.expires_at),
    specificationHash: text(row.specification_hash),
    status: text(row.status) as AirtableWebhookRegistrationStatus,
    refreshOwner: nullableText(row.refresh_owner),
    refreshToken: nullableText(row.refresh_token),
    refreshLeaseExpiresAt: nullableText(row.refresh_lease_expires_at),
    registrationVersion: integer(row.registration_version),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a D1 text value.");
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null) return null;
  return text(value);
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("Expected a D1 integer value.");
  }
  return value;
}
