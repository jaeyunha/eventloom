import { describe, expect, it, vi } from "vitest";
import type {
  AirtableListOptions,
  AirtableRequest,
  AirtableResponse,
  AirtableTransport,
} from "../infrastructure/airtable";
import { FakeAirtableTransport } from "../infrastructure/airtable";
import { type AirtableJsonStore, AirtableSpeakerRepository, listEventScopedJson } from "./airtable";

interface TestRecord {
  readonly id: string;
}

type ListOptions = Omit<AirtableListOptions, "cursor">;
type TestStore = Pick<AirtableJsonStore<TestRecord>, "list">;

const EXPECTED_FILTER = 'FIND("event-123",{Payload JSON})>0';
const TEST_DELAY_MS = 600;
type TestDatabase = ConstructorParameters<typeof AirtableSpeakerRepository>[0]["database"];

function waitForTestDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

class DelayedAirtableTransport implements AirtableTransport {
  readonly fake = new FakeAirtableTransport();
  readonly requests: AirtableRequest[] = [];

  constructor(
    readonly starts: string[],
    private readonly delayMs = TEST_DELAY_MS,
  ) {}

  seed(record: Parameters<FakeAirtableTransport["seed"]>[0]): void {
    this.fake.seed(record);
  }

  async request<TBody = unknown>(request: AirtableRequest): Promise<AirtableResponse<TBody>> {
    this.starts.push(`airtable:${request.table}`);
    await waitForTestDelay(this.delayMs);
    this.requests.push(request);
    return this.fake.request<TBody>(request);
  }
}

function delayedDatabase(
  starts: string[],
  delayMs = TEST_DELAY_MS,
  accountEmail: string | null = "speaker@example.test",
  grantRows: readonly { organization_id: string; speaker_profile_id: string }[] = [],
): TestDatabase {
  const database = {
    prepare(query: string) {
      const operation = query.includes("FROM organization_memberships")
        ? "d1:membership"
        : query.includes("FROM speaker_grants")
          ? "d1:grants"
          : "d1:account";
      return {
        bind(..._values: unknown[]) {
          return {
            async all<T>() {
              starts.push(operation);
              await waitForTestDelay(delayMs);
              return {
                results: (operation === "d1:grants" ? grantRows : []) as T[],
              };
            },
            async first<T>() {
              starts.push(operation);
              await waitForTestDelay(delayMs);
              return (
                operation === "d1:membership"
                  ? { organization_id: "tenant-1", role: "owner" }
                  : accountEmail === null
                    ? null
                    : { email: accountEmail }
              ) as T;
            },
            async run() {
              return { success: true, meta: { changes: 0 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  };
  return database as unknown as TestDatabase;
}

function seedEvent(transport: DelayedAirtableTransport): void {
  transport.seed({
    baseId: "base-test",
    table: "Events",
    fields: {
      "Application ID": "event-123",
      "Settings JSON": JSON.stringify({
        id: "event-123",
        organizationId: "tenant-1",
        name: "Parallel event",
      }),
    },
  });
}

describe("scoped adapter read ordering", () => {
  it("starts grants, account, event, and projection reads in one wave", async () => {
    const starts: string[] = [];
    const transport = new DelayedAirtableTransport(starts);
    seedEvent(transport);
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: delayedDatabase(starts),
    });

    const startedAt = performance.now();
    await expect(repository.getAccessScope("event-123", "account-1")).resolves.toEqual({
      submissionIds: [],
      participantIds: [],
    });
    expect(performance.now() - startedAt).toBeLessThan(1_000);

    expect(starts).toEqual([
      "d1:grants",
      "d1:account",
      "airtable:Events",
      "airtable:Submissions",
      "airtable:Decisions",
      "airtable:Speaker Profiles",
    ]);
    const readTables = transport.requests
      .filter((request) => request.method === "GET")
      .map((request) => request.table);
    expect(readTables).toHaveLength(4);
    expect(readTables.filter((table) => table === "Events")).toHaveLength(1);
    expect(readTables.filter((table) => table === "Submissions")).toHaveLength(1);
    expect(readTables.filter((table) => table === "Decisions")).toHaveLength(1);
    expect(readTables.filter((table) => table === "Speaker Profiles")).toHaveLength(1);
  });
  it("does not discover portal contexts without a verified account email", async () => {
    const starts: string[] = [];
    const transport = new DelayedAirtableTransport(starts);
    seedEvent(transport);
    transport.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": "submission-1",
        "Answers JSON": JSON.stringify({
          id: "submission-1",
          tenantId: "tenant-1",
          organizationId: "tenant-1",
          eventId: "event-123",
          formId: "form-1",
          ownerAccountId: "account-1",
          title: "Unverified owner submission",
          status: "accepted",
          participants: [
            {
              id: "participant-1",
              email: "speaker@example.test",
              role: "primary",
            },
          ],
          updatedAt: "2026-08-11T00:00:00.000Z",
        }),
      },
    });
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: delayedDatabase(starts, TEST_DELAY_MS, null),
    });

    const startedAt = performance.now();
    await expect(repository.listPortalContexts("account-1")).resolves.toEqual([]);

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(starts).toEqual([
      "d1:grants",
      "d1:account",
      "airtable:Speaker Profiles",
      "airtable:Submissions",
      "airtable:Decisions",
      "airtable:Events",
    ]);
  });

  it("keeps accepted capabilities scoped to the accepted participant", async () => {
    const starts: string[] = [];
    const transport = new DelayedAirtableTransport(starts);
    seedEvent(transport);
    for (const [id, participantId, status] of [
      ["1-draft", "participant-draft", "submitted"],
      ["2-accepted", "participant-accepted", "accepted"],
    ] as const) {
      transport.seed({
        baseId: "base-test",
        table: "Submissions",
        fields: {
          "Application ID": `submission-${id}`,
          "Answers JSON": JSON.stringify({
            id: `submission-${id}`,
            tenantId: "tenant-1",
            organizationId: "tenant-1",
            eventId: "event-123",
            formId: "form-1",
            ownerAccountId: "account-1",
            title: `${id} submission`,
            status,
            participants: [
              {
                id: participantId,
                email: "speaker@example.test",
                role: "primary",
              },
            ],
            updatedAt: "2026-08-11T00:00:00.000Z",
          }),
        },
      });
    }
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: delayedDatabase(starts),
    });

    const startedAt = performance.now();
    const projections = await repository.listPortalContextScopes("account-1");

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(projections).toHaveLength(1);
    expect(projections[0]?.context.primaryParticipantId).toBe("participant-draft");
    expect(projections[0]?.scope.capabilitiesByParticipant).toMatchObject({
      "participant-draft": [],
      "participant-accepted": expect.arrayContaining(["asset-read", "submission-edit"]),
    });
  });
  it("fails closed when an unscoped event resolves granted profiles from multiple tenants", async () => {
    const starts: string[] = [];
    const transport = new DelayedAirtableTransport(starts);
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": "event-unscoped",
        "Settings JSON": JSON.stringify({
          id: "event-unscoped",
          name: "Unscoped event",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": "submission-owner",
        "Answers JSON": JSON.stringify({
          id: "submission-owner",
          tenantId: "tenant-1",
          eventId: "event-unscoped",
          formId: "form-1",
          ownerAccountId: "account-1",
          title: "Owner submission",
          status: "accepted",
          participants: [
            {
              id: "participant-owner",
              email: "speaker@example.test",
              role: "primary",
            },
          ],
          updatedAt: "2026-08-11T00:00:00.000Z",
        }),
      },
    });
    const grants = ["tenant-1", "tenant-2"].map((organizationId, index) => {
      const participantId = `participant-grant-${index + 1}`;
      const profileId = `speaker-profile:event-unscoped:${participantId}`;
      transport.seed({
        baseId: "base-test",
        table: "Speaker Profiles",
        fields: {
          "Application ID": profileId,
          Biography: JSON.stringify({
            id: profileId,
            tenantId: organizationId,
            eventId: "event-unscoped",
            participantId,
            displayName: participantId,
            email: index === 0 ? "speaker@example.test" : "stale@example.test",
            version: 1,
            updatedAt: "2026-08-11T00:00:00.000Z",
          }),
        },
      });
      return {
        organization_id: organizationId,
        speaker_profile_id: profileId,
      };
    });
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: delayedDatabase(starts, TEST_DELAY_MS, "speaker@example.test", grants),
    });

    const startedAt = performance.now();
    await expect(repository.listPortalContextScopes("account-1")).resolves.toEqual([]);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
  it("starts the event and profile lookup together without an extra event read", async () => {
    const starts: string[] = [];
    const transport = new DelayedAirtableTransport(starts);
    seedEvent(transport);
    transport.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": "speaker-profile:event-123:participant-1",
        Biography: JSON.stringify({
          id: "speaker-profile:event-123:participant-1",
          tenantId: "tenant-1",
          eventId: "event-123",
          participantId: "participant-1",
          displayName: "Test Speaker",
          email: "speaker@example.test",
          version: 1,
          updatedAt: "2026-08-11T00:00:00.000Z",
        }),
      },
    });
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: delayedDatabase(starts),
    });

    const startedAt = performance.now();
    await expect(repository.listProfiles("event-123", ["participant-1"])).resolves.toEqual([
      expect.objectContaining({
        id: "speaker-profile:event-123:participant-1",
        participantId: "participant-1",
      }),
    ]);
    expect(performance.now() - startedAt).toBeLessThan(1_000);

    expect(starts).toEqual(["airtable:Events", "airtable:Speaker Profiles"]);
    const readTables = transport.requests
      .filter((request) => request.method === "GET")
      .map((request) => request.table);
    expect(readTables).toEqual(["Events", "Speaker Profiles"]);
  });
  it("overlaps organizer projections with the event-bound membership lookup", async () => {
    const starts: string[] = [];
    const transport = new DelayedAirtableTransport(starts, 350);
    seedEvent(transport);
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: delayedDatabase(starts, 350),
    });

    const startedAt = performance.now();
    await expect(repository.getOrganizerAccessScope("event-123", "account-1")).resolves.toEqual({
      tenantId: "tenant-1",
      eventId: "event-123",
      role: "owner",
      submissionIds: [],
      participantIds: [],
    });

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(starts).toEqual([
      "airtable:Events",
      "airtable:Submissions",
      "airtable:Session Roster",
      "d1:membership",
    ]);
    const readTables = transport.requests
      .filter((request) => request.method === "GET")
      .map((request) => request.table);
    expect(readTables).toEqual(["Events", "Submissions", "Session Roster"]);
  });
});

describe("listEventScopedJson", () => {
  it("propagates a scoped read TypeError without an unfiltered retry", async () => {
    const failure = new TypeError("scoped read failed");
    const list = vi.fn(async (options: ListOptions = {}): Promise<TestRecord[]> => {
      if (options.filterByFormula !== undefined) throw failure;
      return [];
    });
    const store: TestStore = { list };

    await expect(listEventScopedJson(store, "Payload JSON", "event-123")).rejects.toBe(failure);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ filterByFormula: EXPECTED_FILTER });
  });

  it("returns records from a successful scoped call", async () => {
    const records: TestRecord[] = [{ id: "record-1" }];
    const list = vi.fn(async (_options: ListOptions = {}): Promise<TestRecord[]> => records);
    const store: TestStore = { list };

    await expect(listEventScopedJson(store, "Payload JSON", "event-123")).resolves.toEqual(records);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ filterByFormula: EXPECTED_FILTER });
  });
});
