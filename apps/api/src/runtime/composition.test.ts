import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import type { AgendaState, PublishedAgendaRevision } from "../features/agenda/types";
import type { CfpForm, EventCfp, Submission } from "../features/cfp/model";
import type { CfpRepository } from "../features/cfp/service";
import type { CrmContact, CrmEventProjection } from "../features/crm/types";
import { CommunicationService } from "../features/communications/service";
import type { CommunicationActor, CommunicationRecipient } from "../features/communications/types";
import { EvaluationService } from "../features/evaluations/service";
import { SessionService } from "../features/sessions/service";
import type {
  PrivateAssetCapabilityBinding,
  PrivateUploadGrant,
  SpeakerAsset,
} from "../features/speaker/types";
import {
  type AirtableRequest,
  type AirtableResponse,
  type AirtableTransport,
  FakeAirtableTransport,
} from "../infrastructure/airtable";
import type { CloudflareOutboxMessage } from "../infrastructure/cloudflare/bindings";
import {
  AirtableAgendaRepository,
  AirtableCfpFileAssetGateway,
  AirtableCfpRepository,
  AirtableCommunicationRepository,
  AirtableCrmRepository,
  AirtableEvaluationAcceptanceHandoff,
  AirtableEvaluationDecisionProjection,
  AirtableEvaluationReminderBoundary,
  AirtableEvaluationRepository,
  AirtableEventRepository,
  AirtableRemixContentGateway,
  AirtableSessionRepository,
  AirtableSpeakerReminderDeliveryAdapter,
  AirtableSpeakerRepository,
  AirtableSubmissionReviewSource,
  CloudflareCfpEffects,
  createAirtableDependencies,
} from "./airtable";
import { createLocalCfpService } from "./cfp";
import {
  D1ApiKeyAuthenticatorGateway,
  D1BetterAuthGateway,
  inspectProductionRuntime,
  type RuntimeBindings,
} from "./cloudflare";
import { createRuntimeApp, createRuntimeDependencies, createRuntimeWorker } from "./composition";
import {
  LOCAL_API_KEY,
  LOCAL_ORGANIZATION_ID,
  LOCAL_SESSION_TOKEN,
  LOCAL_SPEAKER_SESSION_TOKEN,
} from "./local";

const localBindings: RuntimeBindings = {
  APP_ENV: "local",
  RUNTIME_PROFILE: "fixture",
  WEB_ORIGIN: "http://localhost:3015",
};
class FormulaRecordingTransport implements AirtableTransport {
  readonly fake = new FakeAirtableTransport();
  readonly requests: AirtableRequest[] = [];

  constructor(private readonly delayMs = 0) {}

  seed(record: Parameters<FakeAirtableTransport["seed"]>[0]): void {
    this.fake.seed(record);
  }

  async request<TBody = unknown>(request: AirtableRequest) {
    this.requests.push({
      ...request,
      ...(request.query === undefined ? {} : { query: { ...request.query } }),
    });
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    const formula = request.query?.filterByFormula;
    if (typeof formula !== "string") return this.fake.request<TBody>(request);
    const delegatedFormula = formula.includes("FIND(")
      ? undefined
      : formula.startsWith("AND(")
        ? formula.slice(4, -1).split(",")[0]
        : formula;
    return this.fake.request<TBody>({
      ...request,
      query: {
        ...request.query,
        filterByFormula: delegatedFormula,
      },
    });
  }
}
class CrmCountingTransport extends FormulaRecordingTransport {
  inFlight = 0;
  maxInFlight = 0;

  constructor(delayMs = 0) {
    super(delayMs);
  }
  override async request<TBody = unknown>(request: AirtableRequest) {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      return await super.request<TBody>(request);
    } finally {
      this.inFlight -= 1;
    }
  }
}

class OrderedCrmProjectionTransport extends CrmCountingTransport {
  readonly writeStarts: string[] = [];
  readonly profileWriteStarted: Promise<void>;
  #resolveProfileWriteStarted!: () => void;
  #releaseProfileWrite!: () => void;
  readonly #profileWriteRelease: Promise<void>;

  constructor(delayMs = 0) {
    super(delayMs);
    this.profileWriteStarted = new Promise((resolve) => {
      this.#resolveProfileWriteStarted = resolve;
    });
    this.#profileWriteRelease = new Promise((resolve) => {
      this.#releaseProfileWrite = resolve;
    });
  }

  releaseProfileWrite(): void {
    this.#releaseProfileWrite();
  }

  override async request<TBody = unknown>(request: AirtableRequest) {
    if (
      (request.method === "POST" || request.method === "PATCH") &&
      (request.table === "Speaker Profiles" || request.table === "Session Roster")
    ) {
      this.writeStarts.push(request.table);
      if (request.table === "Speaker Profiles") {
        this.#resolveProfileWriteStarted();
        await this.#profileWriteRelease;
      }
    }
    return super.request<TBody>(request);
  }
}

function organizerHeaders(): HeadersInit {
  return { cookie: `better-auth.session_token=${LOCAL_SESSION_TOKEN}` };
}
function speakerHeaders(): HeadersInit {
  return { cookie: `better-auth.session_token=${LOCAL_SPEAKER_SESSION_TOKEN}` };
}
function productionD1(digest: string): NonNullable<RuntimeBindings["DB"]> {
  const row = {
    id: "key-production",
    organization_id: LOCAL_ORGANIZATION_ID,
    label: "Production test key",
    scopes_json: '["events:read","events:write","agenda:read","agenda:write"]',
    expires_at: null,
    revoked_at: null,
  };
  return {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              return query.includes("FROM api_keys") && values[0] === digest ? (row as T) : null;
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
  } as unknown as NonNullable<RuntimeBindings["DB"]>;
}

function productionBindings(
  transport: AirtableTransport,
  database: NonNullable<RuntimeBindings["DB"]>,
): RuntimeBindings {
  const coordinator = {
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
  } as unknown as NonNullable<RuntimeBindings["AGENDA_COORDINATOR"]>;
  const bucket = {
    head: async (objectKey: string) =>
      objectKey === "assets/marcus-accepted.pdf"
        ? { size: 256, httpMetadata: { contentType: "application/pdf" } }
        : null,
    get: async () => null,
    put: async () => undefined,
  } as unknown as NonNullable<RuntimeBindings["PRIVATE_FILES"]>;
  const queue = {
    async send() {},
  } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
  return {
    APP_ENV: "production",
    WEB_ORIGIN: "https://open-sessionboard-web-production.ashleyha0317.workers.dev",
    API_ORIGIN: "https://open-sessionboard-api-production.ashleyha0317.workers.dev",
    DB: database,
    AGENDA_COORDINATOR: coordinator,
    PRIVATE_FILES: bucket,
    OUTBOX_QUEUE: queue,
    AIRTABLE_ACCESS_TOKEN: "test-token",
    AI: {
      async run() {
        return { response: "{}" };
      },
    },
    AI_MODEL: "@cf/meta/llama-3.1-8b-instruct-fp8",
    AIRTABLE_BASE_ID: "base-test",
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    OPENSEND_API_URL: "https://opensend.namuh.co",
    OPENSEND_API_KEY: "opensend-test-key",
    CACHE_INVALIDATION_URL:
      "https://open-sessionboard-web-production.ashleyha0317.workers.dev/api/internal/cache-invalidation",
    CACHE_INVALIDATION_TOKEN: "shared-cache-invalidation-token",
    AIRTABLE_TRANSPORT: transport,
  };
}

interface AutojoinDatabaseState {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly memberships: Array<{ organization_id: string; role: string }>;
  readonly speakerGrants: Array<{
    organization_id: string;
    speaker_profile_id: string;
  }>;
  readonly inserts: Array<{
    organization_id: string;
    user_id: string;
    role: string;
    created_at: string;
    updated_at: string;
  }>;
  operationCount: number;
}

function autojoinDatabase(input: {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly memberships?: readonly { organization_id: string; role: string }[];
  readonly pendingInvitation?: boolean;
  readonly speakerGrants?: readonly {
    organization_id: string;
    speaker_profile_id: string;
  }[];
  readonly delayMs?: number;
}): {
  readonly database: NonNullable<RuntimeBindings["DB"]>;
  readonly state: AutojoinDatabaseState;
} {
  const state: AutojoinDatabaseState = {
    email: input.email,
    emailVerified: input.emailVerified,
    memberships: [...(input.memberships ?? [])],
    speakerGrants: [...(input.speakerGrants ?? [])],
    inserts: [],
    operationCount: 0,
  };
  const delayMs = input.delayMs ?? 0;
  async function delayOperation(): Promise<void> {
    state.operationCount += 1;
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  const database = {
    prepare(query: string) {
      return {
        async all<T>() {
          return this.bind().all<T>();
        },
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              await delayOperation();
              if (query.includes("FROM api_keys")) {
                return {
                  id: "api-key-autojoin",
                  organization_id: "ai-engineer",
                  label: "Autojoin test key",
                  scopes_json: '["events:read"]',
                  expires_at: null,
                  revoked_at: null,
                } as T;
              }
              if (!query.includes("FROM auth_sessions")) return null;
              return {
                session_id: "session-autojoin",
                user_id: "user-autojoin",
                email: state.email,
                email_verified: state.emailVerified ? 1 : 0,
                expires_at: "2099-01-01T00:00:00.000Z",
              } as T;
            },
            async all<T>() {
              await delayOperation();
              if (query.includes("FROM auth_sessions") && query.includes("scope_type")) {
                return {
                  results: [
                    {
                      session_id: "session-autojoin",
                      user_id: "user-autojoin",
                      email: state.email,
                      email_verified: state.emailVerified ? 1 : 0,
                      expires_at: "2099-01-01T00:00:00.000Z",
                      scope_type: "session",
                      scope_order: 0,
                      organization_id: null,
                      role: null,
                      speaker_profile_id: null,
                    },
                    ...state.memberships.map((membership) => ({
                      session_id: "session-autojoin",
                      user_id: "user-autojoin",
                      email: state.email,
                      email_verified: state.emailVerified ? 1 : 0,
                      expires_at: "2099-01-01T00:00:00.000Z",
                      scope_type: "membership",
                      scope_order: 1,
                      organization_id: membership.organization_id,
                      role: membership.role,
                      speaker_profile_id: null,
                    })),
                    ...state.speakerGrants.map((speakerGrant) => ({
                      session_id: "session-autojoin",
                      user_id: "user-autojoin",
                      email: state.email,
                      email_verified: state.emailVerified ? 1 : 0,
                      expires_at: "2099-01-01T00:00:00.000Z",
                      scope_type: "speaker_grant",
                      scope_order: 2,
                      organization_id: speakerGrant.organization_id,
                      role: null,
                      speaker_profile_id: speakerGrant.speaker_profile_id,
                    })),
                  ] as T[],
                };
              }
              if (query.includes("FROM organization_memberships")) {
                return { results: state.memberships as T[] };
              }
              if (query.includes("FROM speaker_grants")) {
                return { results: state.speakerGrants as T[] };
              }
              if (query.includes("FROM auth_verifications")) {
                return {
                  results: input.pendingInvitation
                    ? ([
                        {
                          id: "pending-invitation",
                          identifier: JSON.stringify({
                            kind: "member_invitation",
                            invitation: {
                              id: "pending-invitation",
                              organizationId: "ai-engineer",
                              userId: "user-autojoin",
                              email: input.email.trim().toLowerCase(),
                              name: "Pending Evaluator",
                              role: "reviewer",
                              idempotencyKey: "pending-autojoin",
                              status: "delivered",
                              createdAt: "2026-08-11T00:00:00.000Z",
                              updatedAt: "2026-08-11T00:00:01.000Z",
                              expiresAt: "2099-01-01T00:00:00.000Z",
                              deliveredAt: "2026-08-11T00:00:01.000Z",
                              acceptedAt: null,
                            },
                            activationDigest: null,
                            usedAt: null,
                          }),
                          token_digest: "random-pending-token-digest",
                          expires_at: "2099-01-01T00:00:00.000Z",
                          created_at: "2026-08-11T00:00:00.000Z",
                          updated_at: "2026-08-11T00:00:01.000Z",
                        },
                      ] as T[])
                    : ([] as T[]),
                };
              }
              return { results: [] as T[] };
            },
            async run() {
              await delayOperation();
              if (query.includes("INSERT INTO organization_memberships")) {
                const [organizationId, userId, createdAt, updatedAt] = values;
                const row = {
                  organization_id: String(organizationId),
                  user_id: String(userId),
                  role: "admin",
                  created_at: String(createdAt),
                  updated_at: String(updatedAt),
                };
                state.inserts.push(row);
                if (
                  !state.memberships.some(
                    (membership) =>
                      membership.organization_id === row.organization_id &&
                      row.user_id === "user-autojoin",
                  )
                ) {
                  state.memberships.push({
                    organization_id: row.organization_id,
                    role: row.role,
                  });
                }
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  } as unknown as NonNullable<RuntimeBindings["DB"]>;
  return { database, state };
}
interface CfpReceiptOutboxRow {
  readonly id: string;
  readonly tenantId: string;
  readonly topic: string;
  readonly deduplicationKey: string;
  readonly payloadJson: string;
  state: string;
}

function cfpReceiptDatabase(): {
  readonly database: NonNullable<RuntimeBindings["DB"]>;
  readonly rows: Map<string, CfpReceiptOutboxRow>;
} {
  const rows = new Map<string, CfpReceiptOutboxRow>();
  const database = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (query.includes("FROM auth_users")) {
                return { email: "verified.submitter@example.test" } as T;
              }
              if (query.includes("SELECT state FROM outbox_jobs")) {
                const row = rows.get(String(values[0]));
                return row === undefined ? null : ({ state: row.state } as T);
              }
              return null;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              if (query.includes("INSERT INTO outbox_jobs")) {
                const [id, tenantId, topic, deduplicationKey, payloadJson] = values;
                const duplicate = [...rows.values()].some(
                  (row) =>
                    row.tenantId === String(tenantId) &&
                    row.topic === String(topic) &&
                    row.deduplicationKey === String(deduplicationKey),
                );
                if (duplicate) return { success: true, meta: { changes: 0 } };
                rows.set(String(id), {
                  id: String(id),
                  tenantId: String(tenantId),
                  topic: String(topic),
                  deduplicationKey: String(deduplicationKey),
                  payloadJson: String(payloadJson),
                  state: "pending",
                });
                return { success: true, meta: { changes: 1 } };
              }
              if (query.includes("UPDATE outbox_jobs SET state = 'queued'")) {
                const row = rows.get(String(values[1]));
                if (row !== undefined) row.state = "queued";
                return {
                  success: true,
                  meta: { changes: row === undefined ? 0 : 1 },
                };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  } as unknown as NonNullable<RuntimeBindings["DB"]>;
  return { database, rows };
}
function cfpFileAssetCompositionFixture(): {
  readonly gateway: AirtableCfpFileAssetGateway;
  readonly setUploaded: (uploaded: boolean) => void;
  readonly binding: () => PrivateAssetCapabilityBinding | undefined;
} {
  const event: EventCfp = {
    id: "event-file",
    tenantId: "tenant-file",
    version: 1,
    slug: "event-file",
    name: "File CFP",
    timezone: "UTC",
    opensAt: "2026-08-01T00:00:00.000Z",
    closesAt: "2026-09-01T00:00:00.000Z",
  };
  const form: CfpForm = {
    id: "form-file",
    tenantId: event.tenantId,
    eventId: event.id,
    name: "File CFP",
    version: 1,
    status: "published",
    welcomeContent: "",
    settings: {
      speakerLimit: 2,
      maxSubmissionsPerAccount: 2,
      remindersEnabled: false,
      adminNotificationsEnabled: false,
      confirmationMessage: "",
      successContent: "",
    },
    sections: [{ id: "section", title: "Talk", description: "" }],
    submissionFields: [
      {
        id: "slides",
        sectionId: "section",
        key: "slides",
        label: "Slides",
        kind: "file_request",
        required: false,
        options: [],
        fileRequest: {
          allowedMimeTypes: ["application/pdf"],
          maxBytes: 1024,
          required: false,
          owner: "submission",
        },
      },
    ],
    participantFields: [],
    rules: [],
  };
  const submission: Submission = {
    id: "submission-file",
    tenantId: event.tenantId,
    eventId: event.id,
    formId: form.id,
    ownerAccountId: "owner-file",
    formVersion: 1,
    version: 1,
    status: "draft",
    completedSteps: ["welcome"],
    answers: {},
    participants: [],
    secondaryContacts: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
  const cfp = {
    async getEvent(tenantId: string, eventId: string) {
      return tenantId === event.tenantId && eventId === event.id ? event : null;
    },
    async getForm(tenantId: string, formId: string) {
      return tenantId === form.tenantId && formId === form.id ? form : null;
    },
    async getSubmission(tenantId: string, submissionId: string) {
      return tenantId === submission.tenantId && submissionId === submission.id ? submission : null;
    },
  } as unknown as CfpRepository;
  const assets = new Map<string, SpeakerAsset>();
  const speakers = {
    async createPendingAsset(asset: SpeakerAsset) {
      assets.set(asset.id, structuredClone(asset));
      return structuredClone(asset);
    },
    async getAsset(eventId: string, assetId: string) {
      const asset = assets.get(assetId);
      return asset?.eventId === eventId ? structuredClone(asset) : null;
    },
    async finalizeAsset(command: {
      eventId: string;
      assetId: string;
      state: "ready" | "rejected";
      finalizedAt: string;
      rejectionReason?: string;
    }) {
      const asset = assets.get(command.assetId);
      if (asset === undefined || asset.eventId !== command.eventId) {
        return { ok: false, reason: "not_found" } as const;
      }
      const finalized = {
        ...asset,
        state: command.state,
        finalizedAt: command.finalizedAt,
        ...(command.rejectionReason === undefined
          ? {}
          : { rejectionReason: command.rejectionReason }),
      };
      assets.set(asset.id, finalized);
      return { ok: true, value: structuredClone(finalized) } as const;
    },
  };
  let uploaded = false;
  let latestBinding: PrivateAssetCapabilityBinding | undefined;
  const privateAssets = {
    async registerUploadCapability(
      binding: PrivateAssetCapabilityBinding,
    ): Promise<PrivateUploadGrant> {
      latestBinding = structuredClone(binding);
      return {
        method: "PUT",
        url: `/api/speaker/assets/capabilities/upload/${binding.capabilityId}/opaque-token`,
        headers: {
          "content-type": binding.contentType,
          "content-length": String(binding.sizeBytes),
        },
        expiresAt: binding.expiresAt,
      };
    },
    async verifyUploadCapability(binding: PrivateAssetCapabilityBinding) {
      return (
        uploaded &&
        latestBinding !== undefined &&
        latestBinding.capabilityId === binding.capabilityId
      );
    },
    async invalidateUploadCapability() {
      uploaded = false;
    },
  };
  return {
    gateway: new AirtableCfpFileAssetGateway({
      cfp,
      speakers,
      privateAssets,
      now: () => new Date("2026-08-08T12:00:00.000Z"),
    }),
    setUploaded(value) {
      uploaded = value;
    },
    binding: () => latestBinding,
  };
}

describe("production CFP file asset composition", () => {
  it("binds upload capabilities, denies tenant mismatch, and finds finalized assets", async () => {
    const fixture = cfpFileAssetCompositionFixture();
    const authorization = await fixture.gateway.issueUpload({
      tenantId: "tenant-file",
      eventId: "event-file",
      submissionId: "submission-file",
      owner: "submission",
      fieldKey: "slides",
      fileName: "slides.pdf",
      contentType: "application/pdf",
      sizeBytes: 4,
      idempotencyKey: "issue-file-1",
    });

    expect(authorization).toMatchObject({
      asset: {
        tenantId: "tenant-file",
        eventId: "event-file",
        submissionId: "submission-file",
        owner: "submission",
        state: "pending_upload",
      },
      grant: { method: "PUT", url: expect.stringContaining("opaque-token") },
    });
    expect(fixture.binding()).toMatchObject({
      tenantId: "tenant-file",
      eventId: "event-file",
      submissionId: "submission-file",
      objectKey: expect.stringContaining("cfp/"),
    });
    await expect(
      fixture.gateway.getAsset({
        tenantId: "tenant-other",
        eventId: "event-file",
        submissionId: "submission-file",
        assetId: authorization.asset.assetId,
        owner: "submission",
      }),
    ).resolves.toBeNull();

    fixture.setUploaded(true);
    const finalized = await fixture.gateway.finalizeUpload({
      tenantId: "tenant-file",
      eventId: "event-file",
      submissionId: "submission-file",
      fieldKey: "slides",
      assetId: authorization.asset.assetId,
      owner: "submission",
      state: "ready",
      idempotencyKey: "finalize-file-1",
    });
    expect(finalized).toMatchObject({
      assetId: authorization.asset.assetId,
      state: "ready",
      tenantId: "tenant-file",
    });
    await expect(
      fixture.gateway.getAsset({
        tenantId: "tenant-file",
        eventId: "event-file",
        submissionId: "submission-file",
        assetId: finalized.assetId,
        owner: "submission",
      }),
    ).resolves.toEqual(finalized);
  });
});

describe("production CFP receipt effects", () => {
  it("queues one verified submitter receipt per submission version without calling OpenSend", async () => {
    const queueMessages: CloudflareOutboxMessage[] = [];
    const queue = {
      async send(message: CloudflareOutboxMessage) {
        queueMessages.push(message);
      },
    } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
    const { database, rows } = cfpReceiptDatabase();
    const effects = new CloudflareCfpEffects(queue, database);
    const event: EventCfp = {
      id: "event-cfp",
      tenantId: "tenant-cfp",
      version: 1,
      slug: "cfp-event",
      name: "Reliable Systems Summit",
      timezone: "UTC",
      opensAt: "2026-08-01T00:00:00.000Z",
      closesAt: "2026-09-01T00:00:00.000Z",
    };
    const form: CfpForm = {
      id: "form-cfp",
      tenantId: "tenant-cfp",
      eventId: "event-cfp",
      name: "Main CFP",
      version: 3,
      status: "published",
      welcomeContent: "",
      settings: {
        speakerLimit: 1,
        maxSubmissionsPerAccount: 1,
        remindersEnabled: false,
        adminNotificationsEnabled: false,
        confirmationMessage: "",
        successContent: "",
      },
      sections: [{ id: "section", title: "Talk", description: "" }],
      submissionFields: [],
      participantFields: [],
      rules: [],
    };
    const submission: Submission = {
      id: "submission-cfp",
      tenantId: "tenant-cfp",
      eventId: "event-cfp",
      formId: "form-cfp",
      ownerAccountId: "account-cfp",
      formVersion: 3,
      version: 7,
      status: "submitted",
      completedSteps: ["welcome", "account", "submission", "participant", "review"],
      answers: { title: "Idempotent Receipts" },
      participants: [
        {
          id: "participant-cfp",
          firstName: "Attacker",
          lastName: "Address",
          email: "unverified.form@example.test",
          role: "primary",
          biography: "",
          answers: {},
        },
      ],
      secondaryContacts: [],
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T01:00:00.000Z",
      submittedAt: "2026-08-08T01:00:00.000Z",
    };
    const input = {
      submission,
      form,
      event,
      submissionTitle: "Idempotent Receipts",
      idempotencyKey: "caller-key-is-not-authoritative",
    };

    await effects.enqueueSubmissionConfirmation(input);
    await effects.enqueueSubmissionConfirmation({
      ...input,
      idempotencyKey: "different-retry-key",
    });

    expect(rows).toHaveLength(1);
    const job = [...rows.values()][0];
    if (job === undefined) throw new Error("The CFP receipt outbox job was not persisted.");
    const payload = JSON.parse(job.payloadJson) as Record<string, unknown>;
    expect(payload).toEqual({
      from: "speakers@sessionboard.namuh.co",
      to: ["verified.submitter@example.test"],
      subject: "Submission received: Idempotent Receipts — Reliable Systems Summit",
      html: "<p>Your submission <strong>Idempotent Receipts</strong> for <strong>Reliable Systems Summit</strong> was received.</p>",
      text: 'Your submission "Idempotent Receipts" for Reliable Systems Summit was received.',
      idempotencyKey: "cfp-receipt:submission-cfp:v7",
    });
    expect(job).toMatchObject({
      tenantId: "tenant-cfp",
      topic: "communications",
      deduplicationKey: "cfp-receipt:submission-cfp:v7",
      state: "queued",
    });
    expect(queueMessages).toHaveLength(1);
    expect(queueMessages[0]).toMatchObject({
      version: 1,
      jobId: "runtime:tenant-cfp:communications:cfp-receipt:submission-cfp:v7",
      tenantId: "tenant-cfp",
      topic: "communications",
    });
    expect(JSON.stringify(payload)).not.toContain("foreverbrowsing.com");
    expect(JSON.stringify(payload)).not.toContain("unverified.form@example.test");
  });
});
describe("production authenticated tenant scope", () => {
  it("loads a valid session and scopes with one delayed D1 operation", async () => {
    const { database, state } = autojoinDatabase({
      email: "member@example.com",
      emailVerified: true,
      memberships: [{ organization_id: "org-membership", role: "reviewer" }],
      speakerGrants: [{ organization_id: "org-speaker", speaker_profile_id: "speaker-1" }],
      delayMs: 300,
    });
    const gateway = new D1BetterAuthGateway(database);
    const startedAt = Date.now();
    const session = await gateway.resolveSession("session-token");
    const elapsedMs = Date.now() - startedAt;

    expect(state.operationCount).toBe(1);
    expect(elapsedMs).toBeLessThanOrEqual(500);
    expect(session).toMatchObject({
      sessionId: "session-autojoin",
      userId: "user-autojoin",
      email: "member@example.com",
      emailVerified: true,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      memberships: [{ organizationId: "org-membership", role: "reviewer" }],
      speakerGrants: [{ organizationId: "org-speaker", speakerProfileId: "speaker-1" }],
    });
  });
  async function resolveSession(input: {
    readonly email: string;
    readonly emailVerified: boolean;
    readonly memberships?: readonly { organization_id: string; role: string }[];
    readonly pendingInvitation?: boolean;
    readonly speakerGrants?: readonly {
      organization_id: string;
      speaker_profile_id: string;
    }[];
  }) {
    const { database, state } = autojoinDatabase(input);
    const gateway = new D1BetterAuthGateway(database);
    const session = await gateway.resolveSession("session-token");
    return { session, state };
  }

  it("does not derive an organization membership from the user's email domain", async () => {
    const input = {
      email: " Host@SWYX.IO ",
      emailVerified: true,
      speakerGrants: [{ organization_id: "ai-engineer", speaker_profile_id: "speaker-1" }],
    } as const;
    const { database, state } = autojoinDatabase(input);
    const gateway = new D1BetterAuthGateway(database);

    await expect(gateway.resolveSession("session-token")).resolves.toMatchObject({
      email: input.email,
      emailVerified: true,
      memberships: [],
      speakerGrants: [{ organizationId: "ai-engineer", speakerProfileId: "speaker-1" }],
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("does not autojoin a verified evaluator while an invitation is unfinished", async () => {
    const { session, state } = await resolveSession({
      email: "evaluator@swyx.io",
      emailVerified: true,
      pendingInvitation: true,
    });

    expect(session?.memberships).toEqual([]);
    expect(state.inserts).toHaveLength(0);
  });

  it("preserves an existing organization role", async () => {
    const { session, state } = await resolveSession({
      email: "host@swyx.io",
      emailVerified: true,
      memberships: [{ organization_id: "ai-engineer", role: "reviewer" }],
    });

    expect(session?.memberships).toEqual([{ organizationId: "ai-engineer", role: "reviewer" }]);
    expect(state.inserts).toHaveLength(0);
    const owner = await resolveSession({
      email: "owner@swyx.io",
      emailVerified: true,
      memberships: [{ organization_id: "ai-engineer", role: "owner" }],
    });
    expect(owner.session?.memberships).toEqual([{ organizationId: "ai-engineer", role: "owner" }]);
    expect(owner.state.inserts).toHaveLength(0);
  });

  it("denies unverified, subdomain, lookalike, and other-domain sessions", async () => {
    const cases = [
      { email: "host@swyx.io", emailVerified: false },
      { email: "host@sub.swyx.io", emailVerified: true },
      { email: "host@swyx.io.attacker", emailVerified: true },
      { email: "host@example.com", emailVerified: true },
    ] as const;

    for (const input of cases) {
      const { session, state } = await resolveSession(input);
      expect(session?.memberships).toEqual([]);
      expect(state.inserts).toHaveLength(0);
    }
  });
  it("does not autojoin API key credentials", async () => {
    const { database, state } = autojoinDatabase({
      email: "host@swyx.io",
      emailVerified: true,
    });
    const gateway = new D1ApiKeyAuthenticatorGateway(database);

    await expect(gateway.findByPresentedKey("api-key")).resolves.toMatchObject({
      organizationId: "ai-engineer",
    });
    expect(state.inserts).toHaveLength(0);
  });
  it("does not autojoin verified sessions when the policy is disabled", async () => {
    const { database, state } = autojoinDatabase({
      email: "host@swyx.io",
      emailVerified: true,
    });
    const gateway = new D1BetterAuthGateway(database);

    await expect(gateway.resolveSession("session-token")).resolves.toMatchObject({
      email: "host@swyx.io",
      memberships: [],
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("accepts integrated runtime configuration without tenant autojoin settings", () => {
    const bindings = productionBindings(new FakeAirtableTransport(), productionD1("unused"));
    expect(inspectProductionRuntime(bindings).success).toBe(true);
    expect(() => createRuntimeApp(bindings)).not.toThrow();
  });
});

describe("integrated local runtime composition", () => {
  function bindingsFor(transport: AirtableTransport): RuntimeBindings {
    return {
      ...productionBindings(transport, productionD1("unused")),
      APP_ENV: "local",
      RUNTIME_PROFILE: "integrated",
      WEB_ORIGIN: "http://127.0.0.1:3015",
      API_ORIGIN: "https://production-origin-must-be-ignored.example",
      AIRTABLE_BASE_ID: "production-base-must-not-be-used",
      AIRTABLE_BASE_DEV_ID: "development-base",
      BETTER_AUTH_SECRET: "production-secret-must-not-be-used",
      OPENSEND_API_URL: "https://production-mail-must-not-be-used.example",
      OPENSEND_API_KEY: "production-mail-key-must-not-be-used",
    };
  }

  it("uses the production repository graph with only the dedicated development base", async () => {
    const transport = new FormulaRecordingTransport();
    const bindings = bindingsFor(transport);
    const dependencies = createRuntimeDependencies(bindings);

    expect(dependencies.events).toBeDefined();
    expect(dependencies.sessions).toBeDefined();
    expect(dependencies.communications).toBeDefined();
    expect(dependencies.members).toBeDefined();

    await dependencies.events?.service.listEvents(
      {
        organizationId: LOCAL_ORGANIZATION_ID,
        userId: "local-integrated-owner",
        role: "owner",
        kind: "human",
      },
      { organizationId: LOCAL_ORGANIZATION_ID, includeArchived: false },
    );

    expect(transport.requests.length).toBeGreaterThan(0);
    expect(transport.requests.every((request) => request.baseId === "development-base")).toBe(true);
    expect(
      transport.requests.some((request) => request.baseId === "production-base-must-not-be-used"),
    ).toBe(false);
  });

  it("fails closed without AIRTABLE_BASE_DEV_ID even when AIRTABLE_BASE_ID exists", () => {
    const bindings = bindingsFor(new FakeAirtableTransport());
    const { AIRTABLE_BASE_DEV_ID: _developmentBase, ...withoutDevelopmentBase } = bindings;
    const inspection = inspectProductionRuntime(withoutDevelopmentBase);

    expect(inspection.success).toBe(false);
    expect(inspection.issues).toContain(
      "AIRTABLE_BASE_DEV_ID is required for integrated local development",
    );
    expect(() => createRuntimeApp(withoutDevelopmentBase)).toThrow();
  });
});

describe("fixture local runtime composition", () => {
  it("serves health and a seeded speaker portal without external credentials", async () => {
    const app = createRuntimeApp(localBindings);

    const health = await app.request("/api/health", undefined, localBindings);
    const portal = await app.request(
      "/api/speaker/events/demo-event/portal",
      { headers: speakerHeaders() },
      localBindings,
    );

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      status: "ok",
      environment: "local",
    });
    expect(portal.status).toBe(200);
    await expect(portal.json()).resolves.toMatchObject({
      data: {
        outstandingTaskCount: 2,
        submissions: [{ id: "local-submission", status: "accepted" }],
        profiles: [{ participantId: "local-participant", displayName: "Alex Rivera" }],
      },
    });

    const contexts = await app.request(
      "/api/speaker/portal/contexts",
      { headers: speakerHeaders() },
      localBindings,
    );
    expect(contexts.status).toBe(200);
    await expect(contexts.json()).resolves.toMatchObject({
      data: [
        {
          eventId: "demo-event",
          submissionIds: ["local-submission"],
          participantIds: ["local-participant"],
          primaryParticipantId: "local-participant",
        },
      ],
    });
  });
  it("serves the seeded canonical submission list to its organization organizer", async () => {
    const app = createRuntimeApp(localBindings);
    const response = await app.request(
      `/api/cfp/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/submissions`,
      { headers: organizerHeaders() },
      localBindings,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          submission: {
            tenantId: LOCAL_ORGANIZATION_ID,
            eventId: "demo-event",
            ownerAccountId: expect.any(String),
          },
        },
      ],
    });
  });
  it("serves the organizer overview core and activity from local repositories", async () => {
    const app = createRuntimeApp(localBindings);
    const coreResponse = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/overview/core`,
      { headers: organizerHeaders() },
      localBindings,
    );
    const activityResponse = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/overview/activity`,
      { headers: organizerHeaders() },
      localBindings,
    );

    expect(coreResponse.status).toBe(200);
    expect(activityResponse.status).toBe(200);
    expect(coreResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(activityResponse.headers.get("cache-control")).toBe("private, no-store");

    const coreBody = (await coreResponse.json()) as { data: Record<string, unknown> };
    expect(coreBody).toMatchObject({
      data: {
        organizationId: LOCAL_ORGANIZATION_ID,
        metrics: { eventCount: 2 },
        events: [
          { id: "demo-event", name: "Open Sessionboard Demo" },
          {
            id: "open-sessionboard-conf",
            name: "Open Sessionboard Conference",
          },
        ],
      },
    });
    expect(coreBody.data).not.toHaveProperty("actionItems");
    expect(coreBody.data.metrics).not.toHaveProperty("submissionCount");

    const activityBody = (await activityResponse.json()) as { data: Record<string, unknown> };
    expect(activityBody).toMatchObject({
      data: {
        organizationId: LOCAL_ORGANIZATION_ID,
        metrics: {
          submissionCount: 1,
          pendingReviewCount: 1,
          outstandingSpeakerTaskCount: 2,
          publishedSessionCount: 2,
        },
        actionItems: [
          { id: "reviews:demo-event", count: 1 },
          { id: "speaker_tasks:demo-event", count: 2 },
        ],
      },
    });
    expect(activityBody.data).not.toHaveProperty("events");
    expect(activityBody.data.metrics).not.toHaveProperty("eventCount");

    const legacyResponse = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/overview`,
      { headers: organizerHeaders() },
      localBindings,
    );
    expect(legacyResponse.status).toBe(404);
  });
  it("serves seeded integration admin data for the current organizer workspace", async () => {
    const app = createRuntimeApp(localBindings);
    const response = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/integrations`,
      { headers: organizerHeaders() },
      localBindings,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        event: { id: string; name: string; timeZone: string };
        delivery: {
          openSend: { state: string; deliveredLast24Hours: number };
          calendar: { state: string; sentLast24Hours: number };
        };
        apiKeys: readonly { id: string }[];
        webhooks: readonly { id: string; endpointUrl: string }[];
      };
    };
    expect(body.data.event).toEqual({
      id: "demo-event",
      name: "Open Sessionboard Demo",
      timeZone: "America/Los_Angeles",
      publishedAgendaRevisionId: "agenda-local-revision-2",
    });
    expect(body.data.delivery).toMatchObject({
      openSend: { state: "connected", deliveredLast24Hours: 18 },
      calendar: { state: "degraded", sentLast24Hours: 7 },
    });
    expect(body.data.apiKeys).toEqual([
      expect.objectContaining({
        id: "local-key-demo-event",
        label: "Local integration client",
      }),
    ]);
    expect(body.data.webhooks).toEqual([
      expect.objectContaining({
        id: "local-webhook-demo",
        endpointUrl: "https://hooks.local.open-sessionboard.test/demo",
      }),
    ]);
    expect(body.data).not.toHaveProperty("accelevents");

    const anonymous = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/integrations`,
      undefined,
      localBindings,
    );
    expect(anonymous.status).toBe(401);
    const credential = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/integrations/opensend/credential`,
      {
        method: "PUT",
        headers: { ...organizerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ secret: "replacement-open-send-key" }),
      },
      localBindings,
    );
    expect(credential.status).toBe(204);

    const createdKey = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/api-keys`,
      {
        method: "POST",
        headers: { ...organizerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          label: "QA client",
          scopes: ["events:read"],
          expiresAt: null,
        }),
      },
      localBindings,
    );
    expect(createdKey.status).toBe(201);
    const createdKeyBody = (await createdKey.json()) as {
      data: { id: string; secret: string };
    };
    expect(createdKeyBody.data).toMatchObject({ id: "local-created-key-1" });
    expect(createdKeyBody.data.secret.length).toBeGreaterThan(32);

    const revokedKey = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/api-keys/${createdKeyBody.data.id}`,
      { method: "DELETE", headers: organizerHeaders() },
      localBindings,
    );
    expect(revokedKey.status).toBe(204);

    const createdWebhook = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/webhooks`,
      {
        method: "POST",
        headers: { ...organizerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          endpointUrl: "https://hooks.local.open-sessionboard.test/qa",
          events: ["agenda.published"],
        }),
      },
      localBindings,
    );
    expect(createdWebhook.status).toBe(201);
    const createdWebhookBody = (await createdWebhook.json()) as {
      data: { id: string; secret: string };
    };
    expect(createdWebhookBody.data.secret.length).toBeGreaterThan(32);

    const pausedWebhook = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/webhooks/${createdWebhookBody.data.id}`,
      {
        method: "PATCH",
        headers: { ...organizerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ active: false }),
      },
      localBindings,
    );
    expect(pausedWebhook.status).toBe(204);

    const rotatedWebhook = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/webhooks/${createdWebhookBody.data.id}/rotate-secret`,
      {
        method: "POST",
        headers: { ...organizerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      localBindings,
    );
    expect(rotatedWebhook.status).toBe(200);

    const deletedWebhook = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/webhooks/${createdWebhookBody.data.id}`,
      { method: "DELETE", headers: organizerHeaders() },
      localBindings,
    );
    expect(deletedWebhook.status).toBe(204);

    const retry = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/integrations/calendar/deliveries/calendar-local-failure-demo-event/retry`,
      {
        method: "POST",
        headers: { ...organizerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      localBindings,
    );
    expect(retry.status).toBe(204);

    const refreshed = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/integrations`,
      { headers: organizerHeaders() },
      localBindings,
    );
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toMatchObject({
      data: {
        delivery: {
          openSend: { credentialLastFour: "-key" },
          calendar: { state: "connected", lastFailure: null },
        },
        apiKeys: expect.arrayContaining([
          expect.objectContaining({
            id: "local-created-key-1",
            revokedAt: expect.any(String),
          }),
        ]),
        webhooks: [expect.objectContaining({ id: "local-webhook-demo" })],
      },
    });
  });

  it("returns a private 404 for mismatched and legacy integration scopes", async () => {
    const app = createRuntimeApp(localBindings);
    const mismatched = await app.request(
      "/api/admin/organizations/another-organization/events/demo-event/integrations",
      { headers: organizerHeaders() },
      localBindings,
    );
    expect(mismatched.status).toBe(404);
    await expect(mismatched.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "The event was not found." },
    });

    const legacy = await app.request(
      "/api/admin/events/demo-event/integrations",
      { headers: organizerHeaders() },
      localBindings,
    );
    expect(legacy.status).toBe(404);
  });

  it("denies anonymous, reviewer, and wrong-tenant organizer overview access", async () => {
    const app = createRuntimeApp(localBindings);
    const suffixes = ["core", "activity"] as const;
    const basePath = `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/overview`;
    const anonymous = await Promise.all(
      suffixes.map((suffix) => app.request(`${basePath}/${suffix}`, undefined, localBindings)),
    );
    const wrongTenant = await Promise.all(
      suffixes.map((suffix) =>
        app.request(
          `/api/admin/organizations/another-organization/overview/${suffix}`,
          { headers: organizerHeaders() },
          localBindings,
        ),
      ),
    );
    const reviewerApp = createApp({
      authenticator: {
        authenticate: async () => ({
          kind: "user" as const,
          sessionId: "reviewer-session",
          userId: "reviewer",
          email: "reviewer@example.test",
          memberships: [
            {
              organizationId: LOCAL_ORGANIZATION_ID,
              role: "reviewer" as const,
            },
          ],
          speakerGrants: [],
        }),
      },
      organizerOverview: {
        getOverviewCore: async (organizationId: string) => ({
          organizationId,
          metrics: { eventCount: 0 },
          events: [],
        }),
        getOverviewActivity: async (organizationId: string) => ({
          organizationId,
          metrics: {
            submissionCount: 0,
            pendingReviewCount: 0,
            outstandingSpeakerTaskCount: 0,
            publishedSessionCount: 0,
          },
          actionItems: [],
        }),
      },
    });
    const reviewer = await Promise.all(
      suffixes.map((suffix) =>
        reviewerApp.request(`${basePath}/${suffix}`, undefined, localBindings),
      ),
    );

    expect(anonymous.map((response) => response.status)).toEqual([401, 401]);
    expect(wrongTenant.map((response) => response.status)).toEqual([403, 403]);
    expect(reviewer.map((response) => response.status)).toEqual([403, 403]);
  });

  it("keeps core overview independent from activity failures", async () => {
    let coreCalls = 0;
    let activityCalls = 0;
    const app = createApp({
      authenticator: {
        authenticate: async () => ({
          kind: "user" as const,
          sessionId: "overview-session",
          userId: "owner",
          email: "owner@example.test",
          memberships: [{ organizationId: "organization-1", role: "owner" as const }],
          speakerGrants: [],
        }),
      },
      organizerOverview: {
        getOverviewCore: async (organizationId: string) => {
          coreCalls += 1;
          return {
            organizationId,
            metrics: { eventCount: 1 },
            events: [
              {
                id: "event-1",
                name: "Event",
                slug: null,
                status: "active",
                startsAt: null,
                endsAt: null,
              },
            ],
          };
        },
        getOverviewActivity: async () => {
          activityCalls += 1;
          throw new Error("activity unavailable");
        },
      },
    });

    const core = await app.request(
      "/api/admin/organizations/organization-1/overview/core",
      undefined,
      localBindings,
    );
    expect(core.status).toBe(200);
    expect(coreCalls).toBe(1);
    expect(activityCalls).toBe(0);

    const activity = await app.request(
      "/api/admin/organizations/organization-1/overview/activity",
      undefined,
      localBindings,
    );
    expect(activity.status).toBe(500);
    expect(coreCalls).toBe(1);
    expect(activityCalls).toBe(1);
  });

  it("returns explicit empty split overview data without repository fiction", async () => {
    const app = createApp({
      authenticator: {
        authenticate: async () => ({
          kind: "user" as const,
          sessionId: "empty-session",
          userId: "owner",
          email: "owner@example.test",
          memberships: [{ organizationId: "empty-organization", role: "owner" as const }],
          speakerGrants: [],
        }),
      },
      organizerOverview: {
        getOverviewCore: async (organizationId: string) => ({
          organizationId,
          metrics: { eventCount: 0 },
          events: [],
        }),
        getOverviewActivity: async (organizationId: string) => ({
          organizationId,
          metrics: {
            submissionCount: 0,
            pendingReviewCount: 0,
            outstandingSpeakerTaskCount: 0,
            publishedSessionCount: 0,
          },
          actionItems: [],
        }),
      },
    });
    const core = await app.request(
      "/api/admin/organizations/empty-organization/overview/core",
      undefined,
      localBindings,
    );
    const activity = await app.request(
      "/api/admin/organizations/empty-organization/overview/activity",
      undefined,
      localBindings,
    );

    expect(core.status).toBe(200);
    await expect(core.json()).resolves.toEqual({
      data: {
        organizationId: "empty-organization",
        metrics: { eventCount: 0 },
        events: [],
      },
    });
    expect(activity.status).toBe(200);
    await expect(activity.json()).resolves.toEqual({
      data: {
        organizationId: "empty-organization",
        metrics: {
          submissionCount: 0,
          pendingReviewCount: 0,
          outstandingSpeakerTaskCount: 0,
          publishedSessionCount: 0,
        },
        actionItems: [],
      },
    });
  });

  it("keeps local speaker mutations stateful and version checked", async () => {
    const app = createRuntimeApp(localBindings);
    const path = "/api/speaker/events/demo-event/profiles/local-participant";

    const updated = await app.request(
      path,
      {
        method: "PATCH",
        headers: { ...speakerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          biography: "Updated local biography.",
          expectedVersion: 1,
        }),
      },
      localBindings,
    );
    const stale = await app.request(
      path,
      {
        method: "PATCH",
        headers: { ...speakerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          biography: "Stale update.",
          expectedVersion: 1,
        }),
      },
      localBindings,
    );

    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { biography: "Updated local biography.", version: 2 },
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });
  });

  it("seeds a mutable draft and immutable public agenda projection", async () => {
    const app = createRuntimeApp(localBindings);
    const adminBase = `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/agenda`;
    const draftResponse = await app.request(
      `${adminBase}/draft`,
      { headers: organizerHeaders() },
      localBindings,
    );
    const draftPayload = (await draftResponse.json()) as {
      data: {
        version: number;
        entries: Array<{
          id: string;
          sessionId: string;
          roomId: string;
          trackIds: string[];
          startsAtLocal: string;
          endsAtLocal: string;
        }>;
      };
    };
    const updated = await app.request(
      `${adminBase}/draft`,
      {
        method: "PUT",
        headers: { ...organizerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: draftPayload.data.version,
          entries: draftPayload.data.entries.map(
            ({ id, sessionId, roomId, trackIds, startsAtLocal, endsAtLocal }) => ({
              id,
              sessionId,
              roomId,
              trackIds,
              startsAtLocal,
              endsAtLocal,
            }),
          ),
        }),
      },
      localBindings,
    );
    const published = await app.request(
      "/api/public/events/demo-event/agenda",
      undefined,
      localBindings,
    );

    expect(draftResponse.status).toBe(200);
    expect(draftPayload.data.entries).toHaveLength(2);
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { version: draftPayload.data.version },
    });
    expect(published.status).toBe(200);
    const publishedBody = (await published.json()) as {
      data: Record<string, unknown> & { revision: Record<string, unknown> };
    };
    expect(publishedBody).toEqual({
      data: {
        event: {
          slug: "demo-event",
          name: "Open Sessionboard Demo",
          timeZone: "America/Los_Angeles",
          startsOn: "2026-09-18",
          endsOn: "2026-09-18",
          venueName: "Open Sessionboard Hall",
        },
        revision: {
          id: "revision_local_3",
          number: 1,
          publishedAt: "2026-08-08T12:00:00.000Z",
        },
        entries: [
          {
            id: "local-entry-keynote",
            sessionId: "local-session-keynote",
            title: "Designing reliable community systems",
            summary: "",
            format: "Session",
            speakerNames: [],
            roomName: "Main Hall",
            trackNames: ["Main stage"],
            startsAt: expect.any(String),
            endsAt: expect.any(String),
          },
          {
            id: "local-entry-workshop",
            sessionId: "local-session-workshop",
            title: "A practical guide to resilient programs",
            summary: "",
            format: "Session",
            speakerNames: [],
            roomName: "Workshop Studio",
            trackNames: ["Practice"],
            startsAt: expect.any(String),
            endsAt: expect.any(String),
          },
        ],
      },
    });
    expect(publishedBody.data).not.toHaveProperty("eventId");
    expect(publishedBody.data).not.toHaveProperty("sourceDraftVersion");
    expect(publishedBody.data.revision).not.toHaveProperty("sourceDraftVersion");
    expect(publishedBody.data.revision).not.toHaveProperty("publishedBy");
  });

  it("withholds unsafe generic resources and advertises only mounted webhooks locally", async () => {
    const app = createRuntimeApp(localBindings);
    const apiHeaders = { authorization: `Bearer ${LOCAL_API_KEY}` };
    const genericRequests = [
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/events`,
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event`,
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/speakers`,
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/agenda`,
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/sessions`,
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/sessions/local-session-keynote`,
    ];

    for (const path of genericRequests) {
      const response = await app.request(path, { headers: apiHeaders }, localBindings);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "NOT_FOUND", traceId: expect.any(String) },
      });
    }

    const eventCreate = await app.request(
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/events`,
      {
        method: "POST",
        headers: { ...apiHeaders, "content-type": "application/json" },
        body: JSON.stringify({ name: "Unsafe generic create" }),
      },
      localBindings,
    );
    const sessionUpdate = await app.request(
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/sessions/local-session-keynote`,
      {
        method: "PATCH",
        headers: { ...apiHeaders, "content-type": "application/json" },
        body: JSON.stringify({ title: "Unsafe generic update" }),
      },
      localBindings,
    );
    expect(eventCreate.status).toBe(404);
    expect(sessionUpdate.status).toBe(404);

    const webhooks = await app.request(
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/webhooks`,
      { headers: apiHeaders },
      localBindings,
    );
    expect(webhooks.status).toBe(200);

    const discovery = await app.request("/api/v1/openapi.json", undefined, localBindings);
    expect(discovery.status).toBe(200);
    const document = (await discovery.json()) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(document.paths).sort()).toEqual([
      "/api/v1/organizations/{organizationId}/webhooks",
      "/api/v1/organizations/{organizationId}/webhooks/{subscriptionId}",
    ]);
    expect(
      Object.keys(document.paths["/api/v1/organizations/{organizationId}/webhooks"] ?? {}),
    ).toEqual(expect.arrayContaining(["get", "post"]));
    expect(document.paths["/api/v1/organizations/{organizationId}/webhooks"]).toMatchObject({
      get: { security: [{ apiKey: ["webhooks:read"] }] },
      post: { security: [{ apiKey: ["webhooks:write"] }] },
    });
    expect(
      Object.keys(
        document.paths["/api/v1/organizations/{organizationId}/webhooks/{subscriptionId}"] ?? {},
      ),
    ).toEqual(expect.arrayContaining(["get", "patch", "put", "delete"]));
  });

  it("seeds an open CFP with deterministic draft creation", async () => {
    const service = createLocalCfpService();
    const draft = await service.createDraft({
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      formId: "main-cfp",
      ownerAccountId: "local-speaker",
      idempotencyKey: "local-cfp-draft",
    });
    const replay = await service.createDraft({
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      formId: "main-cfp",
      ownerAccountId: "local-speaker",
      idempotencyKey: "local-cfp-draft",
    });

    expect(draft).toMatchObject({
      id: "submission_local_1",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      formId: "main-cfp",
      ownerAccountId: "local-speaker",
      status: "draft",
      version: 1,
    });
    expect(replay).toEqual(draft);
  });

  it("does not query or mutate raw Airtable tables through generic public-v1 routes", async () => {
    const transport = new FormulaRecordingTransport();
    transport.seed({
      baseId: "base-test",
      table: "Events",
      recordId: "rec00000000000001",
      fields: {
        "Application ID": "event-airtable",
        "Settings JSON": JSON.stringify({
          id: "event-airtable",
          organizationId: LOCAL_ORGANIZATION_ID,
          name: "Private Airtable Event",
          version: 1,
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Participants",
      recordId: "rec00000000000002",
      fields: {
        "Application ID": "participant-airtable",
        "First Name": "Private",
        Email: "private@example.test",
      },
    });
    const digestBytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode("production-api-key")),
    );
    const digest = [...digestBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const database = productionD1(digest);
    const bindings = productionBindings(transport, database);
    const app = createRuntimeApp(bindings);
    const headers = { authorization: "Bearer production-api-key" };

    for (const resource of ["events", "sessions", "speakers", "agenda"]) {
      const response = await app.request(
        `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/${resource}`,
        { headers },
        bindings,
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "NOT_FOUND", traceId: expect.any(String) },
      });
    }

    const create = await app.request(
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/events`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ name: "Must not be written" }),
      },
      bindings,
    );
    expect(create.status).toBe(404);
    expect(
      transport.requests.some((request) =>
        ["Events", "Sessions", "Participants", "Agenda Versions"].includes(request.table),
      ),
    ).toBe(false);
  });
  it("matches canonical email against mixed-case authoritative CRM rows", async () => {
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "base-test",
      table: "CRM Contacts",
      fields: {
        "Application ID": "mixed-case-contact",
        "Contact JSON": JSON.stringify({
          id: "mixed-case-contact",
          organizationId: "crm-organization",
          displayName: "Mixed Case",
          email: "Mixed.Case@Example.Test",
          status: "active",
        }),
      },
    });
    const repository = new AirtableCrmRepository({
      baseId: "base-test",
      transport,
    });

    await expect(
      repository.findContactByEmail("crm-organization", "mixed.case@example.test"),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "mixed-case-contact",
        email: "Mixed.Case@Example.Test",
      }),
    );
  });
  it("reuses one same-event canonical speaker by normalized email without changing linkage", async () => {
    const transport = new FakeAirtableTransport();
    const eventId = "crm-marcus-event";
    const organizationId = "crm-marcus-organization";
    const participantId = "participant-marcus-canonical";
    const submissionId = "speaker-submission:accepted-marcus";
    const profileId = `speaker-profile:${eventId}:${participantId}`;
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId,
          name: "Marcus Event",
          slug: eventId,
          timeZone: "UTC",
          startsAt: "2026-08-09T00:00:00.000Z",
          endsAt: "2026-08-10T00:00:00.000Z",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": profileId,
        Biography: JSON.stringify({
          id: profileId,
          tenantId: organizationId,
          eventId,
          participantId,
          displayName: "Marcus Okafor",
          email: " MARCUS@example.test ",
          biography: "Accepted speaker profile.",
          status: "active",
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Session Roster",
      fields: {
        "Application ID": `roster:${eventId}:${participantId}`,
        "Members JSON": JSON.stringify({
          id: `roster:${eventId}:${participantId}`,
          tenantId: organizationId,
          eventId,
          submissionId,
          participantId,
          displayName: "Marcus Okafor",
          email: "marcus@example.test",
          role: "primary",
          status: "active",
          workflowStatus: "accepted",
          version: 1,
          createdAt: "2026-08-09T00:00:00.000Z",
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    const repository = new AirtableCrmRepository({
      baseId: "base-test",
      transport,
      events: new AirtableEventRepository({ baseId: "base-test", transport }),
    });
    const contact: CrmContact = {
      id: "crm-contact:marcus",
      organizationId,
      firstName: "Marcus",
      lastName: "Okafor",
      displayName: "Marcus from CRM",
      email: "MARCUS@example.test",
      phone: null,
      company: "CRM Systems",
      title: "Community Lead",
      website: null,
      linkedinUrl: null,
      notes: "CRM notes must not replace the canonical profile.",
      tags: [],
      customFields: {},
      source: "speaker",
      status: "active",
      mergedIntoId: null,
      pipelineStage: "qualified",
      version: 1,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    const projection: CrmEventProjection = {
      id: "event-contact:marcus",
      organizationId,
      eventId,
      contactId: contact.id,
      sessionId: "session-marcus",
      role: "speaker",
      note: null,
      createdBy: "crm-owner",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    transport.seed({
      baseId: "base-test",
      table: "CRM Contacts",
      fields: {
        "Application ID": contact.id,
        "Contact JSON": JSON.stringify(contact),
      },
    });

    const saved = await repository.saveProjection(projection, contact);
    expect(saved.id).toBe(`event-contact:existing:${eventId}:${contact.id}`);
    expect(saved.sessionId).toBe("session-marcus");
    expect(
      transport.requests.filter(
        (request) =>
          (request.method === "POST" || request.method === "PATCH") &&
          (request.table === "Speaker Profiles" || request.table === "Session Roster"),
      ),
    ).toHaveLength(0);

    const speakerRepository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: productionD1("crm-marcus"),
    });
    await expect(speakerRepository.listRoster(eventId, submissionId)).resolves.toEqual([
      expect.objectContaining({
        participantId,
        submissionId,
        email: "marcus@example.test",
      }),
    ]);

    const requestCount = transport.requests.length;
    await expect(repository.saveProjection(projection, contact)).resolves.toMatchObject(saved);
    expect(
      transport.requests
        .slice(requestCount)
        .filter(
          (request) =>
            (request.method === "POST" || request.method === "PATCH") &&
            (request.table === "Speaker Profiles" || request.table === "Session Roster"),
        ),
    ).toHaveLength(0);
  });
  it("does not reuse cross-scope email identities and blocks ambiguous candidates before writes", async () => {
    const organizationId = "crm-scope-organization";
    const eventId = "crm-scope-event";
    const contact: CrmContact = {
      id: "crm-contact:scope",
      organizationId,
      firstName: "Scope",
      lastName: "Speaker",
      displayName: "Scope Speaker",
      email: "scope@example.test",
      phone: null,
      company: null,
      title: null,
      website: null,
      linkedinUrl: null,
      notes: null,
      tags: [],
      customFields: {},
      source: "speaker",
      status: "active",
      mergedIntoId: null,
      pipelineStage: "new",
      version: 1,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    const projection: CrmEventProjection = {
      id: "event-contact:scope",
      organizationId,
      eventId,
      contactId: contact.id,
      sessionId: null,
      role: "speaker",
      note: null,
      createdBy: "crm-owner",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    const seedEvent = (transport: FakeAirtableTransport, id: string, organization: string) => {
      transport.seed({
        baseId: "base-test",
        table: "Events",
        fields: {
          "Application ID": id,
          "Settings JSON": JSON.stringify({
            id,
            organizationId: organization,
            name: id,
            slug: id,
            timeZone: "UTC",
            startsAt: "2026-08-09T00:00:00.000Z",
            endsAt: "2026-08-10T00:00:00.000Z",
          }),
        },
      });
    };
    const seedProfile = (
      transport: FakeAirtableTransport,
      profileId: string,
      event: string,
      organization: string,
      participantId: string,
      email = contact.email,
    ) => {
      transport.seed({
        baseId: "base-test",
        table: "Speaker Profiles",
        fields: {
          "Application ID": profileId,
          Biography: JSON.stringify({
            id: profileId,
            tenantId: organization,
            eventId: event,
            participantId,
            displayName: participantId,
            email,
            biography: "",
            status: "active",
            version: 1,
            updatedAt: "2026-08-09T00:00:00.000Z",
          }),
        },
      });
    };
    const seedContact = (transport: FakeAirtableTransport) => {
      transport.seed({
        baseId: "base-test",
        table: "CRM Contacts",
        fields: {
          "Application ID": contact.id,
          "Contact JSON": JSON.stringify(contact),
        },
      });
    };

    const scopedTransport = new FakeAirtableTransport();
    seedEvent(scopedTransport, eventId, organizationId);
    seedEvent(scopedTransport, `${eventId}-other`, organizationId);
    seedProfile(
      scopedTransport,
      `speaker-profile:${eventId}:other-org`,
      eventId,
      "crm-other-organization",
      "participant-other-org",
    );
    seedProfile(
      scopedTransport,
      `speaker-profile:${eventId}-other:other-event`,
      `${eventId}-other`,
      organizationId,
      "participant-other-event",
    );
    seedContact(scopedTransport);
    const scopedRepository = new AirtableCrmRepository({
      baseId: "base-test",
      transport: scopedTransport,
      events: new AirtableEventRepository({ baseId: "base-test", transport: scopedTransport }),
    });
    await expect(scopedRepository.saveProjection(projection, contact)).resolves.toEqual(projection);
    const scopedSpeakerRepository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport: scopedTransport,
      database: productionD1("crm-scope"),
    });
    await expect(
      scopedSpeakerRepository.listRoster(eventId, `speaker-submission:crm-contact:${contact.id}`),
    ).resolves.toEqual([
      expect.objectContaining({
        participantId: contact.id,
        email: contact.email,
      }),
    ]);
    expect(
      scopedTransport.requests.filter(
        (request) =>
          (request.method === "POST" || request.method === "PATCH") &&
          request.table === "Speaker Profiles",
      ),
    ).toHaveLength(1);

    const ambiguousTransport = new FakeAirtableTransport();
    seedEvent(ambiguousTransport, eventId, organizationId);
    seedContact(ambiguousTransport);
    seedProfile(
      ambiguousTransport,
      `speaker-profile:${eventId}:one`,
      eventId,
      organizationId,
      "participant-one",
    );
    seedProfile(
      ambiguousTransport,
      `speaker-profile:${eventId}:two`,
      eventId,
      organizationId,
      "participant-two",
    );
    const ambiguousRepository = new AirtableCrmRepository({
      baseId: "base-test",
      transport: ambiguousTransport,
      events: new AirtableEventRepository({ baseId: "base-test", transport: ambiguousTransport }),
    });
    await expect(ambiguousRepository.saveProjection(projection, contact)).rejects.toThrow(
      /multiple canonical speakers/u,
    );
    expect(
      ambiguousTransport.requests.filter(
        (request) =>
          (request.method === "POST" || request.method === "PATCH") &&
          ["CRM Event Projections", "Speaker Profiles", "Session Roster"].includes(request.table),
      ),
    ).toHaveLength(0);
  });
  it("persists CRM state in Airtable, queues outreach, and projects event speakers without sessions", async () => {
    const transport = new OrderedCrmProjectionTransport(5);
    const eventId = "crm-event";
    const organizationId = "crm-organization";
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId,
          name: "CRM Event",
          slug: "crm-event",
          timeZone: "UTC",
          startsAt: "2026-08-09T00:00:00.000Z",
          endsAt: "2026-08-10T00:00:00.000Z",
        }),
      },
    });
    const database = productionD1("unused");
    const queueMessages: CloudflareOutboxMessage[] = [];
    const queue = {
      async send(message: CloudflareOutboxMessage) {
        queueMessages.push(message);
      },
    } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
    const principal = {
      kind: "user" as const,
      sessionId: "crm-session",
      userId: "crm-owner",
      email: "owner@example.test",
      memberships: [{ organizationId, role: "owner" as const }],
      speakerGrants: [],
    };
    const bindings = productionBindings(transport, database);
    if (bindings.AGENDA_COORDINATOR === undefined || bindings.PRIVATE_FILES === undefined) {
      throw new Error("Expected production test bindings.");
    }
    const dependencies = createAirtableDependencies({
      authenticator: { authenticate: async () => principal },
      baseId: "base-test",
      transport,
      database,
      agendaCoordinator: bindings.AGENDA_COORDINATOR,
      privateFiles: bindings.PRIVATE_FILES,
      outboxQueue: queue,
      webOrigin: "https://example.test",
    });
    const app = createApp({
      ...dependencies,
      authenticator: { authenticate: async () => principal },
    });
    const base = `/api/admin/organizations/${organizationId}/crm`;
    const created = await app.request(
      `${base}/contacts`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "crm-contact-create" },
        body: JSON.stringify({
          displayName: "CRM Speaker",
          firstName: "CRM",
          lastName: "Speaker",
          email: "speaker@example.test",
          title: "Principal Engineer",
          company: "Example Systems",
          notes: "A reliable speaker.",
        }),
      },
      { APP_ENV: "production", WEB_ORIGIN: "https://example.test" },
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: { id: string; version: number } };
    expect(createdBody.data.version).toBe(1);
    expect(
      transport.requests.filter(
        (request) => request.method === "GET" && request.table === "CRM Event Projections",
      ),
    ).toHaveLength(0);
    const projectionRequestStart = transport.requests.length;
    transport.maxInFlight = 0;

    const projectionPending = app.request(
      `${base}/contacts/${createdBody.data.id}/events`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "crm-event-projection" },
        body: JSON.stringify({ eventId, role: "speaker" }),
      },
      { APP_ENV: "production", WEB_ORIGIN: "https://example.test" },
    );
    await transport.profileWriteStarted;
    expect(transport.writeStarts).toEqual(["Speaker Profiles"]);
    transport.releaseProfileWrite();
    const projection = await projectionPending;
    expect(projection.status).toBe(200);
    expect(transport.writeStarts).toEqual(["Speaker Profiles", "Session Roster"]);
    const projectionRequests = transport.requests.slice(projectionRequestStart);
    expect(
      projectionRequests.filter(
        (request) => request.method === "GET" && request.table === "CRM Contacts",
      ),
    ).toHaveLength(2);
    const projectionReads = projectionRequests.filter(
      (request) => request.method === "GET" && request.table === "CRM Event Projections",
    );
    expect(projectionReads).toHaveLength(2);
    expect(
      projectionReads.filter((request) => String(request.query?.filterByFormula).includes("FIND(")),
    ).toHaveLength(1);
    const outreach = await app.request(
      `${base}/contacts/${createdBody.data.id}/outreach`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "crm-outreach" },
        body: JSON.stringify({ subject: "Hello", body: "Hi {{firstName}}" }),
      },
      { APP_ENV: "production", WEB_ORIGIN: "https://example.test" },
    );
    expect(outreach.status).toBe(202);
    const createdSegment = await app.request(
      `${base}/segments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Active contacts",
          rules: [{ field: "status", operator: "eq", value: "active" }],
        }),
      },
      { APP_ENV: "production", WEB_ORIGIN: "https://example.test" },
    );
    expect(createdSegment.status).toBe(201);
    const segmentReadStart = transport.requests.length;
    const listedSegments = await app.request(`${base}/segments`, undefined, {
      APP_ENV: "production",
      WEB_ORIGIN: "https://example.test",
    });
    expect(listedSegments.status).toBe(200);
    const segmentReads = transport.requests
      .slice(segmentReadStart)
      .filter((request) => request.method === "GET" && request.table === "CRM Segments");
    expect(segmentReads).toHaveLength(1);
    expect(String(segmentReads[0]?.query?.filterByFormula)).toContain(
      JSON.stringify(organizationId),
    );
    const analyticsReadStart = transport.requests.length;
    transport.maxInFlight = 0;
    const analyticsResponse = await app.request(`${base}/analytics`, undefined, {
      APP_ENV: "production",
      WEB_ORIGIN: "https://example.test",
    });
    expect(analyticsResponse.status).toBe(200);
    const analyticsReads = transport.requests
      .slice(analyticsReadStart)
      .filter(
        (request) =>
          request.method === "GET" &&
          ["CRM Contacts", "CRM Event Projections", "CRM Outreach"].includes(request.table),
      );
    expect(analyticsReads).toHaveLength(3);
    expect(
      analyticsReads.every((request) =>
        String(request.query?.filterByFormula).includes(JSON.stringify(organizationId)),
      ),
    ).toBe(true);
    expect(transport.maxInFlight).toBeGreaterThanOrEqual(3);
    expect(queueMessages).toHaveLength(1);
    expect(transport.requests.some((request) => request.table === "CRM Contacts")).toBe(true);
    expect(transport.requests.some((request) => request.table === "CRM Event Projections")).toBe(
      true,
    );
    expect(transport.requests.some((request) => request.table === "CRM Outreach")).toBe(true);
    expect(transport.requests.some((request) => request.table === "Session Roster")).toBe(true);
    expect(transport.requests.some((request) => request.table === "Sessions")).toBe(false);
    expect(transport.requests.some((request) => request.table === "Submissions")).toBe(false);

    const reloadedRepository = new AirtableCrmRepository({
      baseId: "base-test",
      transport,
      events: new AirtableEventRepository({ baseId: "base-test", transport }),
    });
    const reloadedContact = await reloadedRepository.getContact(
      organizationId,
      createdBody.data.id,
    );
    expect(reloadedContact).toEqual(
      expect.objectContaining({ displayName: "CRM Speaker", version: 1 }),
    );
    const roster = new AirtableSpeakerRepository({ baseId: "base-test", transport, database });
    await expect(
      roster.listRoster(eventId, `speaker-submission:crm-contact:${createdBody.data.id}`),
    ).resolves.toEqual([
      expect.objectContaining({
        participantId: createdBody.data.id,
        displayName: "CRM Speaker",
      }),
    ]);
    await expect(roster.getProfile(eventId, createdBody.data.id)).resolves.toEqual(
      expect.objectContaining({
        participantId: createdBody.data.id,
        displayName: "CRM Speaker",
        status: "active",
      }),
    );
    const crmFilteredReads = transport.requests.filter(
      (request) =>
        request.method === "GET" &&
        ["CRM Contacts", "CRM Event Projections", "CRM Outreach"].includes(request.table),
    );
    expect(crmFilteredReads.length).toBeGreaterThan(0);
    expect(
      crmFilteredReads.every((request) => typeof request.query?.filterByFormula === "string"),
    ).toBe(true);
    expect(
      crmFilteredReads.some((request) => String(request.query?.filterByFormula).includes("FIND(")),
    ).toBe(true);
    expect(
      transport.requests.filter(
        (request) => request.method === "POST" && request.table === "CRM Event Projections",
      ),
    ).toHaveLength(1);
    expect(
      transport.requests.filter(
        (request) => request.method === "POST" && request.table === "CRM Outreach",
      ),
    ).toHaveLength(1);
  });
  it("admits a projected CRM contact beside a same-name accepted speaker without granting speaker eligibility", async () => {
    const transport = new FakeAirtableTransport();
    const organizationId = "ai-engineer";
    const eventId = "devflow-conf-2027";
    const acceptedSubmissionId = "submission-marcus-accepted";
    const acceptedParticipantId = "participant-marcus-accepted";
    const updatedAt = "2026-08-09T00:00:00.000Z";
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId,
          eventId,
          slug: eventId,
          name: "Devflow Conference",
          timeZone: "UTC",
          startsAt: "2026-08-09T00:00:00.000Z",
          endsAt: "2026-08-10T00:00:00.000Z",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": acceptedSubmissionId,
        "Answers JSON": JSON.stringify({
          id: acceptedSubmissionId,
          organizationId,
          tenantId: organizationId,
          eventId,
          formId: "form-devflow",
          title: "Accepted Marcus session",
          status: "accepted",
          participants: [
            {
              id: acceptedParticipantId,
              firstName: "Marcus",
              lastName: "Chen",
              email: "marcus.accepted@example.test",
              role: "primary",
            },
          ],
          version: 1,
          updatedAt,
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": `speaker-profile:${eventId}:${acceptedParticipantId}`,
        Biography: JSON.stringify({
          id: `speaker-profile:${eventId}:${acceptedParticipantId}`,
          eventId,
          participantId: acceptedParticipantId,
          displayName: "Marcus Chen",
          email: "marcus.accepted@example.test",
          jobTitle: "Staff Engineer",
          company: "Accepted Systems",
          biography: "Accepted event speaker.",
          socialLinks: {},
          status: "active",
          version: 1,
          updatedAt,
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Published Speaker Projections",
      fields: {
        "Application ID": `published:${eventId}`,
        "Organization ID": organizationId,
        "Event Slug": eventId,
        "Revision ID": "revision-devflow-1",
        "Revision Number": 1,
        "Published At": updatedAt,
        "Projection JSON": JSON.stringify({
          id: `published:${eventId}`,
          organizationId,
          eventId,
          eventSlug: eventId,
          revisionId: "revision-devflow-1",
          revisionNumber: 1,
          publishedAt: updatedAt,
          event: {
            slug: eventId,
            name: "Devflow Conference",
            timeZone: "UTC",
            startsOn: "2026-08-09",
            endsOn: "2026-08-10",
            venueName: null,
          },
          revision: {
            id: "revision-devflow-1",
            number: 1,
            publishedAt: updatedAt,
          },
          speakers: [
            {
              id: acceptedParticipantId,
              displayName: "Marcus Chen",
              pronouns: null,
              jobTitle: "Staff Engineer",
              organization: "Accepted Systems",
              biography: "Accepted event speaker.",
              photoUrl: null,
              sessionIds: ["session-accepted"],
              sessionTitles: ["Accepted Marcus session"],
              trackNames: [],
            },
          ],
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Speaker Tasks",
      fields: {
        "Application ID": "task-marcus-accepted",
        "Owner JSON": JSON.stringify({
          entityType: "speaker_task",
          id: "task-marcus-accepted",
          eventId,
          submissionId: `speaker-submission:${acceptedSubmissionId}`,
          participantId: acceptedParticipantId,
          type: "action",
          owner: "speaker",
          title: "Accepted task",
          status: "not_started",
          dependencyIds: [],
          reminderOffsetsMinutes: [],
          assigneeIds: [acceptedParticipantId],
          version: 1,
          updatedAt,
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "File Assets",
      fields: {
        "Application ID": "asset-marcus-accepted",
        "Settings JSON": JSON.stringify({
          entityType: "speaker_asset",
          id: "asset-marcus-accepted",
          tenantId: organizationId,
          eventId,
          submissionId: `speaker-submission:${acceptedSubmissionId}`,
          participantId: acceptedParticipantId,
          kind: "slides",
          objectKey: "assets/marcus-accepted.pdf",
          fileName: "marcus-accepted.pdf",
          contentType: "application/pdf",
          sizeBytes: 256,
          state: "ready",
          createdAt: updatedAt,
        }),
      },
    });
    const { database } = speakerOrganizerDatabase({
      memberships: [{ organization_id: organizationId, role: "owner" }],
    });
    const bindings = productionBindings(transport, database);
    if (
      bindings.AGENDA_COORDINATOR === undefined ||
      bindings.PRIVATE_FILES === undefined ||
      bindings.OUTBOX_QUEUE === undefined
    ) {
      throw new Error("Expected production speaker bindings.");
    }
    const principal = {
      kind: "user" as const,
      sessionId: "devflow-organizer-session",
      userId: "devflow-organizer",
      email: "organizer@example.test",
      memberships: [{ organizationId, role: "owner" as const }],
      speakerGrants: [],
    };
    const dependencies = createAirtableDependencies({
      authenticator: { authenticate: async () => principal },
      baseId: "base-test",
      transport,
      database,
      agendaCoordinator: bindings.AGENDA_COORDINATOR,
      privateFiles: bindings.PRIVATE_FILES,
      outboxQueue: bindings.OUTBOX_QUEUE,
      webOrigin: "https://example.test",
    });
    const app = createApp({
      ...dependencies,
      authenticator: { authenticate: async () => principal },
    });
    const env = { APP_ENV: "production", WEB_ORIGIN: "https://example.test" };
    const crmBase = `/api/admin/organizations/${organizationId}/crm`;
    const createContact = async (email: string, idempotencyKey: string) => {
      const response = await app.request(
        `${crmBase}/contacts`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
          body: JSON.stringify({ displayName: "Marcus Chen", email }),
        },
        env,
      );
      expect(response.status).toBe(201);
      return (await response.json()) as { data: { id: string; email: string } };
    };
    const firstContact = await createContact("marcus.first@example.test", "crm-first");
    const selectedContact = await createContact("marcus.selected@example.test", "crm-selected");
    const projection = await app.request(
      `${crmBase}/contacts/${selectedContact.data.id}/events`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "crm-project-selected" },
        body: JSON.stringify({ eventId, role: "prospect" }),
      },
      env,
    );
    expect(projection.status).toBe(200);

    transport.seed({
      baseId: "base-test",
      table: "Speaker Tasks",
      fields: {
        "Application ID": "task-marcus-crm",
        "Owner JSON": JSON.stringify({
          entityType: "speaker_task",
          id: "task-marcus-crm",
          eventId,
          submissionId: `speaker-submission:crm-contact:${selectedContact.data.id}`,
          participantId: selectedContact.data.id,
          type: "action",
          owner: "speaker",
          title: "CRM task",
          status: "not_started",
          dependencyIds: [],
          reminderOffsetsMinutes: [],
          assigneeIds: [selectedContact.data.id],
          version: 1,
          updatedAt,
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "File Assets",
      fields: {
        "Application ID": "asset-marcus-crm",
        "Settings JSON": JSON.stringify({
          entityType: "speaker_asset",
          id: "asset-marcus-crm",
          tenantId: organizationId,
          eventId,
          submissionId: `speaker-submission:crm-contact:${selectedContact.data.id}`,
          participantId: selectedContact.data.id,
          kind: "slides",
          objectKey: "assets/marcus-crm.pdf",
          fileName: "marcus-crm.pdf",
          contentType: "application/pdf",
          sizeBytes: 128,
          state: "ready",
          createdAt: updatedAt,
        }),
      },
    });

    const speakerBase = `/api/admin/organizations/${organizationId}/events/${eventId}/speakers`;
    const rosterResponse = await app.request(speakerBase, undefined, env);
    expect(rosterResponse.status).toBe(200);
    const rosterPayload = (await rosterResponse.json()) as {
      data: {
        speakers: readonly {
          participantId: string;
          displayName: string;
          email: string;
          status: string;
          sessions: readonly unknown[];
          taskSummary: { total: number };
          assets: readonly { assetId: string }[];
        }[];
      };
    };
    expect(rosterPayload.data.speakers).toHaveLength(2);
    expect(rosterPayload.data.speakers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participantId: acceptedParticipantId,
          displayName: "Marcus Chen",
          email: "marcus.accepted@example.test",
          sessions: [
            {
              submissionId: `speaker-submission:${acceptedSubmissionId}`,
              title: "Accepted Marcus session",
              status: "accepted",
            },
          ],
          taskSummary: expect.objectContaining({ total: 1 }),
          assets: [expect.objectContaining({ assetId: "asset-marcus-accepted" })],
        }),
        expect.objectContaining({
          participantId: selectedContact.data.id,
          displayName: "Marcus Chen",
          email: "marcus.selected@example.test",
          status: "crm-prospect",
          sessions: [],
          taskSummary: expect.objectContaining({ total: 0 }),
          assets: [],
        }),
      ]),
    );
    expect(rosterPayload.data.speakers.map((speaker) => speaker.participantId)).not.toContain(
      firstContact.data.id,
    );

    const tasksResponse = await app.request(
      `/api/admin/organizations/${organizationId}/events/${eventId}/speaker-tasks`,
      undefined,
      env,
    );
    expect(tasksResponse.status).toBe(200);
    const tasksPayload = (await tasksResponse.json()) as {
      data: { tasks: readonly { taskId: string }[] };
    };
    expect(tasksPayload.data.tasks.map((task) => task.taskId)).toEqual(["task-marcus-accepted"]);
    const crmTasksResponse = await app.request(
      `/api/admin/organizations/${organizationId}/events/${eventId}/speaker-tasks?participantId=${encodeURIComponent(selectedContact.data.id)}`,
      undefined,
      env,
    );
    expect(crmTasksResponse.status).toBe(404);

    const acceptedAssetsResponse = await app.request(
      `${speakerBase}/${acceptedParticipantId}/assets`,
      undefined,
      env,
    );
    expect(acceptedAssetsResponse.status).toBe(200);
    await expect(acceptedAssetsResponse.json()).resolves.toMatchObject({
      data: [{ assetId: "asset-marcus-accepted" }],
    });
    const crmAssetsResponse = await app.request(
      `${speakerBase}/${encodeURIComponent(selectedContact.data.id)}/assets`,
      undefined,
      env,
    );
    expect(crmAssetsResponse.status).toBe(404);

    const acceptedSessionsResponse = await app.request(
      `${speakerBase}/${acceptedParticipantId}/sessions`,
      undefined,
      env,
    );
    expect(acceptedSessionsResponse.status).toBe(200);
    await expect(acceptedSessionsResponse.json()).resolves.toEqual({
      data: [
        {
          submissionId: `speaker-submission:${acceptedSubmissionId}`,
          title: "Accepted Marcus session",
          status: "accepted",
        },
      ],
    });
    const crmSessionsResponse = await app.request(
      `${speakerBase}/${encodeURIComponent(selectedContact.data.id)}/sessions`,
      undefined,
      env,
    );
    expect(crmSessionsResponse.status).toBe(404);

    const publicationResponse = await app.request(
      `/api/public/events/${eventId}/speakers`,
      undefined,
      env,
    );
    expect(publicationResponse.status).toBe(200);
    const publicationPayload = (await publicationResponse.json()) as {
      data: { speakers: readonly { id: string }[] };
    };
    expect(publicationPayload.data.speakers.map((speaker) => speaker.id)).toEqual([
      acceptedParticipantId,
    ]);
    expect(publicationPayload.data.speakers.map((speaker) => speaker.id)).not.toContain(
      selectedContact.data.id,
    );

    const projectionRead = [...transport.requests]
      .reverse()
      .find(
        (request) => request.method === "GET" && request.table === "Published Speaker Projections",
      );
    expect(projectionRead?.query).toMatchObject({
      pageSize: 2,
      filterByFormula: `{Event Slug}='${eventId}'`,
      "fields[]": expect.arrayContaining([
        "Application ID",
        "Organization ID",
        "Event Slug",
        "Revision ID",
        "Revision Number",
        "Published At",
        "Projection JSON",
      ]),
    });

    transport.seed({
      baseId: "base-test",
      table: "Published Speaker Projections",
      recordId: "rec00000000000099",
      fields: {
        "Application ID": `published:other:${eventId}`,
        "Organization ID": "other-organization",
        "Event Slug": eventId,
        "Projection JSON": JSON.stringify({
          id: `published:other:${eventId}`,
          organizationId: "other-organization",
          eventId: "other-event",
          eventSlug: eventId,
          revisionId: "revision-other-1",
          revisionNumber: 1,
          publishedAt: updatedAt,
          event: {
            slug: eventId,
            name: "Ambiguous Event",
            timeZone: "UTC",
            startsOn: "2026-08-09",
            endsOn: "2026-08-10",
            venueName: null,
          },
          revision: {
            id: "revision-other-1",
            number: 1,
            publishedAt: updatedAt,
          },
          speakers: [],
        }),
      },
    });
    await expect(dependencies.publishedSpeakers?.getPublishedSpeakers(eventId)).resolves.toBeNull();
  });
  it("requires the fixed origin pair and OpenSend credentials", () => {
    const bindings = productionBindings(new FakeAirtableTransport(), productionD1("unused"));
    expect(inspectProductionRuntime(bindings).success).toBe(true);
    const { API_ORIGIN: _apiOrigin, ...withoutApiOrigin } = bindings;
    expect(inspectProductionRuntime(withoutApiOrigin).success).toBe(true);
    const {
      OPENSEND_API_KEY: _openSendKey,
      OPENSEND_SENDING_API_KEY: _sendingKey,
      ...withoutOpenSendKey
    } = bindings;
    expect(inspectProductionRuntime(withoutOpenSendKey).success).toBe(false);
    expect(
      inspectProductionRuntime({
        ...bindings,
        API_ORIGIN: "https://attacker.example",
      }).success,
    ).toBe(false);
  });

  it("mounts the live Better Auth session path through the production app", async () => {
    const bindings = productionBindings(new FakeAirtableTransport(), productionD1("unused"));
    const app = createRuntimeApp(bindings);
    const response = await app.request(
      `${bindings.API_ORIGIN}/api/auth/get-session`,
      { headers: { origin: bindings.WEB_ORIGIN } },
      bindings,
    );

    expect(response.status).not.toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).not.toContain("open-send-test-key");
  });

  it("fails closed without non-local provider configuration and never returns issue details", async () => {
    const worker = createRuntimeWorker();
    const bindings: RuntimeBindings = {
      APP_ENV: "production",
      WEB_ORIGIN: "https://open-sessionboard.pages.dev",
    };
    const response = await worker.fetch?.(
      new Request("https://api.example.com/api/health", {
        headers: { origin: bindings.WEB_ORIGIN },
      }),
      bindings,
      {} as ExecutionContext,
    );

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(503);
    expect(response?.headers.get("access-control-allow-origin")).toBe(bindings.WEB_ORIGIN);
    const payload = await response?.json();
    expect(payload).toMatchObject({
      error: {
        code: "CONFIGURATION_ERROR",
        message: "The API runtime is not configured.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("AIRTABLE_ACCESS_TOKEN");
  });
  it("exposes a scheduled handler and fails closed on invalid runtime configuration", async () => {
    const worker = createRuntimeWorker();
    const scheduled = worker.scheduled;
    if (scheduled === undefined) throw new Error("The runtime worker did not expose scheduled.");
    const bindings: RuntimeBindings = {
      APP_ENV: "production",
      WEB_ORIGIN: "https://open-sessionboard.pages.dev",
    };

    await expect(
      scheduled({ scheduledTime: Date.now() } as never, bindings, {} as ExecutionContext),
    ).resolves.toBeUndefined();
  });

  it("exposes the production outbox queue consumer and retries when bindings fail closed", async () => {
    const worker = createRuntimeWorker();
    const queue = worker.queue;
    if (queue === undefined) throw new Error("The runtime worker did not expose queue.");
    const retries: Array<{ delaySeconds?: number }> = [];
    const message = {
      body: {
        version: 1,
        jobId: "job-1",
        tenantId: "ai-engineer",
        topic: "communications",
        enqueuedAt: "2026-08-10T00:00:00.000Z",
      },
      ack() {
        throw new Error("An unconfigured runtime must not acknowledge outbox work.");
      },
      retry(options?: { delaySeconds?: number }) {
        retries.push(options ?? {});
      },
    };

    await expect(
      queue(
        { messages: [message] } as never,
        {
          APP_ENV: "production",
          WEB_ORIGIN: "https://open-sessionboard-web-production.ashleyha0317.workers.dev",
        },
        {} as ExecutionContext,
      ),
    ).resolves.toBeUndefined();
    expect(retries).toEqual([{ delaySeconds: 60 }]);
  });
});
type AcceptanceIdempotencyRow = {
  requestDigest: string;
  state: "processing" | "completed";
  responseJson: string | null;
  responseStatus: number | null;
  expiresAt: string;
};

function acceptanceDatabase(
  events: string[],
  options: { readonly speakerGrantAvailable?: boolean } = {},
): {
  readonly database: NonNullable<RuntimeBindings["DB"]>;
  readonly outbox: Map<string, { state: string; topic: string; payload: unknown }>;
  readonly grants: string[];
} {
  const idempotency = new Map<string, AcceptanceIdempotencyRow>();
  const outbox = new Map<string, { state: string; topic: string; payload: unknown }>();
  const grants: string[] = [];
  const database = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (query.includes("FROM idempotency_records")) {
                const key = `${String(values[0])}:${String(values[1])}:${String(values[2])}`;
                const row = idempotency.get(key);
                return (
                  row === undefined
                    ? null
                    : {
                        request_digest: row.requestDigest,
                        state: row.state,
                        response_status: row.responseStatus,
                        response_json: row.responseJson,
                        expires_at: row.expiresAt,
                      }
                ) as T | null;
              }
              if (query.includes("SELECT state FROM outbox_jobs")) {
                const row = outbox.get(String(values[0]));
                return (row === undefined ? null : { state: row.state }) as T | null;
              }
              if (query.includes("FROM auth_users")) {
                events.push("db:auth-users");
                return options.speakerGrantAvailable === false
                  ? null
                  : ({
                      id: "account-speaker",
                      email: "speaker@example.test",
                    } as T);
              }
              return null;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              if (query.includes("INSERT INTO idempotency_records")) {
                const key = `${String(values[0])}:${String(values[1])}:${String(values[2])}`;
                idempotency.set(key, {
                  requestDigest: String(values[3]),
                  state: "processing",
                  responseJson: null,
                  responseStatus: null,
                  expiresAt: String(values[5]),
                });
                return { success: true, meta: { changes: 1 } };
              }
              if (query.includes("UPDATE idempotency_records")) {
                const key = `${String(values[3])}:${String(values[4])}:${String(values[5])}`;
                const row = idempotency.get(key);
                if (row !== undefined) {
                  row.state = "completed";
                  row.responseStatus = Number(values[0]);
                  row.responseJson = String(values[1]);
                  row.expiresAt = String(values[2]);
                }
                return {
                  success: true,
                  meta: { changes: row === undefined ? 0 : 1 },
                };
              }
              if (query.includes("DELETE FROM idempotency_records")) {
                const key = `${String(values[0])}:${String(values[1])}:${String(values[2])}`;
                idempotency.delete(key);
                return { success: true, meta: { changes: 1 } };
              }
              if (query.includes("INSERT INTO outbox_jobs")) {
                const id = String(values[0]);
                const topic = String(values[2]);
                const payload = JSON.parse(String(values[4])) as unknown;
                const duplicate = outbox.has(id);
                if (!duplicate) outbox.set(id, { state: "pending", topic, payload });
                return { success: true, meta: { changes: duplicate ? 0 : 1 } };
              }
              if (query.includes("UPDATE outbox_jobs SET state = 'queued'")) {
                const row = outbox.get(String(values[1]));
                if (row !== undefined) row.state = "queued";
                return {
                  success: true,
                  meta: { changes: row === undefined ? 0 : 1 },
                };
              }
              if (query.includes("INSERT INTO speaker_grants")) {
                grants.push(String(values[2]));
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  } as unknown as NonNullable<RuntimeBindings["DB"]>;
  return { database, outbox, grants };
}

function acceptanceTransport(events: string[]): {
  readonly fake: FakeAirtableTransport;
  readonly transport: AirtableTransport;
} {
  const fake = new FakeAirtableTransport();
  const transport: AirtableTransport = {
    async request(request) {
      events.push(`airtable:${request.method}:${request.table}`);
      return fake.request(request);
    },
  };
  return { fake, transport };
}

describe("production agenda, portal, acceptance, and reminder boundaries", () => {
  it("uses authoritative indexed event fields for agenda metadata", async () => {
    const eventId = "devflow-conf-2027";
    const organizationId = "ai-engineer";
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        Name: "DevFlow Conf 2027",
        Slug: eventId,
        Status: "open",
        "Time Zone": "America/Los_Angeles",
        "Starts At": "2027-05-12T16:00:00.000Z",
        "Ends At": "2027-05-15T06:59:59.000Z",
        Version: 2,
        "Created At": "2026-08-09T00:00:00.000Z",
        "Updated At": "2026-08-11T00:00:00.000Z",
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId,
          slug: eventId,
          name: "Stale DevFlow metadata",
          timeZone: "UTC",
          startsAt: "1970-01-01T00:00:00.000Z",
          endsAt: "1970-01-01T00:30:00.000Z",
          venue: "DevFlow Hall",
          version: 1,
        }),
      },
    });
    const database = productionD1("unused");
    const bindings = productionBindings(transport, database);
    if (
      bindings.AGENDA_COORDINATOR === undefined ||
      bindings.PRIVATE_FILES === undefined ||
      bindings.OUTBOX_QUEUE === undefined
    ) {
      throw new Error("Expected production agenda bindings.");
    }
    const dependencies = createAirtableDependencies({
      authenticator: { authenticate: async () => null },
      baseId: "base-test",
      transport,
      database,
      agendaCoordinator: bindings.AGENDA_COORDINATOR,
      privateFiles: bindings.PRIVATE_FILES,
      outboxQueue: bindings.OUTBOX_QUEUE,
      webOrigin: "https://example.test",
    });
    await expect(
      new AirtableEventRepository({ baseId: "base-test", transport }).getEvent(
        organizationId,
        eventId,
      ),
    ).resolves.toMatchObject({
      name: "DevFlow Conf 2027",
      slug: eventId,
      timeZone: "America/Los_Angeles",
      startsAt: "2027-05-12T16:00:00.000Z",
      endsAt: "2027-05-15T06:59:59.000Z",
    });
    const metadata = dependencies.agenda?.eventMetadataForEvent;
    if (metadata === undefined) {
      throw new Error("Production agenda event metadata is not mounted.");
    }

    await expect(metadata(eventId)).resolves.toEqual({
      slug: eventId,
      name: "DevFlow Conf 2027",
      timeZone: "America/Los_Angeles",
      startsOn: "2027-05-12",
      endsOn: "2027-05-14",
      venueName: "DevFlow Hall",
    });
  });
  it("stores new speaker profile scope in Biography without nonexistent physical scope fields", async () => {
    const transport = new FakeAirtableTransport();
    const organizationId = "tenant-profile-create";
    const eventId = "event-profile-create";
    const participantId = "participant-profile-create";
    const profileId = `speaker-profile:${eventId}:${participantId}`;
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId,
          name: "Profile create event",
        }),
      },
    });
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: productionD1("unused"),
    });

    await repository.ensureProfile({
      organizationId,
      eventId,
      participant: {
        id: participantId,
        firstName: "Priya",
        lastName: "Raman",
        email: "priya@example.test",
        role: "primary",
        biography: "Original biography.",
        answers: {},
      },
      updatedAt: "2026-08-11T01:00:00.000Z",
    });

    const create = transport.requests.find(
      (request) => request.method === "POST" && request.table === "Speaker Profiles",
    );
    const fields = (
      create?.body as { readonly fields?: Readonly<Record<string, unknown>> } | undefined
    )?.fields;
    expect(fields).toEqual({
      "Application ID": profileId,
      Version: 1,
      Biography: expect.any(String),
    });
    expect(JSON.parse(String(fields?.Biography))).toMatchObject({
      id: profileId,
      tenantId: organizationId,
      eventId,
      participantId,
      biography: "Original biography.",
      version: 1,
    });
  });

  it("updates Biography JSON and its physical Version atomically from the JSON version", async () => {
    const transport = new FakeAirtableTransport();
    const organizationId = "tenant-profile-update";
    const eventId = "event-profile-update";
    const participantId = "participant-profile-update";
    const profileId = `speaker-profile:${eventId}:${participantId}`;
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId,
          name: "Profile update event",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": profileId,
        Version: 2,
        Biography: JSON.stringify({
          id: profileId,
          tenantId: organizationId,
          eventId,
          participantId,
          displayName: "Priya Raman",
          biography: "Original biography.",
          status: "accepted",
          version: 1,
          updatedAt: "2026-08-11T01:00:00.000Z",
        }),
      },
    });
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database: productionD1("unused"),
    });

    await expect(
      repository.updateBiography({
        eventId,
        participantId,
        biography: "Updated biography.",
        expectedVersion: 1,
        updatedAt: "2026-08-11T02:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        tenantId: organizationId,
        eventId,
        participantId,
        biography: "Updated biography.",
        version: 2,
      },
    });

    const update = transport.requests.find(
      (request) => request.method === "PATCH" && request.table === "Speaker Profiles",
    );
    const fields = (
      update?.body as { readonly fields?: Readonly<Record<string, unknown>> } | undefined
    )?.fields;
    expect(fields).toEqual({
      "Application ID": profileId,
      Version: 2,
      Biography: expect.any(String),
    });
    expect(JSON.parse(String(fields?.Biography))).toMatchObject({
      id: profileId,
      tenantId: organizationId,
      eventId,
      participantId,
      biography: "Updated biography.",
      version: 2,
    });
  });
  it("loads the authoritative agenda workspace with one Airtable request", async () => {
    const eventId = "event-workspace-read";
    const state: AgendaState = {
      eventId,
      stateVersion: 3,
      timeZone: "UTC",
      minimumTravelMinutes: 0,
      sessions: [],
      rooms: [],
      tracks: [],
      draft: {
        eventId,
        timeZone: "UTC",
        version: 2,
        entries: [],
        warningOverrides: [],
        updatedAt: "2026-08-11T00:00:00.000Z",
        updatedBy: "organizer-workspace-read",
      },
      revisions: [],
      currentPublishedRevisionId: null,
      outbox: [],
      audit: [],
      suggestionRuns: [],
    };
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "base-test",
      table: "Agenda Versions",
      fields: {
        "Application ID": eventId,
        "Conflicts JSON": JSON.stringify(state),
      },
    });
    const repository = new AirtableAgendaRepository({
      baseId: "base-test",
      transport,
    });

    await expect(repository.load(eventId)).resolves.toEqual(state);
    expect(
      transport.requests.map((request) => ({
        method: request.method,
        table: request.table,
      })),
    ).toEqual([{ method: "GET", table: "Agenda Versions" }]);
  });
  it("initializes and synchronizes the production agenda on first session access without publishing", async () => {
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": "event-first-access",
        "Settings JSON": JSON.stringify({
          id: "event-first-access",
          organizationId: LOCAL_ORGANIZATION_ID,
          eventId: "event-first-access",
          name: "First access event",
          timeZone: "UTC",
          startsAt: "2026-08-09T00:00:00.000Z",
          endsAt: "2026-08-10T00:00:00.000Z",
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    const database = productionD1("unused");
    const bindings = productionBindings(transport, database);
    const agendaCoordinator = bindings.AGENDA_COORDINATOR;
    const privateFiles = bindings.PRIVATE_FILES;
    const outboxQueue = bindings.OUTBOX_QUEUE;
    if (
      agendaCoordinator === undefined ||
      privateFiles === undefined ||
      outboxQueue === undefined
    ) {
      throw new Error("Production Cloudflare bindings are not mounted.");
    }
    const dependencies = createAirtableDependencies({
      authenticator: { authenticate: async () => null },
      baseId: "base-test",
      transport,
      database,
      agendaCoordinator,
      privateFiles,
      outboxQueue,
      webOrigin: "https://example.test",
    });
    const actor = {
      tenantId: LOCAL_ORGANIZATION_ID,
      userId: "owner-first-access",
      role: "owner" as const,
    };
    const sessions = dependencies.sessions;
    if (sessions === undefined) throw new Error("Production sessions are not mounted.");
    await expect(
      sessions.service.listSessions(actor, { eventId: "event-first-access" }),
    ).resolves.toEqual([]);
    await sessions.service.createSession(actor, {
      eventId: "event-first-access",
      id: "session-first-access",
      title: "First access session",
      durationMinutes: 30,
      status: "Accepted",
    });
    const agendaCreates = transport.requests.filter(
      (request) => request.method === "POST" && request.table === "Agenda Versions",
    );
    expect(agendaCreates).toHaveLength(1);
    expect(
      transport.requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.table === "Agenda Versions" &&
          JSON.stringify(request.body).includes("session-first-access"),
      ),
    ).toBe(true);
    expect(transport.requests.some((request) => request.table === "Published Agenda")).toBe(false);
  });
  it("queues cache invalidation after materializing an agenda publication", async () => {
    const transport = new FakeAirtableTransport();
    const eventId = "event-publish-cache";
    const organizationId = "tenant-publish-cache";
    const participantId = "participant-publish-cache";
    const sessionId = "session-publish-cache";
    const profileId = `speaker-profile:${eventId}:${participantId}`;
    const entry = {
      id: "entry-publish-cache",
      sessionId,
      roomId: "room-publish-cache",
      trackIds: ["track-publish-cache"],
      startsAt: "2027-05-12T17:00:00.000Z",
      endsAt: "2027-05-12T17:30:00.000Z",
      startsAtLocal: "2027-05-12T17:00:00",
      endsAtLocal: "2027-05-12T17:30:00",
      timeZone: "UTC",
    };
    const publishedAt = "2026-08-10T18:44:33.481Z";
    const revision: PublishedAgendaRevision = {
      id: "revision-publish-cache",
      eventId,
      revisionNumber: 1,
      sourceDraftVersion: 1,
      timeZone: "UTC",
      entries: [entry],
      warningOverrides: [],
      publishedAt,
      publishedBy: "organizer-publish-cache",
      rollbackOfRevisionId: null,
    };
    const agendaState: AgendaState = {
      eventId,
      stateVersion: 1,
      timeZone: "UTC",
      minimumTravelMinutes: 0,
      sessions: [
        {
          id: sessionId,
          title: "Published session",
          status: "accepted",
          participantIds: [participantId],
          resourceIds: [],
          capacityRequired: 1,
          durationMinutes: 30,
        },
      ],
      rooms: [
        {
          id: entry.roomId,
          name: "Main Stage",
          capacity: 500,
        },
      ],
      tracks: [{ id: entry.trackIds[0] as string, name: "Platform" }],
      draft: {
        eventId,
        timeZone: "UTC",
        version: 1,
        entries: [entry],
        warningOverrides: [],
        updatedAt: publishedAt,
        updatedBy: "organizer-publish-cache",
      },
      revisions: [revision],
      currentPublishedRevisionId: revision.id,
      outbox: [],
      audit: [],
      suggestionRuns: [],
    };
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId,
          tenantId: organizationId,
          name: "Published cache event",
          slug: "published-cache-event",
          timeZone: "UTC",
          startsAt: "2027-05-12T00:00:00.000Z",
          endsAt: "2027-05-14T23:59:59.000Z",
          venue: "Test venue",
          version: 1,
          updatedAt: publishedAt,
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Agenda Versions",
      fields: {
        "Application ID": eventId,
        "Conflicts JSON": JSON.stringify(agendaState),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Sessions",
      fields: {
        "Application ID": sessionId,
        "Organization ID": organizationId,
        "Event ID": eventId,
        Title: "Published session",
        Description: "A published session description.",
        Status: "confirmed",
        Version: 1,
        "Duration Minutes": 30,
        "Capacity Required": 1,
        "Speaker IDs JSON": JSON.stringify([participantId]),
        "Track IDs JSON": JSON.stringify(entry.trackIds),
        "Settings JSON": JSON.stringify({
          publicationStatus: "published",
          roomId: entry.roomId,
          trackId: entry.trackIds[0],
        }),
        "Metadata JSON": JSON.stringify({
          id: sessionId,
          title: "Published session",
          status: "confirmed",
          durationMinutes: 30,
          capacityRequired: 1,
          speakerProfileIds: [participantId],
          history: [],
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": profileId,
        Biography: JSON.stringify({
          id: profileId,
          eventId,
          participantId,
          displayName: "Priya Raman",
          biography: "A reliable platform engineer.",
          jobTitle: "Principal Engineer",
          company: "Latticework Systems",
          version: 1,
          updatedAt: publishedAt,
        }),
      },
    });
    const { database, state } = speakerOrganizerDatabase({});
    const queue = {
      async send(message: CloudflareOutboxMessage) {
        state.queueMessages.push(message);
      },
    } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
    const bindings = productionBindings(transport, database);
    if (bindings.AGENDA_COORDINATOR === undefined || bindings.PRIVATE_FILES === undefined) {
      throw new Error("Expected production test bindings.");
    }
    const dependencies = createAirtableDependencies({
      authenticator: { authenticate: async () => null },
      baseId: "base-test",
      transport,
      database,
      agendaCoordinator: bindings.AGENDA_COORDINATOR,
      privateFiles: bindings.PRIVATE_FILES,
      outboxQueue: queue,
      webOrigin: "https://example.test",
    });
    if (dependencies.agenda?.afterPublish === undefined) {
      throw new Error("Production agenda publication projection is not mounted.");
    }

    await dependencies.agenda.afterPublish(eventId, revision);
    const projectionWrite = transport.requests.find(
      (request) => request.method === "POST" && request.table === "Published Speaker Projections",
    );
    expect(projectionWrite?.body).toMatchObject({
      fields: {
        "Application ID": `published-speakers:${organizationId}:${eventId}`,
        "Organization ID": organizationId,
        "Event Slug": "published-cache-event",
        "Revision ID": revision.id,
        "Revision Number": revision.revisionNumber,
        "Published At": revision.publishedAt,
      },
    });
    expect(JSON.stringify(projectionWrite?.body ?? {})).toContain("Priya Raman");

    expect([...state.outbox.values()]).toContainEqual(
      expect.objectContaining({
        tenantId: organizationId,
        topic: "cache-invalidation",
        payload: {
          eventId,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
        },
      }),
    );
    expect(state.queueMessages).toContainEqual(
      expect.objectContaining({ tenantId: organizationId, topic: "cache-invalidation" }),
    );
  });
  it("exposes every owner submission status while granting capabilities only for accepted records", async () => {
    const transport = new FakeAirtableTransport();
    const eventId = "event-portal-statuses";
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId: "tenant-portal",
          name: "Portal statuses",
          slug: "portal-statuses",
        }),
      },
    });
    const participant = (id: string) => ({
      id,
      firstName: id,
      lastName: "Speaker",
      email: "portal-owner@example.test",
      role: "primary",
      biography: "",
      answers: {},
    });
    for (const [id, status] of [
      ["submission-accepted", "accepted"],
      ["submission-submitted", "submitted"],
      ["submission-declined", "submitted"],
    ] as const) {
      transport.seed({
        baseId: "base-test",
        table: "Submissions",
        fields: {
          "Application ID": id,
          "Answers JSON": JSON.stringify({
            id,
            tenantId: "tenant-portal",
            organizationId: "tenant-portal",
            eventId,
            formId: "form-portal",
            ownerAccountId: "portal-owner",
            title: id,
            status,
            participants: [participant(id)],
            updatedAt: "2026-08-09T00:00:00.000Z",
          }),
        },
      });
    }
    transport.seed({
      baseId: "base-test",
      table: "Decisions",
      fields: {
        "Application ID": "decision-submission-declined",
        "Metadata JSON": JSON.stringify({
          id: "decision-submission-declined",
          tenantId: "tenant-portal",
          eventId,
          submissionId: "submission-declined",
          status: "rejected",
          reason: "Not a fit for this event.",
        }),
      },
    });
    const database = {
      prepare() {
        return {
          bind() {
            return {
              async all<T>() {
                return { results: [] as T[] };
              },
              async first<T>() {
                return { email: "portal-owner@example.test" } as T;
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
    } as unknown as NonNullable<RuntimeBindings["DB"]>;
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database,
    });
    const contexts = await repository.listPortalContexts("portal-owner");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      eventId,
      submissionIds: expect.arrayContaining([
        "submission-accepted",
        "submission-submitted",
        "submission-declined",
      ]),
      capabilities: [
        "profile-self",
        "task-response",
        "asset-read",
        "asset-write",
        "asset-comment",
        "submission-edit",
      ],
    });
    const submissionReadsBefore = transport.requests.length;
    const submissions = await repository.listSubmissions(eventId, ["submission-declined"]);
    const submissionReadRequests = transport.requests
      .slice(submissionReadsBefore)
      .filter((request) => request.method === "GET" && request.table === "Submissions");
    expect(submissionReadRequests).toHaveLength(1);
    expect(submissionReadRequests[0]?.query?.filterByFormula).toBe(
      "{Application ID}='submission-declined'",
    );
    expect(submissions).toEqual([
      expect.objectContaining({
        id: "submission-declined",
        status: "declined",
        reason: "Not a fit for this event.",
      }),
    ]);
    const pendingTransport = new FakeAirtableTransport();
    pendingTransport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": "event-pending-only",
        "Settings JSON": JSON.stringify({
          id: "event-pending-only",
          organizationId: "tenant-portal",
          name: "Pending only",
        }),
      },
    });
    pendingTransport.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": "submission-pending-only",
        "Answers JSON": JSON.stringify({
          id: "submission-pending-only",
          tenantId: "tenant-portal",
          eventId: "event-pending-only",
          formId: "form-portal",
          ownerAccountId: "portal-owner",
          title: "Pending",
          status: "submitted",
          participants: [participant("pending-only")],
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    const pendingRepository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport: pendingTransport,
      database,
    });
    await expect(pendingRepository.listPortalContexts("portal-owner")).resolves.toMatchObject([
      { eventId: "event-pending-only", capabilities: ["submission-edit"] },
    ]);
    await expect(
      pendingRepository.getAccessScope("event-pending-only", "portal-owner"),
    ).resolves.toMatchObject({
      capabilities: ["submission-edit"],
      capabilitiesByParticipant: {
        "pending-only": ["submission-edit"],
      },
    });
  });
  it("writes the canonical accepted session idempotently before account grants and preserves taxonomy and participants", async () => {
    const events: string[] = [];
    const { fake, transport } = acceptanceTransport(events);
    const submission: Submission = {
      id: "submission-acceptance",
      tenantId: "tenant-acceptance",
      eventId: "event-acceptance",
      formId: "form-acceptance",
      ownerAccountId: "owner-acceptance",
      formVersion: 1,
      version: 4,
      status: "submitted",
      completedSteps: ["welcome", "account", "submission", "participant", "review"],
      answers: {
        abstract: "Preserve this taxonomy.",
        formatId: "format-talk",
        trackIds: ["track-main"],
        tagIds: ["tag-systems"],
      },
      participants: [
        {
          id: "participant-primary",
          firstName: "Primary",
          lastName: "Speaker",
          email: "primary@example.test",
          role: "primary",
          biography: "Primary bio",
          answers: {},
        },
        {
          id: "participant-co",
          firstName: "Co",
          lastName: "Speaker",
          email: "co@example.test",
          role: "co_speaker",
          biography: "Co bio",
          answers: {},
        },
      ],
      secondaryContacts: [],
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
      submittedAt: "2026-08-08T01:00:00.000Z",
    };
    fake.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": submission.id,
        Title: "Canonical session",
        "Answers JSON": JSON.stringify(submission),
      },
    });
    const { database, outbox, grants } = acceptanceDatabase(events);
    const cfp = new AirtableCfpRepository({ baseId: "base-test", transport });
    const speakers = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database,
    });
    const sessions = new AirtableSessionRepository({
      baseId: "base-test",
      transport,
    });
    const agendaSyncEvents: string[] = [];
    const sessionService = new SessionService(sessions, {
      clock: () => new Date("2026-08-09T02:00:00.000Z"),
      agendaCatalogSynchronizer: {
        async ensureInitialized(input) {
          agendaSyncEvents.push(`ensure:${input.tenantId}:${input.eventId}`);
          return undefined;
        },
        async synchronize(input) {
          agendaSyncEvents.push(`synchronize:${input.tenantId}:${input.eventId}`);
          return undefined;
        },
      },
    });
    const queueMessages: CloudflareOutboxMessage[] = [];
    const queue = {
      async send(message: CloudflareOutboxMessage) {
        queueMessages.push(message);
      },
    } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
    const handoff = new AirtableEvaluationAcceptanceHandoff({
      cfp,
      speakers,
      sessions,
      sessionService,
      database,
      queue,
    });
    const input = {
      tenantId: submission.tenantId,
      eventId: submission.eventId,
      planId: "plan-acceptance",
      submissionId: submission.id,
      decisionId: "decision-acceptance",
      decidedBy: "organizer-acceptance",
      decidedAt: "2026-08-09T02:00:00.000Z",
      reason: "Accepted",
      idempotencyKey: "acceptance-key",
    };
    await handoff.accept(input);
    await handoff.accept(input);
    await expect(
      speakers.getSubmission(submission.eventId, `speaker-submission:${submission.id}`),
    ).resolves.toMatchObject({
      title: "Canonical session",
    });
    const acceptedActor = {
      tenantId: submission.tenantId,
      userId: input.decidedBy,
      role: "organizer" as const,
      kind: "user" as const,
    };
    await expect(
      sessionService.listSessions(acceptedActor, {
        eventId: submission.eventId,
      }),
    ).resolves.toMatchObject([
      expect.objectContaining({
        id: "session-submission-acceptance",
        title: "Canonical session",
        status: "Accepted",
        durationMinutes: 30,
      }),
    ]);
    await expect(
      sessionService.getAgendaCatalog(submission.tenantId, submission.eventId),
    ).resolves.toMatchObject({
      sessions: [
        expect.objectContaining({
          id: "session-submission-acceptance",
          title: "Canonical session",
          status: "accepted",
          participantIds: ["participant-primary", "participant-co"],
          speakerNames: ["Primary Speaker", "Co Speaker"],
        }),
      ],
    });
    expect(agendaSyncEvents).toEqual([
      "synchronize:tenant-acceptance:event-acceptance",
      "ensure:tenant-acceptance:event-acceptance",
    ]);
    expect(fake.requests.some((request) => request.table === "Published Agenda")).toBe(false);
    const sessionRequests = fake.requests.filter(
      (request) => request.table === "Sessions" && request.method === "POST",
    );
    expect(sessionRequests).toHaveLength(1);
    const sessionPayload = JSON.parse(
      String(
        (sessionRequests[0]?.body as { fields?: { "Metadata JSON"?: string } } | undefined)
          ?.fields?.["Metadata JSON"],
      ),
    ) as Record<string, unknown>;
    expect(sessionPayload).toMatchObject({
      id: "session-submission-acceptance",
      status: "Accepted",
      formatId: "format-talk",
      trackIds: ["track-main"],
      tagIds: ["tag-systems"],
      speakerIds: ["participant-primary", "participant-co"],
      speakerRoster: [
        { id: "participant-primary", role: "primary" },
        { id: "participant-co", role: "co_speaker" },
      ],
    });
    expect(events.indexOf("db:auth-users")).toBeGreaterThan(
      events.indexOf("airtable:POST:Sessions"),
    );
    expect(grants).toEqual([
      "account-speaker",
      "account-speaker",
      "account-speaker",
      "account-speaker",
    ]);
    expect([...outbox.values()]).toContainEqual({
      state: "queued",
      topic: "cache-invalidation",
      payload: { eventId: "event-acceptance" },
    });
    expect(queueMessages).toContainEqual(expect.objectContaining({ topic: "cache-invalidation" }));
  });
  it("fails acceptance observably when speaker grant provisioning returns false", async () => {
    const events: string[] = [];
    const { fake, transport } = acceptanceTransport(events);
    const submission: Submission = {
      id: "submission-grant-failure",
      tenantId: "tenant-grant-failure",
      eventId: "event-grant-failure",
      formId: "form-grant-failure",
      ownerAccountId: "owner-grant-failure",
      formVersion: 1,
      version: 1,
      status: "submitted",
      completedSteps: [],
      answers: { title: "Grant failure" },
      participants: [
        {
          id: "participant-grant-failure",
          firstName: "Grant",
          lastName: "Failure",
          email: "grant-failure@example.test",
          role: "primary",
          biography: "Grant failure biography",
          answers: {},
        },
      ],
      secondaryContacts: [],
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    fake.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": submission.id,
        "Answers JSON": JSON.stringify(submission),
      },
    });
    const { database } = acceptanceDatabase(events, { speakerGrantAvailable: false });
    const cfp = new AirtableCfpRepository({ baseId: "base-test", transport });
    const speakers = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database,
    });
    const sessions = new AirtableSessionRepository({ baseId: "base-test", transport });
    const queue = {
      async send() {},
    } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
    const handoff = new AirtableEvaluationAcceptanceHandoff({
      cfp,
      speakers,
      sessions,
      database,
      queue,
    });

    await expect(
      handoff.accept({
        tenantId: submission.tenantId,
        eventId: submission.eventId,
        planId: "plan-grant-failure",
        submissionId: submission.id,
        decisionId: "decision-grant-failure",
        decidedBy: "organizer-grant-failure",
        decidedAt: "2026-08-09T01:00:00.000Z",
        reason: "Accepted",
        idempotencyKey: "grant-failure-key",
      }),
    ).rejects.toThrow("Speaker grant provisioning failed");
    expect(events).toContain("db:auth-users");
  });
  it("restricts remix speaker visibility and application to the event tenant", async () => {
    const tenantId = "tenant-remix-owner";
    const otherTenantId = "tenant-remix-other";
    const eventId = "event-remix-scope";
    const events: string[] = [];
    const { fake, transport } = acceptanceTransport(events);
    fake.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId: tenantId,
          eventId,
          name: "Remix scope event",
        }),
      },
    });
    fake.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": `speaker-profile:${eventId}:accepted`,
        Biography: JSON.stringify({
          id: `speaker-profile:${eventId}:accepted`,
          tenantId,
          eventId,
          participantId: "accepted",
          displayName: "Accepted Speaker",
          biography: "Accepted biography",
          status: "accepted",
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    fake.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": `speaker-profile:${eventId}:organizer`,
        Biography: JSON.stringify({
          id: `speaker-profile:${eventId}:organizer`,
          eventId,
          participantId: "organizer",
          displayName: "Organizer Speaker",
          biography: "Organizer biography",
          status: "active",
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    fake.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": `speaker-profile:${eventId}:cross-tenant`,
        Biography: JSON.stringify({
          id: `speaker-profile:${eventId}:cross-tenant`,
          organizationId: otherTenantId,
          eventId,
          participantId: "cross-tenant",
          displayName: "Cross Tenant Speaker",
          biography: "Cross tenant biography",
          status: "active",
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    const { database } = acceptanceDatabase(events);
    const queue = {
      async send() {},
    } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
    const gateway = new AirtableRemixContentGateway({
      baseId: "base-test",
      transport,
      database,
      queue,
    });

    await expect(gateway.listSpeakers({ tenantId, eventId })).resolves.toEqual([
      expect.objectContaining({ id: "accepted", biography: "Accepted biography" }),
      expect.objectContaining({ id: "organizer", biography: "Organizer biography" }),
    ]);
    await expect(gateway.listSpeakers({ tenantId: otherTenantId, eventId })).resolves.toEqual([]);
    await expect(
      gateway.getSpeaker({ tenantId: otherTenantId, eventId, sourceId: "accepted" }),
    ).resolves.toBeNull();

    await expect(
      gateway.applyRevision({
        tenantId,
        eventId,
        sourceType: "speaker",
        sourceId: "organizer",
        expectedSourceRevision: 1,
        fields: ["biography"],
        content: { biography: "Updated organizer biography" },
        candidateId: "candidate-organizer",
        actorId: "organizer-owner",
        appliedAt: "2026-08-09T01:00:00.000Z",
      }),
    ).resolves.toMatchObject({ sourceRevision: 2, sourceId: "organizer" });
    const profilePatch = fake.requests.find(
      (request) => request.method === "PATCH" && request.table === "Speaker Profiles",
    );
    const profilePatchFields = (
      profilePatch?.body as { readonly fields?: Readonly<Record<string, unknown>> } | undefined
    )?.fields;
    expect(profilePatchFields).toEqual({
      "Application ID": `speaker-profile:${eventId}:organizer`,
      Version: 2,
      Biography: expect.any(String),
    });
    expect(JSON.parse(String(profilePatchFields?.Biography))).toMatchObject({
      tenantId,
      eventId,
      version: 2,
      biography: "Updated organizer biography",
    });
    await expect(gateway.getSpeaker({ tenantId, eventId, sourceId: "organizer" })).resolves.toEqual(
      expect.objectContaining({ biography: "Updated organizer biography", revision: 2 }),
    );

    await expect(
      gateway.applyRevision({
        tenantId: otherTenantId,
        eventId,
        sourceType: "speaker",
        sourceId: "accepted",
        expectedSourceRevision: 1,
        fields: ["biography"],
        content: { biography: "Cross tenant update" },
        candidateId: "candidate-cross-tenant",
        actorId: "other-owner",
        appliedAt: "2026-08-09T01:00:00.000Z",
      }),
    ).rejects.toThrow("speaker content changed");
  });
  it("batches reviewer workspace Airtable reads under the warm latency budget", async () => {
    const tenantId = "tenant-workspace";
    const eventId = "event-workspace";
    const reviewerId = "reviewer-workspace";
    const planId = "plan-workspace";
    const formId = "form-workspace";
    const now = "2026-08-10T12:00:00.000Z";
    const transport = new FormulaRecordingTransport(220);
    const reviewRound = {
      id: "round-workspace",
      name: "Committee review",
      sequence: 1,
      closesAt: null,
      rubric: {
        id: "rubric-workspace",
        name: "Workspace rubric",
        criteria: [
          {
            id: "quality",
            label: "Quality",
            description: "Proposal quality",
            minimum: 1,
            maximum: 5,
            weight: 1,
            required: true,
          },
        ],
      },
    };
    const plan = {
      id: planId,
      tenantId,
      eventId,
      name: "Core reviewer queue",
      status: "open",
      blindReview: true,
      closesAt: null,
      assignmentRule: { reviewsPerSubmission: 2, maxAssignmentsPerReviewer: 10 },
      rounds: [reviewRound],
      reviewerProjection: { fieldIds: [], fileIds: [] },
      gradingLockedAt: now,
      version: 2,
      createdAt: now,
      updatedAt: now,
    };
    transport.seed({
      baseId: "base-test",
      table: "Review Plans",
      fields: {
        "Application ID": planId,
        "Rounds JSON": JSON.stringify(plan),
      },
    });

    const assignments = [
      {
        id: `${planId}:round-workspace:submission-zulu:${reviewerId}`,
        tenantId,
        eventId,
        planId,
        roundId: reviewRound.id,
        submissionId: "submission-zulu",
        reviewerId,
        status: "assigned",
        planVersion: 2,
        rubricRevision: 2,
        submissionRevision: 3,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${planId}:round-workspace:submission-alpha:${reviewerId}`,
        tenantId,
        eventId,
        planId,
        roundId: reviewRound.id,
        submissionId: "submission-alpha",
        reviewerId,
        status: "assigned",
        planVersion: 2,
        rubricRevision: 2,
        submissionRevision: 4,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const assignment of [
      ...assignments,
      {
        ...assignments[0],
        id: "foreign-tenant-assignment",
        tenantId: "tenant-other",
      },
    ]) {
      transport.seed({
        baseId: "base-test",
        table: "Evaluations",
        fields: {
          "Application ID": assignment.id,
          "Scores JSON": JSON.stringify({
            ...assignment,
            entityType: "evaluation_assignment",
          }),
        },
      });
    }

    transport.seed({
      baseId: "base-test",
      table: "CFP Forms",
      fields: {
        "Application ID": formId,
        "Fields JSON": JSON.stringify({
          id: formId,
          tenantId,
          eventId,
          name: "Workspace form",
          version: 1,
          status: "published",
          welcomeContent: "",
          settings: {
            speakerLimit: 5,
            maxSubmissionsPerAccount: 5,
            remindersEnabled: false,
            adminNotificationsEnabled: false,
            confirmationMessage: "",
            successContent: "",
          },
          sections: [],
          submissionFields: [
            {
              id: "field-speaker-email",
              key: "speakerEmail",
              label: "Speaker email",
              kind: "email",
              required: true,
            },
          ],
          participantFields: [],
          rules: [],
        }),
      },
    });
    for (const [id, title, version] of [
      ["submission-zulu", "Zulu session", 3],
      ["submission-alpha", "Alpha session", 4],
    ] as const) {
      transport.seed({
        baseId: "base-test",
        table: "Submissions",
        fields: {
          "Application ID": id,
          "Answers JSON": JSON.stringify({
            id,
            tenantId,
            eventId,
            formId,
            ownerAccountId: "speaker-account",
            formVersion: 1,
            version,
            status: "submitted",
            completedSteps: ["welcome"],
            answers: {
              title,
              abstract: `${title} abstract`,
              speakerEmail: "hidden@example.com",
            },
            participants: [
              {
                id: `${id}-participant`,
                firstName: "Hidden",
                lastName: "Speaker",
                email: "hidden@example.com",
                biography: "Private biography",
                answers: {},
              },
            ],
            secondaryContacts: [],
            createdAt: now,
            updatedAt: now,
            submittedAt: now,
          }),
        },
      });
    }

    const service = new EvaluationService(
      new AirtableEvaluationRepository({ baseId: "base-test", transport }),
      new AirtableSubmissionReviewSource(
        new AirtableCfpRepository({ baseId: "base-test", transport }),
      ),
    );
    transport.requests.length = 0;
    const startedAt = performance.now();
    const workspace = await service.listReviewerWorkspace(
      {
        tenantId,
        userId: reviewerId,
        kind: "human",
        grants: [{ eventId, role: "reviewer" }],
      },
      eventId,
    );
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1_000);
    expect(workspace.assignments.map((entry) => entry.submission.title)).toEqual([
      "Alpha session",
      "Zulu session",
    ]);
    expect(workspace.assignments).toHaveLength(2);
    expect(
      workspace.assignments.every(
        (entry) =>
          entry.assignment.tenantId === tenantId &&
          entry.submission.identityRedacted &&
          entry.submission.participants.length === 0 &&
          !JSON.stringify(entry.submission).includes("hidden@example.com"),
      ),
    ).toBe(true);

    const reads = transport.requests.filter((request) => request.method === "GET");
    expect(reads.map((request) => request.table).sort()).toEqual([
      "CFP Forms",
      "Evaluations",
      "Review Plans",
      "Submissions",
    ]);
    const evaluationsRead = reads.find((request) => request.table === "Evaluations");
    expect(evaluationsRead?.query?.filterByFormula).toContain("AND(");
    expect(evaluationsRead?.query?.filterByFormula).toContain(tenantId);
    expect(evaluationsRead?.query?.filterByFormula).toContain(reviewerId);
    expect(evaluationsRead?.query?.filterByFormula).toContain(eventId);
  });
  it("batches organizer workspace Airtable reads under the warm latency budget", async () => {
    const tenantId = "tenant-organizer-workspace";
    const eventId = "event-organizer-workspace";
    const otherTenantId = "tenant-organizer-other";
    const otherEventId = "event-organizer-other";
    const planId = "plan-organizer-workspace";
    const roundId = "round-organizer-workspace";
    const now = "2026-08-10T12:00:00.000Z";
    const later = "2026-08-10T12:05:00.000Z";
    const transport = new FormulaRecordingTransport(700);
    const reviewRound = {
      id: roundId,
      name: "Organizer review",
      sequence: 1,
      closesAt: null,
      rubric: {
        id: "rubric-organizer-workspace",
        name: "Organizer rubric",
        criteria: [
          {
            id: "quality",
            label: "Quality",
            description: "Proposal quality",
            minimum: 1,
            maximum: 5,
            weight: 1,
            required: true,
          },
        ],
      },
    };
    const plan = {
      id: planId,
      tenantId,
      eventId,
      name: "Organizer queue",
      status: "open",
      blindReview: true,
      closesAt: null,
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 10 },
      rounds: [reviewRound],
      reviewerProjection: { fieldIds: [], fileIds: [] },
      gradingLockedAt: now,
      version: 2,
      createdAt: now,
      updatedAt: now,
    };
    transport.seed({
      baseId: "base-test",
      table: "Review Plans",
      fields: {
        "Application ID": planId,
        "Rounds JSON": JSON.stringify(plan),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Review Plans",
      fields: {
        "Application ID": "foreign-plan",
        "Rounds JSON": JSON.stringify({
          ...plan,
          id: "foreign-plan",
          tenantId: otherTenantId,
          eventId: otherEventId,
        }),
      },
    });
    const assignmentSubmitted = {
      id: "assignment-organizer-submitted",
      tenantId,
      eventId,
      planId,
      roundId,
      submissionId: "submission-organizer-alpha",
      reviewerId: "reviewer-organizer-one",
      status: "assigned",
      planVersion: 2,
      rubricRevision: 2,
      submissionRevision: 1,
      version: 2,
      createdAt: now,
      updatedAt: later,
    };
    const assignmentOutstanding = {
      id: "assignment-organizer-outstanding",
      tenantId,
      eventId,
      planId,
      roundId,
      submissionId: "submission-organizer-zulu",
      reviewerId: "reviewer-organizer-two",
      status: "assigned",
      planVersion: 2,
      rubricRevision: 2,
      submissionRevision: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const staleAssignment = { ...assignmentSubmitted, version: 1, updatedAt: now };
    const reviewSubmitted = {
      id: `review:${assignmentSubmitted.id}`,
      tenantId,
      eventId,
      planId,
      roundId,
      assignmentId: assignmentSubmitted.id,
      submissionId: assignmentSubmitted.submissionId,
      reviewerId: assignmentSubmitted.reviewerId,
      scores: {
        quality: {
          criterionId: "quality",
          value: 4,
          origin: "human",
          evidence: ["reviewer evidence"],
          humanConfirmedBy: assignmentSubmitted.reviewerId,
        },
      },
      comment: "Strong proposal",
      submittedAt: later,
      version: 2,
      planRevision: 2,
      rubricRevision: 2,
      submissionRevision: 1,
      createdAt: now,
      updatedAt: later,
    };
    const staleReview = { ...reviewSubmitted, version: 1, updatedAt: now, submittedAt: null };
    const reviewDraft = {
      id: `review:${assignmentOutstanding.id}`,
      tenantId,
      eventId,
      planId,
      roundId,
      assignmentId: assignmentOutstanding.id,
      submissionId: assignmentOutstanding.submissionId,
      reviewerId: assignmentOutstanding.reviewerId,
      scores: {},
      comment: "Draft",
      submittedAt: null,
      version: 1,
      planRevision: 2,
      rubricRevision: 2,
      submissionRevision: 1,
      createdAt: now,
      updatedAt: now,
    };
    for (const evaluation of [
      staleAssignment,
      assignmentSubmitted,
      assignmentOutstanding,
      staleReview,
      reviewSubmitted,
      reviewDraft,
      {
        ...assignmentOutstanding,
        id: "foreign-tenant-assignment",
        tenantId: otherTenantId,
      },
      {
        ...reviewDraft,
        id: "review:foreign-tenant-assignment",
        assignmentId: "foreign-tenant-assignment",
        tenantId: otherTenantId,
      },
      {
        ...assignmentOutstanding,
        id: "foreign-event-assignment",
        eventId: otherEventId,
      },
    ]) {
      transport.seed({
        baseId: "base-test",
        table: "Evaluations",
        fields: {
          "Application ID": evaluation.id,
          "Scores JSON": JSON.stringify({
            ...evaluation,
            entityType: "scores" in evaluation ? "evaluation_review" : "evaluation_assignment",
          }),
        },
      });
    }

    const decisionAccepted = {
      id: `decision:${planId}:${assignmentSubmitted.submissionId}`,
      tenantId,
      eventId,
      planId,
      submissionId: assignmentSubmitted.submissionId,
      status: "accepted",
      version: 2,
      history: [
        {
          from: null,
          to: "accepted",
          reason: "Accepted",
          decidedBy: "organizer-workspace",
          decidedAt: later,
          idempotencyKey: "decision-accepted",
        },
      ],
      updatedAt: later,
    };
    const decisionWaitlisted = {
      id: `decision:${planId}:${assignmentOutstanding.submissionId}`,
      tenantId,
      eventId,
      planId,
      submissionId: assignmentOutstanding.submissionId,
      status: "waitlisted",
      version: 1,
      history: [
        {
          from: null,
          to: "waitlisted",
          reason: "Waitlisted",
          decidedBy: "organizer-workspace",
          decidedAt: now,
          idempotencyKey: "decision-waitlisted",
        },
      ],
      updatedAt: now,
    };
    const staleDecision = { ...decisionAccepted, version: 1, status: "waitlisted", updatedAt: now };
    for (const decision of [
      staleDecision,
      decisionAccepted,
      decisionWaitlisted,
      {
        ...decisionWaitlisted,
        id: "decision:foreign-tenant",
        tenantId: otherTenantId,
        submissionId: "submission-foreign-tenant",
      },
      {
        ...decisionWaitlisted,
        id: "decision:foreign-event",
        eventId: otherEventId,
        submissionId: "submission-foreign-event",
      },
    ]) {
      transport.seed({
        baseId: "base-test",
        table: "Decisions",
        fields: {
          "Application ID": decision.id,
          "Metadata JSON": JSON.stringify({ ...decision, entityType: "evaluation_decision" }),
        },
      });
    }

    const seedSubmission = (input: {
      readonly id: string;
      readonly tenantId: string;
      readonly eventId: string;
      readonly title: string;
      readonly version?: number;
    }) => {
      const version = input.version ?? 1;
      transport.seed({
        baseId: "base-test",
        table: "Submissions",
        fields: {
          "Application ID": input.id,
          "Answers JSON": JSON.stringify({
            id: input.id,
            tenantId: input.tenantId,
            eventId: input.eventId,
            formId: "form-organizer-workspace",
            ownerAccountId: "speaker-organizer-workspace",
            formVersion: 1,
            version,
            status: "submitted",
            completedSteps: ["welcome"],
            answers: { title: input.title, abstract: `${input.title} abstract` },
            participants: [],
            secondaryContacts: [],
            createdAt: now,
            updatedAt: version === 1 ? now : later,
            submittedAt: now,
            reopenedAt: null,
          }),
        },
      });
    };
    seedSubmission({
      id: "submission-organizer-alpha",
      tenantId,
      eventId,
      title: "Alpha proposal",
    });
    seedSubmission({
      id: "submission-organizer-zulu",
      tenantId,
      eventId,
      title: "Zulu proposal",
    });
    seedSubmission({
      id: "submission-foreign-tenant",
      tenantId: otherTenantId,
      eventId,
      title: "Foreign tenant proposal",
    });
    seedSubmission({
      id: "submission-foreign-event",
      tenantId,
      eventId: otherEventId,
      title: "Foreign event proposal",
    });

    const service = new EvaluationService(
      new AirtableEvaluationRepository({ baseId: "base-test", transport }),
      new AirtableSubmissionReviewSource(
        new AirtableCfpRepository({ baseId: "base-test", transport }),
      ),
    );
    transport.requests.length = 0;
    const startedAt = performance.now();
    const workspace = await service.getOrganizerWorkspace(
      {
        tenantId,
        userId: "organizer-workspace",
        kind: "human",
        grants: [{ eventId, role: "organizer" }],
      },
      eventId,
    );
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1_100);
    expect(workspace.plan).toMatchObject({ id: planId, tenantId, eventId });
    expect(workspace.submissions.map((submission) => submission.id).sort()).toEqual([
      "submission-organizer-alpha",
      "submission-organizer-zulu",
    ]);
    expect(workspace.assignments.map((assignment) => assignment.id).sort()).toEqual([
      assignmentOutstanding.id,
      assignmentSubmitted.id,
    ]);
    expect(workspace.progress).toMatchObject({
      planId,
      total: 2,
      assigned: 1,
      inProgress: 0,
      submitted: 1,
      abstained: 0,
      completionPercent: 50,
    });
    expect(workspace.progress.reviewers).toEqual([
      expect.objectContaining({
        reviewerId: assignmentSubmitted.reviewerId,
        roundId,
        assigned: 1,
        submitted: 1,
        outstanding: 0,
        completionPercent: 100,
      }),
      expect.objectContaining({
        reviewerId: assignmentOutstanding.reviewerId,
        roundId,
        assigned: 1,
        submitted: 0,
        outstanding: 1,
        completionPercent: 0,
      }),
    ]);
    expect(workspace.decisions).toEqual({
      [assignmentSubmitted.submissionId]: expect.objectContaining({
        id: decisionAccepted.id,
        status: "accepted",
        version: 2,
      }),
      [assignmentOutstanding.submissionId]: expect.objectContaining({
        id: decisionWaitlisted.id,
        status: "waitlisted",
        version: 1,
      }),
    });
    expect(workspace.aggregates).toHaveLength(2);
    expect(workspace.aggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          planId,
          roundId,
          submissionId: assignmentSubmitted.submissionId,
          expectedReviewCount: 1,
          submittedReviewCount: 1,
          averageWeightedTotal: 4,
          possibleWeightedTotal: 5,
          criteria: [expect.objectContaining({ criterionId: "quality", average: 4, count: 1 })],
        }),
        expect.objectContaining({
          planId,
          roundId,
          submissionId: assignmentOutstanding.submissionId,
          expectedReviewCount: 1,
          submittedReviewCount: 0,
          averageWeightedTotal: null,
          possibleWeightedTotal: 5,
        }),
      ]),
    );
    const reads = transport.requests.filter((request) => request.method === "GET");
    expect(reads).toHaveLength(4);
    expect(reads.map((request) => request.table).sort()).toEqual([
      "Decisions",
      "Evaluations",
      "Review Plans",
      "Submissions",
    ]);
    for (const table of ["Review Plans", "Evaluations", "Decisions"] as const) {
      const read = reads.find((request) => request.table === table);
      expect(read?.query?.filterByFormula).toContain("AND(");
      expect(read?.query?.filterByFormula).toContain(tenantId);
      expect(read?.query?.filterByFormula).toContain(eventId);
    }
    expect(JSON.stringify(workspace)).not.toContain("foreign");
  });
  it("persists authoritative Airtable assignment replacement with internal record IDs", async () => {
    const tenantId = "tenant-replacement";
    const eventId = "event-replacement";
    const planId = "plan-replacement";
    const roundId = "round-replacement";
    const submissionId = "submission-replacement";
    const now = "2026-08-10T12:00:00.000Z";
    const transport = new FormulaRecordingTransport();
    const assignmentA = {
      id: "assignment-replacement-a",
      tenantId,
      eventId,
      planId,
      roundId,
      submissionId,
      reviewerId: "reviewer-a",
      status: "assigned" as const,
      planVersion: 1,
      rubricRevision: 1,
      submissionRevision: 1,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const assignmentB = {
      ...assignmentA,
      id: "assignment-replacement-b",
      reviewerId: "reviewer-b",
      status: "submitted" as const,
      version: 2,
      updatedAt: "2026-08-10T12:05:00.000Z",
    };
    const assignmentC = {
      ...assignmentA,
      id: "assignment-replacement-c",
      reviewerId: "reviewer-c",
    };
    const reviewA = {
      id: `review:${assignmentA.id}`,
      tenantId,
      eventId,
      planId,
      roundId,
      assignmentId: assignmentA.id,
      submissionId,
      reviewerId: assignmentA.reviewerId,
      scores: {},
      comment: "Submitted review",
      submittedAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    transport.seed({
      baseId: "base-test",
      table: "Evaluations",
      recordId: "rec00000000000001",
      fields: {
        "Application ID": assignmentA.id,
        "Scores JSON": JSON.stringify({ ...assignmentA, entityType: "evaluation_assignment" }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Evaluations",
      recordId: "rec00000000000002",
      fields: {
        "Application ID": assignmentB.id,
        "Scores JSON": JSON.stringify({ ...assignmentB, entityType: "evaluation_assignment" }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Evaluations",
      recordId: "rec00000000000003",
      fields: {
        "Application ID": reviewA.id,
        "Scores JSON": JSON.stringify({ ...reviewA, entityType: "evaluation_review" }),
      },
    });

    let rejectNextCreate = true;
    const mutationTransport: AirtableTransport = {
      async request<TBody = unknown>(request: AirtableRequest): Promise<AirtableResponse<TBody>> {
        if (rejectNextCreate && request.method === "POST" && request.table === "Evaluations") {
          rejectNextCreate = false;
          return { status: 503, headers: {}, body: {} as TBody };
        }
        return transport.request<TBody>(request);
      },
    };
    const repository = new AirtableEvaluationRepository({
      baseId: "base-test",
      transport: mutationTransport,
    });
    const staleSnapshot = {
      ...assignmentB,
      status: "assigned" as const,
      version: 1,
      updatedAt: now,
    };
    await expect(
      repository.replaceAssignments(tenantId, eventId, planId, roundId, submissionId, [
        staleSnapshot,
        assignmentC,
      ]),
    ).rejects.toMatchObject({ status: 503 });
    await expect(repository.getAssignment(tenantId, assignmentA.id)).resolves.toMatchObject(
      assignmentA,
    );
    await expect(repository.getReview(tenantId, assignmentA.id)).resolves.toMatchObject(reviewA);
    await repository.replaceAssignments(tenantId, eventId, planId, roundId, submissionId, [
      staleSnapshot,
      assignmentC,
    ]);

    await expect(repository.getAssignment(tenantId, assignmentA.id)).resolves.toBeNull();
    await expect(repository.getReview(tenantId, assignmentA.id)).resolves.toBeNull();
    await expect(repository.getAssignment(tenantId, assignmentB.id)).resolves.toMatchObject(
      assignmentB,
    );
    await expect(repository.getAssignment(tenantId, assignmentC.id)).resolves.toMatchObject(
      assignmentC,
    );
    await expect(
      repository.listOrganizerWorkspaceRecords(tenantId, eventId),
    ).resolves.toMatchObject({
      assignments: [assignmentB, assignmentC],
      reviews: [],
    });
    await expect(
      repository.listReviewerWorkspaceRecords(tenantId, assignmentB.reviewerId, [eventId]),
    ).resolves.toMatchObject({
      assignments: [assignmentB],
      reviews: [],
    });

    expect(
      transport.requests
        .filter((request) => request.method === "DELETE")
        .map((request) => request.recordId),
    ).toEqual(expect.arrayContaining(["rec00000000000001", "rec00000000000003"]));
    expect(
      transport.requests.find(
        (request) => request.method === "PATCH" && request.recordId === "rec00000000000002",
      ),
    ).toBeUndefined();
    const createIndex = transport.requests.findIndex(
      (request) => request.method === "POST" && request.table === "Evaluations",
    );
    const deleteIndex = transport.requests.findIndex((request) => request.method === "DELETE");
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThan(createIndex);
  });
  it("queues reviewer reminders through the shared outbox with stable idempotency", async () => {
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "base-test",
      table: "Review Plans",
      fields: {
        "Application ID": "plan-reminder",
        "Rounds JSON": JSON.stringify({
          id: "plan-reminder",
          tenantId: "tenant-reminder",
          eventId: "event-reminder",
          name: "Review plan",
          version: 1,
          status: "open",
          rounds: [],
        }),
      },
    });
    const events: string[] = [];
    const { database, outbox } = acceptanceDatabase(events);
    const messages: CloudflareOutboxMessage[] = [];
    const queue = {
      async send(message: CloudflareOutboxMessage) {
        messages.push(message);
      },
    } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
    const boundary = new AirtableEvaluationReminderBoundary(
      new AirtableEvaluationRepository({ baseId: "base-test", transport }),
      database,
      queue,
    );
    const actor = {
      tenantId: "tenant-reminder",
      userId: "organizer-reminder",
      kind: "human" as const,
      grants: [{ eventId: "event-reminder", role: "organizer" as const }],
    };
    await expect(
      boundary.sendOutstandingReviewerReminders(actor, {
        planId: "plan-reminder",
        roundId: "round-1",
        reviewerIds: ["reviewer-1"],
        assignmentIds: ["assignment-1"],
      }),
    ).resolves.toEqual({ queued: 1, reviewerIds: ["reviewer-1"] });
    await boundary.sendOutstandingReviewerReminders(actor, {
      planId: "plan-reminder",
      roundId: "round-1",
      reviewerIds: ["reviewer-1"],
      assignmentIds: ["assignment-1"],
    });
    expect(messages).toHaveLength(1);
    expect([...outbox.values()]).toHaveLength(1);
    expect([...outbox.values()][0]).toMatchObject({
      topic: "communications",
      state: "queued",
    });
  });
});
interface SpeakerOrganizerOutboxRow {
  readonly id: string;
  readonly tenantId: string;
  readonly topic: string;
  readonly deduplicationKey: string;
  readonly payload: unknown;
  state: string;
}

interface SpeakerOrganizerDatabaseState {
  readonly memberships: Array<{ organization_id: string; role: string }>;
  readonly verifiedEmails: Map<string, string>;
  readonly outbox: Map<string, SpeakerOrganizerOutboxRow>;
  readonly queueMessages: CloudflareOutboxMessage[];
  readonly grants: Array<{
    organization_id: string;
    speaker_profile_id: string;
    user_id: string;
  }>;
  readonly starts: string[];
}

function speakerOrganizerDatabase(input: {
  readonly memberships?: readonly { organization_id: string; role: string }[];
  readonly verifiedEmails?: readonly string[];
  readonly delayMs?: number;
}): {
  readonly database: NonNullable<RuntimeBindings["DB"]>;
  readonly state: SpeakerOrganizerDatabaseState;
} {
  const state: SpeakerOrganizerDatabaseState = {
    memberships: [...(input.memberships ?? [])],
    verifiedEmails: new Map(
      (input.verifiedEmails ?? []).map((email) => [email.toLowerCase(), email]),
    ),
    outbox: new Map(),
    queueMessages: [],
    grants: [],
    starts: [],
  };
  const delayMs = input.delayMs ?? 0;
  const database = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (query.includes("FROM organization_memberships")) {
                const membership = state.memberships.find(
                  (candidate) => candidate.organization_id === String(values[0]),
                );
                return (membership ?? null) as T | null;
              }
              if (query.includes("FROM auth_users")) {
                const email =
                  query.includes("WHERE id = ?") && String(values[0]) === "account-speaker"
                    ? state.verifiedEmails.values().next().value
                    : state.verifiedEmails.get(String(values[0]).toLowerCase());
                if (query.includes("SELECT id")) {
                  return (email === undefined ? null : { id: "account-speaker" }) as T | null;
                }
                return (email === undefined ? null : { email }) as T | null;
              }
              if (query.includes("SELECT state FROM outbox_jobs")) {
                return (
                  state.outbox.get(String(values[0]))?.state === undefined
                    ? null
                    : { state: state.outbox.get(String(values[0]))?.state }
                ) as T | null;
              }
              return null;
            },
            async all<T>() {
              if (query.includes("FROM organization_memberships")) {
                state.starts.push("d1:membership");
                if (delayMs > 0) {
                  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
                }
                return { results: state.memberships as T[] };
              }
              if (query.includes("FROM auth_users") && query.includes("SELECT id")) {
                const email = state.verifiedEmails.get(String(values[0]).toLowerCase());
                return {
                  results: email === undefined ? [] : [{ id: "account-speaker" }],
                } as unknown as { results: T[] };
              }
              if (query.includes("FROM speaker_grants")) {
                return {
                  results: state.grants.filter((grant) => grant.user_id === String(values[0])),
                } as unknown as { results: T[] };
              }
              return { results: [] as T[] };
            },
            async run() {
              if (query.includes("INSERT INTO speaker_grants")) {
                const [organizationId, speakerProfileId, userId] = values;
                state.grants.push({
                  organization_id: String(organizationId),
                  speaker_profile_id: String(speakerProfileId),
                  user_id: String(userId),
                });
                return { success: true, meta: { changes: 1 } };
              }
              if (query.includes("INSERT INTO outbox_jobs")) {
                const [id, tenantId, topic, deduplicationKey, payloadJson] = values;
                const duplicate = [...state.outbox.values()].some(
                  (row) =>
                    row.tenantId === String(tenantId) &&
                    row.topic === String(topic) &&
                    row.deduplicationKey === String(deduplicationKey),
                );
                if (duplicate) return { success: true, meta: { changes: 0 } };
                state.outbox.set(String(id), {
                  id: String(id),
                  tenantId: String(tenantId),
                  topic: String(topic),
                  deduplicationKey: String(deduplicationKey),
                  payload: JSON.parse(String(payloadJson)) as unknown,
                  state: "pending",
                });
                return { success: true, meta: { changes: 1 } };
              }
              if (query.includes("UPDATE outbox_jobs SET state = 'queued'")) {
                const row = state.outbox.get(String(values[1]));
                if (row !== undefined) row.state = "queued";
                return {
                  success: true,
                  meta: { changes: row === undefined ? 0 : 1 },
                };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  } as unknown as NonNullable<RuntimeBindings["DB"]>;
  return { database, state };
}

function seedSpeakerOrganizerFixture(
  transport: FakeAirtableTransport | FormulaRecordingTransport,
): void {
  transport.seed({
    baseId: "base-test",
    table: "Events",
    fields: {
      "Application ID": "event-speaker",
      "Settings JSON": JSON.stringify({
        id: "event-speaker",
        organizationId: "ai-engineer",
        eventId: "event-speaker",
        name: "Speaker Event",
      }),
    },
  });
  transport.seed({
    baseId: "base-test",
    table: "Submissions",
    fields: {
      "Application ID": "submission-speaker",
      "Answers JSON": JSON.stringify({
        id: "submission-speaker",
        organizationId: "ai-engineer",
        tenantId: "ai-engineer",
        eventId: "event-speaker",
        ownerAccountId: "account-speaker",
        formId: "form-speaker",
        title: "Reliable Systems",
        status: "accepted",
        participants: [
          {
            id: "participant-speaker",
            firstName: "Verified",
            lastName: "Speaker",
            email: "speaker@example.test",
            role: "primary",
          },
        ],
        updatedAt: "2026-08-09T00:00:00.000Z",
      }),
    },
  });
  transport.seed({
    baseId: "base-test",
    table: "Submissions",
    fields: {
      "Application ID": "submission-cross-tenant",
      "Answers JSON": JSON.stringify({
        id: "submission-cross-tenant",
        organizationId: "other-tenant",
        tenantId: "other-tenant",
        eventId: "event-speaker",
        formId: "form-speaker",
        title: "Cross tenant",
        status: "accepted",
        participants: [{ id: "participant-cross", firstName: "Cross", lastName: "Tenant" }],
        updatedAt: "2026-08-09T00:00:00.000Z",
      }),
    },
  });
  transport.seed({
    baseId: "base-test",
    table: "Speaker Profiles",
    fields: {
      "Application ID": "speaker-profile:event-speaker:participant-speaker",
      Biography: JSON.stringify({
        id: "speaker-profile:event-speaker:participant-speaker",
        eventId: "event-speaker",
        participantId: "participant-speaker",
        displayName: "Verified Speaker",
        email: "speaker@example.test",
        version: 1,
        updatedAt: "2026-08-09T00:00:00.000Z",
      }),
    },
  });
}

describe("production organizer speaker composition", () => {
  function fixture() {
    const transport = new FormulaRecordingTransport();
    seedSpeakerOrganizerFixture(transport.fake);
    const { database, state } = speakerOrganizerDatabase({
      memberships: [{ organization_id: "ai-engineer", role: "owner" }],
      verifiedEmails: ["speaker@example.test"],
    });
    const queue = {
      async send(message: CloudflareOutboxMessage) {
        state.queueMessages.push(message);
      },
    } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database,
    });
    return { transport, database, state, queue, repository };
  }

  it("allows only event-bound owner/admin memberships and excludes reviewer and cross-tenant records", async () => {
    const { state, repository } = fixture();
    const membership = state.memberships[0];
    if (membership === undefined) throw new Error("Speaker organizer membership fixture is empty.");
    await expect(
      repository.getOrganizerAccessScope("event-speaker", "organizer-speaker"),
    ).resolves.toEqual({
      tenantId: "ai-engineer",
      eventId: "event-speaker",
      role: "owner",
      submissionIds: ["submission-speaker"],
      participantIds: ["participant-speaker"],
    });
    membership.role = "admin";
    await expect(
      repository.getOrganizerAccessScope("event-speaker", "organizer-speaker"),
    ).resolves.toMatchObject({
      tenantId: "ai-engineer",
      role: "admin",
    });
    membership.role = "reviewer";
    await expect(
      repository.getOrganizerAccessScope("event-speaker", "organizer-speaker"),
    ).resolves.toBeNull();
    state.memberships.splice(0, 1, {
      organization_id: "other-tenant",
      role: "owner",
    });
    await expect(
      repository.getOrganizerAccessScope("event-speaker", "organizer-speaker"),
    ).resolves.toBeNull();
  });
  it("loads organizer deliverables in one 650 ms dependency wave", async () => {
    const transport = new FormulaRecordingTransport(650);
    seedSpeakerOrganizerFixture(transport);
    transport.seed({
      baseId: "base-test",
      table: "Speaker Tasks",
      fields: {
        "Application ID": "task-speaker-read",
        "Owner JSON": JSON.stringify({
          id: "task-speaker-read",
          eventId: "event-speaker",
          submissionId: "submission-speaker",
          participantId: "participant-speaker",
          type: "upload",
          owner: "speaker",
          title: "Upload slides",
          status: "not_started",
          dependencyIds: [],
          reminderOffsetsMinutes: [],
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "File Assets",
      fields: {
        "Application ID": "asset-speaker-read",
        "Settings JSON": JSON.stringify({
          id: "asset-speaker-read",
          entityType: "speaker_asset",
          tenantId: "ai-engineer",
          eventId: "event-speaker",
          submissionId: "submission-speaker",
          participantId: "participant-speaker",
          taskId: "task-speaker-read",
          kind: "slides",
          objectKey: "events/event-speaker/slides.pdf",
          fileName: "slides.pdf",
          contentType: "application/pdf",
          sizeBytes: 1_024,
          state: "ready",
          versionFamilyId: "slides-family",
          version: 1,
          createdAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    const { database, state } = speakerOrganizerDatabase({
      memberships: [{ organization_id: "ai-engineer", role: "owner" }],
      delayMs: 650,
    });
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database,
    });

    const startedAt = performance.now();
    const pending = repository.getOrganizerReadModel("event-speaker", "organizer-speaker", {
      profiles: true,
      tasks: true,
      assets: true,
    });
    await Promise.resolve();
    expect(transport.requests.map((request) => request.table)).toEqual([
      "Events",
      "Submissions",
      "Session Roster",
      "Decisions",
      "Speaker Profiles",
      "Speaker Tasks",
      "File Assets",
    ]);

    await expect(pending).resolves.toMatchObject({
      scope: {
        tenantId: "ai-engineer",
        eventId: "event-speaker",
        role: "owner",
        participantIds: ["participant-speaker"],
      },
      profiles: [{ participantId: "participant-speaker" }],
      tasks: [{ id: "task-speaker-read" }],
      assets: [{ id: "asset-speaker-read" }],
    });
    expect(performance.now() - startedAt).toBeLessThan(1_300);
    expect(state.starts).toEqual(["d1:membership"]);
    const readsByTable = transport.requests.reduce<Record<string, number>>((counts, request) => {
      if (request.method === "GET") counts[request.table] = (counts[request.table] ?? 0) + 1;
      return counts;
    }, {});
    expect(readsByTable).toMatchObject({
      Events: 1,
      Submissions: 1,
      "Session Roster": 1,
      Decisions: 1,
      "Speaker Profiles": 1,
      "Speaker Tasks": 1,
      "File Assets": 1,
    });
    expect(
      transport.requests.find((request) => request.table === "Speaker Tasks")?.query
        ?.filterByFormula,
    ).toBe('FIND("event-speaker",{Owner JSON})>0');
    expect(
      transport.requests.find((request) => request.table === "File Assets")?.query?.filterByFormula,
    ).toBe('FIND("event-speaker",{Settings JSON})>0');
    expect(
      transport.requests.find((request) => request.table === "Speaker Profiles")?.query
        ?.filterByFormula,
    ).toBe('FIND("event-speaker",{Biography})>0');

    transport.requests.length = 0;
    await repository.listAssetHistory("event-speaker", "slides-family");
    await repository.listAssetComments("event-speaker", "asset-speaker-read");
    const sessions = new AirtableSessionRepository({ baseId: "base-test", transport });
    await sessions.listSessions("ai-engineer", "event-speaker");
    expect(
      transport.requests.find((request) => request.table === "File Assets")?.query?.filterByFormula,
    ).toBe('FIND("event-speaker",{Settings JSON})>0');
    expect(
      transport.requests.find((request) => request.table === "File Comments")?.query
        ?.filterByFormula,
    ).toBe('FIND("event-speaker",{Settings JSON})>0');
    expect(
      transport.requests.find((request) => request.table === "Sessions")?.query?.filterByFormula,
    ).toBe('FIND("event-speaker",{Metadata JSON})>0');

    const production = productionBindings(transport, database);
    const agendaCoordinator = production.AGENDA_COORDINATOR;
    const privateFiles = production.PRIVATE_FILES;
    const outboxQueue = production.OUTBOX_QUEUE;
    if (
      agendaCoordinator === undefined ||
      privateFiles === undefined ||
      outboxQueue === undefined
    ) {
      throw new Error("Expected production speaker bindings.");
    }
    const dependencies = createAirtableDependencies({
      authenticator: { authenticate: async () => null },
      baseId: "base-test",
      transport,
      database,
      agendaCoordinator,
      privateFiles,
      outboxQueue,
      webOrigin: "https://example.test",
    });
    const speaker = dependencies.speaker;
    if (speaker === undefined) throw new Error("Production speaker dependencies are not mounted.");
    transport.requests.length = 0;
    const rosterStartedAt = performance.now();
    await expect(
      speaker.service.listOrganizerSpeakerRoster(
        "ai-engineer",
        "event-speaker",
        "organizer-speaker",
      ),
    ).resolves.toMatchObject({
      organizationId: "ai-engineer",
      eventId: "event-speaker",
      speakers: [
        expect.objectContaining({
          participantId: "participant-speaker",
          displayName: "Verified Speaker",
          sessions: [
            expect.objectContaining({
              submissionId: "speaker-submission:submission-speaker",
            }),
          ],
          assets: [expect.objectContaining({ assetId: "asset-speaker-read" })],
        }),
      ],
    });
    expect(performance.now() - rosterStartedAt).toBeLessThan(1_300);
    expect(transport.requests.map((request) => request.table)).toEqual([
      "Events",
      "Submissions",
      "Session Roster",
      "Decisions",
      "Speaker Profiles",
      "Speaker Tasks",
      "File Assets",
    ]);

    const membership = state.memberships[0];
    if (membership === undefined) throw new Error("Expected an organizer membership.");
    membership.role = "reviewer";
    transport.requests.length = 0;
    await expect(
      speaker.service.listOrganizerSpeakerRoster(
        "ai-engineer",
        "event-speaker",
        "organizer-speaker",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(transport.requests.map((request) => request.table)).toEqual([
      "Events",
      "Submissions",
      "Session Roster",
      "Decisions",
      "Speaker Profiles",
      "Speaker Tasks",
      "File Assets",
    ]);
    transport.requests.length = 0;
    await expect(
      repository.getOrganizerReadModel("event-speaker", "organizer-speaker", {
        profiles: true,
        tasks: true,
        assets: true,
      }),
    ).resolves.toBeNull();
    expect(transport.requests.map((request) => request.table)).toEqual([
      "Events",
      "Submissions",
      "Session Roster",
      "Decisions",
      "Speaker Profiles",
      "Speaker Tasks",
      "File Assets",
    ]);
  });

  it("persists organizer-created speaker tasks with optimistic updates", async () => {
    const { repository } = fixture();
    const task = {
      id: "task-speaker-upload",
      eventId: "event-speaker",
      submissionId: "submission-speaker",
      participantId: "participant-speaker",
      type: "upload" as const,
      owner: "speaker" as const,
      title: "Upload presentation",
      status: "not_started" as const,
      dependencyIds: [],
      reminderOffsetsMinutes: [],
      allowedMimeTypes: ["application/pdf"],
      maxBytes: 5_000_000,
      assigneeIds: ["participant-speaker"],
      version: 1,
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    await expect(
      repository.createTask({
        task,
        expectedVersion: null,
        actorAccountId: "organizer-speaker",
      }),
    ).resolves.toEqual({ ok: true, value: task });
    await expect(
      repository.createTask({
        task,
        expectedVersion: null,
        actorAccountId: "organizer-speaker",
      }),
    ).resolves.toEqual({ ok: false, reason: "version_conflict" });

    const updated = {
      ...task,
      title: "Upload final presentation",
      version: 2,
      updatedAt: "2026-08-10T00:00:00.000Z",
    };
    await expect(
      repository.updateTask({
        task: updated,
        expectedVersion: 1,
        actorAccountId: "organizer-speaker",
      }),
    ).resolves.toEqual({ ok: true, value: updated });
    await expect(repository.getTask(task.eventId, task.id)).resolves.toEqual(updated);
  });
  it("keeps accepted and tenant-scoped CRM tasks after an Airtable repository reload", async () => {
    const { repository, transport, database } = fixture();
    const manualRoster = {
      id: "roster-crm-manual",
      tenantId: "ai-engineer",
      eventId: "event-speaker",
      submissionId: "speaker-submission:crm-contact:manual",
      participantId: "participant-manual",
      displayName: "Manual Speaker",
      workflowStatus: "crm-prospect",
      organizerStatus: "pending",
      role: "primary",
      status: "pending",
      version: 1,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    const crossTenantRoster = {
      ...manualRoster,
      id: "roster-crm-cross-tenant",
      tenantId: "other-tenant",
      submissionId: "speaker-submission:crm-contact:cross-tenant",
      participantId: "participant-cross-tenant",
    };
    const crossEventRoster = {
      ...manualRoster,
      id: "roster-crm-cross-event",
      eventId: "other-event",
      submissionId: "speaker-submission:crm-contact:cross-event",
      participantId: "participant-cross-event",
    };
    for (const entry of [manualRoster, crossTenantRoster, crossEventRoster]) {
      transport.seed({
        baseId: "base-test",
        table: "Session Roster",
        fields: {
          "Application ID": entry.id,
          "Members JSON": JSON.stringify(entry),
        },
      });
    }
    const seedTask = (input: {
      id: string;
      eventId: string;
      participantId: string;
      submissionId: string;
    }) => {
      transport.seed({
        baseId: "base-test",
        table: "Speaker Tasks",
        fields: {
          "Application ID": input.id,
          "Owner JSON": JSON.stringify({
            id: input.id,
            eventId: input.eventId,
            submissionId: input.submissionId,
            participantId: input.participantId,
            type: "action",
            owner: "speaker",
            title: input.id,
            status: "not_started",
            dependencyIds: [],
            reminderOffsetsMinutes: [],
            assigneeIds: [input.participantId],
            version: 1,
            updatedAt: "2026-08-09T00:00:00.000Z",
          }),
        },
      });
    };
    seedTask({
      id: "task-accepted-reload",
      eventId: "event-speaker",
      participantId: "participant-speaker",
      submissionId: "submission-speaker",
    });
    seedTask({
      id: "task-crm-reload",
      eventId: "event-speaker",
      participantId: "participant-manual",
      submissionId: manualRoster.submissionId,
    });
    seedTask({
      id: "task-crm-wrong-submission",
      eventId: "event-speaker",
      participantId: "participant-manual",
      submissionId: "speaker-submission:crm-contact:wrong",
    });
    seedTask({
      id: "task-crm-cross-tenant",
      eventId: "event-speaker",
      participantId: crossTenantRoster.participantId,
      submissionId: crossTenantRoster.submissionId,
    });
    seedTask({
      id: "task-crm-cross-event",
      eventId: "other-event",
      participantId: crossEventRoster.participantId,
      submissionId: crossEventRoster.submissionId,
    });

    const participantIds = [
      "participant-speaker",
      "participant-manual",
      crossTenantRoster.participantId,
      crossEventRoster.participantId,
    ];
    await expect(repository.listTasks("event-speaker", participantIds)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "task-accepted-reload" }),
        expect.objectContaining({ id: "task-crm-reload" }),
      ]),
    );
    const beforeReload = await repository.listTasks("event-speaker", participantIds);
    expect(beforeReload.map((task) => task.id).sort()).toEqual([
      "task-accepted-reload",
      "task-crm-reload",
    ]);

    const reloaded = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database,
    });
    await expect(reloaded.listTasks("event-speaker", participantIds)).resolves.toEqual(
      beforeReload,
    );
  });
  it("canonicalizes speaker aliases before projecting portal tasks", async () => {
    const { repository, state, transport } = fixture();
    const aliasParticipantId = "participant-speaker-alias";
    const canonicalProfileId = "speaker-profile:event-speaker:participant-speaker";
    const aliasProfileId = `speaker-profile:event-speaker:${aliasParticipantId}`;
    state.grants.push(
      {
        organization_id: "ai-engineer",
        speaker_profile_id: canonicalProfileId,
        user_id: "account-speaker",
      },
      {
        organization_id: "ai-engineer",
        speaker_profile_id: aliasProfileId,
        user_id: "account-speaker",
      },
    );
    transport.seed({
      baseId: "base-test",
      table: "Speaker Profiles",
      fields: {
        "Application ID": aliasProfileId,
        Biography: JSON.stringify({
          id: aliasProfileId,
          eventId: "event-speaker",
          participantId: aliasParticipantId,
          displayName: "Verified Speaker",
          email: "speaker@example.test",
          biography: "",
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": "speaker-submission:submission-speaker-alias",
        "Answers JSON": JSON.stringify({
          id: "speaker-submission:submission-speaker-alias",
          organizationId: "ai-engineer",
          eventId: "event-speaker",
          title: "Reliable Systems",
          status: "accepted",
          participantIds: [aliasParticipantId],
          primaryParticipantId: aliasParticipantId,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });

    const seedTask = (input: {
      id: string;
      participantId: string;
      submissionId: string;
      title: string;
      version?: number;
      updatedAt?: string;
    }) => {
      transport.seed({
        baseId: "base-test",
        table: "Speaker Tasks",
        fields: {
          "Application ID": input.id,
          "Owner JSON": JSON.stringify({
            id: input.id,
            eventId: "event-speaker",
            submissionId: input.submissionId,
            participantId: input.participantId,
            assigneeIds: [input.participantId],
            type: "action",
            owner: "speaker",
            title: input.title,
            status: "not_started",
            dependencyIds: [],
            reminderOffsetsMinutes: [],
            version: input.version ?? 1,
            updatedAt: input.updatedAt ?? "2026-08-09T00:00:00.000Z",
          }),
        },
      });
    };
    seedTask({
      id: "task-family:participant-speaker",
      participantId: "participant-speaker",
      submissionId: "speaker-submission:submission-speaker",
      title: "Canonical family",
    });
    seedTask({
      id: `task-family:${aliasParticipantId}`,
      participantId: aliasParticipantId,
      submissionId: "speaker-submission:submission-speaker-alias",
      title: "Canonical family",
      version: 5,
      updatedAt: "2026-08-10T00:00:00.000Z",
    });
    seedTask({
      id: "organizer-task-for-alias",
      participantId: aliasParticipantId,
      submissionId: "speaker-submission:submission-speaker-alias",
      title: "Organizer follow-up",
    });
    seedTask({
      id: "same-title:participant-speaker:one",
      participantId: "participant-speaker",
      submissionId: "speaker-submission:submission-speaker",
      title: "Keep both authoritative records",
    });
    seedTask({
      id: `same-title:${aliasParticipantId}:two`,
      participantId: aliasParticipantId,
      submissionId: "speaker-submission:submission-speaker-alias",
      title: "Keep both authoritative records",
    });

    await expect(
      repository.getAccessScope("event-speaker", "account-speaker"),
    ).resolves.toMatchObject({
      tenantId: "ai-engineer",
      participantIds: ["participant-speaker"],
      primaryParticipantId: "participant-speaker",
      capabilitiesByParticipant: {
        "participant-speaker": expect.arrayContaining(["task-response", "roster-manage"]),
      },
    });
    await expect(repository.listPortalContexts("account-speaker")).resolves.toMatchObject([
      {
        eventId: "event-speaker",
        participantIds: ["participant-speaker"],
        primaryParticipantId: "participant-speaker",
      },
    ]);

    const tasks = await repository.listTasks("event-speaker", ["participant-speaker"]);
    expect(tasks.map((task) => task.id).sort()).toEqual([
      "same-title:participant-speaker:one",
      "task-family:participant-speaker",
    ]);
    expect(tasks.find((task) => task.id === "task-family:participant-speaker")).toMatchObject({
      participantId: "participant-speaker",
      submissionId: "speaker-submission:submission-speaker",
      version: 1,
    });
    expect(tasks.find((task) => task.id === "organizer-task-for-alias")).toBeUndefined();
  });

  it("resolves public CFP submission IDs to canonical speaker roster records", async () => {
    const { repository, transport } = fixture();
    const rosterEntry = {
      id: "roster-speaker",
      tenantId: "ai-engineer",
      eventId: "event-speaker",
      submissionId: "speaker-submission:submission-speaker",
      participantId: "participant-speaker",
      displayName: "Verified Speaker",
      role: "primary" as const,
      status: "active" as const,
      version: 1,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    transport.seed({
      baseId: "base-test",
      table: "Session Roster",
      fields: {
        "Application ID": rosterEntry.id,
        "Members JSON": JSON.stringify(rosterEntry),
      },
    });

    await expect(repository.listRoster("event-speaker", "submission-speaker")).resolves.toEqual([
      {
        id: rosterEntry.id,
        organizationId: "ai-engineer",
        eventId: rosterEntry.eventId,
        submissionId: rosterEntry.submissionId,
        participantId: rosterEntry.participantId,
        displayName: rosterEntry.displayName,
        role: rosterEntry.role,
        status: rosterEntry.status,
        version: rosterEntry.version,
        createdAt: rosterEntry.createdAt,
        updatedAt: rosterEntry.updatedAt,
      },
    ]);
  });

  it("keeps invitation preview non-mutating, queues verified invitations once, and never uses host addresses", async () => {
    const { database, queue, state, transport } = fixture();
    const bindings = productionBindings(transport, database);
    const agendaCoordinator = bindings.AGENDA_COORDINATOR;
    const privateFiles = bindings.PRIVATE_FILES;
    if (agendaCoordinator === undefined || privateFiles === undefined) {
      throw new Error("Production Cloudflare bindings are not mounted.");
    }
    const dependencies = createAirtableDependencies({
      authenticator: { authenticate: async () => null },
      baseId: "base-test",
      transport,
      database,
      agendaCoordinator,
      privateFiles,
      outboxQueue: queue,
      webOrigin: "https://example.test",
    });
    const before = transport.requests.length;
    const speaker = dependencies.speaker;
    if (speaker === undefined) throw new Error("Production speaker dependencies are not mounted.");
    await expect(
      speaker.service.previewOrganizerSpeakerInvitations(
        "ai-engineer",
        "event-speaker",
        "organizer-speaker",
        ["participant-speaker"],
      ),
    ).resolves.toEqual([
      {
        participantId: "participant-speaker",
        recipientEmail: "speaker@example.test",
        state: "ready",
      },
    ]);
    expect(transport.requests.slice(before).every((request) => request.method === "GET")).toBe(
      true,
    );
    const first = await speaker.service.sendOrganizerSpeakerInvitations({
      organizationId: "ai-engineer",
      eventId: "event-speaker",
      accountId: "organizer-speaker",
      participantIds: ["participant-speaker"],
      templateId: "speaker-invitation",
      idempotencyKey: "speaker-invitation-key",
    });
    const second = await speaker.service.sendOrganizerSpeakerInvitations({
      organizationId: "ai-engineer",
      eventId: "event-speaker",
      accountId: "organizer-speaker",
      participantIds: ["participant-speaker"],
      templateId: "speaker-invitation",
      idempotencyKey: "speaker-invitation-key",
    });
    expect(first).toMatchObject({
      status: "queued",
      recipients: [{ recipientEmail: "speaker@example.test", status: "queued" }],
    });
    expect(second).toMatchObject({
      status: "duplicate",
      duplicate: true,
      recipients: [{ recipientEmail: "speaker@example.test", status: "duplicate" }],
    });
    expect(state.outbox.size).toBe(1);
    expect(state.queueMessages).toHaveLength(1);
    const payload = [...state.outbox.values()][0]?.payload;
    expect(payload).toMatchObject({
      from: "speakers@sessionboard.namuh.co",
      to: ["speaker@example.test"],
      subject: "Speaker invitation for event-speaker",
      html: expect.stringContaining(
        'href="https://example.test/login?next=%2Fportal">Sign in to the speaker portal</a>',
      ),
      text: expect.stringContaining(
        "Sign in to the speaker portal: https://example.test/login?next=%2Fportal",
      ),
    });
    expect(JSON.stringify(payload)).not.toContain("foreverbrowsing.com");
    const template = await speaker.service.createOrganizerSpeakerEmailTemplate({
      organizationId: "ai-engineer",
      eventId: "event-speaker",
      accountId: "organizer-speaker",
      templateId: "bulk-speaker-welcome",
      name: "Bulk speaker welcome",
      subject: "Welcome {{first_name}}",
      html: "<p>Welcome {{first_name}} to the speaker program.</p>",
      text: "Welcome {{first_name}} to the speaker program.",
    });
    const emailPreview = await speaker.service.previewOrganizerSpeakerEmails({
      organizationId: "ai-engineer",
      eventId: "event-speaker",
      accountId: "organizer-speaker",
      participantIds: ["participant-speaker"],
      templateId: template.id,
      templateVersion: template.version,
    });
    await expect(
      speaker.service.sendOrganizerSpeakerEmails({
        organizationId: "ai-engineer",
        eventId: "event-speaker",
        accountId: "organizer-speaker",
        previewId: emailPreview.id,
        idempotencyKey: "bulk-speaker-welcome-send",
      }),
    ).resolves.toMatchObject({
      status: "queued",
      deliveries: [
        expect.objectContaining({
          participantId: "participant-speaker",
          status: "queued",
        }),
      ],
    });
    expect([...state.outbox.values()]).toContainEqual(
      expect.objectContaining({
        topic: "communications",
        payload: expect.objectContaining({
          to: ["speaker@example.test"],
          subject: "Welcome Verified",
          html: "<p>Welcome Verified to the speaker program.</p>",
          text: "Welcome Verified to the speaker program.",
          templateId: "bulk-speaker-welcome",
          templateVersion: 1,
        }),
      }),
    );
    const delivery = new AirtableSpeakerReminderDeliveryAdapter(
      database,
      queue,
      "https://web.example.test",
    );
    await expect(
      delivery.enqueueReminder({
        organizationId: "ai-engineer",
        eventId: "event-speaker",
        recipient: {
          participantId: "participant-speaker",
          displayName: "Speaker",
          email: "speaker@example.test",
          taskIds: ["task-headshot"],
          tasks: [
            {
              taskId: "task-headshot",
              participantId: "participant-speaker",
              title: "Upload final headshot",
              dueAt: "2027-05-10T17:00:00.000Z",
            },
          ],
        },
        idempotencyKey: "speaker-reminder-key",
        actorAccountId: "organizer-speaker",
      }),
    ).resolves.toMatchObject({ queued: true });
    expect([...state.outbox.values()]).toContainEqual(
      expect.objectContaining({
        topic: "communications",
        payload: expect.objectContaining({
          subject: "Reminder: Upload final headshot (due 2027-05-10T17:00:00.000Z)",
          html: expect.stringContaining("Upload final headshot (due 2027-05-10T17:00:00.000Z)"),
          text: expect.stringContaining("Upload final headshot (due 2027-05-10T17:00:00.000Z)"),
        }),
      }),
    );
    await expect(
      delivery.enqueueInvitation({
        organizationId: "ai-engineer",
        eventId: "event-speaker",
        participantId: "participant-speaker",
        recipientEmail: "host@foreverbrowsing.com",
        templateId: "speaker-invitation",
        idempotencyKey: "host-invitation-key",
        actorAccountId: "organizer-speaker",
      }),
    ).resolves.toEqual({ status: "failed" });
    expect(state.queueMessages).toHaveLength(3);
  });
  it("queues personalized decision email content from the canonical submission", async () => {
    const { database, queue, state, transport } = fixture();
    const projection = new AirtableEvaluationDecisionProjection(
      new AirtableCfpRepository({ baseId: "base-test", transport }),
      database,
      queue,
    );
    await projection.projectDecision({
      tenantId: "ai-engineer",
      eventId: "event-speaker",
      planId: "plan-speaker",
      submissionId: "submission-speaker",
      decisionId: "decision-speaker-rejected",
      decisionVersion: 1,
      status: "rejected",
      priorStatus: null,
      reason: "Not selected",
      decidedByUserId: "organizer-speaker",
      decidedAt: "2026-08-12T21:00:00.000Z",
      idempotencyKey: "decision-speaker-rejected-v1",
      participantProjection: {
        status: "rejected",
        reason: "Not selected",
        decisionVersion: 1,
        decidedAt: "2026-08-12T21:00:00.000Z",
      },
      communication: { templatePurpose: "decision_rejected" },
    });
    expect([...state.outbox.values()]).toContainEqual(
      expect.objectContaining({
        topic: "communications",
        payload: expect.objectContaining({
          to: ["speaker@example.test"],
          subject: "event-speaker — Reliable Systems — rejected",
          html: expect.stringContaining("Participants: Verified Speaker"),
          text: expect.stringContaining(
            "Submission: Reliable Systems\nParticipants: Verified Speaker\nDecision: rejected",
          ),
        }),
      }),
    );
  });
  it("serves an empty canonical Airtable roster, creates Priya by participant email, and reloads scoped projections", async () => {
    const transport = new FakeAirtableTransport();
    const eventId = "event-priya";
    const submissionId = "submission-priya";
    const canonicalSubmissionId = `speaker-submission:${submissionId}`;
    transport.seed({
      baseId: "base-test",
      table: "Events",
      fields: {
        "Application ID": eventId,
        "Settings JSON": JSON.stringify({
          id: eventId,
          organizationId: "ai-engineer",
          eventId,
          name: "Priya event",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": submissionId,
        "Answers JSON": JSON.stringify({
          id: submissionId,
          organizationId: "ai-engineer",
          tenantId: "ai-engineer",
          eventId,
          formId: "form-priya",
          title: "Priya session",
          status: "accepted",
          participants: [
            {
              id: "participant-priya",
              firstName: "Priya",
              lastName: "Raman",
              email: "priya@example.test",
              role: "primary",
              biography: "Platform engineer",
              answers: {},
            },
          ],
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Submissions",
      fields: {
        "Application ID": canonicalSubmissionId,
        "Answers JSON": JSON.stringify({
          id: canonicalSubmissionId,
          entityType: "speaker_submission",
          eventId,
          title: "Priya session",
          status: "accepted",
          participantIds: ["participant-priya"],
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    const { database, state } = speakerOrganizerDatabase({
      memberships: [{ organization_id: "ai-engineer", role: "owner" }],
      verifiedEmails: ["priya@example.test"],
    });
    const bindings = productionBindings(transport, database);
    const agendaCoordinator = bindings.AGENDA_COORDINATOR;
    const privateFiles = bindings.PRIVATE_FILES;
    const outboxQueue = bindings.OUTBOX_QUEUE;
    if (
      agendaCoordinator === undefined ||
      privateFiles === undefined ||
      outboxQueue === undefined
    ) {
      throw new Error("Production Cloudflare bindings are not mounted.");
    }
    const principal = {
      kind: "user" as const,
      sessionId: "session-organizer",
      userId: "organizer-speaker",
      email: "organizer@example.test",
      memberships: [{ organizationId: "ai-engineer", role: "owner" as const }],
      speakerGrants: [],
    };
    const runtimeDependencies = createAirtableDependencies({
      authenticator: { authenticate: async () => principal },
      baseId: "base-test",
      transport,
      database,
      agendaCoordinator,
      privateFiles,
      outboxQueue,
      webOrigin: "https://example.test",
    });
    const speaker = runtimeDependencies.speaker;
    if (speaker === undefined) {
      throw new Error("Production speaker dependencies were not composed.");
    }
    const app = createApp({
      authenticator: { authenticate: async () => principal },
      speaker,
    });
    const env = { APP_ENV: "production", WEB_ORIGIN: "https://example.test" };
    const path = `/api/admin/organizations/ai-engineer/events/${eventId}/speakers`;
    const initial = await app.request(path, undefined, env);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({
      data: { organizationId: "ai-engineer", eventId, speakers: [] },
    });

    const created = await app.request(
      path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "Priya Raman",
          email: "PRIYA@example.test",
          jobTitle: "Principal Engineer",
          company: "Latticework Systems",
          biography: "Builds reliable developer platforms.",
          socialLinks: { linkedin: "https://linkedin.com/in/priya" },
          status: "accepted",
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const createdPayload = (await created.json()) as {
      data: {
        organizationId: string;
        eventId: string;
        speakers: readonly Record<string, unknown>[];
      };
    };
    expect(createdPayload.data).toMatchObject({
      organizationId: "ai-engineer",
      eventId,
    });
    expect(createdPayload.data.speakers).toHaveLength(1);
    expect(createdPayload.data.speakers[0]).toMatchObject({
      participantId: "participant-priya",
      email: "priya@example.test",
      jobTitle: "Principal Engineer",
      company: "Latticework Systems",
      status: "accepted",
      sessions: [
        {
          submissionId: canonicalSubmissionId,
          title: "Priya session",
          status: "accepted",
        },
      ],
    });
    expect(createdPayload.data.speakers[0]).not.toHaveProperty("objectKey");
    expect(transport.requests.some((request) => request.table === "Session Roster")).toBe(true);
    expect(transport.requests.some((request) => request.table === "Speaker Roster")).toBe(false);
    expect(state.grants).toEqual([
      {
        organization_id: "ai-engineer",
        speaker_profile_id: "speaker-profile:event-priya:participant-priya",
        user_id: "account-speaker",
      },
    ]);

    const reloaded = await app.request(path, undefined, env);
    expect(reloaded.status).toBe(200);
    const reloadedPayload = (await reloaded.json()) as {
      data: { speakers: readonly Record<string, unknown>[] };
    };
    expect(reloadedPayload.data.speakers).toHaveLength(1);
    expect(reloadedPayload.data.speakers[0]?.sessions).toEqual([
      {
        submissionId: canonicalSubmissionId,
        title: "Priya session",
        status: "accepted",
      },
    ]);
    expect(reloadedPayload.data.speakers[0]).toMatchObject({
      participantId: "participant-priya",
      status: "accepted",
      sessions: [{ submissionId: canonicalSubmissionId }],
    });
    expect(reloadedPayload.data.speakers[0]).not.toHaveProperty("objectKey");

    const wrongTenant = await app.request(
      `/api/admin/organizations/other-tenant/events/${eventId}/speakers`,
      undefined,
      env,
    );
    const wrongEvent = await app.request(
      "/api/admin/organizations/ai-engineer/events/other-event/speakers",
      undefined,
      env,
    );
    expect(wrongTenant.status).toBe(404);
    expect(wrongEvent.status).toBe(404);
  });
});
describe("production communication repository composition", () => {
  it("uses event-scoped template and recipient reads and preserves the authorized snapshot", async () => {
    const transport = new FormulaRecordingTransport();
    const tenantId = "communications-tenant";
    const eventId = "communications-event";
    const otherEventId = "other-communications-event";
    const template = {
      id: "group-template",
      tenantId,
      eventId,
      name: "Event update",
      purpose: "organizer_group_email",
      version: 1,
      status: "approved",
      sender: "speakers@sessionboard.namuh.co",
      subject: "Hello {{displayName}}",
      html: "<p>{{displayName}}</p><div>{{message}}</div>",
      text: "Hello {{displayName}}: {{message}}",
      variables: ["displayName", "message"],
      createdBy: "organizer-communications",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      approvedBy: "organizer-communications",
      approvedAt: "2026-08-10T00:00:00.000Z",
      entityType: "communication_template",
    };
    const otherTemplate = { ...template, id: "other-template", eventId: otherEventId };
    const recipient: CommunicationRecipient = {
      id: "participant-communications",
      participantId: "participant-communications",
      tenantId,
      eventId,
      email: "participant@example.test",
      displayName: "Participant",
      audiences: ["all_participants"],
      data: { firstName: "Participant" },
    };
    transport.seed({
      baseId: "base-test",
      table: "Email Templates",
      fields: {
        "Application ID": "template:group-template:v1",
        "Organization ID": tenantId,
        "Event ID": eventId,
        Purpose: "organizer_group_email",
        Status: "approved",
        Sender: "speakers@sessionboard.namuh.co",
        "Settings JSON": JSON.stringify(template),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Email Templates",
      fields: {
        "Application ID": "template:other-template:v1",
        "Organization ID": tenantId,
        "Event ID": otherEventId,
        Purpose: "organizer_group_email",
        Status: "approved",
        Sender: "speakers@sessionboard.namuh.co",
        "Settings JSON": JSON.stringify(otherTemplate),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Participants",
      fields: {
        "Application ID": recipient.id,
        Event: eventId,
        "Metadata JSON": JSON.stringify({ ...recipient, entityType: "participant" }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Participants",
      fields: {
        "Application ID": "participant-other-event",
        Event: otherEventId,
        "Metadata JSON": JSON.stringify({
          ...recipient,
          id: "participant-other-event",
          eventId: otherEventId,
          email: "other-event@example.test",
          entityType: "participant",
        }),
      },
    });

    const repository = new AirtableCommunicationRepository({
      baseId: "base-test",
      transport,
    });
    const listed = await repository.listTemplates(tenantId, eventId, "organizer_group_email");
    expect(listed.map((item) => item.id)).toEqual(["group-template"]);
    const templateRequest = transport.requests.find(
      (request) => request.method === "GET" && request.table === "Email Templates",
    );
    expect(String(templateRequest?.query?.filterByFormula)).toBe(
      `AND({Organization ID}='${tenantId}',{Event ID}='${eventId}',{Purpose}='organizer_group_email')`,
    );

    transport.requests.length = 0;
    const service = new CommunicationService(repository, undefined, {
      clock: () => new Date("2026-08-10T00:00:00.000Z"),
    });
    const actor: CommunicationActor = {
      tenantId,
      userId: "organizer-communications",
      kind: "human",
      grants: [{ eventId, role: "organizer" }],
    };
    const preview = await service.previewGroupSend(actor, {
      eventId,
      purpose: "organizer_group_email",
      templateId: "group-template",
      audience: "all_participants",
      data: { message: "Scoped update" },
    });

    expect(preview.recipientCount).toBe(1);
    expect(preview.recipients).toEqual([recipient]);
    for (const [table, count] of [
      ["Participants", 2],
      ["Submissions", 2],
      ["Decisions", 1],
    ] as const) {
      const reads = transport.requests.filter(
        (request) => request.method === "GET" && request.table === table,
      );
      expect(reads).toHaveLength(count);
      expect(reads.every((request) => typeof request.query?.filterByFormula === "string")).toBe(
        true,
      );
    }
    expect(
      transport.requests.filter(
        (request) => request.method === "GET" && request.table === "Email Templates",
      ),
    ).toHaveLength(1);
    expect(
      transport.requests.filter(
        (request) => request.method === "GET" && request.table === "Email Send Snapshots",
      ),
    ).toHaveLength(1);
    expect(
      transport.requests.filter(
        (request) => request.method === "POST" && request.table === "Email Send Snapshots",
      ),
    ).toHaveLength(1);
  });
  it("persists scoped speaker email templates, previews, and send history across repositories", async () => {
    const transport = new FormulaRecordingTransport();
    const database = productionD1("speaker-email-unused");
    const organizationId = "speaker-email-tenant";
    const eventId = "speaker-email-event";
    const createdAt = "2026-08-12T20:00:00.000Z";
    const repository = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database,
    });
    const template = {
      id: "speaker-welcome",
      organizationId,
      eventId,
      name: "Speaker welcome",
      version: 1,
      status: "approved",
      sender: "speakers@sessionboard.namuh.co",
      subject: "Welcome {{first_name}}",
      html: "<p>Welcome {{first_name}}</p>",
      text: "Welcome {{first_name}}",
      variables: ["first_name"],
      createdBy: "organizer-email",
      createdAt,
      updatedAt: createdAt,
    } as const;
    const preview = {
      id: "speaker-email-preview",
      organizationId,
      eventId,
      templateId: template.id,
      templateVersion: template.version,
      recipientIds: ["participant-email"],
      recipients: [
        {
          participantId: "participant-email",
          displayName: "Priya Raman",
          firstName: "Priya",
          email: "priya@example.test",
          subject: "Welcome Priya",
          html: "<p>Welcome Priya</p>",
          text: "Welcome Priya",
        },
      ],
      subject: "Welcome Priya",
      html: "<p>Welcome Priya</p>",
      text: "Welcome Priya",
      createdAt,
      expiresAt: "2026-08-12T20:10:00.000Z",
    } as const;
    const send = {
      id: "speaker-email-send",
      organizationId,
      eventId,
      templateId: template.id,
      templateVersion: template.version,
      idempotencyKey: "speaker-email-send-key",
      status: "queued",
      recipientIds: ["participant-email"],
      deliveries: [
        {
          participantId: "participant-email",
          email: "priya@example.test",
          status: "queued",
          providerMessageId: null,
          reason: null,
        },
      ],
      history: [
        {
          occurredAt: createdAt,
          action: "send_created",
          participantId: null,
          details: {},
        },
      ],
      createdAt,
      updatedAt: createdAt,
    } as const;

    await repository.saveSpeakerEmailTemplate(template);
    await repository.saveSpeakerEmailPreview(preview);
    await repository.saveSpeakerEmailSend(send);
    await expect(repository.saveSpeakerEmailTemplate(template)).rejects.toMatchObject({
      code: "DUPLICATE_APPLICATION_ID",
      message: "This immutable speaker email template version already exists.",
    });
    await repository.saveSpeakerEmailTemplate({
      ...template,
      eventId: "other-speaker-email-event",
    });
    await repository.saveSpeakerEmailSend({
      ...send,
      id: "other-speaker-email-send",
      eventId: "other-speaker-email-event",
      idempotencyKey: "other-speaker-email-send-key",
    });

    const reloaded = new AirtableSpeakerRepository({
      baseId: "base-test",
      transport,
      database,
    });
    await expect(reloaded.listSpeakerEmailTemplates(organizationId, eventId)).resolves.toEqual([
      template,
    ]);
    await expect(
      reloaded.getSpeakerEmailPreview(organizationId, eventId, preview.id),
    ).resolves.toEqual(preview);
    await expect(reloaded.listSpeakerEmailSends(organizationId, eventId)).resolves.toEqual([send]);
    await expect(reloaded.getSpeakerEmailSend(organizationId, eventId, send.id)).resolves.toEqual(
      send,
    );
    const templateListRequest = transport.requests.find(
      (request) =>
        request.method === "GET" &&
        request.table === "Email Templates" &&
        String(request.query?.filterByFormula).startsWith("AND({Organization ID}"),
    );
    expect(templateListRequest?.query?.filterByFormula).toBe(
      `AND({Organization ID}='${organizationId}',{Event ID}='${eventId}')`,
    );
    const sendListRequest = transport.requests.find(
      (request) =>
        request.method === "GET" &&
        request.table === "Email Send Snapshots" &&
        String(request.query?.filterByFormula).startsWith("AND({Organization ID}"),
    );
    expect(sendListRequest?.query?.filterByFormula).toBe(
      `AND({Organization ID}='${organizationId}',{Event ID}='${eventId}')`,
    );
    const deliveredSend = {
      ...send,
      status: "sent",
      deliveries: send.deliveries.map((delivery) => ({
        ...delivery,
        status: "sent" as const,
        providerMessageId: "message-speaker-email",
      })),
      history: [
        ...send.history,
        {
          occurredAt: "2026-08-12T20:01:00.000Z",
          action: "delivery_sent" as const,
          participantId: "participant-email",
          details: { providerMessageId: "message-speaker-email" },
        },
      ],
      updatedAt: "2026-08-12T20:01:00.000Z",
    } as const;
    await reloaded.saveSpeakerEmailSend(deliveredSend);
    await expect(reloaded.getSpeakerEmailSend(organizationId, eventId, send.id)).resolves.toEqual(
      deliveredSend,
    );
    const terminalWrite = [...transport.requests]
      .reverse()
      .find((request) => request.method === "PATCH" && request.table === "Email Send Snapshots");
    expect(
      (terminalWrite?.body as { fields?: { Status?: string; "Data JSON"?: string } } | undefined)
        ?.fields,
    ).toMatchObject({
      Status: "delivered",
      "Data JSON": expect.stringContaining('"status":"sent"'),
    });
    await expect(
      reloaded.getSpeakerEmailPreview("other-tenant", eventId, preview.id),
    ).resolves.toBeNull();
    await expect(
      reloaded.getSpeakerEmailSend(organizationId, "other-event", send.id),
    ).resolves.toBeNull();
  });
});
