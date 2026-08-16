import { describe, expect, it } from "vitest";
import { AgendaCoordinator } from "./agenda-coordinator";
import {
  CloudflareBindingError,
  inspectCloudflareBindings,
  requireCloudflareBindings,
} from "./bindings";

function validBindings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    APP_ENV: "local",
    WEB_ORIGIN: "http://127.0.0.1:3015",
    CALENDAR_UID_DOMAIN: "calendar.localhost.test",
    DB: { prepare: () => undefined, batch: () => undefined },
    AGENDA_COORDINATOR: { idFromName: () => undefined, get: () => undefined },
    PRIVATE_FILES: { get: () => undefined, put: () => undefined },
    OUTBOX_QUEUE: { send: () => undefined },
    ...overrides,
  };
}

class FakeDurableObjectStorage {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async transaction<T>(closure: (transaction: DurableObjectTransaction) => Promise<T>): Promise<T> {
    return closure(this as unknown as DurableObjectTransaction);
  }
}

function createCoordinator(): AgendaCoordinator {
  const storage = new FakeDurableObjectStorage();
  return new AgendaCoordinator({ storage } as unknown as DurableObjectState);
}

async function mutate(
  coordinator: AgendaCoordinator,
  operationId: string,
  expectedRevision: number,
): Promise<Response> {
  return coordinator.fetch(
    new Request("https://agenda.invalid/mutations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId, expectedRevision }),
    }),
  );
}

describe("Cloudflare binding validation", () => {
  it("accepts the complete local binding contract", () => {
    const inspection = inspectCloudflareBindings(validBindings());

    expect(inspection).toMatchObject({
      success: true,
      bindings: { APP_ENV: "local", WEB_ORIGIN: "http://127.0.0.1:3015" },
    });
  });

  it("requires HTTPS, a valid calendar UID domain, and every stateful binding outside local development", () => {
    const inspection = inspectCloudflareBindings(
      validBindings({
        APP_ENV: "staging",
        WEB_ORIGIN: "http://staging.example.test",
        CALENDAR_UID_DOMAIN: "https://calendar.example.test",
        PRIVATE_FILES: undefined,
      }),
    );

    expect(inspection).toEqual({
      success: false,
      issues: [
        "non-local WEB_ORIGIN must use HTTPS",
        "CALENDAR_UID_DOMAIN must be a valid domain name",
        "PRIVATE_FILES must be an R2 binding",
      ],
    });
  });

  it("throws a typed error without including binding values", () => {
    expect(() => requireCloudflareBindings({ APP_ENV: "production" })).toThrow(
      CloudflareBindingError,
    );
    expect(() => requireCloudflareBindings({ APP_ENV: "production" })).toThrow(
      "WEB_ORIGIN must be a URL",
    );
  });
});

describe("AgendaCoordinator", () => {
  it("increments the revision and returns a stable receipt on replay", async () => {
    const coordinator = createCoordinator();

    const committed = await mutate(coordinator, "publish:revision-1", 0);
    expect(committed.status).toBe(201);
    const receipt = (await committed.json()) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      operationId: "publish:revision-1",
      previousRevision: 0,
      revision: 1,
      replayed: false,
    });

    const replayed = await mutate(coordinator, "publish:revision-1", 0);
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual({ ...receipt, replayed: true });

    const revision = await coordinator.fetch(new Request("https://agenda.invalid/revision"));
    expect(await revision.json()).toEqual({ revision: 1 });
  });

  it("rejects stale revisions without advancing state", async () => {
    const coordinator = createCoordinator();
    await mutate(coordinator, "publish:revision-1", 0);

    const conflict = await mutate(coordinator, "publish:revision-2", 0);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: "REVISION_CONFLICT",
      expectedRevision: 0,
      currentRevision: 1,
    });

    const committed = await mutate(coordinator, "publish:revision-2", 1);
    expect(committed.status).toBe(201);
    expect(await committed.json()).toMatchObject({ revision: 2, replayed: false });
  });

  it("rejects malformed operations and unknown routes", async () => {
    const coordinator = createCoordinator();
    const invalid = await coordinator.fetch(
      new Request("https://agenda.invalid/mutations", {
        method: "POST",
        body: JSON.stringify({ operationId: "", expectedRevision: -1 }),
      }),
    );
    expect(invalid.status).toBe(400);

    const missing = await coordinator.fetch(new Request("https://agenda.invalid/unknown"));
    expect(missing.status).toBe(404);
  });
});
