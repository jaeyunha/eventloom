import { describe, expect, it } from "vitest";
import worker from "../../apps/api/src/index";
import { apiErrorSchema, healthResponseSchema } from "../../packages/contracts/src";

type RuntimeBindings = {
  APP_ENV: "local" | "staging" | "production";
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
  it("issues distinct local sessions and enforces organizer, reviewer, and speaker boundaries", async () => {
    const personas = [
      {
        email: "organizer@local.test",
        cookie: organizerHeaders.cookie,
        userId: "local-organizer",
      },
      {
        email: "reviewer@local.test",
        cookie: reviewerHeaders.cookie,
        userId: "local-reviewer",
      },
      {
        email: "speaker@local.test",
        cookie: speakerHeaders.cookie,
        userId: "local-speaker",
      },
    ] as const;

    for (const persona of personas) {
      const signIn = await runtimeRequest(
        "/api/auth/sign-in/email",
        jsonRequest("POST", { email: persona.email, password: "local" }),
      );
      expect(signIn.status).toBe(200);
      expect(signIn.headers.get("set-cookie")).toContain(persona.cookie);
      const session = await runtimeRequest("/api/auth/get-session", {
        headers: { cookie: persona.cookie },
      });
      expect(session.status).toBe(200);
      expect((await session.json()) as { user: { id: string } }).toMatchObject({
        user: { id: persona.userId },
      });
    }

    const invalid = await runtimeRequest(
      "/api/auth/sign-in/email",
      jsonRequest("POST", { email: "organizer@local.test", password: "wrong" }),
    );
    expect(invalid.status).toBe(401);

    const organizerEvents = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events`,
      { headers: organizerHeaders },
    );
    expect(organizerEvents.status).toBe(200);

    const reviewerEvents = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events`,
      { headers: reviewerHeaders },
    );
    expect(reviewerEvents.status).toBe(403);

    const speakerEvents = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events`,
      { headers: speakerHeaders },
    );
    expect(speakerEvents.status).toBe(403);

    const reviewerWorkspace = await runtimeRequest(
      `/api/admin/evaluations/reviewer/workspace?eventId=${eventId}`,
      { headers: reviewerHeaders },
    );
    expect(reviewerWorkspace.status).toBe(200);
    const reviewerData = await jsonData<{ assignments: readonly { reviewerId: string }[] }>(
      reviewerWorkspace,
    );
    expect(reviewerData.assignments).toHaveLength(1);

    const speakerPortal = await runtimeRequest(`/api/speaker/events/${eventId}/portal`, {
      headers: speakerHeaders,
    });
    expect(speakerPortal.status).toBe(200);
  });

  it("serves seeded local organizer data for Events, People, CRM, and CFP review", async () => {
    const eventsResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events`,
      { headers: organizerHeaders },
    );
    const events = await jsonData<Array<{ id: string; organizationId: string }>>(eventsResponse);
    expect(eventsResponse.status).toBe(200);
    expect(events.map((event) => event.id)).toEqual(
      expect.arrayContaining(["demo-event", "open-sessionboard-conf"]),
    );
    expect(events.every((event) => event.organizationId === organizationId)).toBe(true);

    const membersResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/members`,
      { headers: organizerHeaders },
    );
    const members = await jsonData<Array<{ userId: string; role: string }>>(membersResponse);
    expect(membersResponse.status).toBe(200);
    expect(members).toContainEqual(
      expect.objectContaining({ userId: "local-organizer", role: "owner" }),
    );
    expect(members).toContainEqual(
      expect.objectContaining({ userId: "local-reviewer", role: "reviewer" }),
    );

    const contactsResponse = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/crm/contacts?status=active`,
      { headers: organizerHeaders },
    );
    expect(contactsResponse.status).toBe(200);
    expect(await jsonData<unknown[]>(contactsResponse)).toEqual([]);

    const cfpResponse = await runtimeRequest(
      `/api/public/cfp/organizations/${organizationId}/events/${eventId}`,
    );
    expect(cfpResponse.status).toBe(200);
    expect(await jsonData<{ event: { id: string } }>(cfpResponse)).toMatchObject({
      event: { id: eventId },
    });

    const evaluationResponse = await runtimeRequest(
      `/api/admin/evaluations/organizer/workspace?eventId=${eventId}`,
      { headers: organizerHeaders },
    );
    expect(evaluationResponse.status).toBe(200);
    expect(
      await jsonData<{ plan: { id: string; eventId: string; status: string } }>(evaluationResponse),
    ).toMatchObject({
      plan: {
        id: "local-evaluation-plan",
        eventId,
        status: "open",
      },
    });

    const speakerContentPath = `/api/speaker/events/${eventId}/organizer/content/speaker/local-participant`;
    const speakerContentResponse = await runtimeRequest(speakerContentPath, {
      headers: organizerHeaders,
    });
    expect(speakerContentResponse.status).toBe(200);
    expect(
      await jsonData<{ entityId: string; version: number; biography: string }>(
        speakerContentResponse,
      ),
    ).toMatchObject({
      entityId: "local-participant",
      version: 1,
    });

    const speakerHistoryResponse = await runtimeRequest(`${speakerContentPath}/history`, {
      headers: organizerHeaders,
    });
    expect(speakerHistoryResponse.status).toBe(200);
    expect(
      await jsonData<Array<{ entityId: string; version: number; action: string }>>(
        speakerHistoryResponse,
      ),
    ).toEqual([
      expect.objectContaining({
        entityId: "local-participant",
        version: 1,
        action: "created",
      }),
    ]);
  });

  it("enforces auth boundaries while exposing a useful seeded speaker portal", async () => {
    const unauthenticatedAgenda = await runtimeRequest(
      `/api/admin/organizations/${organizationId}/events/${eventId}/agenda/draft`,
      { headers: { "x-request-id": traceId } },
    );
    await errorResponse(unauthenticatedAgenda, 401, "AUTHENTICATION_REQUIRED");

    const unauthenticatedPublicApi = await runtimeRequest(
      `/api/v1/organizations/${organizationId}/webhooks`,
      { headers: { "x-request-id": traceId } },
    );
    await errorResponse(unauthenticatedPublicApi, 401, "AUTHENTICATION_REQUIRED");

    const apiKeyHeaders = {
      authorization: "Bearer local-api-key",
      "x-request-id": traceId,
    };
    const crossTenant = await runtimeRequest(
      "/api/v1/organizations/another-organization/webhooks",
      { headers: apiKeyHeaders },
    );
    await errorResponse(crossTenant, 403, "ACCESS_DENIED");

    const agendaProjectionResponse = await runtimeRequest(`/api/public/events/${eventId}/agenda`);
    const agendaProjection = await jsonData<{ entries: Array<Record<string, unknown>> }>(
      agendaProjectionResponse,
    );

    expect(agendaProjectionResponse.status).toBe(200);
    expect(agendaProjection.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(agendaProjection)).not.toContain("email");

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

    const updatedEntries = inputEntries.map((entry, index) =>
      index === 0 ? { ...entry, endsAtLocal: "2026-09-18T09:45:00" } : entry,
    );

    const updateResponse = await runtimeRequest(
      `${adminBase}/draft`,
      jsonRequest(
        "PUT",
        { expectedVersion: draft.version, entries: updatedEntries },
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
    await errorResponse(staleResponse, 412, "PRECONDITION_FAILED");

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
      event: { slug: string };
      revision: { id: string; number: number; publishedAt: string };
      entries: unknown[];
    }>(publicResponse);
    const serialized = JSON.stringify(publicAgenda);

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("cache-control")).toContain("s-maxage=60");
    expect(publicAgenda).toMatchObject({
      event: { slug: eventId },
      revision: { id: publication.id },
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
                    format: "Breakout Session",
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

  it("mounts the seeded organizer lifecycle workspaces with strict persona access", async () => {
    const workspaceBase = `/api/admin/organizations/${organizationId}/events/${eventId}`;

    const settingsResponse = await runtimeRequest(`${workspaceBase}/sessions/settings`, {
      headers: organizerHeaders,
    });
    expect(settingsResponse.status).toBe(200);
    expect(
      await jsonData<{
        statuses: readonly string[];
        agendaEligibleStatuses: readonly string[];
      }>(settingsResponse),
    ).toMatchObject({
      statuses: expect.arrayContaining(["accepted", "scheduled"]),
      agendaEligibleStatuses: ["accepted", "scheduled"],
    });

    const roomsResponse = await runtimeRequest(`${workspaceBase}/sessions/rooms`, {
      headers: organizerHeaders,
    });
    const rooms = await jsonData<readonly { id: string; name: string }[]>(roomsResponse);
    expect(roomsResponse.status).toBe(200);
    expect(rooms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "local-room-main", name: "Main Hall" }),
        expect.objectContaining({ id: "local-room-studio", name: "Workshop Studio" }),
      ]),
    );

    const templatesResponse = await runtimeRequest(`${workspaceBase}/communications/templates`, {
      headers: organizerHeaders,
    });
    expect(templatesResponse.status).toBe(200);
    expect(
      (
        (await templatesResponse.json()) as {
          templates: readonly { id: string; status: string; sender: string }[];
        }
      ).templates,
    ).toEqual([
      expect.objectContaining({
        id: "local-event-update",
        status: "approved",
        sender: "speakers@sessionboard.namuh.co",
      }),
    ]);

    const createReportResponse = await runtimeRequest(
      `${workspaceBase}/reports`,
      jsonRequest(
        "POST",
        {
          id: "local-program-report",
          name: "Program snapshot",
          description: "Current accepted program.",
          relationships: ["sessions"],
          fields: ["sessions.id", "sessions.title", "sessions.status"],
          order: ["sessions.id", "sessions.title", "sessions.status"],
          filters: [],
          sort: [{ field: "sessions.title", direction: "asc" }],
        },
        organizerHeaders,
      ),
    );
    expect(createReportResponse.status).toBe(201);
    expect(
      (await createReportResponse.json()) as {
        id: string;
        eventId: string;
        fields: readonly string[];
      },
    ).toMatchObject({
      id: "local-program-report",
      eventId,
      fields: ["sessions.id", "sessions.title", "sessions.status"],
    });

    const remixResponse = await runtimeRequest(
      `${workspaceBase}/remix/records?sourceType=session`,
      { headers: organizerHeaders },
    );
    expect(remixResponse.status).toBe(200);
    expect(
      ((await remixResponse.json()) as { records: readonly { id: string; eventId: string }[] })
        .records,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "local-session-keynote", eventId }),
        expect.objectContaining({ id: "local-session-workshop", eventId }),
      ]),
    );

    for (const path of [
      `${workspaceBase}/sessions/settings`,
      `${workspaceBase}/communications/templates`,
      `${workspaceBase}/reports`,
      `${workspaceBase}/remix/records?sourceType=session`,
    ]) {
      const reviewerResponse = await runtimeRequest(path, { headers: reviewerHeaders });
      expect(reviewerResponse.status).toBe(403);
      const speakerResponse = await runtimeRequest(path, { headers: speakerHeaders });
      expect(speakerResponse.status).toBe(403);
    }
  });
  it("serves one matching immutable public agenda and speaker revision", async () => {
    const [agendaResponse, speakersResponse] = await Promise.all([
      runtimeRequest(`/api/public/events/${eventId}/agenda`),
      runtimeRequest(`/api/public/events/${eventId}/speakers`),
    ]);
    expect(agendaResponse.status).toBe(200);
    expect(speakersResponse.status).toBe(200);
    const agenda = await jsonData<{ revision: { id: string; number: number } }>(agendaResponse);
    const speakers = await jsonData<{
      revision: { id: string; number: number };
      speakers: readonly { displayName: string; id: string }[];
    }>(speakersResponse);
    expect(speakers.revision).toEqual(agenda.revision);
    expect(speakers.speakers).toEqual([
      expect.objectContaining({
        id: "local-public-speaker-alex",
        displayName: "Alex Rivera",
      }),
    ]);
    expect(JSON.stringify(speakers)).not.toContain("local-participant");
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
