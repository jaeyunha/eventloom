import { describe, expect, it } from "vitest";
import type { RequestAuthenticator } from "../features/auth/authenticator";
import type { CloudflareOutboxMessage } from "../infrastructure/cloudflare/bindings";
import { D1WebhookRepository } from "../infrastructure/cloudflare/d1-webhook-repository";
import { D1AgendaRepository } from "../infrastructure/cloudflare/repositories/agenda";
import { D1CfpRepository } from "../infrastructure/cloudflare/repositories/cfp";
import { D1CommunicationRepository } from "../infrastructure/cloudflare/repositories/communications";
import { D1CrmRepository } from "../infrastructure/cloudflare/repositories/crm";
import { D1EvaluationRepository } from "../infrastructure/cloudflare/repositories/evaluations";
import { D1EventRepository } from "../infrastructure/cloudflare/repositories/events";
import { D1ProgramPublicationRepository } from "../infrastructure/cloudflare/repositories/publication";
import { D1RemixRepository } from "../infrastructure/cloudflare/repositories/remix";
import { D1ReportRepository } from "../infrastructure/cloudflare/repositories/reports";
import { D1ReviewerPoolRepository } from "../infrastructure/cloudflare/repositories/reviewer-pool";
import { D1SessionRepository } from "../infrastructure/cloudflare/repositories/sessions";
import { D1SpeakerRepository } from "../infrastructure/cloudflare/repositories/speaker";
import { D1PublishedSpeakerProjectionStore, D1RemixContentGateway } from "./airtable";
import {
  createD1RuntimeComposition,
  createD1RuntimeDependencies,
  D1RuntimeAgendaRepository,
} from "./d1";

function database(): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first<T>() {
              return null as T | null;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  } as unknown as D1Database;
}

function options() {
  const db = database();
  return {
    authenticator: {
      async authenticate() {
        return null;
      },
    } satisfies Pick<RequestAuthenticator, "authenticate">,
    database: db,
    agendaCoordinator: {
      idFromName(name: string) {
        return name;
      },
      get() {
        return {
          async fetch() {
            return Response.json({ revision: 0 });
          },
        };
      },
    } as unknown as DurableObjectNamespace,
    privateFiles: {
      async get() {
        return null;
      },
      async put() {},
    } as unknown as R2Bucket,
    outboxQueue: {
      async send(_message: CloudflareOutboxMessage) {},
    } as unknown as Queue<CloudflareOutboxMessage>,
    webOrigin: "https://web.example.test",
    encryptionKey: "test-secret-that-is-at-least-32-characters-long",
  };
}

describe("D1 runtime composition", () => {
  it("uses D1 repositories as the production domain authority", () => {
    const composition = createD1RuntimeComposition(options());

    expect(composition.repositories.events).toBeInstanceOf(D1EventRepository);
    expect(composition.repositories.cfp).toBeInstanceOf(D1CfpRepository);
    expect(composition.repositories.sessions).toBeInstanceOf(D1SessionRepository);
    expect(composition.repositories.speaker).toBeInstanceOf(D1SpeakerRepository);
    expect(composition.repositories.agenda).toBeInstanceOf(D1RuntimeAgendaRepository);
    expect(composition.repositories.agenda.forOrganization("org-1")).toBeInstanceOf(
      D1AgendaRepository,
    );
    expect(composition.repositories.communications).toBeInstanceOf(D1CommunicationRepository);
    expect(composition.repositories.reports).toBeInstanceOf(D1ReportRepository);
    expect(composition.repositories.remix).toBeInstanceOf(D1RemixRepository);
    expect(composition.repositories.evaluations).toBeInstanceOf(D1EvaluationRepository);
    expect(composition.repositories.crm).toBeInstanceOf(D1CrmRepository);
    expect(composition.repositories.publication).toBeInstanceOf(D1ProgramPublicationRepository);
    expect(composition.repositories.reviewerPools).toBeInstanceOf(D1ReviewerPoolRepository);
    expect(composition.dependencies.webhooks).toBeInstanceOf(D1WebhookRepository);
    expect(composition.airtable).toEqual({ enabled: false });
  });

  it("resolves Agenda event scope using deployed event columns", async () => {
    const statements: string[] = [];
    const db = {
      prepare(query: string) {
        statements.push(query);
        return {
          bind() {
            return {
              async first<T>() {
                return query === "SELECT organization_id FROM events WHERE id = ?"
                  ? ({ organization_id: "organization-1" } as T)
                  : null;
              },
              async all<T>() {
                return { results: [] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    const dependencies = createD1RuntimeDependencies({ DB: db });

    await dependencies.agenda.load("event-1");

    expect(statements[0]).toBe("SELECT organization_id FROM events WHERE id = ?");
  });

  it("lists published events without requiring an event tombstone column", async () => {
    const statements: string[] = [];
    const db = {
      prepare(query: string) {
        statements.push(query);
        return {
          bind() {
            return {
              async first<T>() {
                return null as T | null;
              },
              async all<T>() {
                return { results: [] as T[] };
              },
            };
          },
          async all<T>() {
            return { results: [] as T[] };
          },
        };
      },
    } as unknown as D1Database;
    const store = new D1PublishedSpeakerProjectionStore(
      db,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await store.listPublishedEventProjections();

    expect(statements[0]).toContain("WHERE p.served_revision IS NOT NULL");
    expect(statements[0]).not.toContain("deleted_at");
  });

  it("resolves a publication manifest without requiring an event tombstone column", async () => {
    const statements: string[] = [];
    const db = {
      prepare(query: string) {
        statements.push(query);
        return {
          bind() {
            return {
              async first<T>() {
                return null as T | null;
              },
              async all<T>() {
                return { results: [] as T[] };
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    const store = new D1PublishedSpeakerProjectionStore(
      db,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await store.getProgramPublicationManifest("forward-summit-2028");

    expect(statements[0]).toContain("WHERE lower(slug) = ? LIMIT 2");
    expect(statements[0]).not.toContain("deleted_at");
  });

  it("uses D1 source repositories for remix content without an Airtable fallback", async () => {
    const session = {
      id: "session-1",
      tenantId: "org-1",
      eventId: "event-1",
      title: "Original title",
      description: "Original description",
      status: "Accepted",
      durationMinutes: 30,
      capacityRequired: 0,
      trackIds: ["track-1"],
      tagIds: ["tag-1"],
      speakerIds: [],
      speakerRoster: [],
      resourceIds: [],
      version: 1,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      createdBy: "organizer-1",
      updatedBy: "organizer-1",
      history: [],
    };
    const speaker = {
      id: "profile-1",
      eventId: "event-1",
      participantId: "participant-1",
      displayName: "Speaker One",
      biography: "Original biography",
      version: 1,
      updatedAt: "2026-08-13T00:00:00.000Z",
    };
    const sessions = {
      listSessions: async () => [session],
      getSession: async () => session,
      putSession: async () => {},
    };
    const speakers = {
      listProfilesForEvent: async () => [speaker],
      getProfile: async () => speaker,
      updateBiography: async () => ({ ok: true as const, value: { ...speaker, version: 2 } }),
    };
    const gateway = new D1RemixContentGateway({
      sessions,
      speakers,
      database: database(),
      queue: { async send() {} } as unknown as Queue,
    });

    await expect(gateway.listSessions({ tenantId: "org-1", eventId: "event-1" })).resolves.toEqual([
      expect.objectContaining({ id: "session-1", title: "Original title" }),
    ]);
    await expect(gateway.listSpeakers({ tenantId: "org-1", eventId: "event-1" })).resolves.toEqual([
      expect.objectContaining({ id: "participant-1", biography: "Original biography" }),
    ]);
  });

  it("treats Airtable configuration as optional adapter state only", () => {
    const unconfigured = createD1RuntimeComposition(options());
    const configured = createD1RuntimeComposition({
      ...options(),
      airtable: {
        baseId: "base-adapter",
        transport: {
          async request() {
            throw new Error("Domain composition must not call the Airtable adapter.");
          },
        },
      },
    });

    expect(unconfigured.airtable).toEqual({ enabled: false });
    expect(configured.airtable).toEqual({ enabled: true, baseId: "base-adapter" });
    expect(configured.repositories.events).toBeInstanceOf(D1EventRepository);
    expect(configured.repositories.cfp).toBeInstanceOf(D1CfpRepository);
    expect(configured.repositories.sessions).toBeInstanceOf(D1SessionRepository);
    expect(configured.dependencies.webhooks).toBeInstanceOf(D1WebhookRepository);
  });
});
