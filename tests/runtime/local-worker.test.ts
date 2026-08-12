import { describe, expect, it } from "vitest";
import worker from "../../apps/api/src/index";
import { apiErrorSchema, healthResponseSchema } from "../../packages/contracts/src";

type RuntimeBindings = {
  APP_ENV: "local" | "staging" | "production";
  RUNTIME_PROFILE?: "integrated" | "fixture";
  WEB_ORIGIN: string;
  DB: unknown;
  AGENDA_COORDINATOR: unknown;
  PRIVATE_FILES: unknown;
  OUTBOX_QUEUE: unknown;
};

type RuntimeWorker = {
  fetch(
    request: Request,
    bindings: RuntimeBindings,
    executionContext: unknown,
  ): Response | Promise<Response>;
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
const reviewerHeaders = {
  cookie: "better-auth.session_token=local-reviewer-session",
  "x-request-id": traceId,
};
const speakerHeaders = {
  cookie: "better-auth.session_token=local-speaker-session",
  "x-request-id": traceId,
};

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
  RUNTIME_PROFILE: "fixture",
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
    const agendaProjection =
      await jsonData<Array<Record<string, unknown>>>(agendaProjectionResponse);

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
  it("keeps organizer, reviewer, and speaker personas on separate authorization paths", async () => {
    const signIn = async (email: string, password: string) => {
      const response = await runtimeRequest(
        "/api/auth/sign-in/email",
        jsonRequest("POST", { email, password }),
      );
      expect(response.status).toBe(200);
      return response;
    };
    const organizerSignIn = await signIn(
      "organizer@local.open-sessionboard.test",
      "organizer-local",
    );
    const reviewerSignIn = await signIn("reviewer@local.open-sessionboard.test", "reviewer-local");
    const speakerSignIn = await signIn("speaker@local.open-sessionboard.test", "speaker-local");

    expect((await organizerSignIn.json()).token).toBe("local-session");
    expect((await reviewerSignIn.json()).token).toBe("local-reviewer-session");
    expect((await speakerSignIn.json()).token).toBe("local-speaker-session");

    const reviewerWorkspace = await runtimeRequest(
      "/api/admin/evaluations/reviewer/workspace?eventId=demo-event",
      { headers: reviewerHeaders },
    );
    const reviewerData = await jsonData<{
      assignments: Array<{ assignment: { reviewerId: string; status: string } }>;
    }>(reviewerWorkspace);
    expect(reviewerWorkspace.status).toBe(200);
    expect(reviewerData.assignments).toEqual([
      expect.objectContaining({
        assignment: expect.objectContaining({ reviewerId: "local-reviewer", status: "assigned" }),
      }),
    ]);

    const reviewerEvents = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events`,
      { headers: reviewerHeaders },
    );
    await errorResponse(reviewerEvents, 403, "ACCESS_DENIED");

    const reviewerOrganizerWorkspace = await runtimeRequest(
      "/api/admin/evaluations/organizer/workspace?eventId=demo-event",
      { headers: reviewerHeaders },
    );
    await errorResponse(reviewerOrganizerWorkspace, 403, "ACCESS_DENIED");

    const speakerEvents = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events`,
      { headers: speakerHeaders },
    );
    await errorResponse(speakerEvents, 403, "ACCESS_DENIED");

    const reviewerPortal = await runtimeRequest(`/api/speaker/events/${eventId}/portal`, {
      headers: reviewerHeaders,
    });
    await errorResponse(reviewerPortal, 404, "NOT_FOUND");
    const speakerPortal = await runtimeRequest(`/api/speaker/events/${eventId}/portal`, {
      headers: speakerHeaders,
    });
    expect(speakerPortal.status).toBe(200);
  });
  it("serves one event lifecycle across organizer surfaces and public projections", async () => {
    const eventResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events`,
      { headers: organizerHeaders },
    );
    const events = await jsonData<Array<Record<string, unknown>>>(eventResponse);
    expect(eventResponse.status).toBe(200);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: eventId, status: "active", slug: eventId }),
      ]),
    );

    const eventDetailResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}`,
      { headers: organizerHeaders },
    );
    const eventDetail = await jsonData<Record<string, any>>(eventDetailResponse);
    expect(eventDetailResponse.status).toBe(200);
    expect(eventDetail).toMatchObject({
      id: eventId,
      status: "active",
      cfpSettings: { enabled: true },
      embedConfigurations: [expect.objectContaining({ enabled: true, widgetId: "agenda" })],
    });
    const overviewResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/overview/activity`,
      { headers: organizerHeaders },
    );
    const overview = await jsonData<{
      metrics: {
        submissionCount: number;
        pendingReviewCount: number;
        outstandingSpeakerTaskCount: number;
        publishedSessionCount: number;
      };
    }>(overviewResponse);
    expect(overviewResponse.status).toBe(200);
    expect(overview.metrics).toMatchObject({
      submissionCount: 1,
      pendingReviewCount: 1,
      outstandingSpeakerTaskCount: 2,
      publishedSessionCount: 2,
    });

    const sessionsResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}/sessions`,
      { headers: organizerHeaders },
    );
    const sessions = await jsonData<Array<Record<string, unknown>>>(sessionsResponse);
    const settingsResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}/sessions/settings`,
      { headers: organizerHeaders },
    );
    const settings = await jsonData<Record<string, unknown>>(settingsResponse);
    const auditResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}/sessions/audit`,
      { headers: organizerHeaders },
    );
    const audit = await jsonData<Array<Record<string, unknown>>>(auditResponse);
    expect(sessionsResponse.status).toBe(200);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.every((session) => session.status === "Accepted")).toBe(true);
    expect(settingsResponse.status).toBe(200);
    expect(settings).toMatchObject({ agendaEligibleStatuses: ["Accepted"] });
    expect(auditResponse.status).toBe(200);
    expect(audit.length).toBeGreaterThan(0);

    const membersResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/members`,
      { headers: organizerHeaders },
    );
    const members = await jsonData<Array<Record<string, unknown>>>(membersResponse);
    expect(membersResponse.status).toBe(200);
    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "local-organizer", role: "owner" }),
        expect.objectContaining({ userId: "local-reviewer", role: "reviewer" }),
      ]),
    );

    const cfpResponse = await runtimeRequest(
      `/api/cfp/organizations/${organizationId}/events/${eventId}/submissions`,
      { headers: organizerHeaders },
    );
    const cfpSubmissions = await jsonData<Array<Record<string, unknown>>>(cfpResponse);
    expect(cfpResponse.status).toBe(200);
    expect(cfpSubmissions.length).toBeGreaterThan(0);
    expect(cfpSubmissions.some((submission) => submission.status === "submitted")).toBe(true);

    const publicCfpResponse = await runtimeRequest(
      `/api/public/cfp/organizations/${organizationId}/events/${eventId}`,
    );
    expect(publicCfpResponse.status).toBe(200);

    const organizerEvaluation = await runtimeRequest(
      "/api/admin/evaluations/organizer/workspace?eventId=demo-event",
      { headers: organizerHeaders },
    );
    expect(organizerEvaluation.status).toBe(200);

    const deliverablesResponse = await runtimeRequest(
      `/api/speaker/events/${eventId}/organizer/deliverables`,
      { headers: organizerHeaders },
    );
    const deliverables = await jsonData<Record<string, any>>(deliverablesResponse);
    const filesResponse = await runtimeRequest(`/api/speaker/events/${eventId}/organizer/assets`, {
      headers: organizerHeaders,
    });
    const files = await jsonData<Array<Record<string, unknown>>>(filesResponse);
    expect(deliverablesResponse.status).toBe(200);
    expect(JSON.stringify(deliverables)).toContain("local-slides-task");
    expect(filesResponse.status).toBe(200);
    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "local-slides-asset", state: "ready" }),
      ]),
    );

    const communicationsResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}/communications/templates`,
      { headers: organizerHeaders },
    );
    const communications = await communicationsResponse.json();
    expect(communicationsResponse.status).toBe(200);
    expect(JSON.stringify(communications)).toContain("local-template-accepted");

    const reportsResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}/reports`,
      { headers: organizerHeaders },
    );
    const reports = await reportsResponse.json();
    expect(reportsResponse.status).toBe(200);
    expect(JSON.stringify(reports)).toContain("local-program-report");

    const remixRecordsResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}/remix/records?sourceType=session`,
      { headers: organizerHeaders },
    );
    const remixRecords = await remixRecordsResponse.json();
    expect(remixRecordsResponse.status).toBe(200);
    expect(JSON.stringify(remixRecords)).toContain("local-session-keynote");

    const publicAgendaResponse = await runtimeRequest(`/api/public/events/${eventId}/agenda`);
    const publicAgenda = await jsonData<{ eventId: string; entries: unknown[] }>(
      publicAgendaResponse,
    );
    const publicSpeakersResponse = await runtimeRequest(`/api/public/events/${eventId}/speakers`);
    const publicSpeakers = await publicSpeakersResponse.json();
    expect(publicAgendaResponse.status).toBe(200);
    expect(publicAgenda.eventId).toBe(eventId);
    expect(publicAgenda.entries.length).toBeGreaterThan(0);
    expect(publicSpeakersResponse.status).toBe(200);
    expect(JSON.stringify(publicSpeakers)).toContain("Alex Rivera");
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
      jsonRequest(
        "PUT",
        { expectedVersion: draft.version, entries: inputEntries },
        organizerHeaders,
      ),
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
        ...speakerHeaders,
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
      headers: speakerHeaders,
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
                    format: "Workshop",
                    abstract:
                      "A complete deterministic CFP submission exercised without credentials.",
                  },
                }
              : {}),
          },
          {
            ...speakerHeaders,
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
        { ...speakerHeaders, "idempotency-key": "runtime-cfp-participants-1" },
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
        { ...speakerHeaders, "idempotency-key": "runtime-cfp-review-step-1" },
      ),
    );
    const reviewStep = await jsonData<{ version: number }>(reviewStepResponse);
    expect(reviewStepResponse.status).toBe(200);
    version = reviewStep.version;

    const reviewResponse = await runtimeRequest(`${cfpBase}/submissions/${created.id}/review`, {
      method: "POST",
      headers: { ...speakerHeaders, "idempotency-key": "runtime-cfp-review-1" },
    });
    const review = await jsonData<{ canSubmit: boolean; issues: unknown[] }>(reviewResponse);
    expect(reviewResponse.status).toBe(200);
    expect(review).toMatchObject({ canSubmit: true, issues: [] });

    const submitInit = jsonRequest(
      "POST",
      { expectedVersion: version },
      { ...speakerHeaders, "idempotency-key": "runtime-cfp-submit-1" },
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
