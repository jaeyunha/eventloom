import { apiErrorSchema } from "@open-sessionboard/contracts";
import { type ApiDependencies, createApp } from "../app";
import {
  consumeOutboxQueue,
  type OutboxConsumerBindings,
  type OutboxDeliveryStatusRecorder,
} from "../infrastructure/cloudflare/outbox-consumer";
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
  if (bindings.APP_ENV === "local") {
    const aiSelection = bindings.AI_PROVIDER?.trim().toLowerCase() || "auto";
    const useOpenAi =
      (aiSelection === "openai" || aiSelection === "auto") &&
      typeof bindings.OPENAI_API_KEY === "string" &&
      bindings.OPENAI_API_KEY.trim().length > 0;
    if (aiSelection !== "auto" && aiSelection !== "openai" && aiSelection !== "disabled") {
      throw new RuntimeConfigurationError([
        "Local AI_PROVIDER must be auto, openai, or disabled; Workers AI requires deployed bindings.",
      ]);
    }
    const aiProviders = useOpenAi
      ? createLocalAiProviders(bindings.OPENAI_API_KEY ?? "", bindings)
      : undefined;
    return createLocalDependencies(aiProviders);
  }
  if (bindings.APP_ENV !== "staging" && bindings.APP_ENV !== "production") {
    throw new RuntimeConfigurationError(["APP_ENV must be local, staging, or production"]);
  }
  const inspection = inspectProductionRuntime(bindings);
  if (!inspection.success) throw new RuntimeConfigurationError(inspection.issues);
  return createCloudflareDependencies(bindings);
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

async function runScheduledReminders(
  dependencies: ApiDependencies,
  bindings: RuntimeBindings,
  scheduledAt: Date,
): Promise<void> {
  const speaker = dependencies.speaker?.service;
  const events = dependencies.events?.service;
  if (speaker === undefined || events === undefined) return;
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
      await speaker.queueScheduledReminders({
        organizationId,
        eventId,
        organizerAccountIds: organizers.map((organizer) => organizer.accountId),
        now: scheduledAt,
      });
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
            status: input.status,
            ...(input.providerMessageId === undefined
              ? {}
              : { providerMessageId: input.providerMessageId }),
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            occurredAt: input.occurredAt,
          },
        );
        return;
      }

      const service = dependencies.crm?.service;
      if (service === undefined) {
        throw new Error("The CRM outreach delivery status service is unavailable.");
      }
      await service.recordOutreachDeliveryStatus({
        organizationId: input.tenantId,
        outreachId: input.target.outreachId,
        idempotencyKey: input.target.idempotencyKey,
        status: input.status,
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
  let localRuntime: RuntimeApplication | undefined;
  const runtimeFor = (bindings: RuntimeBindings): RuntimeApplication => {
    if (bindings.APP_ENV === "local") {
      if (localRuntime === undefined) localRuntime = createRuntimeApplication(bindings);
      return localRuntime;
    }
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
      const inspection = inspectProductionRuntime(bindings);
      if (!inspection.success) {
        for (const message of batch.messages) {
          message.retry({ delaySeconds: 60 });
        }
        return;
      }
      const runtime = runtimeFor(bindings);
      await consumeOutboxQueue(
        batch,
        bindings as OutboxConsumerBindings,
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
