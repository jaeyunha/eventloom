export type AirtableAuthMode = "oauth" | "pat";

export type AirtableConnectionStatus =
  | "disconnected"
  | "authorizing"
  | "connected"
  | "refreshing"
  | "paused"
  | "reauthorization_required"
  | "disconnecting";

export interface AirtableConnection {
  id: string;
  organizationId: string;
  status: AirtableConnectionStatus;
  authMode: AirtableAuthMode;
  credentialReference: string | null;
  credentialLastFour: string | null;
  airtableUserId: string | null;
  airtableAccountId: string | null;
  baseId: string | null;
  baseName: string | null;
  grantedScopes: string[];
  connectionVersion: number;
  lastSchemaCheckAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  disconnectedAt: string | null;
}

export interface AirtableConnectionStore {
  findById(organizationId: string, connectionId: string): Promise<AirtableConnection | null>;
  findActiveByOrganization(organizationId: string): Promise<AirtableConnection | null>;
  create(connection: AirtableConnection): Promise<void>;
  update(
    organizationId: string,
    connectionId: string,
    patch: Partial<AirtableConnection>,
  ): Promise<AirtableConnection>;
}

export interface AirtableSecretStore {
  put(secret: string): Promise<string>;
  get(reference: string): Promise<string>;
  delete(reference: string): Promise<void>;
}

export interface AirtableProviderIdentity {
  userId: string | null;
  accountId: string | null;
  scopes: string[];
}

export interface AirtableFieldSchema {
  id: string;
  name: string;
  type: string;
}

export interface AirtableTableSchema {
  id: string;
  name: string;
  fields: AirtableFieldSchema[];
}

export interface AirtableBaseSchema {
  id: string;
  name: string;
  tables: AirtableTableSchema[];
}

export interface AirtableProvider {
  inspectCredential(input: {
    authMode: AirtableAuthMode;
    credential: string;
  }): Promise<AirtableProviderIdentity>;
  getBaseSchema(input: {
    authMode: AirtableAuthMode;
    credential: string;
    baseId: string;
  }): Promise<AirtableBaseSchema>;
  revokeCredential(input: { authMode: AirtableAuthMode; credential: string }): Promise<void>;
}

export interface AirtableRequiredField {
  sourceField: string;
  allowedTypes?: string[];
}

export interface AirtableEntitySchemaRequirement {
  entityType: string;
  tableName?: string;
  requiredFields: AirtableRequiredField[];
}

export interface AirtableControlConfiguration {
  requiredScopes: string[];
  schema: AirtableEntitySchemaRequirement[];
}

export interface AirtableConfigurationStore {
  getControlConfiguration(organizationId: string): Promise<AirtableControlConfiguration>;
  saveProjection(configuration: AirtableProjectionConfiguration): Promise<void>;
}

export interface AirtableProjectionConfiguration {
  id: string;
  organizationId: string;
  connectionId: string;
  entityType: string;
  tableId: string;
  tableName: string;
  enabled: boolean;
  preset: string;
  schemaVersion: number;
  fieldMapping: Record<string, string>;
  inboundFields: string[];
  conflictPolicy: "manual" | "d1_wins" | "airtable_wins";
  projectionVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAirtableConnectionStatus {
  id: string;
  status: AirtableConnectionStatus;
  authMode: AirtableAuthMode;
  credentialLastFour: string | null;
  airtableUserId: string | null;
  airtableAccountId: string | null;
  baseId: string | null;
  baseName: string | null;
  grantedScopes: string[];
  connectionVersion: number;
  lastSchemaCheckAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  updatedAt: string;
  disconnectedAt: string | null;
}

export class AirtableControlError extends Error {
  constructor(
    readonly code:
      | "connection_not_found"
      | "connection_already_exists"
      | "invalid_connection_state"
      | "missing_scope"
      | "base_not_found"
      | "schema_mismatch"
      | "invalid_mapping",
    message: string,
  ) {
    super(message);
    this.name = "AirtableControlError";
  }
}

export interface AirtableControlDependencies {
  connections: AirtableConnectionStore;
  provider: AirtableProvider;
  secrets: AirtableSecretStore;
  configurations: AirtableConfigurationStore;
  now: () => Date;
  createId: () => string;
}

export interface SaveAirtableMappingInput {
  organizationId: string;
  connectionId: string;
  entityType: string;
  tableId: string;
  fieldMapping: Record<string, string>;
  inboundFields?: string[];
  conflictPolicy?: "manual" | "d1_wins" | "airtable_wins";
  preset?: string;
  enabled?: boolean;
}

interface ValidatedCredential {
  identity: AirtableProviderIdentity;
  base: AirtableBaseSchema;
  configuration: AirtableControlConfiguration;
}

export class AirtableControlService {
  constructor(private readonly dependencies: AirtableControlDependencies) {}

  async connectPat(input: {
    organizationId: string;
    token: string;
    baseId: string;
  }): Promise<PublicAirtableConnectionStatus> {
    if (await this.dependencies.connections.findActiveByOrganization(input.organizationId)) {
      throw new AirtableControlError(
        "connection_already_exists",
        "The organization already has an active Airtable connection",
      );
    }

    const validated = await this.validateCredential(
      input.organizationId,
      "pat",
      input.token,
      input.baseId,
    );
    const credentialReference = await this.dependencies.secrets.put(input.token);
    const timestamp = this.timestamp();
    const connection: AirtableConnection = {
      id: this.dependencies.createId(),
      organizationId: input.organizationId,
      status: "connected",
      authMode: "pat",
      credentialReference,
      credentialLastFour: input.token.slice(-4) || null,
      airtableUserId: validated.identity.userId,
      airtableAccountId: validated.identity.accountId,
      baseId: validated.base.id,
      baseName: validated.base.name,
      grantedScopes: [...validated.identity.scopes],
      connectionVersion: 1,
      lastSchemaCheckAt: timestamp,
      lastSuccessAt: timestamp,
      lastErrorCode: null,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      disconnectedAt: null,
    };

    try {
      await this.dependencies.connections.create(connection);
    } catch (error) {
      await this.dependencies.secrets.delete(credentialReference);
      throw error;
    }

    return this.redact(connection);
  }

  async finalizeOAuth(input: {
    organizationId: string;
    connectionId: string;
    credentialReference: string;
    baseId: string;
  }): Promise<PublicAirtableConnectionStatus> {
    const connection = await this.requireConnection(input.organizationId, input.connectionId);
    if (
      connection.authMode !== "oauth" ||
      !["authorizing", "reauthorization_required"].includes(connection.status)
    ) {
      throw new AirtableControlError(
        "invalid_connection_state",
        "Only an authorizing OAuth connection can be finalized",
      );
    }

    try {
      const credential = await this.dependencies.secrets.get(input.credentialReference);
      const validated = await this.validateCredential(
        input.organizationId,
        "oauth",
        credential,
        input.baseId,
      );
      const timestamp = this.timestamp();
      const previousReference = connection.credentialReference;
      const updated = await this.dependencies.connections.update(
        input.organizationId,
        input.connectionId,
        {
          status: "connected",
          credentialReference: input.credentialReference,
          credentialLastFour: null,
          airtableUserId: validated.identity.userId,
          airtableAccountId: validated.identity.accountId,
          baseId: validated.base.id,
          baseName: validated.base.name,
          grantedScopes: [...validated.identity.scopes],
          connectionVersion: connection.connectionVersion + 1,
          lastSchemaCheckAt: timestamp,
          lastSuccessAt: timestamp,
          lastErrorCode: null,
          lastError: null,
          updatedAt: timestamp,
          disconnectedAt: null,
        },
      );
      if (previousReference && previousReference !== input.credentialReference) {
        await this.dependencies.secrets.delete(previousReference);
      }
      return this.redact(updated);
    } catch (error) {
      await this.markReauthorizationRequired(connection, error);
      throw error;
    }
  }

  async saveMapping(input: SaveAirtableMappingInput): Promise<AirtableProjectionConfiguration> {
    const connection = await this.requireConnection(input.organizationId, input.connectionId);
    this.requireState(connection, ["connected", "paused"]);
    if (!connection.credentialReference || !connection.baseId) {
      throw new AirtableControlError(
        "invalid_connection_state",
        "The connection has no credential or base",
      );
    }

    const credential = await this.dependencies.secrets.get(connection.credentialReference);
    const controlConfiguration = await this.dependencies.configurations.getControlConfiguration(
      input.organizationId,
    );
    this.assertScopes(controlConfiguration.requiredScopes, connection.grantedScopes);
    const base = await this.loadBase(connection.authMode, credential, connection.baseId);
    const table = base.tables.find((candidate) => candidate.id === input.tableId);
    if (!table) {
      throw new AirtableControlError("schema_mismatch", `Table ${input.tableId} does not exist`);
    }

    const requirement = controlConfiguration.schema.find(
      (candidate) => candidate.entityType === input.entityType,
    );
    if (!requirement) {
      throw new AirtableControlError(
        "invalid_mapping",
        `Entity type ${input.entityType} is not configured for Airtable`,
      );
    }
    this.assertTableMatches(requirement, table, input.fieldMapping);

    const timestamp = this.timestamp();
    const projection: AirtableProjectionConfiguration = {
      id: this.dependencies.createId(),
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      entityType: input.entityType,
      tableId: table.id,
      tableName: table.name,
      enabled: input.enabled ?? true,
      preset: input.preset ?? "custom",
      schemaVersion: 1,
      fieldMapping: { ...input.fieldMapping },
      inboundFields: [...(input.inboundFields ?? [])],
      conflictPolicy: input.conflictPolicy ?? "manual",
      projectionVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.dependencies.configurations.saveProjection(projection);
    await this.dependencies.connections.update(input.organizationId, input.connectionId, {
      lastSchemaCheckAt: timestamp,
      lastSuccessAt: timestamp,
      lastErrorCode: null,
      lastError: null,
      updatedAt: timestamp,
    });
    return projection;
  }

  async pause(
    organizationId: string,
    connectionId: string,
  ): Promise<PublicAirtableConnectionStatus> {
    const connection = await this.requireConnection(organizationId, connectionId);
    this.requireState(connection, ["connected"]);
    return this.redact(
      await this.dependencies.connections.update(organizationId, connectionId, {
        status: "paused",
        updatedAt: this.timestamp(),
      }),
    );
  }

  async resume(
    organizationId: string,
    connectionId: string,
  ): Promise<PublicAirtableConnectionStatus> {
    const connection = await this.requireConnection(organizationId, connectionId);
    this.requireState(connection, ["paused"]);
    if (!connection.credentialReference || !connection.baseId) {
      throw new AirtableControlError(
        "invalid_connection_state",
        "The connection has no credential or base",
      );
    }

    try {
      const credential = await this.dependencies.secrets.get(connection.credentialReference);
      const validated = await this.validateCredential(
        organizationId,
        connection.authMode,
        credential,
        connection.baseId,
      );
      const timestamp = this.timestamp();
      return this.redact(
        await this.dependencies.connections.update(organizationId, connectionId, {
          status: "connected",
          baseName: validated.base.name,
          grantedScopes: [...validated.identity.scopes],
          lastSchemaCheckAt: timestamp,
          lastSuccessAt: timestamp,
          lastErrorCode: null,
          lastError: null,
          updatedAt: timestamp,
        }),
      );
    } catch (error) {
      await this.markReauthorizationRequired(connection, error);
      throw error;
    }
  }

  async requireReauthorization(
    organizationId: string,
    connectionId: string,
    reason: string,
    code = "reauthorization_required",
  ): Promise<PublicAirtableConnectionStatus> {
    const connection = await this.requireConnection(organizationId, connectionId);
    this.requireState(connection, ["connected", "paused", "refreshing"]);
    return this.redact(
      await this.dependencies.connections.update(organizationId, connectionId, {
        status: "reauthorization_required",
        lastErrorCode: code,
        lastError: reason,
        updatedAt: this.timestamp(),
      }),
    );
  }

  async disconnect(
    organizationId: string,
    connectionId: string,
  ): Promise<PublicAirtableConnectionStatus> {
    const connection = await this.requireConnection(organizationId, connectionId);
    if (connection.status === "disconnected") return this.redact(connection);

    const timestamp = this.timestamp();
    await this.dependencies.connections.update(organizationId, connectionId, {
      status: "disconnecting",
      updatedAt: timestamp,
    });

    let revocationError: unknown = null;
    if (connection.credentialReference) {
      try {
        const credential = await this.dependencies.secrets.get(connection.credentialReference);
        await this.dependencies.provider.revokeCredential({
          authMode: connection.authMode,
          credential,
        });
      } catch (error) {
        revocationError = error;
      } finally {
        await this.dependencies.secrets.delete(connection.credentialReference);
      }
    }

    const completedAt = this.timestamp();
    return this.redact(
      await this.dependencies.connections.update(organizationId, connectionId, {
        status: "disconnected",
        credentialReference: null,
        credentialLastFour: null,
        connectionVersion: connection.connectionVersion + 1,
        lastErrorCode: revocationError ? "provider_revoke_failed" : null,
        lastError: revocationError ? this.errorMessage(revocationError) : null,
        updatedAt: completedAt,
        disconnectedAt: completedAt,
      }),
    );
  }

  async getStatus(
    organizationId: string,
    connectionId: string,
  ): Promise<PublicAirtableConnectionStatus> {
    return this.redact(await this.requireConnection(organizationId, connectionId));
  }

  private async validateCredential(
    organizationId: string,
    authMode: AirtableAuthMode,
    credential: string,
    baseId: string,
  ): Promise<ValidatedCredential> {
    const [identity, configuration] = await Promise.all([
      this.dependencies.provider.inspectCredential({ authMode, credential }),
      this.dependencies.configurations.getControlConfiguration(organizationId),
    ]);
    this.assertScopes(configuration.requiredScopes, identity.scopes);
    const base = await this.loadBase(authMode, credential, baseId);
    this.assertConfiguredSchema(configuration.schema, base);
    return { identity, base, configuration };
  }

  private async loadBase(
    authMode: AirtableAuthMode,
    credential: string,
    baseId: string,
  ): Promise<AirtableBaseSchema> {
    try {
      const base = await this.dependencies.provider.getBaseSchema({ authMode, credential, baseId });
      if (base.id !== baseId) {
        throw new AirtableControlError("base_not_found", `Airtable base ${baseId} was not found`);
      }
      return base;
    } catch (error) {
      if (error instanceof AirtableControlError) throw error;
      throw new AirtableControlError("base_not_found", `Airtable base ${baseId} was not found`);
    }
  }

  private assertScopes(required: string[], granted: string[]): void {
    const missing = required.filter((scope) => !granted.includes(scope));
    if (missing.length) {
      throw new AirtableControlError(
        "missing_scope",
        `Missing required Airtable scopes: ${missing.join(", ")}`,
      );
    }
  }

  private assertConfiguredSchema(
    requirements: AirtableEntitySchemaRequirement[],
    base: AirtableBaseSchema,
  ): void {
    for (const requirement of requirements) {
      if (!requirement.tableName) continue;
      const table = base.tables.find((candidate) => candidate.name === requirement.tableName);
      if (!table) {
        throw new AirtableControlError(
          "schema_mismatch",
          `Required Airtable table ${requirement.tableName} does not exist`,
        );
      }
      this.assertTableMatches(
        requirement,
        table,
        Object.fromEntries(
          requirement.requiredFields.map((field) => [field.sourceField, field.sourceField]),
        ),
      );
    }
  }

  private assertTableMatches(
    requirement: AirtableEntitySchemaRequirement,
    table: AirtableTableSchema,
    mapping: Record<string, string>,
  ): void {
    for (const requiredField of requirement.requiredFields) {
      const airtableField = mapping[requiredField.sourceField];
      if (!airtableField) {
        throw new AirtableControlError(
          "invalid_mapping",
          `Required source field ${requiredField.sourceField} is not mapped`,
        );
      }
      const field = table.fields.find(
        (candidate) =>
          candidate.id === airtableField ||
          candidate.name.toLocaleLowerCase() === airtableField.toLocaleLowerCase(),
      );
      if (!field) {
        throw new AirtableControlError(
          "schema_mismatch",
          `Mapped Airtable field ${airtableField} does not exist in ${table.name}`,
        );
      }
      if (requiredField.allowedTypes?.length && !requiredField.allowedTypes.includes(field.type)) {
        throw new AirtableControlError(
          "schema_mismatch",
          `Airtable field ${field.name} has incompatible type ${field.type}`,
        );
      }
    }
  }

  private async requireConnection(
    organizationId: string,
    connectionId: string,
  ): Promise<AirtableConnection> {
    const connection = await this.dependencies.connections.findById(organizationId, connectionId);
    if (!connection) {
      throw new AirtableControlError("connection_not_found", "Airtable connection was not found");
    }
    return connection;
  }

  private requireState(connection: AirtableConnection, allowed: AirtableConnectionStatus[]): void {
    if (!allowed.includes(connection.status)) {
      throw new AirtableControlError(
        "invalid_connection_state",
        `Airtable connection is ${connection.status}; expected ${allowed.join(" or ")}`,
      );
    }
  }

  private async markReauthorizationRequired(
    connection: AirtableConnection,
    error: unknown,
  ): Promise<void> {
    await this.dependencies.connections.update(connection.organizationId, connection.id, {
      status: "reauthorization_required",
      lastErrorCode:
        error instanceof AirtableControlError ? error.code : "credential_validation_failed",
      lastError: this.errorMessage(error),
      updatedAt: this.timestamp(),
    });
  }

  private redact(connection: AirtableConnection): PublicAirtableConnectionStatus {
    return {
      id: connection.id,
      status: connection.status,
      authMode: connection.authMode,
      credentialLastFour: connection.credentialLastFour,
      airtableUserId: connection.airtableUserId,
      airtableAccountId: connection.airtableAccountId,
      baseId: connection.baseId,
      baseName: connection.baseName,
      grantedScopes: [...connection.grantedScopes],
      connectionVersion: connection.connectionVersion,
      lastSchemaCheckAt: connection.lastSchemaCheckAt,
      lastSuccessAt: connection.lastSuccessAt,
      lastErrorCode: connection.lastErrorCode,
      lastError: connection.lastError,
      updatedAt: connection.updatedAt,
      disconnectedAt: connection.disconnectedAt,
    };
  }

  private timestamp(): string {
    return this.dependencies.now().toISOString();
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export function createAirtableControlService(
  dependencies: AirtableControlDependencies,
): AirtableControlService {
  return new AirtableControlService(dependencies);
}
