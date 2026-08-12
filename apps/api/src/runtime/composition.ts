import { apiErrorSchema } from "@open-sessionboard/contracts";
import { type ApiDependencies, createApp } from "../app";
import type {
  ReminderCandidate,
  ReminderCandidateSource,
  ReminderCandidateSourceResult,
} from "../features/communications/types";
import type { EvaluationActor } from "../features/evaluations/types";
import {
  consumeOutboxQueue,
  type OutboxConsumerBindings,
  type OutboxDeliveryStatusRecorder,
} from "../infrastructure/cloudflare/outbox-consumer";
import {
  CloudflareReminderOutbox,
  D1ReminderRepository,
} from "../infrastructure/cloudflare/reminder-repository";
import {
  type AdvisoryAiReasoningEffort,
  createCloudflareAiProviders,
  createOpenAiResponsesBinding,
  DEFAULT_OPENAI_RESPONSES_MODEL,
} from "../integrations/ai";
import {
  createCloudflareDependencies,
  inspectProductionRuntime,
  type RuntimeBindings,
  runtimeBindingsForEnvironment,
} from "./cloudflare";
import { createLocalDependencies } from "./local";

export class RuntimeConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The API runtime is not configured.");
    this.name = "RuntimeConfigurationError";
  }
}

function requestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(incoming)
    ? incoming
    : crypto.randomUUID();
}

function configurationErrorResponse(request: Request, bindings: RuntimeBindings): Response {
  const traceId = requestId(request);
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "content-type": "application/json; charset=UTF-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": traceId,
  });
  const origin = request.headers.get("origin");
  if (origin !== null && origin === bindings.WEB_ORIGIN) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.append("vary", "Origin");
  }
  return Response.json(
    apiErrorSchema.parse({
      error: {
        code: "CONFIGURATION_ERROR",
        message: "The API runtime is not configured.",
        traceId,
      },
    }),
    { status: 503, headers },
  );
}

function localReasoningEffort(
  value: string | undefined,
  fallback: AdvisoryAiReasoningEffort,
): AdvisoryAiReasoningEffort {
  const normalized = value?.trim().toLowerCase() || fallback;
  if (!["none", "low", "medium", "high", "xhigh", "max"].includes(normalized)) {
    throw new RuntimeConfigurationError([
      "OpenAI reasoning effort must be none, low, medium, high, xhigh, or max.",
    ]);
  }
  return normalized as AdvisoryAiReasoningEffort;
}

function createLocalAiProviders(apiKey: string, bindings: RuntimeBindings) {
  const binding = createOpenAiResponsesBinding({ apiKey });
  const model = bindings.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_RESPONSES_MODEL;
  return createCloudflareAiProviders(binding, {
    model,
    agendaModel: bindings.OPENAI_AGENDA_MODEL?.trim() || model,
    evaluationModel: bindings.OPENAI_EVALUATION_MODEL?.trim() || model,
    remixModel: bindings.OPENAI_REMIX_MODEL?.trim() || model,
    agendaReasoningEffort: localReasoningEffort(bindings.OPENAI_AGENDA_REASONING_EFFORT, "medium"),
    evaluationReasoningEffort: localReasoningEffort(
      bindings.OPENAI_EVALUATION_REASONING_EFFORT,
      "medium",
    ),
    remixReasoningEffort: localReasoningEffort(bindings.OPENAI_REMIX_REASONING_EFFORT, "low"),
    providerName: "openai-responses",
    promptVersion: "openai-responses-v1",
  });
}

export function createRuntimeDependencies(bindings: RuntimeBindings): ApiDependencies {
  const profile = bindings.RUNTIME_PROFILE?.trim().toLowerCase() || "integrated";
  if (profile !== "integrated" && profile !== "fixture") {
    throw new RuntimeConfigurationError(["RUNTIME_PROFILE must be integrated or fixture"]);
  }
  if (profile === "fixture") {
    if (bindings.APP_ENV !== "local") {
      throw new RuntimeConfigurationError([
        "RUNTIME_PROFILE=fixture is allowed only with APP_ENV=local",
      ]);
    }
    const aiSelection = bindings.AI_PROVIDER?.trim().toLowerCase() || "auto";
    const useOpenAi =
      (aiSelection === "openai" || aiSelection === "auto") &&
      typeof bindings.OPENAI_API_KEY === "string" &&
      bindings.OPENAI_API_KEY.trim().length > 0;
    if (aiSelection !== "auto" && aiSelection !== "openai" && aiSelection !== "disabled") {
      throw new RuntimeConfigurationError([
        "Fixture AI_PROVIDER must be auto, openai, or disabled.",
      ]);
    }
    const aiProviders = useOpenAi
      ? createLocalAiProviders(bindings.OPENAI_API_KEY ?? "", bindings)
      : undefined;
    return createLocalDependencies(aiProviders);
  }
  if (
    bindings.APP_ENV !== "local" &&
    bindings.APP_ENV !== "staging" &&
    bindings.APP_ENV !== "production"
  ) {
    throw new RuntimeConfigurationError(["APP_ENV must be local, staging, or production"]);
  }
  const inspection = inspectProductionRuntime(bindings);
  if (!inspection.success) throw new RuntimeConfigurationError(inspection.issues);
  const dependencies = createCloudflareDependencies(bindings);
  const communicationService = dependencies.communications?.service;
  if (
    communicationService !== undefined &&
    bindings.DB !== undefined &&
    bindings.OUTBOX_QUEUE !== undefined
  ) {
    communicationService.configureReminders({
      repository: new D1ReminderRepository(bindings.DB),
      source: new RuntimeReminderCandidateSource(dependencies, bindings.DB),
      outbox: new CloudflareReminderOutbox(bindings.DB, bindings.OUTBOX_QUEUE),
    });
  }
  return dependencies;
}
type SchedulerMembershipRow = {
  readonly organization_id?: unknown;
  readonly user_id?: unknown;
  readonly role?: unknown;
};

type SchedulerOrganizer = {
  readonly accountId: string;
  readonly organizationId: string;
  readonly role: "owner" | "admin";
};

async function listSchedulerOrganizers(
  bindings: RuntimeBindings,
): Promise<ReadonlyMap<string, readonly SchedulerOrganizer[]>> {
  if (bindings.DB === undefined) return new Map();
  const rows = await bindings.DB.prepare(
    `SELECT organization_id, user_id, role
         FROM organization_memberships
        WHERE role IN ('owner', 'admin')
        ORDER BY organization_id, role, user_id`,
  ).all<SchedulerMembershipRow>();
  const byOrganization = new Map<string, SchedulerOrganizer[]>();
  for (const row of rows.results) {
    const organizationId =
      typeof row.organization_id === "string" ? row.organization_id.trim() : "";
    const accountId = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const role = row.role === "owner" || row.role === "admin" ? row.role : null;
    if (organizationId.length === 0 || accountId.length === 0 || role === null) continue;
    const organizers = byOrganization.get(organizationId) ?? [];
    if (!organizers.some((organizer) => organizer.accountId === accountId)) {
      organizers.push({ accountId, organizationId, role });
      byOrganization.set(organizationId, organizers);
    }
  }
  return byOrganization;
}

function escapeReminderHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function taskCadence(
  dueAt: string | null,
  offsets: readonly number[],
  scheduledAt: Date,
): { cadenceWindow: string; nextEligibleAt: string | null } {
  const dueTime = dueAt === null ? Number.NaN : Date.parse(dueAt);
  if (!Number.isFinite(dueTime)) {
    return { cadenceWindow: "unscheduled", nextEligibleAt: null };
  }
  const thresholds = [
    ...new Set([
      dueTime,
      ...offsets
        .filter((offset) => Number.isSafeInteger(offset) && offset >= 0)
        .map((offset) => dueTime - offset * 60_000),
    ]),
  ].sort((left, right) => left - right);
  const active = thresholds.filter((threshold) => threshold <= scheduledAt.getTime()).at(-1);
  const next = thresholds.find((threshold) => threshold > scheduledAt.getTime());
  return {
    cadenceWindow: new Date(active ?? thresholds[0] ?? dueTime).toISOString(),
    nextEligibleAt: next === undefined ? null : new Date(next).toISOString(),
  };
}

async function reminderAudienceRevision(
  candidates: readonly ReminderCandidate[],
): Promise<string> {
  const serialized = JSON.stringify(
    candidates.map((candidate) => ({
      id: candidate.id,
      recipientApplicationId: candidate.recipientApplicationId,
      normalizedEmail: candidate.normalizedEmail,
      subject: candidate.subject,
      eligibilityReason: candidate.eligibilityReason,
      cadenceWindow: candidate.cadenceWindow,
      nextEligibleAt: candidate.nextEligibleAt,
      eligible: candidate.eligible,
    })),
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

class RuntimeReminderCandidateSource implements ReminderCandidateSource {
  constructor(
    private readonly dependencies: ApiDependencies,
    private readonly database: D1Database,
  ) {}

  async listCandidates(input: {
    organizationId: string;
    eventId: string;
    triggerType: "automatic" | "manual";
    scheduledAt: string;
  }): Promise<ReminderCandidateSourceResult> {
    const scheduledAt = new Date(input.scheduledAt);
    const [taskCandidates, reviewCandidates] = await Promise.all([
      this.taskCandidates(input.organizationId, input.eventId, scheduledAt),
      this.reviewCandidates(input.organizationId, input.eventId, scheduledAt),
    ]);
    const candidates = [...taskCandidates, ...reviewCandidates].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const hasTasks = taskCandidates.length > 0;
    const hasReviews = reviewCandidates.length > 0;
    return {
      audienceType: hasTasks && hasReviews ? "combined" : hasReviews ? "review" : "task",
      audienceRevision: await reminderAudienceRevision(candidates),
      candidates,
    };
  }

  private async organizerAccountId(organizationId: string): Promise<string | null> {
    const row = await this.database
      .prepare(
        `SELECT user_id
           FROM organization_memberships
          WHERE organization_id = ? AND role IN ('owner', 'admin')
          ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, user_id
          LIMIT 1`,
      )
      .bind(organizationId)
      .first<{ user_id?: unknown }>();
    return row !== null && typeof row.user_id === "string" && row.user_id.trim().length > 0
      ? row.user_id.trim()
      : null;
  }

  private async verifiedEmailByAddress(candidate: string | undefined): Promise<string | null> {
    const normalized = candidate?.trim().toLowerCase() ?? "";
    if (normalized.length === 0) return null;
    const row = await this.database
      .prepare(
        `SELECT email
           FROM auth_users
          WHERE LOWER(email) = ? AND email_verified = 1
          LIMIT 1`,
      )
      .bind(normalized)
      .first<{ email?: unknown }>();
    return row !== null && typeof row.email === "string" && row.email.trim().length > 0
      ? row.email.trim().toLowerCase()
      : null;
  }

  private async verifiedReviewer(
    reviewerId: string,
  ): Promise<{ email: string | null; displayName: string }> {
    const row = await this.database
      .prepare(
        `SELECT email, name
           FROM auth_users
          WHERE id = ? AND email_verified = 1
          LIMIT 1`,
      )
      .bind(reviewerId)
      .first<{ email?: unknown; name?: unknown }>();
    return {
      email:
        row !== null && typeof row.email === "string" && row.email.trim().length > 0
          ? row.email.trim().toLowerCase()
          : null,
      displayName:
        row !== null && typeof row.name === "string" && row.name.trim().length > 0
          ? row.name.trim()
          : reviewerId,
    };
  }

  private async taskCandidates(
    organizationId: string,
    eventId: string,
    scheduledAt: Date,
  ): Promise<readonly ReminderCandidate[]> {
    const speaker = this.dependencies.speaker?.service;
    const accountId = await this.organizerAccountId(organizationId);
    if (speaker === undefined || accountId === null) return [];
    const [eligibility, preview] = await Promise.all([
      speaker.previewReminderEligibility({ eventId, accountId, now: scheduledAt }),
      speaker.previewOutstandingReminders({ eventId, accountId }),
    ]);
    if (
      eligibility.organizationId !== organizationId ||
      preview.organizationId !== organizationId
    ) {
      return [];
    }
    const recipientById = new Map(
      preview.recipients.map((recipient) => [recipient.participantId, recipient]),
    );
    const candidates: ReminderCandidate[] = [];
    for (const item of eligibility.items) {
      const recipient = recipientById.get(item.participantId);
      if (recipient === undefined) continue;
      const verifiedEmail = await this.verifiedEmailByAddress(recipient.email);
      const cadence = taskCadence(
        item.dueAt,
        item.reminderOffsetsMinutes,
        scheduledAt,
      );
      const summary =
        item.dueAt === null ? item.title : `${item.title} (due ${item.dueAt})`;
      candidates.push({
        id: `task:${item.taskId}:${item.participantId}`,
        organizationId,
        eventId,
        recipientApplicationId: item.participantId,
        normalizedEmail: verifiedEmail,
        displayName: recipient.displayName,
        subject: { type: "task", taskId: item.taskId },
        eligibilityReason: item.reason,
        cadenceWindow: cadence.cadenceWindow,
        nextEligibleAt: cadence.nextEligibleAt,
        eligible: item.eligible,
        renderedMessage: {
          from: "speakers@sessionboard.namuh.co",
          subject: `Reminder: ${summary}`,
          html: `<p>Please complete ${escapeReminderHtml(summary)}.</p>`,
          text: `Please complete ${summary}.`,
        },
      });
    }
    return candidates;
  }

  private async reviewCandidates(
    organizationId: string,
    eventId: string,
    scheduledAt: Date,
  ): Promise<readonly ReminderCandidate[]> {
    const evaluations = this.dependencies.evaluations?.service;
    if (evaluations === undefined) return [];
    const actor: EvaluationActor = {
      tenantId: organizationId,
      userId: "reminder-candidate-source",
      kind: "human",
      grants: [{ eventId, role: "organizer" }],
    };
    const plans = await evaluations.listPlans(actor, eventId);
    const candidates: ReminderCandidate[] = [];
    const cadenceWindow = scheduledAt.toISOString().slice(0, 10);
    const nextEligibleAt = new Date(
      Date.UTC(
        scheduledAt.getUTCFullYear(),
        scheduledAt.getUTCMonth(),
        scheduledAt.getUTCDate() + 1,
      ),
    ).toISOString();
    for (const plan of plans.filter((candidate) => candidate.status === "open")) {
      const assignments = await evaluations.listOrganizerAssignments(actor, plan.id);
      for (const assignment of assignments) {
        if (assignment.status !== "assigned" && assignment.status !== "in_progress") continue;
        const reviewer = await this.verifiedReviewer(assignment.reviewerId);
        const round = plan.rounds.find((candidate) => candidate.id === assignment.roundId);
        const roundLabel = round?.name ?? assignment.roundId;
        candidates.push({
          id: `review:${assignment.id}`,
          organizationId,
          eventId,
          recipientApplicationId: assignment.reviewerId,
          normalizedEmail: reviewer.email,
          displayName: reviewer.displayName,
          subject: { type: "review", reviewAssignmentId: assignment.id },
          eligibilityReason: "outstanding_review",
          cadenceWindow,
          nextEligibleAt,
          eligible: true,
          renderedMessage: {
            from: "speakers@sessionboard.namuh.co",
            subject: `Review reminder: ${plan.name}`,
            html: `<p>You have an outstanding review for <strong>${escapeReminderHtml(plan.name)}</strong> (${escapeReminderHtml(roundLabel)}).</p>`,
            text: `You have an outstanding review for ${plan.name} (${roundLabel}).`,
          },
        });
      }
    }
    return candidates;
  }
}

export async function runScheduledReminders(
  dependencies: ApiDependencies,
  bindings: RuntimeBindings,
  scheduledAt: Date,
): Promise<void> {
  const communications = dependencies.communications?.service;
  const events = dependencies.events?.service;
  if (communications === undefined || events === undefined) return;
  const organizersByOrganization = await listSchedulerOrganizers(bindings);
  for (const [organizationId, organizers] of organizersByOrganization) {
    const firstOrganizer = organizers[0];
    if (firstOrganizer === undefined) continue;
    const eventRecords = await events.listEvents(
      {
        organizationId,
        userId: firstOrganizer.accountId,
        role: firstOrganizer.role,
        kind: "human",
      },
      { organizationId, includeArchived: false },
    );
    const eventIds = eventRecords
      .filter((event) => event.organizationId === organizationId)
      .map((event) => event.id)
      .sort((left, right) => left.localeCompare(right));
    for (const eventId of eventIds) {
      await communications.runAutomaticReminders(
        {
          tenantId: organizationId,
          userId: "scheduled-reminder-dispatcher",
          kind: "automation",
          grants: [{ eventId, role: "delivery" }],
        },
        {
          organizationId,
          eventId,
          scheduledAt: scheduledAt.toISOString(),
        },
      );
    }
  }
}

type RuntimeApplication = {
  readonly app: ReturnType<typeof createApp>;
  readonly dependencies: ApiDependencies;
};

function createRuntimeApplication(bindings: RuntimeBindings): RuntimeApplication {
  const dependencies = createRuntimeDependencies(bindings);
  return { app: createApp(dependencies), dependencies };
}

function createOutboxDeliveryStatusRecorder(
  dependencies: ApiDependencies,
): OutboxDeliveryStatusRecorder {
  return {
    async recordCommunicationStatus(input) {
      if (input.target.kind === "communication") {
        const service = dependencies.communications?.service;
        if (service === undefined) {
          throw new Error("The communication delivery status service is unavailable.");
        }
        const status =
          input.status === "provider_accepted" ? "delivered" : input.status;
        await service.recordDeliveryStatus(
          {
            tenantId: input.tenantId,
            userId: "outbox-consumer",
            kind: "automation",
            grants: [{ eventId: input.target.eventId, role: "delivery" }],
          },
          {
            eventId: input.target.eventId,
            sendId: input.target.sendId,
            recipientId: input.target.recipientId,
            status,
            ...(input.providerMessageId === undefined
              ? {}
              : { providerMessageId: input.providerMessageId }),
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            occurredAt: input.occurredAt,
          },
        );
        return;
      }
      if (input.target.kind === "reminder") {
        const service = dependencies.communications?.service;
        if (service === undefined) {
          throw new Error("The reminder delivery status service is unavailable.");
        }
        if (input.status === "complained") {
          throw new Error("The reminder delivery status is unsupported.");
        }
        await service.recordReminderDispatchStatus(
          {
            tenantId: input.tenantId,
            userId: "outbox-consumer",
            kind: "automation",
            grants: [{ eventId: input.target.eventId, role: "delivery" }],
          },
          {
            organizationId: input.tenantId,
            eventId: input.target.eventId,
            dispatchId: input.target.dispatchId,
            status: input.status,
            ...(input.providerMessageId === undefined
              ? {}
              : { providerMessageId: input.providerMessageId }),
            ...(input.reason === undefined
              ? {}
              : { failureMetadata: { reason: input.reason } }),
          },
        );
        return;
      }

      const service = dependencies.crm?.service;
      if (service === undefined) {
        throw new Error("The CRM outreach delivery status service is unavailable.");
      }
      const status =
        input.status === "provider_accepted" ? "delivered" : input.status;
      await service.recordOutreachDeliveryStatus({
        organizationId: input.tenantId,
        outreachId: input.target.outreachId,
        idempotencyKey: input.target.idempotencyKey,
        status,
        ...(input.providerMessageId === undefined
          ? {}
          : { providerMessageId: input.providerMessageId }),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        occurredAt: input.occurredAt,
      });
    },
  };
}

export function createRuntimeApp(bindings: RuntimeBindings) {
  return createApp(createRuntimeDependencies(bindings));
}

export function createRuntimeWorker(): ExportedHandler<RuntimeBindings> {
  const runtimes = new WeakMap<object, RuntimeApplication>();
  const runtimeFor = (bindings: RuntimeBindings): RuntimeApplication => {
    const cached = runtimes.get(bindings);
    if (cached !== undefined) return cached;
    const runtime = createRuntimeApplication(bindings);
    runtimes.set(bindings, runtime);
    return runtime;
  };

  return {
    async fetch(request, bindings, executionContext) {
      let runtime: RuntimeApplication;
      try {
        runtime = runtimeFor(bindings);
      } catch (error) {
        if (error instanceof RuntimeConfigurationError) {
          return configurationErrorResponse(request, bindings);
        }
        throw error;
      }
      return runtime.app.fetch(request, bindings, executionContext);
    },
    async queue(batch, bindings, executionContext) {
      if (bindings.APP_ENV === "local" && bindings.RUNTIME_PROFILE?.trim() === "fixture") {
        for (const message of batch.messages) {
          message.retry({ delaySeconds: 60 });
        }
        return;
      }
      const inspection = inspectProductionRuntime(bindings);
      if (!inspection.success) {
        for (const message of batch.messages) {
          message.retry({ delaySeconds: 60 });
        }
        return;
      }
      const runtime = runtimeFor(bindings);
      const effectiveBindings = runtimeBindingsForEnvironment(bindings);
      await consumeOutboxQueue(
        batch,
        effectiveBindings as OutboxConsumerBindings,
        executionContext,
        {
          statusRecorder: createOutboxDeliveryStatusRecorder(runtime.dependencies),
        },
      );
    },
    async scheduled(controller, bindings) {
      let runtime: RuntimeApplication;
      try {
        runtime = runtimeFor(bindings);
      } catch (error) {
        if (error instanceof RuntimeConfigurationError) return;
        throw error;
      }
      const scheduledTime = Number(controller.scheduledTime);
      await runScheduledReminders(
        runtime.dependencies,
        bindings,
        Number.isFinite(scheduledTime) ? new Date(scheduledTime) : new Date(),
      );
    },
  };
}
