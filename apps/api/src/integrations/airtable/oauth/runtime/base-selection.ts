import type {
  AirtableAuthMode,
  AirtableBaseSchema,
  AirtableConnectionStatus,
  AirtableProvider,
  AirtableProviderIdentity,
} from "../../control/service";
import type { AirtableD1Database } from "../../d1/adapters";
import type { AirtableCredentialResolver } from "./credentials";
import { AirtableOAuthRuntimeError } from "./errors";

interface Row extends Record<string, unknown> {}

export interface AirtableBaseSelectionConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly status: AirtableConnectionStatus;
  readonly authMode: AirtableAuthMode;
  readonly credentialReference: string | null;
  readonly connectionVersion: number;
}

export interface SaveValidatedAirtableBaseSelectionInput {
  readonly organizationId: string;
  readonly connectionId: string;
  readonly expectedConnectionVersion: number;
  readonly expectedAuthMode: AirtableAuthMode;
  readonly expectedCredentialReference: string;
  readonly identity: AirtableProviderIdentity;
  readonly base: AirtableBaseSchema;
  readonly selectedAt: string;
}

export interface AirtableBaseSelectionResult {
  readonly organizationId: string;
  readonly connectionId: string;
  readonly baseId: string;
  readonly baseName: string;
  readonly connectionVersion: number;
  readonly selectedAt: string;
}

export interface AirtableBaseSelectionStore {
  findConnection(
    organizationId: string,
    connectionId: string,
  ): Promise<AirtableBaseSelectionConnection | null>;
  saveValidatedSelection(
    input: SaveValidatedAirtableBaseSelectionInput,
  ): Promise<AirtableBaseSelectionResult | null>;
}

export class D1AirtableBaseSelectionStore implements AirtableBaseSelectionStore {
  constructor(private readonly db: AirtableD1Database) {}

  async findConnection(
    organizationId: string,
    connectionId: string,
  ): Promise<AirtableBaseSelectionConnection | null> {
    const row = await this.db
      .prepare(`SELECT id, organization_id, status, auth_mode,
        credential_reference, connection_version
      FROM airtable_connections
      WHERE organization_id = ? AND id = ?`)
      .bind(organizationId, connectionId)
      .first<Row>();
    return row === null ? null : mapConnection(row);
  }

  async saveValidatedSelection(
    input: SaveValidatedAirtableBaseSelectionInput,
  ): Promise<AirtableBaseSelectionResult | null> {
    const row = await this.db
      .prepare(`UPDATE airtable_connections SET
        base_id = ?, base_name = ?, airtable_user_id = ?, airtable_account_id = ?,
        granted_scopes_json = ?, last_schema_check_at = ?, last_success_at = ?,
        last_error_code = NULL, last_error = NULL,
        connection_version = connection_version + 1, updated_at = ?
      WHERE organization_id = ? AND id = ? AND connection_version = ?
        AND auth_mode = ? AND credential_reference = ?
        AND status IN ('connected', 'paused')
      RETURNING organization_id, id, base_id, base_name, connection_version, updated_at`)
      .bind(
        input.base.id,
        input.base.name,
        input.identity.userId,
        input.identity.accountId,
        JSON.stringify(input.identity.scopes),
        input.selectedAt,
        input.selectedAt,
        input.selectedAt,
        input.organizationId,
        input.connectionId,
        input.expectedConnectionVersion,
        input.expectedAuthMode,
        input.expectedCredentialReference,
      )
      .first<Row>();

    if (row === null) return null;
    return {
      organizationId: text(row.organization_id),
      connectionId: text(row.id),
      baseId: text(row.base_id),
      baseName: text(row.base_name),
      connectionVersion: integer(row.connection_version),
      selectedAt: text(row.updated_at),
    };
  }
}

export interface AirtableBaseSelectionServiceDependencies {
  readonly store: AirtableBaseSelectionStore;
  readonly credentials: AirtableCredentialResolver;
  readonly provider: Pick<AirtableProvider, "inspectCredential" | "getBaseSchema">;
  readonly requiredScopes: readonly string[];
  readonly now?: () => Date;
}

export class AirtableBaseSelectionService {
  private readonly requiredScopes: readonly string[];
  private readonly now: () => Date;

  constructor(private readonly dependencies: AirtableBaseSelectionServiceDependencies) {
    this.requiredScopes = normalizeScopes(dependencies.requiredScopes);
    this.now = dependencies.now ?? (() => new Date());
  }

  async selectBase(input: {
    readonly organizationId: string;
    readonly connectionId: string;
    readonly baseId: string;
  }): Promise<AirtableBaseSelectionResult> {
    const organizationId = requireNonEmpty(input.organizationId, "organizationId");
    const connectionId = requireNonEmpty(input.connectionId, "connectionId");
    const baseId = requireNonEmpty(input.baseId, "baseId");
    const connection = await this.dependencies.store.findConnection(organizationId, connectionId);

    if (connection === null) {
      throw new AirtableOAuthRuntimeError(
        "connection_not_found",
        "The Airtable connection was not found.",
      );
    }
    if (connection.status !== "connected" && connection.status !== "paused") {
      throw new AirtableOAuthRuntimeError(
        "connection_unavailable",
        `The Airtable connection cannot select a base from ${connection.status} state.`,
      );
    }

    const resolved = await this.dependencies.credentials.resolve({
      authMode: connection.authMode,
      credentialReference: connection.credentialReference,
    });
    const identity = await this.inspectCredential(resolved.authMode, resolved.credential);
    this.assertScopes(identity.scopes);
    const base = await this.loadBase(resolved.authMode, resolved.credential, baseId);
    const selectedAt = this.timestamp();
    const credentialReference = connection.credentialReference;
    if (credentialReference === null) {
      throw new AirtableOAuthRuntimeError(
        "missing_credential",
        "The Airtable connection has no credential reference.",
      );
    }

    const selected = await this.dependencies.store.saveValidatedSelection({
      organizationId,
      connectionId,
      expectedConnectionVersion: connection.connectionVersion,
      expectedAuthMode: connection.authMode,
      expectedCredentialReference: credentialReference,
      identity,
      base,
      selectedAt,
    });
    if (selected === null) {
      throw new AirtableOAuthRuntimeError(
        "base_selection_conflict",
        "The Airtable connection changed while the base was being validated.",
      );
    }
    return selected;
  }

  private async inspectCredential(
    authMode: AirtableAuthMode,
    credential: string,
  ): Promise<AirtableProviderIdentity> {
    try {
      return await this.dependencies.provider.inspectCredential({ authMode, credential });
    } catch (cause) {
      throw new AirtableOAuthRuntimeError(
        "credential_validation_failed",
        "The Airtable credential could not be validated.",
        { cause },
      );
    }
  }

  private async loadBase(
    authMode: AirtableAuthMode,
    credential: string,
    baseId: string,
  ): Promise<AirtableBaseSchema> {
    let base: AirtableBaseSchema;
    try {
      base = await this.dependencies.provider.getBaseSchema({ authMode, credential, baseId });
    } catch (cause) {
      throw new AirtableOAuthRuntimeError(
        "base_not_found",
        `Airtable base ${baseId} was not found.`,
        { cause },
      );
    }
    if (base.id !== baseId || base.name.length === 0) {
      throw new AirtableOAuthRuntimeError(
        "invalid_base_response",
        "Airtable returned an invalid base selection response.",
      );
    }
    return base;
  }

  private assertScopes(grantedScopes: readonly string[]): void {
    const missing = this.requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    if (missing.length > 0) {
      throw new AirtableOAuthRuntimeError(
        "missing_scope",
        `Missing required Airtable scopes: ${missing.join(", ")}`,
      );
    }
  }

  private timestamp(): string {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new AirtableOAuthRuntimeError(
        "invalid_request",
        "The Airtable base-selection clock returned an invalid date.",
      );
    }
    return now.toISOString();
  }
}

function mapConnection(row: Row): AirtableBaseSelectionConnection {
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    status: text(row.status) as AirtableConnectionStatus,
    authMode: text(row.auth_mode) as AirtableAuthMode,
    credentialReference: nullableText(row.credential_reference),
    connectionVersion: integer(row.connection_version),
  };
}

function normalizeScopes(scopes: readonly string[]): readonly string[] {
  return [...new Set(scopes.map((scope) => scope.trim()))].filter((scope) => scope.length > 0);
}

function requireNonEmpty(value: string, label: string): string {
  if (value.length === 0) {
    throw new AirtableOAuthRuntimeError("invalid_request", `${label} must not be empty.`);
  }
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid Airtable D1 text column");
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("Invalid Airtable D1 integer column");
  }
  return value;
}
