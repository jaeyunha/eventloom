import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AuthPrincipal } from "../auth/types";
import {
  AtomicIdempotencyCoordinator,
  type IdempotencyBeginResult,
  type IdempotencyRecord,
  type IdempotencyStore,
} from "./idempotency";
import {
  createPublicApiV1Routes,
  type PublicApiCreateInput,
  type PublicApiGetInput,
  type PublicApiListInput,
  type PublicApiRepository,
  type PublicApiRouteEnvironment,
  type PublicApiUpdateInput,
} from "./routes";

interface EventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly version: number;
}

type EventMutation = Readonly<Pick<EventRecord, "name">>;

class TestIdempotencyStore implements IdempotencyStore {
  readonly records = new Map<string, IdempotencyRecord>();

  async begin(input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
  }): Promise<IdempotencyBeginResult> {
    const mapKey = `${input.scope}:${input.key}`;
    const existing = this.records.get(mapKey);
    if (existing !== undefined) {
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
    readonly leaseId?: string;
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

class EventRepository implements PublicApiRepository<EventRecord, EventMutation, EventMutation> {
  readonly records: EventRecord[] = [
    { id: "event-a", organizationId: "org-1", name: "Same", version: 1 },
    { id: "event-b", organizationId: "org-1", name: "Same", version: 1 },
    { id: "event-c", organizationId: "org-1", name: "Zulu", version: 1 },
    { id: "other", organizationId: "org-2", name: "Other", version: 1 },
  ];
  creates = 0;
  updates = 0;

  async list(input: PublicApiListInput) {
    const rows = this.records
      .filter((record) => record.organizationId === input.organizationId)
      .sort((left, right) => {
        const name =
          left[input.sort as "name"] < right[input.sort as "name"]
            ? -1
            : left.id < right.id
              ? -1
              : 1;
        return name;
      });
    const start =
      input.cursorData === undefined
        ? 0
        : rows.findIndex((row) => row.id === input.cursorData?.id) + 1;
    return {
      items: rows.slice(start, start + input.limit + 1),
      hasMore: start + input.limit < rows.length,
      nextCursor: null,
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
      name: String(input.data.name),
      version: 1,
    };
    this.records.push(record);
    return record;
  }

  async update(input: PublicApiUpdateInput<EventMutation>) {
    const index = this.records.findIndex(
      (record) => record.organizationId === input.organizationId && record.id === input.id,
    );
    const current = index < 0 ? undefined : this.records[index];
    if (current === undefined || current.version !== input.expectedVersion) {
      return undefined;
    }
    this.updates += 1;
    const updated = { ...current, name: String(input.data.name), version: current.version + 1 };
    this.records[index] = updated;
    return updated;
  }
}

const user: AuthPrincipal = {
  kind: "user",
  sessionId: "session-1",
  userId: "user-1",
  email: "user@example.test",
  memberships: [{ organizationId: "org-1", role: "owner" }],
  speakerGrants: [],
};

const apiKey: AuthPrincipal = {
  kind: "apiKey",
  apiKeyId: "key-1",
  organizationId: "org-1",
  scopes: ["events:read", "events:write"],
};

const otherApiKey: AuthPrincipal = {
  kind: "apiKey",
  apiKeyId: "key-2",
  organizationId: "org-2",
  scopes: ["events:read", "events:write"],
};

function fixture(principal: AuthPrincipal | null = apiKey) {
  const repository = new EventRepository();
  const store = new TestIdempotencyStore();
  const app = new Hono<PublicApiRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("authPrincipal", principal);
    context.set("traceId", "trace-test");
    await next();
  });
  app.route(
    "/api/v1",
    createPublicApiV1Routes<EventRecord, EventMutation, EventMutation>({
      idempotency: new AtomicIdempotencyCoordinator(store),
      resources: [
        {
          name: "events",
          repository,
          sortFields: ["name", "id"],
          createSchema: z.object({ name: z.string().min(1) }),
          updateSchema: z.object({ name: z.string().min(1) }),
        },
      ],
    }),
  );
  return { app, repository };
}

describe("public API v1", () => {
  it("keeps cursor pages stable when sort values tie", async () => {
    const { app } = fixture();
    const first = await app.request("/api/v1/organizations/org-1/events?sort=name&limit=1");
    const firstBody = (await first.json()) as {
      data: EventRecord[];
      page: { nextCursor: string | null };
    };
    const second = await app.request(
      `/api/v1/organizations/org-1/events?sort=name&limit=1&cursor=${encodeURIComponent(firstBody.page.nextCursor ?? "")}`,
    );
    const secondBody = (await second.json()) as { data: EventRecord[] };
    expect(first.status).toBe(200);
    expect(firstBody.data[0]?.id).toBe("event-a");
    expect(secondBody.data[0]?.id).toBe("event-b");
  });

  it("rejects a cursor bound to another organization", async () => {
    const first = await fixture(apiKey).app.request(
      "/api/v1/organizations/org-1/events?sort=name&limit=1",
    );
    const firstBody = (await first.json()) as {
      page: { nextCursor: string | null };
    };
    const crossOrganization = await fixture(otherApiKey).app.request(
      `/api/v1/organizations/org-2/events?sort=name&limit=1&cursor=${encodeURIComponent(firstBody.page.nextCursor ?? "")}`,
    );
    expect(first.status).toBe(200);
    expect(firstBody.page.nextCursor).toEqual(expect.any(String));
    expect(crossOrganization.status).toBe(400);
  });
  it("denies unauthenticated, cross-organization, and missing-scope access", async () => {
    const unauthenticated = await fixture(null).app.request("/api/v1/organizations/org-1/events", {
      headers: { "x-request-id": "trace-test" },
    });
    const browserSession = await fixture(user).app.request("/api/v1/organizations/org-1/events");
    const crossOrganization = await fixture(apiKey).app.request(
      "/api/v1/organizations/org-2/events",
    );
    const missingScope = await fixture({
      ...apiKey,
      scopes: ["events:read"],
    } as AuthPrincipal).app.request("/api/v1/organizations/org-1/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "create-1",
      },
      body: JSON.stringify({ name: "Denied" }),
    });
    expect(unauthenticated.status).toBe(401);
    expect(browserSession.status).toBe(403);
    expect(crossOrganization.status).toBe(403);
    expect(missingScope.status).toBe(403);
  });

  it("replays an idempotent create and rejects a changed payload", async () => {
    const { app, repository } = fixture(apiKey);
    const request = {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "create-1" },
      body: JSON.stringify({ name: "Created" }),
    } as const;
    const first = await app.request("/api/v1/organizations/org-1/events", request);
    const replay = await app.request("/api/v1/organizations/org-1/events", request);
    const conflict = await app.request("/api/v1/organizations/org-1/events", {
      ...request,
      body: JSON.stringify({ name: "Changed" }),
    });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(repository.creates).toBe(1);
  });

  it("requires and enforces optimistic concurrency on updates", async () => {
    const { app, repository } = fixture(apiKey);
    const missing = await app.request("/api/v1/organizations/org-1/events/event-a", {
      method: "PATCH",
      headers: { "content-type": "application/json", "idempotency-key": "update-1" },
      body: JSON.stringify({ name: "No version" }),
    });
    const bodyOnly = await app.request("/api/v1/organizations/org-1/events/event-a", {
      method: "PATCH",
      headers: { "content-type": "application/json", "idempotency-key": "update-body" },
      body: JSON.stringify({ name: "Body version", expectedVersion: 1 }),
    });
    const invalidVersion = await app.request("/api/v1/organizations/org-1/events/event-a", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "update-zero",
        "if-match": "0",
      },
      body: JSON.stringify({ name: "Zero version" }),
    });
    const updated = await app.request("/api/v1/organizations/org-1/events/event-a", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "update-1",
        "if-match": 'W/"1"',
      },
      body: JSON.stringify({ name: "Updated" }),
    });
    const stale = await app.request("/api/v1/organizations/org-1/events/event-a", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "update-2",
        "if-match": "1",
      },
      body: JSON.stringify({ name: "Stale" }),
    });
    const put = await app.request("/api/v1/organizations/org-1/events/event-a", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "update-put",
        "if-match": "2",
      },
      body: JSON.stringify({ name: "Replacement" }),
    });
    expect(missing.status).toBe(412);
    expect(bodyOnly.status).toBe(412);
    expect(invalidVersion.status).toBe(412);
    expect(updated.status).toBe(200);
    expect(stale.status).toBe(412);
    expect(repository.updates).toBe(1);
    expect(put.status).toBe(404);
  });

  it("returns safe trace-bearing errors and a small OpenAPI document", async () => {
    const { app } = fixture(apiKey);
    const malformed = await app.request("/api/v1/organizations/org-1/events?cursor=bad", {
      headers: { "x-request-id": "trace-test" },
    });
    const openapi = await app.request("/api/v1/openapi.json");
    const body = (await malformed.json()) as {
      error: { code: string; message: string; traceId: string };
    };
    const document = (await openapi.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(malformed.status).toBe(400);
    expect(body.error.traceId).toBe("trace-test");
    expect(body.error.message).not.toContain("base64");
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/api/v1/organizations/{organizationId}/events"]).toBeDefined();
  });
});
