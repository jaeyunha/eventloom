import type { AgendaRepository, AgendaState } from "../features/agenda/types";
import type { CloudflareBindings } from "../infrastructure/cloudflare/bindings";
import {
  D1WebhookRepository,
  type WebhookSecretCipher,
} from "../infrastructure/cloudflare/d1-webhook-repository";
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

export interface D1BusinessRepositoryBundle {
  events: D1EventRepository;
  cfp: D1CfpRepository;
  evaluations: D1EvaluationRepository;
  sessions: D1SessionRepository;
  speaker: D1SpeakerRepository;
  agendaForOrganization(organizationId: string): D1AgendaRepository;
  communications: D1CommunicationRepository;
  reports: D1ReportRepository;
  crm: D1CrmRepository;
  remix: D1RemixRepository;
  publication: D1ProgramPublicationRepository;
  reviewerPool: D1ReviewerPoolRepository;
  webhooks: D1WebhookRepository;
}

export function createD1BusinessRepositories(input: {
  database: D1Database;
  webhookSecretCipher: WebhookSecretCipher;
}): D1BusinessRepositoryBundle {
  const { database } = input;
  return {
    events: new D1EventRepository(database),
    cfp: new D1CfpRepository(database),
    evaluations: new D1EvaluationRepository(database),
    sessions: new D1SessionRepository(database),
    speaker: new D1SpeakerRepository(database),
    agendaForOrganization: (organizationId) => new D1AgendaRepository(database, organizationId),
    communications: new D1CommunicationRepository(database),
    reports: new D1ReportRepository(database),
    crm: new D1CrmRepository(database),
    remix: new D1RemixRepository(database),
    publication: new D1ProgramPublicationRepository(database),
    reviewerPool: new D1ReviewerPoolRepository(database),
    webhooks: new D1WebhookRepository(database, {
      secretCipher: input.webhookSecretCipher,
    }),
  };
}

export interface D1RuntimeDependencies {
  events: D1EventRepository;
  cfp: D1CfpRepository;
  evaluations: D1EvaluationRepository;
  sessions: D1SessionRepository;
  speaker: D1SpeakerRepository;
  agenda: AgendaRepository;
  communications: D1CommunicationRepository;
  reports: D1ReportRepository;
  crm: D1CrmRepository;
  remix: D1RemixRepository;
  programPublication: D1ProgramPublicationRepository;
  reviewerPool: D1ReviewerPoolRepository;
  webhooks: D1WebhookRepository;
}

export class D1RuntimeAgendaRepository implements AgendaRepository {
  constructor(
    private readonly database: D1Database,
    private readonly resolveOrganizationId: (eventId: string) => Promise<string | null>,
  ) {}

  forOrganization(organizationId: string): D1AgendaRepository {
    return new D1AgendaRepository(this.database, organizationId);
  }

  async load(eventId: string): Promise<AgendaState | null> {
    const organizationId = await this.resolveOrganizationId(eventId);
    if (organizationId === null) return null;
    return new D1AgendaRepository(this.database, organizationId).load(eventId);
  }

  async compareAndSwap(
    eventId: string,
    expectedVersion: number | null,
    nextState: AgendaState,
  ): Promise<void> {
    const organizationId = await this.resolveOrganizationId(eventId);
    if (organizationId === null) {
      throw new Error(`Agenda event ${eventId} was not found.`);
    }
    await new D1AgendaRepository(this.database, organizationId).compareAndSwap(
      eventId,
      expectedVersion,
      nextState,
    );
  }
}

export interface D1RuntimeCompositionOptions {
  database: D1Database;
  authenticator: unknown;
  agendaCoordinator: DurableObjectNamespace;
  privateFiles: R2Bucket;
  outboxQueue: Queue;
  webOrigin: string;
  encryptionKey: string;
  airtable?: {
    baseId: string;
    transport: unknown;
  };
}

export function createD1RuntimeComposition(options: D1RuntimeCompositionOptions) {
  const repositories = createD1RuntimeDependencies({ DB: options.database });
  return {
    repositories: {
      events: repositories.events,
      cfp: repositories.cfp,
      sessions: repositories.sessions,
      speaker: repositories.speaker,
      agenda: repositories.agenda as D1RuntimeAgendaRepository,
      communications: repositories.communications,
      reports: repositories.reports,
      remix: repositories.remix,
      evaluations: repositories.evaluations,
      crm: repositories.crm,
      publication: repositories.programPublication,
      reviewerPools: repositories.reviewerPool,
    },
    dependencies: {
      webhooks: repositories.webhooks,
    },
    airtable:
      options.airtable === undefined
        ? { enabled: false as const }
        : { enabled: true as const, baseId: options.airtable.baseId },
  };
}

const identityWebhookSecretCipher: WebhookSecretCipher = {
  encrypt: async (secret: string) => secret,
  decrypt: async (ciphertext: string) => ciphertext,
};

export function createD1RuntimeDependencies(
  bindings: Pick<CloudflareBindings, "DB">,
): D1RuntimeDependencies {
  const repositories = createD1BusinessRepositories({
    database: bindings.DB,
    webhookSecretCipher: identityWebhookSecretCipher,
  });
  return {
    events: repositories.events,
    cfp: repositories.cfp,
    evaluations: repositories.evaluations,
    sessions: repositories.sessions,
    speaker: repositories.speaker,
    agenda: new D1RuntimeAgendaRepository(bindings.DB, async (eventId) => {
      const row = await bindings.DB.prepare("SELECT organization_id FROM events WHERE id = ?")
        .bind(eventId)
        .first<{ organization_id: string }>();
      return row?.organization_id ?? null;
    }),
    communications: repositories.communications,
    reports: repositories.reports,
    crm: repositories.crm,
    remix: repositories.remix,
    programPublication: repositories.publication,
    reviewerPool: repositories.reviewerPool,
    webhooks: repositories.webhooks,
  };
}
