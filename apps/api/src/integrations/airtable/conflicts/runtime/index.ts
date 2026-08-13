import type { AirtableIntegrationJson } from "../../../../routes/airtable-integration/routes";
import type { AirtableSecretStore } from "../../control/service";
import type { AirtableD1Database } from "../../d1/adapters";
import { D1AirtableConflictStore } from "../../d1/conflicts";
import {
  type AirtableConflictDomainCommands,
  type AirtableConflictDomainWriteResult,
  type AirtableConflictProviderCommands,
  type AirtableConflictProviderWriteResult,
  type AirtableConflictResolution,
  resolveAirtableConflict,
} from "../service";

export interface AirtableConflictDomainCommandInput {
  readonly commandId: string;
  readonly organizationId: string;
  readonly applicationId: string;
  readonly valueJson: string;
  readonly expectedVersion: number;
}

export interface AirtableConflictDomainCommandBinding {
  readonly entityType: string;
  /** Stable source path used by the inbound translator and stored as the conflict field ID. */
  readonly fieldId: string;
  readonly applyValue: (
    input: AirtableConflictDomainCommandInput,
  ) => Promise<AirtableConflictDomainWriteResult>;
}

export class UnsupportedAirtableConflictPathError extends Error {
  override readonly name = "UnsupportedAirtableConflictPathError";

  constructor(
    readonly entityType: string,
    readonly fieldId: string,
  ) {
    super(`Airtable conflict resolution is not supported for ${entityType}.${fieldId}`);
  }
}

/**
 * Uses the same explicit entity/field pairs as the inbound translator registry. There is no
 * fallback dispatch: adding a projection or field mapping alone never grants a D1 write path.
 */
export class AllowlistedAirtableConflictDomainCommands implements AirtableConflictDomainCommands {
  private readonly bindings: ReadonlyMap<string, AirtableConflictDomainCommandBinding>;

  constructor(bindings: readonly AirtableConflictDomainCommandBinding[]) {
    const indexed = new Map<string, AirtableConflictDomainCommandBinding>();
    for (const binding of bindings) {
      const key = dispatchKey(binding.entityType, binding.fieldId);
      if (indexed.has(key)) {
        throw new Error(`Duplicate Airtable conflict domain binding for ${key}`);
      }
      indexed.set(key, binding);
    }
    this.bindings = indexed;
  }

  async applyValue(input: {
    commandId: string;
    organizationId: string;
    entityType: string;
    applicationId: string;
    fieldId: string;
    valueJson: string;
    expectedVersion: number;
  }): Promise<AirtableConflictDomainWriteResult> {
    const binding = this.bindings.get(dispatchKey(input.entityType, input.fieldId));
    if (binding === undefined) {
      throw new UnsupportedAirtableConflictPathError(input.entityType, input.fieldId);
    }
    assertJson(input.valueJson, "Airtable conflict value");
    return binding.applyValue({
      commandId: input.commandId,
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      valueJson: input.valueJson,
      expectedVersion: input.expectedVersion,
    });
  }
}

export interface AirtableConflictRecordBinding {
  readonly organizationId: string;
  readonly connectionId: string;
  readonly baseId: string;
  readonly credentialReference: string;
  readonly tableId: string;
  readonly recordId: string;
  readonly airtableFieldId: string;
}

export interface AirtableConflictRecordBindingStore {
  find(input: {
    readonly organizationId: string;
    readonly connectionId: string;
    readonly entityType: string;
    readonly applicationId: string;
    readonly fieldId: string;
  }): Promise<AirtableConflictRecordBinding | null>;
}

type Row = Record<string, unknown>;

/** Resolves only an enabled, organization-scoped projection and its exact record mapping. */
export class D1AirtableConflictRecordBindingStore implements AirtableConflictRecordBindingStore {
  constructor(private readonly database: AirtableD1Database) {}

  async find(input: {
    organizationId: string;
    connectionId: string;
    entityType: string;
    applicationId: string;
    fieldId: string;
  }): Promise<AirtableConflictRecordBinding | null> {
    const row = await this.database
      .prepare(`SELECT
          c.organization_id, c.id AS connection_id, c.base_id, c.credential_reference,
          p.table_id, p.field_mapping_json, p.inbound_fields_json, m.record_id
        FROM airtable_connections AS c
        JOIN airtable_projection_configs AS p
          ON p.organization_id = c.organization_id AND p.connection_id = c.id
        JOIN airtable_record_mappings AS m
          ON m.organization_id = c.organization_id AND m.connection_id = c.id
          AND m.entity_type = p.entity_type
        WHERE c.organization_id = ? AND c.id = ? AND c.status = 'connected'
          AND c.base_id IS NOT NULL AND c.credential_reference IS NOT NULL
          AND p.entity_type = ? AND p.enabled = 1
          AND m.application_id = ? AND m.table_id = p.table_id
        LIMIT 1`)
      .bind(input.organizationId, input.connectionId, input.entityType, input.applicationId)
      .first<Row>();
    if (row === null) return null;

    const inboundFields = arrayOfStrings(row.inbound_fields_json, "Airtable inbound fields");
    if (!inboundFields.includes(input.fieldId)) return null;
    const fieldMapping = objectOfStrings(row.field_mapping_json);
    const airtableFieldId = fieldMapping[input.fieldId];
    if (airtableFieldId === undefined || airtableFieldId.length === 0) return null;

    return {
      organizationId: text(row.organization_id),
      connectionId: text(row.connection_id),
      baseId: text(row.base_id),
      credentialReference: text(row.credential_reference),
      tableId: text(row.table_id),
      recordId: text(row.record_id),
      airtableFieldId,
    };
  }
}

export interface AirtableConflictHttpProviderOptions {
  readonly bindings: AirtableConflictRecordBindingStore;
  readonly secrets: Pick<AirtableSecretStore, "get">;
  readonly fetch?: typeof fetch;
  readonly apiOrigin?: string;
}

/** Performs a partial Airtable record update after resolving the D1-owned binding and mapping. */
export class AirtableConflictHttpProviderCommands implements AirtableConflictProviderCommands {
  private readonly fetcher: typeof fetch;
  private readonly apiOrigin: string;

  constructor(private readonly options: AirtableConflictHttpProviderOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.apiOrigin = (options.apiOrigin ?? "https://api.airtable.com").replace(/\/$/, "");
  }

  async writeValue(input: {
    commandId: string;
    organizationId: string;
    connectionId: string;
    entityType: string;
    applicationId: string;
    fieldId: string;
    valueJson: string;
  }): Promise<AirtableConflictProviderWriteResult> {
    const binding = await this.options.bindings.find(input);
    if (binding === null) {
      throw new UnsupportedAirtableConflictPathError(input.entityType, input.fieldId);
    }
    const value = parseJson(input.valueJson, "Airtable conflict value");
    const credential = await this.options.secrets.get(binding.credentialReference);
    const path = ["v0", binding.baseId, binding.tableId, binding.recordId]
      .map(encodeURIComponent)
      .join("/");
    const response = await this.fetcher(`${this.apiOrigin}/${path}`, {
      method: "PATCH",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
        "x-airtable-client-request-id": input.commandId,
      },
      body: JSON.stringify({ fields: { [binding.airtableFieldId]: value } }),
    });
    if (!response.ok) {
      throw new Error(`Airtable conflict write-back failed (${response.status}).`);
    }
    return { kind: "applied" };
  }
}

export interface AirtableConflictRuntimeOptions {
  readonly database: AirtableD1Database;
  readonly connectionForOrganization: (
    organizationId: string,
  ) => Promise<{ readonly id: string } | null>;
  readonly domainBindings: readonly AirtableConflictDomainCommandBinding[];
  readonly secrets: Pick<AirtableSecretStore, "get">;
  readonly fetch?: typeof fetch;
  readonly apiOrigin?: string;
  readonly now?: () => Date;
}

export interface ResolveAirtableConflictRuntimeInput {
  readonly resolution: AirtableConflictResolution;
  readonly resolverId: string;
  readonly commandId: string;
  readonly manualValue?: { readonly valueJson: string };
}

export interface AirtableConflictRuntimeFacade {
  listConflicts(organizationId: string): Promise<AirtableIntegrationJson>;
  resolveConflict(
    organizationId: string,
    conflictId: string,
    input: ResolveAirtableConflictRuntimeInput,
  ): Promise<AirtableIntegrationJson>;
}

/** Route-facing facade with real D1 state transitions and real command/provider execution. */
export function createAirtableConflictRuntime(
  options: AirtableConflictRuntimeOptions,
): AirtableConflictRuntimeFacade {
  const conflicts = new D1AirtableConflictStore(options.database);
  const domain = new AllowlistedAirtableConflictDomainCommands(options.domainBindings);
  const provider = new AirtableConflictHttpProviderCommands({
    bindings: new D1AirtableConflictRecordBindingStore(options.database),
    secrets: options.secrets,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.apiOrigin === undefined ? {} : { apiOrigin: options.apiOrigin }),
  });
  const now = options.now ?? (() => new Date());

  return {
    async listConflicts(organizationId) {
      requireIdentifier(organizationId, "organizationId");
      const connection = await options.connectionForOrganization(organizationId);
      if (connection === null) return [];
      return jsonValue(
        await conflicts.listByOrganizationAndConnection({
          organizationId,
          connectionId: connection.id,
        }),
      );
    },

    async resolveConflict(organizationId, conflictId, input) {
      requireIdentifier(organizationId, "organizationId");
      requireIdentifier(conflictId, "conflictId");
      requireIdentifier(input.resolverId, "resolverId");
      requireIdentifier(input.commandId, "commandId");
      if (input.resolution === "manual") {
        if (input.manualValue === undefined) {
          throw new Error("Manual conflict resolution requires a JSON value.");
        }
        assertJson(input.manualValue.valueJson, "Manual conflict value");
      } else if (input.manualValue !== undefined) {
        throw new Error("manualValue is valid only for manual conflict resolution.");
      }

      return jsonValue(
        await resolveAirtableConflict(
          { conflicts, domain, provider, now },
          {
            conflictId,
            organizationId,
            resolverId: input.resolverId,
            commandId: input.commandId,
            resolution: input.resolution,
            ...(input.manualValue === undefined ? {} : { manualValue: input.manualValue }),
          },
        ),
      );
    },
  };
}

function dispatchKey(entityType: string, fieldId: string): string {
  requireIdentifier(entityType, "entityType");
  requireIdentifier(fieldId, "fieldId");
  return `${entityType}\u0000${fieldId}`;
}

function requireIdentifier(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} is required`);
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid Airtable conflict binding text column");
  }
  return value;
}

function arrayOfStrings(value: unknown, name: string): readonly string[] {
  const parsed = typeof value === "string" ? parseJson(value, name) : value;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error(`${name} must be a JSON array of strings`);
  }
  return parsed;
}

function objectOfStrings(value: unknown): Readonly<Record<string, string>> {
  const parsed = typeof value === "string" ? parseJson(value, "Airtable field mapping") : value;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Airtable field mapping must be a JSON object");
  }
  const entries = Object.entries(parsed);
  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === "string")) {
    throw new Error("Airtable field mapping values must be strings");
  }
  return Object.fromEntries(entries);
}

function parseJson(valueJson: string, name: string): unknown {
  try {
    return JSON.parse(valueJson) as unknown;
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
}

function assertJson(valueJson: string, name: string): void {
  parseJson(valueJson, name);
}

function jsonValue(value: unknown): AirtableIntegrationJson {
  return JSON.parse(JSON.stringify(value)) as AirtableIntegrationJson;
}
