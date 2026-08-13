import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ApiBindings, createApp } from "../../apps/api/src/app";
import { RequestAuthenticator } from "../../apps/api/src/features/auth/authenticator";
import type {
  BetterAuthGateway,
  D1ApiKeyGateway,
  StoredApiKey,
} from "../../apps/api/src/features/auth/types";
import {
  AtomicIdempotencyCoordinator,
  type IdempotencyBeginResult,
  type IdempotencyRecord,
  type IdempotencyStore,
} from "../../apps/api/src/features/public-api/idempotency";
import type {
  PublicApiCreateInput,
  PublicApiGetInput,
  PublicApiListInput,
  PublicApiRepository,
  PublicApiUpdateInput,
} from "../../apps/api/src/features/public-api/routes";
import { InMemoryWebhookRepository } from "../../apps/api/src/integrations/webhooks/types";
import { apiErrorSchema } from "../../packages/contracts/src";

const environment: ApiBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "https://app.example.test",
};
const traceId = "56d37199-bbc7-4a49-b06b-25717e95b78e";
const openApiContract = readFileSync(
  new URL("../../openapi/openapi.yaml", import.meta.url),
  "utf8",
);

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openApiPathSection(path: string): string {
  const match = new RegExp(
    `^  ${escapedRegExp(path)}:\\n([\\s\\S]*?)(?=^  /|^components:)`,
    "m",
  ).exec(openApiContract);
  if (match === null) {
    throw new Error(`OpenAPI path is missing: ${path}`);
  }
  return match[1] ?? "";
}

interface EventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly version: number;
}

type EventMutation = Readonly<Pick<EventRecord, "name">>;

class EventRepository implements PublicApiRepository<EventRecord, EventMutation, EventMutation> {
  readonly records: EventRecord[] = [
    {
      id: "event-safe",
      organizationId: "org-1",
      name: "<script>globalThis.compromised=true</script>",
      version: 1,
    },
    { id: "event-other", organizationId: "org-2", name: "Other tenant", version: 1 },
  ];
  creates = 0;
  lastListInput: PublicApiListInput | undefined;

  async list(input: PublicApiListInput) {
    this.lastListInput = input;
    return {
      items: this.records.filter((record) => record.organizationId === input.organizationId),
      hasMore: false,
    };
  }

  async get(input: PublicApiGetInput) {
    return this.records.find(
      (record) => record.organizationId === input.organizationId && record.id === input.id,
    );
  }

  async create(input: PublicApiCreateInput<EventMutation>) {
    this.creates += 1;
    const record: EventRecord = {
      id: `event-created-${this.creates}`,
      organizationId: input.organizationId,
      name: input.data.name,
      version: 1,
    };
    this.records.push(record);
    return record;
  }

  async update(input: PublicApiUpdateInput<EventMutation>) {
    const index = this.records.findIndex(
      (record) => record.organizationId === input.organizationId && record.id === input.id,
    );
    const current = this.records[index];
    if (!current || current.version !== input.expectedVersion) return undefined;
    const updated = { ...current, name: input.data.name, version: current.version + 1 };
    this.records[index] = updated;
    return updated;
  }
}

class MemoryIdempotencyStore implements IdempotencyStore {
  readonly records = new Map<string, IdempotencyRecord>();

  async begin(input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
  }): Promise<IdempotencyBeginResult> {
    const mapKey = `${input.scope}:${input.key}`;
    const existing = this.records.get(mapKey);
    if (existing) {
      return existing.fingerprint === input.fingerprint
        ? { status: "replay", response: existing }
        : { status: "conflict" };
    }
    return { status: "acquired", leaseId: mapKey };
  }

  async complete(input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
    readonly response: { readonly status: number; readonly body: unknown };
  }): Promise<void> {
    this.records.set(`${input.scope}:${input.key}`, {
      scope: input.scope,
      key: input.key,
      fingerprint: input.fingerprint,
      ...input.response,
    });
  }
}

function authenticatorFixture() {
  const tokens = new Map<string, StoredApiKey>([
    [
      "org-1-secret-token",
      {
        id: "key-org-1",
        organizationId: "org-1",
        label: "test",
        scopes: ["events:read", "events:write", "webhooks:read", "webhooks:write"],
        expiresAt: null,
        revokedAt: null,
      },
    ],
    [
      "revoked-secret-token",
      {
        id: "key-revoked",
        organizationId: "org-1",
        label: "revoked",
        scopes: ["events:read"],
        expiresAt: null,
        revokedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  ]);
  const betterAuth: BetterAuthGateway = {
    resolveSession: async () => null,
    requestMagicLink: async () => undefined,
    consumeMagicLink: async () => null,
  };
  const apiKeys: D1ApiKeyGateway = {
    findByPresentedKey: async (token) => tokens.get(token) ?? null,
    recordSuccessfulUse: async () => undefined,
  };
  return new RequestAuthenticator(betterAuth, apiKeys, {
    clock: { now: () => new Date("2026-08-08T12:00:00.000Z") },
  });
}

function fixture() {
  const repository = new EventRepository();
  const webhookRepository = new InMemoryWebhookRepository([], {
    clock: { now: () => new Date("2026-08-08T12:00:00.000Z") },
    idFactory: (prefix) => `${prefix}_fixed`,
  });
  const app = createApp<EventRecord, EventMutation, EventMutation>({
    authenticator: authenticatorFixture(),
    publicApi: {
      idempotency: new AtomicIdempotencyCoordinator(new MemoryIdempotencyStore()),
      resources: [
        {
          name: "events",
          repository,
          sortFields: ["id", "name"],
        },
      ],
    },
    webhooks: webhookRepository,
  });
  return { app, repository };
}

const authorizedHeaders = {
  authorization: "Bearer org-1-secret-token",
  "x-request-id": traceId,
};

async function expectContractError(response: Response, status: number, code: string) {
  const body = apiErrorSchema.parse(await response.json());
  expect(response.status).toBe(status);
  expect(body.error.code).toBe(code);
  expect(body.error.traceId).toBe(traceId);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return body;
}

describe("assembled API contract and security", () => {
  it("returns trace-bearing 401, 403, 404, and 400 contract errors", async () => {
    const { app } = fixture();
    const unauthenticated = await app.request(
      "/api/v1/organizations/org-1/events",
      { headers: { "x-request-id": traceId } },
      environment,
    );
    const crossTenant = await app.request(
      "/api/v1/organizations/org-2/events",
      { headers: authorizedHeaders },
      environment,
    );
    const missing = await app.request(
      "/api/v1/organizations/org-1/events/missing",
      { headers: authorizedHeaders },
      environment,
    );
    const invalid = await app.request(
      "/api/v1/organizations/org-1/events?limit=0",
      { headers: authorizedHeaders },
      environment,
    );

    await expectContractError(unauthenticated, 401, "AUTHENTICATION_REQUIRED");
    await expectContractError(crossTenant, 403, "TENANT_SCOPE_VIOLATION");
    await expectContractError(missing, 404, "NOT_FOUND");
    await expectContractError(invalid, 400, "VALIDATION_FAILED");
  });

  it("rejects malformed and revoked API keys without exposing presented credentials", async () => {
    const { app } = fixture();
    const malformed = await app.request(
      "/api/v1/organizations/org-1/events",
      {
        headers: {
          authorization: "Bearer org-1-secret-token extra",
          "x-request-id": traceId,
        },
      },
      environment,
    );
    const revoked = await app.request(
      "/api/v1/organizations/org-1/events",
      {
        headers: {
          authorization: "Bearer revoked-secret-token",
          "x-request-id": traceId,
        },
      },
      environment,
    );

    const malformedBody = await expectContractError(malformed, 401, "AUTHENTICATION_REQUIRED");
    const revokedBody = await expectContractError(revoked, 401, "AUTHENTICATION_REQUIRED");
    expect(JSON.stringify([malformedBody, revokedBody])).not.toContain("secret-token");
  });

  it("enforces the configured credentialed CORS origin and write headers", async () => {
    const { app } = fixture();
    const allowed = await app.request(
      "/api/v1/organizations/org-1/events",
      {
        method: "OPTIONS",
        headers: {
          origin: environment.WEB_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,idempotency-key,content-type",
        },
      },
      environment,
    );
    const rejected = await app.request(
      "/api/v1/organizations/org-1/events",
      {
        method: "OPTIONS",
        headers: {
          origin: "https://attacker.example",
          "access-control-request-method": "POST",
        },
      },
      environment,
    );

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(environment.WEB_ORIGIN);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("access-control-allow-methods")).toContain("POST");
    expect(allowed.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "idempotency-key",
    );
    expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("keeps tenant filtering authoritative and treats injection input as inert data", async () => {
    const { app, repository } = fixture();
    const injection = "') OR RECORD_ID() != ''";
    const response = await app.request(
      `/api/v1/organizations/org-1/events?filter.name=${encodeURIComponent(injection)}`,
      { headers: authorizedHeaders },
      environment,
    );
    const body = (await response.json()) as { data: EventRecord[] };

    expect(response.status).toBe(200);
    expect(body.data.map((event) => event.id)).toEqual(["event-safe"]);
    expect(repository.lastListInput?.organizationId).toBe("org-1");
    expect(repository.lastListInput?.filters.name).toBe(injection);
  });

  it("serves untrusted text only as nosniff JSON with a non-HTML CSP", async () => {
    const { app } = fixture();
    const response = await app.request(
      "/api/v1/organizations/org-1/events/event-safe",
      { headers: authorizedHeaders },
      environment,
    );
    const body = (await response.json()) as EventRecord;

    expect(response.status).toBe(200);
    expect(body.name).toContain("<script>");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("replays identical writes and rejects an idempotency-key payload change", async () => {
    const { app, repository } = fixture();
    const request = {
      method: "POST",
      headers: {
        ...authorizedHeaders,
        "content-type": "application/json",
        "idempotency-key": "event-create-key",
      },
      body: JSON.stringify({ name: "Created once" }),
    } as const;
    const first = await app.request("/api/v1/organizations/org-1/events", request, environment);
    const replay = await app.request("/api/v1/organizations/org-1/events", request, environment);
    const conflict = await app.request(
      "/api/v1/organizations/org-1/events",
      { ...request, body: JSON.stringify({ name: "Changed" }) },
      environment,
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    await expectContractError(conflict, 409, "IDEMPOTENCY_CONFLICT");
    expect(await replay.json()).toEqual(await first.json());
    expect(repository.creates).toBe(1);
  });

  it("never returns webhook signing secrets and applies API-key tenant scopes", async () => {
    const { app } = fixture();
    const signingSecret = "signing-secret-that-must-never-be-returned";
    const created = await app.request(
      "/api/v1/organizations/org-1/webhooks",
      {
        method: "POST",
        headers: { ...authorizedHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          endpointUrl: "https://hooks.example.test/eventloom",
          events: ["agenda.published"],
          signingSecret,
        }),
      },
      environment,
    );
    const crossTenant = await app.request(
      "/api/v1/organizations/org-2/webhooks",
      { headers: authorizedHeaders },
      environment,
    );
    const body = await created.json();

    expect(created.status).toBe(201);
    expect(JSON.stringify(body)).not.toContain(signingSecret);
    expect(JSON.stringify(body)).not.toContain('signingSecret"');
    await expectContractError(crossTenant, 403, "ACCESS_DENIED");
  });
});
describe("checked-in OpenAPI contract security", () => {
  const canonicalPaths = [
    "/api/admin/organizations/{organizationId}/events",
    "/api/admin/organizations/{organizationId}/events/{eventId}",
    "/api/admin/organizations/{organizationId}/events/{eventId}/archive",
    "/api/admin/organizations/{organizationId}/events/{eventId}/sessions",
    "/api/admin/organizations/{organizationId}/events/{eventId}/sessions/settings",
    "/api/admin/organizations/{organizationId}/events/{eventId}/sessions/rooms",
    "/api/admin/organizations/{organizationId}/events/{eventId}/sessions/tracks",
    "/api/admin/organizations/{organizationId}/events/{eventId}/sessions/formats",
    "/api/admin/organizations/{organizationId}/events/{eventId}/sessions/levels",
    "/api/admin/organizations/{organizationId}/events/{eventId}/sessions/tags",
    "/api/admin/organizations/{organizationId}/events/{eventId}/communications/templates",
    "/api/admin/organizations/{organizationId}/events/{eventId}/communications/templates/{templateId}/approve",
    "/api/admin/organizations/{organizationId}/events/{eventId}/communications/previews",
    "/api/admin/organizations/{organizationId}/events/{eventId}/communications/sends",
    "/api/admin/organizations/{organizationId}/events/{eventId}/communications/sends/{sendId}/history",
    "/api/admin/organizations/{organizationId}/events/{eventId}/reports/definitions",
    "/api/admin/organizations/{organizationId}/events/{eventId}/reports/runs",
    "/api/admin/organizations/{organizationId}/events/{eventId}/reports/runs/{runId}/download",
    "/api/admin/organizations/{organizationId}/events/{eventId}/remix/candidates",
    "/api/admin/organizations/{organizationId}/events/{eventId}/remix/candidates/{candidateId}/apply",
    "/api/admin/organizations/{organizationId}/events/{eventId}/agenda/suggestions",
    "/api/speaker/portal/contexts",
    "/api/speaker/events/{eventId}/portal",
    "/api/speaker/events/{eventId}/submissions/{submissionId}/roster",
    "/api/speaker/events/{eventId}/assets",
    "/api/speaker/events/{eventId}/tasks",
    "/api/speaker/events/{eventId}/resources",
    "/api/speaker/events/{eventId}/wiki",
  ] as const;

  it("lists canonical tenant-qualified event surfaces with explicit operation security", () => {
    for (const path of canonicalPaths) {
      const section = openApiPathSection(path);
      expect(section).toContain("security:");
      expect(section).not.toContain("security: []");
    }

    const adminPaths = [...openApiContract.matchAll(/^ {2}(\/api\/admin\/[^:]+):$/gm)].map(
      ([, path]) => path ?? "",
    );
    expect(adminPaths.length).toBeGreaterThan(0);
    for (const path of adminPaths) {
      expect(path).toMatch(/^\/api\/admin\/organizations\/\{organizationId\}\/events(?:\/|$)/);
    }

    expect(openApiContract).not.toContain("/api/admin/events/");
    expect(openApiContract).not.toContain("/api/v1/organizations/{organizationId}/{resource}");
    expect(openApiContract).not.toContain("/templates/{templateId}/versions/{version}/approve");
    expect(openApiContract).not.toContain("tenantId:");
  });

  it("keeps public projections unauthenticated and private AI records protected", () => {
    const publicAgenda = openApiPathSection("/api/public/events/{eventId}/agenda");
    const publicSpeakers = openApiPathSection("/api/public/events/{eventSlug}/speakers");
    expect(publicAgenda).toContain("security: []");
    expect(publicSpeakers).toContain("security: []");
    expect(publicAgenda).not.toMatch(/candidate|suggestion/i);
    expect(publicSpeakers).not.toMatch(/candidate|suggestion/i);

    const remixCandidates = openApiPathSection(
      "/api/admin/organizations/{organizationId}/events/{eventId}/remix/candidates",
    );
    const agendaSuggestions = openApiPathSection(
      "/api/admin/organizations/{organizationId}/events/{eventId}/agenda/suggestions",
    );
    expect(remixCandidates).toContain("sessionAuth");
    expect(agendaSuggestions).toContain("sessionAuth");
    expect(remixCandidates).toContain("RemixCandidate");
    expect(agendaSuggestions).toContain("AgendaSuggestion");
    expect(openApiContract).not.toMatch(/\bobjectKey\b/);
  });

  it("uses exact request, version, error, and Eventloom sender identities", () => {
    expect(openApiContract).toContain("name: Idempotency-Key");
    expect(openApiContract).toContain("name: If-Match");
    expect(openApiContract).toContain("X-Request-ID");
    expect(openApiContract).toContain("ETag:");
    expect(openApiContract).toContain("AuthenticationError:");
    expect(openApiContract).toContain("TENANT_SCOPE_VIOLATION");
    expect(openApiContract).toContain("example: ai-engineer");
    expect(openApiContract).toContain("Retry-After");
    expect(openApiContract).toContain("Cache-Control");
    expect(openApiContract).toContain("Authorization bearer");
    for (const sender of [
      "auth@sessionboard.namuh.co",
      "speakers@sessionboard.namuh.co",
      "calendar@sessionboard.namuh.co",
    ]) {
      expect(openApiContract).toContain(sender);
    }
    expect(openApiContract).not.toMatch(/foreverbrowsing\.com|Accelevents|noreply@/i);
    expect(openApiContract).not.toMatch(/\/events\/\{eventId\}.*\/events\/\{eventId\}/);
    expect(openApiContract).not.toContain("/reports/events/");
    expect(openApiContract).not.toContain("/remix/events/");
  });
});
