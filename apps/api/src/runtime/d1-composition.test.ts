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
import { createD1RuntimeComposition, D1RuntimeAgendaRepository } from "./d1";

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
