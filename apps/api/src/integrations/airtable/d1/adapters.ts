import type {
  AirtableConfigurationStore,
  AirtableConnection,
  AirtableConnectionStore,
  AirtableControlConfiguration,
  AirtableProjectionConfiguration,
  AirtableSecretStore,
} from "../control/service";
import type {
  AirtableOAuthAttempt,
  AirtableOAuthAttemptStore,
  AirtableOAuthConnection,
  AirtableOAuthConnectionStore,
  AirtableOAuthCredentials,
  AirtableOAuthSecretStore,
} from "../oauth/service";

export interface AirtableSecretCipher {
  encrypt(plaintext: string): string | Promise<string>;
  decrypt(ciphertext: string): string | Promise<string>;
}

type D1Value = string | number | null;

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  meta?: { changes?: number };
}

interface D1Statement {
  bind(...values: D1Value[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface AirtableD1Database {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}

type Row = Record<string, unknown>;

export class D1AirtableOAuthAttemptStore implements AirtableOAuthAttemptStore {
  constructor(private readonly db: AirtableD1Database) {}

  async create(attempt: AirtableOAuthAttempt): Promise<void> {
    const result = await this.db
      .prepare(`INSERT INTO airtable_oauth_attempts (
        id, organization_id, initiating_user_id, connection_id, state_hash,
        pkce_verifier_ciphertext, return_path, callback_code_hash, status,
        exchange_owner, exchange_token, exchange_lease_expires_at, attempt_version,
        authorization_connection_version, expires_at, consumed_at, result_redirect,
        error_code, created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM airtable_connections
      WHERE id = ? AND organization_id = ? AND auth_mode = 'oauth'
        AND status = 'authorizing' AND connection_version = ?`)
      .bind(
        attempt.id,
        attempt.organizationId,
        attempt.initiatingUserId,
        attempt.connectionId,
        attempt.stateHash,
        attempt.pkceVerifierCiphertext,
        attempt.returnPath,
        attempt.callbackCodeHash,
        attempt.status,
        attempt.exchangeOwner,
        attempt.exchangeToken,
        attempt.exchangeLeaseExpiresAt,
        attempt.attemptVersion,
        attempt.authorizationConnectionVersion,
        attempt.expiresAt,
        attempt.consumedAt,
        attempt.resultRedirect,
        attempt.errorCode,
        attempt.createdAt,
        attempt.updatedAt,
        attempt.connectionId,
        attempt.organizationId,
        attempt.authorizationConnectionVersion,
      )
      .run();
    if (!changed(result)) {
      throw new Error("The Airtable authorization connection is no longer current.");
    }
  }

  async supersede(input: {
    organizationId: string;
    connectionId: string;
    authorizationConnectionVersion: number;
    supersededAt: string;
  }): Promise<void> {
    await this.db
      .prepare(`UPDATE airtable_oauth_attempts SET
        status = 'failed', exchange_owner = NULL, exchange_token = NULL,
        exchange_lease_expires_at = NULL, attempt_version = attempt_version + 1,
        error_code = 'authorization_superseded', updated_at = ?
      WHERE organization_id = ? AND connection_id = ?
        AND authorization_connection_version < ?
        AND status IN ('pending', 'exchanging')`)
      .bind(
        input.supersededAt,
        input.organizationId,
        input.connectionId,
        input.authorizationConnectionVersion,
      )
      .run();
  }

  async findByStateHash(stateHash: string): Promise<AirtableOAuthAttempt | null> {
    return mapAttempt(
      await this.db
        .prepare("SELECT * FROM airtable_oauth_attempts WHERE state_hash = ?")
        .bind(stateHash)
        .first<Row>(),
    );
  }

  async claimExchange(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    callbackCodeHash: string;
    exchangeOwner: string;
    exchangeToken: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }): Promise<AirtableOAuthAttempt | null> {
    const row = await this.db
      .prepare(`UPDATE airtable_oauth_attempts SET
        status = 'exchanging', callback_code_hash = ?, exchange_owner = ?,
        exchange_token = ?, exchange_lease_expires_at = ?,
        attempt_version = attempt_version + 1, updated_at = ?
      WHERE id = ? AND attempt_version = ? AND expires_at > ? AND (
        status = 'pending' OR (
          status = 'exchanging' AND callback_code_hash = ?
          AND exchange_lease_expires_at <= ?
        )
      ) RETURNING *`)
      .bind(
        input.callbackCodeHash,
        input.exchangeOwner,
        input.exchangeToken,
        input.leaseExpiresAt,
        input.claimedAt,
        input.attemptId,
        input.expectedAttemptVersion,
        input.claimedAt,
        input.callbackCodeHash,
        input.claimedAt,
      )
      .first<Row>();
    return mapAttempt(row);
  }

  async expire(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    expiredAt: string;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(`UPDATE airtable_oauth_attempts SET
        status = 'expired', exchange_owner = NULL, exchange_token = NULL,
        exchange_lease_expires_at = NULL, attempt_version = attempt_version + 1,
        updated_at = ?
      WHERE id = ? AND attempt_version = ? AND status IN ('pending', 'exchanging')`)
      .bind(input.expiredAt, input.attemptId, input.expectedAttemptVersion)
      .run();
    return changed(result);
  }

  async finalizeExchange(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    exchangeToken: string;
    finalizedAt: string;
    resultRedirect: string;
    connection: {
      id: string;
      organizationId: string;
      credentialReference: string;
      airtableUserId: string | null;
      airtableAccountId: string | null;
      grantedScopes: readonly string[];
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string | null;
    };
  }): Promise<{ attempt: AirtableOAuthAttempt; connection: AirtableOAuthConnection } | null> {
    const connectionStatement = this.db
      .prepare(`UPDATE airtable_connections SET
        status = 'connected', auth_mode = 'oauth', credential_reference = ?,
        airtable_user_id = ?, airtable_account_id = ?, granted_scopes_json = ?,
        access_token_expires_at = ?, refresh_token_expires_at = ?,
        connection_version = connection_version + 1,
        refresh_owner = NULL, refresh_token = NULL, refresh_lease_expires_at = NULL,
        last_error_code = NULL, last_error = NULL, updated_at = ?, disconnected_at = NULL
      WHERE id = ? AND organization_id = ? AND auth_mode = 'oauth'
        AND status = 'authorizing' AND EXISTS (
          SELECT 1 FROM airtable_oauth_attempts
          WHERE id = ? AND connection_id = airtable_connections.id
            AND organization_id = airtable_connections.organization_id
            AND authorization_connection_version = airtable_connections.connection_version
            AND attempt_version = ? AND status = 'exchanging'
            AND exchange_token = ? AND exchange_lease_expires_at > ?
        ) RETURNING *`)
      .bind(
        input.connection.credentialReference,
        input.connection.airtableUserId,
        input.connection.airtableAccountId,
        JSON.stringify(input.connection.grantedScopes),
        input.connection.accessTokenExpiresAt,
        input.connection.refreshTokenExpiresAt,
        input.finalizedAt,
        input.connection.id,
        input.connection.organizationId,
        input.attemptId,
        input.expectedAttemptVersion,
        input.exchangeToken,
        input.finalizedAt,
      );
    const attemptStatement = this.db
      .prepare(`UPDATE airtable_oauth_attempts SET
        status = 'consumed', exchange_owner = NULL, exchange_token = NULL,
        exchange_lease_expires_at = NULL, attempt_version = attempt_version + 1,
        consumed_at = ?, result_redirect = ?, error_code = NULL, updated_at = ?
      WHERE id = ? AND attempt_version = ? AND status = 'exchanging'
        AND exchange_token = ? AND exchange_lease_expires_at > ?
        AND EXISTS (
          SELECT 1 FROM airtable_connections
          WHERE id = airtable_oauth_attempts.connection_id
            AND organization_id = airtable_oauth_attempts.organization_id
            AND credential_reference = ? AND status = 'connected'
            AND connection_version = airtable_oauth_attempts.authorization_connection_version + 1
            AND updated_at = ?
        ) RETURNING *`)
      .bind(
        input.finalizedAt,
        input.resultRedirect,
        input.finalizedAt,
        input.attemptId,
        input.expectedAttemptVersion,
        input.exchangeToken,
        input.finalizedAt,
        input.connection.credentialReference,
        input.finalizedAt,
      );
    const [connectionResult, attemptResult] = await this.db.batch<Row>([
      connectionStatement,
      attemptStatement,
    ]);
    const connection = mapOAuthConnection(connectionResult?.results?.[0] ?? null);
    const attempt = mapAttempt(attemptResult?.results?.[0] ?? null);
    return connection && attempt ? { attempt, connection } : null;
  }

  async failExchange(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    exchangeToken: string;
    failedAt: string;
    errorCode: string;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(`UPDATE airtable_oauth_attempts SET
        status = 'failed', exchange_owner = NULL, exchange_token = NULL,
        exchange_lease_expires_at = NULL, attempt_version = attempt_version + 1,
        error_code = ?, updated_at = ?
      WHERE id = ? AND attempt_version = ? AND status = 'exchanging'
        AND exchange_token = ?`)
      .bind(
        input.errorCode,
        input.failedAt,
        input.attemptId,
        input.expectedAttemptVersion,
        input.exchangeToken,
      )
      .run();
    return changed(result);
  }
}

export class D1AirtableOAuthConnectionStore implements AirtableOAuthConnectionStore {
  constructor(private readonly db: AirtableD1Database) {}

  async beginAuthorization(input: {
    proposedConnectionId: string;
    organizationId: string;
    startedAt: string;
  }): Promise<AirtableOAuthConnection> {
    const existing = await this.db
      .prepare(`SELECT * FROM airtable_connections
        WHERE organization_id = ? AND status <> 'disconnected' LIMIT 1`)
      .bind(input.organizationId)
      .first<Row>();
    if (existing) {
      if (existing.auth_mode !== "oauth") return requireOAuthConnection(existing);
      const updated = await this.db
        .prepare(`UPDATE airtable_connections SET
          status = 'authorizing', connection_version = connection_version + 1,
          refresh_owner = NULL, refresh_token = NULL, refresh_lease_expires_at = NULL,
          last_error_code = NULL, last_error = NULL, updated_at = ?
        WHERE id = ? AND organization_id = ? RETURNING *`)
        .bind(input.startedAt, text(existing.id), input.organizationId)
        .first<Row>();
      return requireOAuthConnection(updated);
    }

    try {
      const created = await this.db
        .prepare(`INSERT INTO airtable_connections (
          id, organization_id, status, auth_mode, credential_reference,
          airtable_user_id, airtable_account_id, base_id, base_name,
          granted_scopes_json, access_token_expires_at, refresh_token_expires_at,
          connection_version, refresh_owner, refresh_token, refresh_lease_expires_at,
          last_schema_check_at, last_success_at, last_error_code, last_error,
          created_at, updated_at, disconnected_at
        ) VALUES (?, ?, 'authorizing', 'oauth', NULL, NULL, NULL, NULL, NULL,
          '[]', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)
        RETURNING *`)
        .bind(input.proposedConnectionId, input.organizationId, input.startedAt, input.startedAt)
        .first<Row>();
      return requireOAuthConnection(created);
    } catch (error) {
      const raced = await this.db
        .prepare(`SELECT * FROM airtable_connections
          WHERE organization_id = ? AND status <> 'disconnected' LIMIT 1`)
        .bind(input.organizationId)
        .first<Row>();
      if (raced) return requireOAuthConnection(raced);
      throw error;
    }
  }

  async findById(connectionId: string): Promise<AirtableOAuthConnection | null> {
    return mapOAuthConnection(
      await this.db
        .prepare("SELECT * FROM airtable_connections WHERE id = ?")
        .bind(connectionId)
        .first<Row>(),
    );
  }

  async claimRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshOwner: string;
    refreshToken: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }): Promise<AirtableOAuthConnection | null> {
    return mapOAuthConnection(
      await this.db
        .prepare(`UPDATE airtable_connections SET
          status = 'refreshing', refresh_owner = ?, refresh_token = ?,
          refresh_lease_expires_at = ?, connection_version = connection_version + 1,
          updated_at = ?
        WHERE id = ? AND organization_id = ? AND auth_mode = 'oauth'
          AND connection_version = ? AND credential_reference IS NOT NULL AND (
            status = 'connected' OR (
              status = 'refreshing' AND refresh_lease_expires_at <= ?
            )
          ) RETURNING *`)
        .bind(
          input.refreshOwner,
          input.refreshToken,
          input.leaseExpiresAt,
          input.claimedAt,
          input.connectionId,
          input.organizationId,
          input.expectedConnectionVersion,
          input.claimedAt,
        )
        .first<Row>(),
    );
  }

  async finalizeRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshToken: string;
    finalizedAt: string;
    credentialReference: string;
    grantedScopes: readonly string[];
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string | null;
  }): Promise<AirtableOAuthConnection | null> {
    return mapOAuthConnection(
      await this.db
        .prepare(`UPDATE airtable_connections SET
          status = 'connected', credential_reference = ?, granted_scopes_json = ?,
          access_token_expires_at = ?, refresh_token_expires_at = ?,
          connection_version = connection_version + 1,
          refresh_owner = NULL, refresh_token = NULL, refresh_lease_expires_at = NULL,
          last_error_code = NULL, last_error = NULL, updated_at = ?
        WHERE id = ? AND organization_id = ? AND connection_version = ?
          AND status = 'refreshing' AND refresh_token = ?
          AND refresh_lease_expires_at > ? RETURNING *`)
        .bind(
          input.credentialReference,
          JSON.stringify(input.grantedScopes),
          input.accessTokenExpiresAt,
          input.refreshTokenExpiresAt,
          input.finalizedAt,
          input.connectionId,
          input.organizationId,
          input.expectedConnectionVersion,
          input.refreshToken,
          input.finalizedAt,
        )
        .first<Row>(),
    );
  }

  async failRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshToken: string;
    failedAt: string;
    errorCode: string;
    errorMessage: string;
    reauthorizationRequired: boolean;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(`UPDATE airtable_connections SET
        status = ?, connection_version = connection_version + 1,
        refresh_owner = NULL, refresh_token = NULL, refresh_lease_expires_at = NULL,
        last_error_code = ?, last_error = ?, updated_at = ?
      WHERE id = ? AND organization_id = ? AND connection_version = ?
        AND status = 'refreshing' AND refresh_token = ?
        AND refresh_lease_expires_at > ?`)
      .bind(
        input.reauthorizationRequired ? "reauthorization_required" : "connected",
        input.errorCode,
        input.errorMessage,
        input.failedAt,
        input.connectionId,
        input.organizationId,
        input.expectedConnectionVersion,
        input.refreshToken,
        input.failedAt,
      )
      .run();
    return changed(result);
  }
}

export class EncryptedReferenceAirtableOAuthSecretStore implements AirtableOAuthSecretStore {
  constructor(private readonly cipher: AirtableSecretCipher) {}

  async put(input: {
    connectionId: string;
    source: "authorization" | "refresh";
    claimToken: string;
    credentials: AirtableOAuthCredentials;
  }): Promise<string> {
    const plaintext = JSON.stringify({
      connectionId: input.connectionId,
      source: input.source,
      claimToken: input.claimToken,
      credentials: input.credentials,
    });
    return `airtable-oauth:v1:${await this.cipher.encrypt(plaintext)}`;
  }

  async get(credentialReference: string): Promise<AirtableOAuthCredentials> {
    const ciphertext = requireReference(credentialReference, "airtable-oauth:v1:");
    const decoded = JSON.parse(await this.cipher.decrypt(ciphertext)) as {
      credentials?: Partial<AirtableOAuthCredentials>;
    };
    if (
      typeof decoded.credentials?.accessToken !== "string" ||
      typeof decoded.credentials.refreshToken !== "string"
    ) {
      throw new Error("Invalid encrypted Airtable OAuth credential reference");
    }
    return {
      accessToken: decoded.credentials.accessToken,
      refreshToken: decoded.credentials.refreshToken,
    };
  }

  async discard(_credentialReference: string): Promise<void> {}
}

export class EncryptedReferenceAirtableSecretStore implements AirtableSecretStore {
  constructor(private readonly cipher: AirtableSecretCipher) {}

  async put(secret: string): Promise<string> {
    const lastFour = secret.slice(-4);
    const encodedLastFour = encodeURIComponent(lastFour);
    return `airtable-secret:v1:${encodedLastFour}:${await this.cipher.encrypt(secret)}`;
  }

  async get(reference: string): Promise<string> {
    const payload = requireReference(reference, "airtable-secret:v1:");
    const separator = payload.indexOf(":");
    if (separator < 0) throw new Error("Invalid encrypted Airtable secret reference");
    return this.cipher.decrypt(payload.slice(separator + 1));
  }

  async delete(_reference: string): Promise<void> {}
}

export class D1AirtableConnectionStore implements AirtableConnectionStore {
  constructor(private readonly db: AirtableD1Database) {}

  async findById(organizationId: string, connectionId: string): Promise<AirtableConnection | null> {
    return mapControlConnection(
      await this.db
        .prepare("SELECT * FROM airtable_connections WHERE organization_id = ? AND id = ?")
        .bind(organizationId, connectionId)
        .first<Row>(),
    );
  }

  async findActiveByOrganization(organizationId: string): Promise<AirtableConnection | null> {
    return mapControlConnection(
      await this.db
        .prepare(`SELECT * FROM airtable_connections
          WHERE organization_id = ? AND status <> 'disconnected' LIMIT 1`)
        .bind(organizationId)
        .first<Row>(),
    );
  }

  async create(connection: AirtableConnection): Promise<void> {
    await this.db
      .prepare(`INSERT INTO airtable_connections (
        id, organization_id, status, auth_mode, credential_reference,
        airtable_user_id, airtable_account_id, base_id, base_name,
        granted_scopes_json, access_token_expires_at, refresh_token_expires_at,
        connection_version, refresh_owner, refresh_token, refresh_lease_expires_at,
        last_schema_check_at, last_success_at, last_error_code, last_error,
        created_at, updated_at, disconnected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL,
        ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        connection.id,
        connection.organizationId,
        connection.status,
        connection.authMode,
        connection.credentialReference,
        connection.airtableUserId,
        connection.airtableAccountId,
        connection.baseId,
        connection.baseName,
        JSON.stringify(connection.grantedScopes),
        connection.connectionVersion,
        connection.lastSchemaCheckAt,
        connection.lastSuccessAt,
        connection.lastErrorCode,
        connection.lastError,
        connection.createdAt,
        connection.updatedAt,
        connection.disconnectedAt,
      )
      .run();
  }

  async update(
    organizationId: string,
    connectionId: string,
    patch: Partial<AirtableConnection>,
  ): Promise<AirtableConnection> {
    const columns: Record<keyof AirtableConnection, string | null> = {
      id: null,
      organizationId: null,
      status: "status",
      authMode: "auth_mode",
      credentialReference: "credential_reference",
      credentialLastFour: null,
      airtableUserId: "airtable_user_id",
      airtableAccountId: "airtable_account_id",
      baseId: "base_id",
      baseName: "base_name",
      grantedScopes: "granted_scopes_json",
      connectionVersion: "connection_version",
      lastSchemaCheckAt: "last_schema_check_at",
      lastSuccessAt: "last_success_at",
      lastErrorCode: "last_error_code",
      lastError: "last_error",
      createdAt: "created_at",
      updatedAt: "updated_at",
      disconnectedAt: "disconnected_at",
    };
    const assignments: string[] = [];
    const values: D1Value[] = [];
    for (const [key, value] of Object.entries(patch) as [keyof AirtableConnection, unknown][]) {
      const column = columns[key];
      if (!column) continue;
      assignments.push(`${column} = ?`);
      values.push(key === "grantedScopes" ? JSON.stringify(value) : (value as D1Value));
    }
    if (assignments.length === 0) {
      const current = await this.findById(organizationId, connectionId);
      if (!current) throw new Error("Airtable connection was not found");
      return current;
    }
    const row = await this.db
      .prepare(`UPDATE airtable_connections SET ${assignments.join(", ")}
        WHERE organization_id = ? AND id = ? RETURNING *`)
      .bind(...values, organizationId, connectionId)
      .first<Row>();
    const connection = mapControlConnection(row);
    if (!connection) throw new Error("Airtable connection was not found");
    return connection;
  }
}

export class D1AirtableConfigurationStore implements AirtableConfigurationStore {
  constructor(
    private readonly db: AirtableD1Database,
    private readonly controlConfiguration:
      | AirtableControlConfiguration
      | ((
          organizationId: string,
        ) => AirtableControlConfiguration | Promise<AirtableControlConfiguration>),
  ) {}

  async getControlConfiguration(organizationId: string): Promise<AirtableControlConfiguration> {
    const configuration =
      typeof this.controlConfiguration === "function"
        ? await this.controlConfiguration(organizationId)
        : this.controlConfiguration;
    return {
      requiredScopes: [...configuration.requiredScopes],
      schema: configuration.schema.map((requirement) => ({
        ...requirement,
        requiredFields: requirement.requiredFields.map((field) =>
          field.allowedTypes === undefined
            ? { sourceField: field.sourceField }
            : { sourceField: field.sourceField, allowedTypes: [...field.allowedTypes] },
        ),
      })),
    };
  }

  async saveProjection(configuration: AirtableProjectionConfiguration): Promise<void> {
    await this.db
      .prepare(`INSERT INTO airtable_projection_configs (
        id, organization_id, connection_id, entity_type, table_id, table_name,
        enabled, preset, schema_version, field_mapping_json, inbound_fields_json,
        conflict_policy, projection_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(connection_id, entity_type) DO UPDATE SET
        table_id = excluded.table_id,
        table_name = excluded.table_name,
        enabled = excluded.enabled,
        preset = excluded.preset,
        schema_version = excluded.schema_version,
        field_mapping_json = excluded.field_mapping_json,
        inbound_fields_json = excluded.inbound_fields_json,
        conflict_policy = excluded.conflict_policy,
        projection_version = airtable_projection_configs.projection_version + 1,
        updated_at = excluded.updated_at`)
      .bind(
        configuration.id,
        configuration.organizationId,
        configuration.connectionId,
        configuration.entityType,
        configuration.tableId,
        configuration.tableName,
        configuration.enabled ? 1 : 0,
        configuration.preset,
        configuration.schemaVersion,
        JSON.stringify(configuration.fieldMapping),
        JSON.stringify(configuration.inboundFields),
        configuration.conflictPolicy,
        configuration.projectionVersion,
        configuration.createdAt,
        configuration.updatedAt,
      )
      .run();
  }
}

function mapAttempt(row: Row | null): AirtableOAuthAttempt | null {
  if (!row) return null;
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    initiatingUserId: text(row.initiating_user_id),
    connectionId: text(row.connection_id),
    stateHash: text(row.state_hash),
    pkceVerifierCiphertext: text(row.pkce_verifier_ciphertext),
    returnPath: text(row.return_path),
    callbackCodeHash: nullableText(row.callback_code_hash),
    status: text(row.status) as AirtableOAuthAttempt["status"],
    exchangeOwner: nullableText(row.exchange_owner),
    exchangeToken: nullableText(row.exchange_token),
    exchangeLeaseExpiresAt: nullableText(row.exchange_lease_expires_at),
    attemptVersion: integer(row.attempt_version),
    authorizationConnectionVersion: integer(row.authorization_connection_version),
    expiresAt: text(row.expires_at),
    consumedAt: nullableText(row.consumed_at),
    resultRedirect: nullableText(row.result_redirect),
    errorCode: nullableText(row.error_code),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapOAuthConnection(row: Row | null): AirtableOAuthConnection | null {
  if (!row) return null;
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    status: text(row.status) as AirtableOAuthConnection["status"],
    authMode: text(row.auth_mode) as AirtableOAuthConnection["authMode"],
    credentialReference: nullableText(row.credential_reference),
    airtableUserId: nullableText(row.airtable_user_id),
    airtableAccountId: nullableText(row.airtable_account_id),
    grantedScopes: stringArray(row.granted_scopes_json),
    accessTokenExpiresAt: nullableText(row.access_token_expires_at),
    refreshTokenExpiresAt: nullableText(row.refresh_token_expires_at),
    connectionVersion: integer(row.connection_version),
    refreshOwner: nullableText(row.refresh_owner),
    refreshToken: nullableText(row.refresh_token),
    refreshLeaseExpiresAt: nullableText(row.refresh_lease_expires_at),
    lastErrorCode: nullableText(row.last_error_code),
    lastError: nullableText(row.last_error),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function requireOAuthConnection(row: Row | null): AirtableOAuthConnection {
  const connection = mapOAuthConnection(row);
  if (!connection) throw new Error("Airtable OAuth connection was not found");
  return connection;
}

function mapControlConnection(row: Row | null): AirtableConnection | null {
  if (!row) return null;
  const credentialReference = nullableText(row.credential_reference);
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    status: text(row.status) as AirtableConnection["status"],
    authMode: text(row.auth_mode) as AirtableConnection["authMode"],
    credentialReference,
    credentialLastFour:
      text(row.auth_mode) === "pat" && credentialReference
        ? decodeSecretLastFour(credentialReference)
        : null,
    airtableUserId: nullableText(row.airtable_user_id),
    airtableAccountId: nullableText(row.airtable_account_id),
    baseId: nullableText(row.base_id),
    baseName: nullableText(row.base_name),
    grantedScopes: stringArray(row.granted_scopes_json),
    connectionVersion: integer(row.connection_version),
    lastSchemaCheckAt: nullableText(row.last_schema_check_at),
    lastSuccessAt: nullableText(row.last_success_at),
    lastErrorCode: nullableText(row.last_error_code),
    lastError: nullableText(row.last_error),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    disconnectedAt: nullableText(row.disconnected_at),
  };
}

function decodeSecretLastFour(reference: string): string | null {
  const prefix = "airtable-secret:v1:";
  if (!reference.startsWith(prefix)) return null;
  const payload = reference.slice(prefix.length);
  const separator = payload.indexOf(":");
  if (separator < 0) return null;
  return decodeURIComponent(payload.slice(0, separator)) || null;
}

function requireReference(reference: string, prefix: string): string {
  if (!reference.startsWith(prefix) || reference.length === prefix.length) {
    throw new Error("Invalid encrypted Airtable credential reference");
  }
  return reference.slice(prefix.length);
}

function changed(result: D1Result): boolean {
  return (result.meta?.changes ?? 0) > 0;
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

function stringArray(value: unknown): string[] {
  const parsed = JSON.parse(text(value)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Invalid Airtable D1 string array column");
  }
  return parsed;
}
