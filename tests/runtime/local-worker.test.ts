import { apiErrorSchema, healthResponseSchema } from "../../packages/contracts/src";
import { describe, expect, it } from "vitest";
import worker from "../../apps/api/src/index";

type RuntimeBindings = {
  APP_ENV: "local" | "staging" | "production";
  WEB_ORIGIN: string;
  DB: unknown;
  AGENDA_COORDINATOR: unknown;
  PRIVATE_FILES: unknown;
  OUTBOX_QUEUE: unknown;
};

type RuntimeWorker = {
  fetch(request: Request, bindings: RuntimeBindings, executionContext: unknown): Response | Promise<Response>;
};

const traceId = "a326508b-2ef9-4a90-b57f-24af14b6092f";
const organizationId = "local-organization";
const eventId = "demo-event";
const formId = "main-cfp";
const webOrigin = "http://localhost:3015";
const organizerHeaders = {
  cookie: "better-auth.session_token=local-session",
  "x-request-id": traceId,
};
const speakerHeaders = organizerHeaders;

function createBindingFakes(): Omit<RuntimeBindings, "APP_ENV" | "WEB_ORIGIN"> {
  const statement = {
    bind() {
      return this;
    },
    first: async () => null,
    all: async () => ({ results: [], success: true, meta: {} }),
    raw: async () => [],
    run: async () => ({ results: [], success: true, meta: {} }),
  };

  return {
    DB: {
      prepare: () => statement,
      batch: async () => [],
    },
    AGENDA_COORDINATOR: {
      idFromName: (name: string) => ({ name }),
      get: () => ({ fetch: async () => new Response(null, { status: 503 }) }),
    },
    PRIVATE_FILES: {
      get: async () => null,
      put: async () => ({ key: "unused" }),
    },
    OUTBOX_QUEUE: {
      send: async () => undefined,
    },
  };
}

const localBindings: RuntimeBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: webOrigin,
  ...createBindingFakes(),
};
const productionBindings: RuntimeBindings = {
  APP_ENV: "production",
  WEB_ORIGIN: "https://app.example.test",
  ...createBindingFakes(),
};
const executionContext = {
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
};
const runtimeWorker = worker as unknown as RuntimeWorker;

function runtimeRequest(
  path: string,
  init: RequestInit = {},
  bindings: RuntimeBindings = localBindings,
): Promise<Response> {
  const request = new Request(new URL(path, "https://worker.example.test"), init);
  return Promise.resolve(runtimeWorker.fetch(request, bindings, executionContext));
}

async function errorResponse(response: Response, status: number, code: string) {
  const body = apiErrorSchema.parse(await response.json());
  expect(response.status).toBe(status);
  expect(body.error.code).toBe(code);
  expect(response.headers.get("x-request-id")).toBe(body.error.traceId);
  return body;
}

async function jsonData<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { data: T };
  return body.data;
}

function jsonRequest(method: string, body: unknown, headers: HeadersInit = {}): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

describe.sequential("composed local Worker", () => {
  it("serves health, CORS, and contract-normalized errors through the Worker entry point", async () => {
    const health = await runtimeRequest("/api/health", {
      headers: { "x-request-id": traceId, origin: webOrigin },
    });
    const healthBody = healthResponseSchema.parse(await health.json());

    expect(health.status).toBe(200);
    expect(healthBody).toMatchObject({ status: "ok", environment: "local", traceId });
    expect(health.headers.get("access-control-allow-origin")).toBe(webOrigin);
    expect(health.headers.get("access-control-allow-credentials")).toBe("true");

    const preflight = await runtimeRequest("/api/health", {
      method: "OPTIONS",
      headers: {
        origin: webOrigin,
        "access-control-request-method": "GET",
        "access-control-request-headers": "X-Request-ID",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(webOrigin);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("X-Request-ID");

    const rejectedOrigin = await runtimeRequest("/api/health", {
      headers: { origin: "https://attacker.example" },
    });
    expect(rejectedOrigin.headers.has("access-control-allow-origin")).toBe(false);

    const missing = await runtimeRequest("/api/runtime/not-a-route", {
      headers: { "x-request-id": traceId },
    });
    const error = await errorResponse(missing, 404, "NOT_FOUND");
    expect(error.error.message).not.toContain("not-a-route");
  });

  it("enforces auth boundaries while exposing a useful seeded speaker portal", async () => {

    const unauthenticatedAgenda = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}/agenda/draft`,
      { headers: { "x-request-id": traceId } },
    );
    await errorResponse(unauthenticatedAgenda, 401, "AUTHENTICATION_REQUIRED");

    const unauthenticatedPublicApi = await runtimeRequest(
      `/api/v1/organizations/${organizationId}/events`,
      { headers: { "x-request-id": traceId } },
    );
    await errorResponse(unauthenticatedPublicApi, 401, "AUTHENTICATION_REQUIRED");

    const apiKeyHeaders = {
      authorization: "Bearer local-api-key",
      "x-request-id": traceId,
    };
    const crossTenant = await runtimeRequest("/api/v1/organizations/another-organization/events", {
      headers: apiKeyHeaders,
    });
    await errorResponse(crossTenant, 403, "TENANT_SCOPE_VIOLATION");

    const speakersResponse = await runtimeRequest(
      `/api/v1/organizations/${organizationId}/speakers`,
      { headers: apiKeyHeaders },
    );
    const speakers = await jsonData<Array<Record<string, unknown>>>(speakersResponse);
    const agendaProjectionResponse = await runtimeRequest(
      `/api/v1/organizations/${organizationId}/agenda`,
      { headers: apiKeyHeaders },
    );
    const agendaProjection = await jsonData<Array<Record<string, unknown>>>(
      agendaProjectionResponse,
    );

    expect(speakersResponse.status).toBe(200);
    expect(speakers.length).toBeGreaterThan(0);
    expect(JSON.stringify(speakers)).not.toContain("email");
    expect(agendaProjectionResponse.status).toBe(200);
    expect(agendaProjection.length).toBeGreaterThan(0);

    const portalResponse = await runtimeRequest(`/api/speaker/events/${eventId}/portal`, {
      headers: speakerHeaders,
    });
    const portal = await jsonData<{
      submissions: Array<{ id: string; eventId: string }>;
      profiles: Array<{ participantId: string; eventId: string }>;
      tasks: Array<{ id: string; eventId: string }>;
      outstandingTaskCount: number;
    }>(portalResponse);

    expect(portalResponse.status).toBe(200);
    expect(portalResponse.headers.get("cache-control")).toContain("no-store");
    expect(portal.submissions.length).toBeGreaterThan(0);
    expect(portal.profiles.length).toBeGreaterThan(0);
    expect(portal.tasks.length).toBeGreaterThan(0);
    expect(portal.outstandingTaskCount).toBeGreaterThan(0);
    expect(portal.submissions.every((submission) => submission.eventId === eventId)).toBe(true);
    expect(portal.profiles.every((profile) => profile.eventId === eventId)).toBe(true);
    expect(portal.tasks.every((task) => task.eventId === eventId)).toBe(true);
  });

  it("rejects agenda conflicts and stale writes, then publishes the immutable public projection", async () => {
    const adminBase = `/api/admin/organizations/${organizationId}/events/${eventId}/agenda`;
    const seededPublicResponse = await runtimeRequest(`/api/public/events/${eventId}/agenda`);
    const seededPublic = await jsonData<{ entries: unknown[] }>(seededPublicResponse);
    expect(seededPublicResponse.status).toBe(200);
    expect(seededPublic.entries.length).toBeGreaterThanOrEqual(2);
    const draftResponse = await runtimeRequest(`${adminBase}/draft`, {
      headers: organizerHeaders,
    });
    expect(draftResponse.status).toBe(200);
    const draft = await jsonData<{
      eventId: string;
      version: number;
      entries: Array<{
        id: string;
        sessionId: string;
        roomId: string;
        trackIds: string[];
        startsAtLocal: string;
        endsAtLocal: string;
      }>;
    }>(draftResponse);
    const inputEntries = draft.entries.map(
      ({ id, sessionId, roomId, trackIds, startsAtLocal, endsAtLocal }) => ({
        id,
        sessionId,
        roomId,
        trackIds,
        startsAtLocal,
        endsAtLocal,
      }),
    );
    const firstEntry = inputEntries[0];
    const secondEntry = inputEntries[1];

    expect(draft.eventId).toBe(eventId);
    expect(inputEntries.length).toBeGreaterThanOrEqual(2);
    if (!firstEntry || !secondEntry) throw new Error("The local agenda seed needs two entries.");

    const conflictingEntries = inputEntries.map((entry, index) =>
      index === 1
        ? {
            ...entry,
            roomId: firstEntry.roomId,
            startsAtLocal: firstEntry.startsAtLocal,
            endsAtLocal: firstEntry.endsAtLocal,
          }
        : entry,
    );
    const conflictResponse = await runtimeRequest(
      `${adminBase}/draft`,
      jsonRequest(
        "PUT",
        { expectedVersion: draft.version, entries: conflictingEntries },
        organizerHeaders,
      ),
    );
    const conflict = await errorResponse(conflictResponse, 409, "CONFLICT");
    expect(conflict.error.details?.map((detail) => detail.code)).toContain("agenda.room");

    const unchangedResponse = await runtimeRequest(`${adminBase}/draft`, {
      headers: organizerHeaders,
    });
    const unchanged = await jsonData<{ version: number; entries: unknown[] }>(unchangedResponse);
    expect(unchanged.version).toBe(draft.version);
    expect(unchanged.entries).toHaveLength(draft.entries.length);

    const updateResponse = await runtimeRequest(
      `${adminBase}/draft`,
      jsonRequest("PUT", { expectedVersion: draft.version, entries: inputEntries }, organizerHeaders),
    );
    const updated = await jsonData<{ version: number }>(updateResponse);
    expect(updateResponse.status).toBe(200);
    expect(updated.version).toBe(draft.version + 1);

    const staleResponse = await runtimeRequest(
      `${adminBase}/draft`,
      jsonRequest("PUT", { expectedVersion: draft.version, entries: [] }, organizerHeaders),
    );
    await errorResponse(staleResponse, 409, "CONFLICT");

    const publishResponse = await runtimeRequest(
      `${adminBase}/publish`,
      jsonRequest("POST", { expectedVersion: updated.version }, organizerHeaders),
    );
    const publication = await jsonData<{
      id: string;
      eventId: string;
      sourceDraftVersion: number;
      entries: unknown[];
    }>(publishResponse);
    expect(publishResponse.status).toBe(200);
    expect(publication).toMatchObject({ eventId, sourceDraftVersion: updated.version });

    const publicResponse = await runtimeRequest(`/api/public/events/${eventId}/agenda`);
    const publicAgenda = await jsonData<{
      revisionId: string;
      eventId: string;
      sourceDraftVersion: number;
      entries: unknown[];
    }>(publicResponse);
    const serialized = JSON.stringify(publicAgenda);

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("cache-control")).toContain("max-age=60");
    expect(publicAgenda).toMatchObject({
      revisionId: publication.id,
      eventId,
      sourceDraftVersion: updated.version,
    });
    expect(publicAgenda.entries).toHaveLength(draft.entries.length);
    expect(serialized).not.toContain("publishedBy");
    expect(serialized).not.toContain("warningOverrides");
    expect(serialized).not.toContain("updatedBy");
  });

  it("creates, reviews, and idempotently submits a CFP draft through the composed runtime", async () => {
    const cfpBase = `/api/cfp/organizations/${organizationId}/events/${eventId}`;
    const createPath = `${cfpBase}/forms/${formId}/drafts`;
    const createInit = {
      method: "POST",
      headers: {
        ...organizerHeaders,
        "idempotency-key": "runtime-cfp-create-1",
      },
    } satisfies RequestInit;

    const unauthenticated = await runtimeRequest(createPath, {
      method: "POST",
      headers: { "idempotency-key": "runtime-cfp-unauthenticated-1", "x-request-id": traceId },
    });
    await errorResponse(unauthenticated, 401, "AUTHENTICATION_REQUIRED");

    const missingIdempotencyKey = await runtimeRequest(createPath, {
      method: "POST",
      headers: organizerHeaders,
    });
    await errorResponse(missingIdempotencyKey, 400, "VALIDATION_FAILED");

    const createdResponse = await runtimeRequest(createPath, createInit);
    const created = await jsonData<{
      id: string;
      version: number;
      status: string;
      ownerAccountId: string;
    }>(createdResponse);
    expect(createdResponse.status).toBe(201);
    expect(created).toMatchObject({ status: "draft", ownerAccountId: "local-speaker" });

    const replayResponse = await runtimeRequest(createPath, createInit);
    const replay = await jsonData<{ id: string; version: number }>(replayResponse);
    expect(replayResponse.status).toBe(201);
    expect(replay).toEqual(expect.objectContaining({ id: created.id, version: created.version }));

    let version = created.version;
    const completedSteps = ["welcome", "account", "submission"] as const;
    for (const completedStep of completedSteps) {
      const savedResponse = await runtimeRequest(
        `${cfpBase}/submissions/${created.id}/draft`,
        jsonRequest(
          "PATCH",
          {
            expectedVersion: version,
            completedStep,
            ...(completedStep === "submission"
              ? {
                  answers: {
                    title: "Reliable local runtime verification",
                    format: "talk",
                    abstract: "A complete deterministic CFP submission exercised without credentials.",
                  },
                }
              : {}),
          },
          {
            ...organizerHeaders,
            "idempotency-key": `runtime-cfp-step-${completedStep}`,
          },
        ),
      );
      const saved = await jsonData<{ version: number }>(savedResponse);
      expect(savedResponse.status).toBe(200);
      version = saved.version;
    }

    const participantsResponse = await runtimeRequest(
      `${cfpBase}/submissions/${created.id}/participants`,
      jsonRequest(
        "PUT",
        {
          expectedVersion: version,
          participants: [
            {
              id: "participant-runtime",
              firstName: "Avery",
              lastName: "Speaker",
              email: "avery@example.test",
              role: "primary",
              biography: "A deterministic local speaker biography.",
              answers: {},
            },
          ],
          secondaryContacts: [],
        },
        { ...organizerHeaders, "idempotency-key": "runtime-cfp-participants-1" },
      ),
    );
    const participants = await jsonData<{ version: number }>(participantsResponse);
    expect(participantsResponse.status).toBe(200);
    version = participants.version;

    const reviewStepResponse = await runtimeRequest(
      `${cfpBase}/submissions/${created.id}/draft`,
      jsonRequest(
        "PATCH",
        { expectedVersion: version, completedStep: "review" },
        { ...organizerHeaders, "idempotency-key": "runtime-cfp-review-step-1" },
      ),
    );
    const reviewStep = await jsonData<{ version: number }>(reviewStepResponse);
    expect(reviewStepResponse.status).toBe(200);
    version = reviewStep.version;

    const reviewResponse = await runtimeRequest(`${cfpBase}/submissions/${created.id}/review`, {
      method: "POST",
      headers: { ...organizerHeaders, "idempotency-key": "runtime-cfp-review-1" },
    });
    const review = await jsonData<{ canSubmit: boolean; issues: unknown[] }>(reviewResponse);
    expect(reviewResponse.status).toBe(200);
    expect(review).toMatchObject({ canSubmit: true, issues: [] });

    const submitInit = jsonRequest(
      "POST",
      { expectedVersion: version },
      { ...organizerHeaders, "idempotency-key": "runtime-cfp-submit-1" },
    );
    const submitResponse = await runtimeRequest(
      `${cfpBase}/submissions/${created.id}/submit`,
      submitInit,
    );
    const submitted = await jsonData<{
      submission: { id: string; status: string; version: number };
      confirmationQueued: boolean;
    }>(submitResponse);
    expect(submitResponse.status).toBe(200);
    expect(submitted.submission).toMatchObject({ id: created.id, status: "submitted" });
    expect(submitted.confirmationQueued).toBe(true);

    const submitReplayResponse = await runtimeRequest(
      `${cfpBase}/submissions/${created.id}/submit`,
      submitInit,
    );
    const submitReplay = await jsonData<{
      submission: { id: string; status: string; version: number };
      confirmationQueued: boolean;
    }>(submitReplayResponse);
    expect(submitReplayResponse.status).toBe(200);
    expect(submitReplay).toEqual(submitted);
  });

  it("fails closed outside local mode when provider configuration is absent", async () => {
    const response = await runtimeRequest(
      `/api/speaker/events/${eventId}/portal`,
      { headers: speakerHeaders },
      productionBindings,
    );
    const body = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(503);
    expect(["CONFIGURATION_ERROR", "INTEGRATION_UNAVAILABLE"]).toContain(body.error.code);
    expect(JSON.stringify(body)).not.toContain("local-speaker");
  });
});
