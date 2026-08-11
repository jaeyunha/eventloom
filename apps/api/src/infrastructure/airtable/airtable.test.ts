import { describe, expect, it } from "vitest";
import {
  type AirtableMapper,
  AirtableRepository,
  AirtableRepositoryError,
  type AirtableRequest,
  applicationIdFormula,
  FakeAirtableTransport,
  FetchAirtableTransport,
  RetryingAirtableTransport,
} from "./index";

interface EventEntity {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

interface EventCreate {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

interface EventUpdate {
  readonly name?: string;
  readonly active?: boolean;
}

interface EventFields {
  "Application ID": string;
  Name: string;
  Active: boolean;
}

const mapper: AirtableMapper<EventEntity, EventCreate, EventUpdate, EventFields> = {
  applicationIdField: "Application ID",
  applicationIdOf: (input) => input.id,
  encodeCreate: (input) => ({
    "Application ID": input.id,
    Name: input.name,
    Active: input.active,
  }),
  encodeUpdate: (input) => {
    const fields: Partial<EventFields> = {};
    if (input.name !== undefined) {
      fields.Name = input.name;
    }
    if (input.active !== undefined) {
      fields.Active = input.active;
    }
    return fields;
  },
  decode: (fields) => ({
    id: fields["Application ID"],
    name: fields.Name,
    active: fields.Active,
  }),
};

function createRepository(transport: FakeAirtableTransport | RetryingAirtableTransport) {
  return new AirtableRepository({
    baseId: "app_test",
    table: "Events",
    mapper,
    transport,
  });
}

function seedEvent(transport: FakeAirtableTransport, event: EventEntity, recordId?: string): void {
  transport.seed({
    baseId: "app_test",
    table: "Events",
    fields: {
      "Application ID": event.id,
      Name: event.name,
      Active: event.active,
    },
    ...(recordId === undefined ? {} : { recordId }),
  });
}

describe("AirtableRepository", () => {
  it("round-trips typed entities without exposing Airtable record IDs", async () => {
    const transport = new FakeAirtableTransport();
    const repository = createRepository(transport);

    const created = await repository.create({ id: "evt_01", name: "Launch", active: true });
    const read = await repository.get("evt_01");
    const updated = await repository.update("evt_01", { name: "Launch day", active: false });

    expect(created).toEqual({ id: "evt_01", name: "Launch", active: true });
    expect(read).toEqual(created);
    expect(updated).toEqual({ id: "evt_01", name: "Launch day", active: false });
    expect(JSON.stringify([created, read, updated])).not.toContain("rec00000000000001");
    expect(await repository.delete("evt_01")).toBe(true);
    expect(await repository.find("evt_01")).toBeUndefined();
    expect(await repository.delete("evt_01")).toBe(false);
  });

  it("paginates deterministically by stable application ID", async () => {
    const transport = new FakeAirtableTransport();
    seedEvent(transport, { id: "evt_03", name: "Third", active: true });
    seedEvent(transport, { id: "evt_01", name: "First", active: true });
    seedEvent(transport, { id: "evt_02", name: "Second", active: true });
    const repository = createRepository(transport);

    const first = await repository.list({ pageSize: 2 });
    if (first.nextCursor === undefined) {
      throw new Error("Expected the first page to include a cursor.");
    }
    const second = await repository.list({ pageSize: 2, cursor: first.nextCursor });

    expect(first.items.map(({ id }) => id)).toEqual(["evt_01", "evt_02"]);
    expect(first.nextCursor).toBe("offset:2");
    expect(second.items.map(({ id }) => id)).toEqual(["evt_03"]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("supports OR filters for bounded application-ID reads", async () => {
    const transport = new FakeAirtableTransport();
    seedEvent(transport, { id: "evt_03", name: "Third", active: true });
    seedEvent(transport, { id: "evt_01", name: "First", active: true });
    seedEvent(transport, { id: "evt_02", name: "Second", active: true });
    const repository = createRepository(transport);

    const result = await repository.list({
      filterByFormula: "OR({Application ID}='evt_01',{Application ID}='evt_03')",
    });

    expect(result.items.map(({ id }) => id)).toEqual(["evt_01", "evt_03"]);
  });
  it("uses event-scoped filters without returning another event", async () => {
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "app_test",
      table: "Events",
      fields: {
        "Application ID": "evt_a",
        "Event ID": "event-a",
        Name: "Event A",
        Active: true,
      },
    });
    transport.seed({
      baseId: "app_test",
      table: "Events",
      fields: {
        "Application ID": "evt_b",
        "Event ID": "event-b",
        Name: "Event B",
        Active: true,
      },
    });
    const repository = createRepository(transport);

    const result = await repository.list({
      filterByFormula: applicationIdFormula("Event ID", "event-a"),
    });

    expect(result.items.map(({ id }) => id)).toEqual(["evt_a"]);
    expect(transport.requests[0]?.query?.filterByFormula).toBe("{Event ID}='event-a'");
  });
  it("supports scoped FIND filters over JSON payload fields", async () => {
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "app_test",
      table: "Events",
      fields: {
        "Application ID": "evt_a",
        Name: "Event A",
        Active: true,
        "Payload JSON": JSON.stringify({ eventId: "event-a" }),
      },
    });
    transport.seed({
      baseId: "app_test",
      table: "Events",
      fields: {
        "Application ID": "evt_b",
        Name: "Event B",
        Active: true,
        "Payload JSON": JSON.stringify({ eventId: "event-b" }),
      },
    });
    const repository = createRepository(transport);

    const result = await repository.list({
      filterByFormula: 'FIND("event-a",{Payload JSON})>0',
    });

    expect(result.items.map(({ id }) => id)).toEqual(["evt_a"]);
  });

  it("rejects internal Airtable IDs and duplicate application IDs", async () => {
    const transport = new FakeAirtableTransport();
    seedEvent(transport, { id: "evt_duplicate", name: "One", active: true });
    seedEvent(transport, { id: "evt_duplicate", name: "Two", active: true });
    const repository = createRepository(transport);

    await expect(repository.get("evt_duplicate")).rejects.toMatchObject({
      code: "DUPLICATE_APPLICATION_ID",
    });
    await expect(
      repository.create({
        id: "rec00000000000001",
        name: "Leaked ID",
        active: true,
      }),
    ).rejects.toThrow("Airtable record IDs cannot be used as application IDs");
  });

  it("returns safe typed errors for unsuccessful and malformed responses", async () => {
    const unavailable = new FakeAirtableTransport();
    unavailable.enqueueResponse({ status: 503, headers: {}, body: { secret: "do not expose" } });

    await expect(createRepository(unavailable).list()).rejects.toEqual(
      expect.objectContaining({
        code: "REQUEST_FAILED",
        status: 503,
        retryable: true,
        message: "Airtable request failed with status 503.",
      }),
    );

    const malformed = new FakeAirtableTransport();
    malformed.enqueueResponse({ status: 200, headers: {}, body: { records: "invalid" } });
    await expect(createRepository(malformed).list()).rejects.toBeInstanceOf(
      AirtableRepositoryError,
    );
  });
});

describe("RetryingAirtableTransport", () => {
  it("honors Retry-After for rate-limited writes and then succeeds", async () => {
    const transport = new FakeAirtableTransport();
    const delays: number[] = [];
    transport.enqueueResponse({
      status: 429,
      headers: { "retry-after": "2" },
      body: { error: { type: "TOO_MANY_REQUESTS" } },
    });
    transport.enqueueResponse({ status: 201, headers: {}, body: { created: true } });
    const retrying = new RetryingAirtableTransport(transport, {
      maxAttempts: 3,
      jitterRatio: 0,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    const response = await retrying.request({
      method: "POST",
      baseId: "app_test",
      table: "Events",
      body: { fields: { Name: "Limited" } },
    });

    expect(response.status).toBe(201);
    expect(delays).toEqual([2_000]);
    expect(transport.requests).toHaveLength(2);
  });

  it("retries idempotent reads with deterministic exponential backoff", async () => {
    const transport = new FakeAirtableTransport();
    const delays: number[] = [];
    transport.enqueueError(new TypeError("network unavailable"));
    transport.enqueueResponse({ status: 502, headers: {}, body: {} });
    transport.enqueueResponse({ status: 200, headers: {}, body: { records: [] } });
    const retrying = new RetryingAirtableTransport(transport, {
      maxAttempts: 3,
      baseDelayMs: 100,
      jitterRatio: 0,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    const response = await retrying.request({
      method: "GET",
      baseId: "app_test",
      table: "Events",
    });

    expect(response.status).toBe(200);
    expect(delays).toEqual([100, 200]);
  });

  it("does not replay a mutation after an ambiguous server failure", async () => {
    const transport = new FakeAirtableTransport();
    transport.enqueueResponse({ status: 503, headers: {}, body: {} });
    const retrying = new RetryingAirtableTransport(transport, {
      sleep: async () => undefined,
    });
    const request: AirtableRequest = {
      method: "POST",
      baseId: "app_test",
      table: "Events",
      body: { fields: { Name: "Only once" } },
    };

    expect((await retrying.request(request)).status).toBe(503);
    expect(transport.requests).toHaveLength(1);
  });
});

describe("FetchAirtableTransport", () => {
  it("injects fetch and sends encoded authenticated Airtable requests", async () => {
    let observedUrl = "";
    let observedInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      observedUrl = String(input);
      observedInit = init;
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "content-type": "application/json", "x-test": "yes" },
      });
    }) as typeof fetch;
    const transport = new FetchAirtableTransport({ token: "secret-token", fetch: fetcher });

    const response = await transport.request({
      method: "GET",
      baseId: "app test",
      table: "Event records",
      query: { "fields[]": ["Name", "Application ID"], pageSize: 25 },
    });

    const headers = new Headers(observedInit?.headers);
    expect(observedUrl).toContain("/v0/app%20test/Event%20records");
    expect(observedUrl).toContain("fields%5B%5D=Name");
    expect(headers.get("authorization")).toBe("Bearer secret-token");
    expect(response).toEqual({
      status: 200,
      headers: { "content-type": "application/json", "x-test": "yes" },
      body: { records: [] },
    });
  });
  it("invokes the runtime fetch through globalThis in strict worker runtimes", async () => {
    const originalFetch = globalThis.fetch;
    let observedThis: unknown;
    globalThis.fetch = async function runtimeFetch(this: unknown) {
      observedThis = this;
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    };

    try {
      const transport = new FetchAirtableTransport({ token: "secret-token" });
      await transport.request({
        method: "GET",
        baseId: "app_test",
        table: "Events",
      });
      expect(observedThis).toBe(globalThis);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
