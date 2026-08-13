import { describe, expect, it } from "vitest";
import {
  type AirtableBaseSchema,
  type AirtableConfigurationStore,
  type AirtableConnection,
  type AirtableConnectionStore,
  type AirtableControlDependencies,
  type AirtableControlError,
  AirtableControlService,
  type AirtableProjectionConfiguration,
  type AirtableProvider,
  type AirtableSecretStore,
} from "./service";

const NOW = new Date("2026-01-02T03:04:05.000Z");
const REQUIRED_SCOPES = ["data.records:read", "data.records:write", "schema.bases:read"];
const BASE: AirtableBaseSchema = {
  id: "app_base",
  name: "Applications",
  tables: [
    {
      id: "tbl_applications",
      name: "Applications",
      fields: [
        { id: "fld_name", name: "Name", type: "singleLineText" },
        { id: "fld_status", name: "Status", type: "singleSelect" },
      ],
    },
  ],
};

class MemoryConnections implements AirtableConnectionStore {
  readonly records = new Map<string, AirtableConnection>();

  async findById(organizationId: string, connectionId: string) {
    const connection = this.records.get(connectionId);
    return connection?.organizationId === organizationId ? structuredClone(connection) : null;
  }

  async findActiveByOrganization(organizationId: string) {
    const connection = [...this.records.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.status !== "disconnected",
    );
    return connection ? structuredClone(connection) : null;
  }

  async create(connection: AirtableConnection) {
    this.records.set(connection.id, structuredClone(connection));
  }

  async update(organizationId: string, connectionId: string, patch: Partial<AirtableConnection>) {
    const existing = this.records.get(connectionId);
    if (!existing || existing.organizationId !== organizationId)
      throw new Error("missing connection");
    const updated = { ...existing, ...structuredClone(patch) };
    this.records.set(connectionId, updated);
    return structuredClone(updated);
  }
}

class MemorySecrets implements AirtableSecretStore {
  readonly values = new Map<string, string>();
  readonly deleted: string[] = [];
  next = 1;

  async put(secret: string) {
    const reference = `secret-${this.next++}`;
    this.values.set(reference, secret);
    return reference;
  }

  async get(reference: string) {
    const value = this.values.get(reference);
    if (!value) throw new Error("secret missing");
    return value;
  }

  async delete(reference: string) {
    this.deleted.push(reference);
    this.values.delete(reference);
  }
}

class MemoryConfigurations implements AirtableConfigurationStore {
  readonly saved: AirtableProjectionConfiguration[] = [];

  async getControlConfiguration() {
    return {
      requiredScopes: REQUIRED_SCOPES,
      schema: [
        {
          entityType: "application",
          tableName: "Applications",
          requiredFields: [
            { sourceField: "name", allowedTypes: ["singleLineText"] },
            { sourceField: "status", allowedTypes: ["singleSelect"] },
          ],
        },
      ],
    };
  }

  async saveProjection(configuration: AirtableProjectionConfiguration) {
    this.saved.push(structuredClone(configuration));
  }
}

class FakeProvider implements AirtableProvider {
  scopes = [...REQUIRED_SCOPES];
  base = structuredClone(BASE);
  inspectCalls: unknown[] = [];
  baseCalls: unknown[] = [];
  revokeCalls: unknown[] = [];
  revokeError: Error | null = null;

  async inspectCredential(input: { authMode: "oauth" | "pat"; credential: string }) {
    this.inspectCalls.push(input);
    return { userId: "usr_airtable", accountId: "acc_airtable", scopes: [...this.scopes] };
  }

  async getBaseSchema(input: { authMode: "oauth" | "pat"; credential: string; baseId: string }) {
    this.baseCalls.push(input);
    return structuredClone(this.base);
  }

  async revokeCredential(input: { authMode: "oauth" | "pat"; credential: string }) {
    this.revokeCalls.push(input);
    if (this.revokeError) throw this.revokeError;
  }
}

function connection(overrides: Partial<AirtableConnection> = {}): AirtableConnection {
  return {
    id: "connection-1",
    organizationId: "organization-1",
    status: "connected",
    authMode: "pat",
    credentialReference: "secret-existing",
    credentialLastFour: "1234",
    airtableUserId: "usr_airtable",
    airtableAccountId: "acc_airtable",
    baseId: BASE.id,
    baseName: BASE.name,
    grantedScopes: [...REQUIRED_SCOPES],
    connectionVersion: 1,
    lastSchemaCheckAt: NOW.toISOString(),
    lastSuccessAt: NOW.toISOString(),
    lastErrorCode: null,
    lastError: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    disconnectedAt: null,
    ...overrides,
  };
}

function setup(existing?: AirtableConnection) {
  const connections = new MemoryConnections();
  const secrets = new MemorySecrets();
  const provider = new FakeProvider();
  const configurations = new MemoryConfigurations();
  let id = 1;
  if (existing) {
    connections.records.set(existing.id, structuredClone(existing));
    if (existing.credentialReference)
      secrets.values.set(existing.credentialReference, "credential-value");
  }
  const dependencies: AirtableControlDependencies = {
    connections,
    secrets,
    provider,
    configurations,
    now: () => new Date(NOW),
    createId: () => `generated-${id++}`,
  };
  return {
    service: new AirtableControlService(dependencies),
    connections,
    secrets,
    provider,
    configurations,
  };
}

describe("AirtableControlService", () => {
  it("connects a PAT only after validating scopes, base, and required schema", async () => {
    const { service, connections, secrets, provider } = setup();

    const status = await service.connectPat({
      organizationId: "organization-1",
      token: "pat-secret-9876",
      baseId: BASE.id,
    });

    expect(provider.inspectCalls).toEqual([{ authMode: "pat", credential: "pat-secret-9876" }]);
    expect(provider.baseCalls).toEqual([
      { authMode: "pat", credential: "pat-secret-9876", baseId: BASE.id },
    ]);
    expect(status).toMatchObject({
      id: "generated-1",
      status: "connected",
      authMode: "pat",
      credentialLastFour: "9876",
      baseId: BASE.id,
      baseName: BASE.name,
      connectionVersion: 1,
      updatedAt: NOW.toISOString(),
    });
    expect(status).not.toHaveProperty("credentialReference");
    expect(JSON.stringify(status)).not.toContain("pat-secret-9876");
    expect(secrets.values.get("secret-1")).toBe("pat-secret-9876");
    expect(connections.records.get("generated-1")?.credentialReference).toBe("secret-1");
  });

  it("rejects missing required scopes before storing a PAT", async () => {
    const { service, provider, secrets } = setup();
    provider.scopes = ["data.records:read"];

    await expect(
      service.connectPat({ organizationId: "organization-1", token: "pat", baseId: BASE.id }),
    ).rejects.toMatchObject({ code: "missing_scope" } satisfies Partial<AirtableControlError>);
    expect(secrets.values.size).toBe(0);
    expect(provider.baseCalls).toEqual([]);
  });

  it("rejects a base whose required schema is incompatible", async () => {
    const { service, provider, secrets } = setup();
    const table = provider.base.tables[0];
    if (table === undefined) {
      throw new Error("Expected an Airtable fixture table.");
    }
    const field = table.fields[1];
    if (field === undefined) {
      throw new Error("Expected an Airtable fixture field.");
    }
    field.type = "number";

    await expect(
      service.connectPat({ organizationId: "organization-1", token: "pat", baseId: BASE.id }),
    ).rejects.toMatchObject({ code: "schema_mismatch" } satisfies Partial<AirtableControlError>);
    expect(secrets.values.size).toBe(0);
  });

  it("accepts an OAuth credential handoff only after validation and removes the old secret", async () => {
    const authorizing = connection({
      status: "authorizing",
      authMode: "oauth",
      credentialReference: "secret-old",
      credentialLastFour: null,
      baseId: null,
      baseName: null,
    });
    const { service, connections, secrets, provider } = setup(authorizing);
    secrets.values.set("secret-new", "oauth-access-token");

    const status = await service.finalizeOAuth({
      organizationId: authorizing.organizationId,
      connectionId: authorizing.id,
      credentialReference: "secret-new",
      baseId: BASE.id,
    });

    expect(provider.inspectCalls).toEqual([
      { authMode: "oauth", credential: "oauth-access-token" },
    ]);
    expect(status.status).toBe("connected");
    expect(status.connectionVersion).toBe(2);
    expect(status.credentialLastFour).toBeNull();
    expect(connections.records.get(authorizing.id)?.credentialReference).toBe("secret-new");
    expect(secrets.deleted).toEqual(["secret-old"]);
  });

  it("marks a failed OAuth validation as requiring reauthorization", async () => {
    const authorizing = connection({ status: "authorizing", authMode: "oauth" });
    const { service, connections, provider } = setup(authorizing);
    provider.scopes = [];
    const credentialReference = authorizing.credentialReference;
    if (credentialReference === null) {
      throw new Error("Expected an OAuth credential reference.");
    }

    await expect(
      service.finalizeOAuth({
        organizationId: authorizing.organizationId,
        connectionId: authorizing.id,
        credentialReference,
        baseId: BASE.id,
      }),
    ).rejects.toMatchObject({ code: "missing_scope" } satisfies Partial<AirtableControlError>);
    expect(connections.records.get(authorizing.id)).toMatchObject({
      status: "reauthorization_required",
      lastErrorCode: "missing_scope",
    });
  });

  it("validates and saves a mapping using the live table schema", async () => {
    const existing = connection();
    const { service, configurations } = setup(existing);

    const projection = await service.saveMapping({
      organizationId: existing.organizationId,
      connectionId: existing.id,
      entityType: "application",
      tableId: "tbl_applications",
      fieldMapping: { name: "fld_name", status: "fld_status" },
      inboundFields: ["status"],
      conflictPolicy: "airtable_wins",
    });

    expect(projection).toEqual({
      id: "generated-1",
      organizationId: existing.organizationId,
      connectionId: existing.id,
      entityType: "application",
      tableId: "tbl_applications",
      tableName: "Applications",
      enabled: true,
      preset: "custom",
      schemaVersion: 1,
      fieldMapping: { name: "fld_name", status: "fld_status" },
      inboundFields: ["status"],
      conflictPolicy: "airtable_wins",
      projectionVersion: 1,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(configurations.saved).toEqual([projection]);
  });

  it("pauses and resumes only after revalidating the credential", async () => {
    const existing = connection();
    const { service, provider } = setup(existing);

    expect((await service.pause(existing.organizationId, existing.id)).status).toBe("paused");
    expect((await service.resume(existing.organizationId, existing.id)).status).toBe("connected");
    expect(provider.inspectCalls).toHaveLength(1);
    expect(provider.baseCalls).toHaveLength(1);
  });

  it("supports an explicit reauthorization transition", async () => {
    const existing = connection();
    const { service } = setup(existing);

    const status = await service.requireReauthorization(
      existing.organizationId,
      existing.id,
      "The token was revoked",
      "token_revoked",
    );

    expect(status).toMatchObject({
      status: "reauthorization_required",
      lastErrorCode: "token_revoked",
      lastError: "The token was revoked",
    });
  });

  it("revokes then deletes the local secret on disconnect", async () => {
    const existing = connection();
    const { service, secrets, provider, connections } = setup(existing);

    const status = await service.disconnect(existing.organizationId, existing.id);

    expect(provider.revokeCalls).toEqual([{ authMode: "pat", credential: "credential-value" }]);
    expect(secrets.deleted).toEqual(["secret-existing"]);
    expect(status).toMatchObject({
      status: "disconnected",
      credentialLastFour: null,
      connectionVersion: 2,
      disconnectedAt: NOW.toISOString(),
    });
    expect(connections.records.get(existing.id)?.credentialReference).toBeNull();
  });

  it("deletes the local secret and completes disconnect when provider revocation fails", async () => {
    const existing = connection();
    const { service, secrets, provider } = setup(existing);
    provider.revokeError = new Error("provider unavailable");

    const status = await service.disconnect(existing.organizationId, existing.id);

    expect(secrets.deleted).toEqual(["secret-existing"]);
    expect(status).toMatchObject({
      status: "disconnected",
      lastErrorCode: "provider_revoke_failed",
      lastError: "provider unavailable",
    });
  });

  it("returns a redacted public status", async () => {
    const existing = connection();
    const { service } = setup(existing);

    const status = await service.getStatus(existing.organizationId, existing.id);

    expect(status.credentialLastFour).toBe("1234");
    expect(status).not.toHaveProperty("credentialReference");
    expect(status).not.toHaveProperty("organizationId");
    expect(status).not.toHaveProperty("createdAt");
  });
});
