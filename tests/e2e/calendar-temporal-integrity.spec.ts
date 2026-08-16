import { type APIRequestContext, type APIResponse, expect, test } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const SEEDED_EVENT_ID = "demo-event";
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_TOKEN = "local-session";
const adminEventPath = `/api/admin/organizations/${ORGANIZATION_ID}/events`;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  expect(value).toBeDefined();
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  return value as JsonRecord;
}

async function responseJson(response: APIResponse): Promise<JsonRecord> {
  return record(await response.json());
}

function dataRecord(body: JsonRecord): JsonRecord {
  return record(body.data);
}

async function expectTemporalError(
  response: APIResponse,
  expectedMessage: RegExp,
): Promise<JsonRecord> {
  expect(response.status()).toBe(400);
  const body = await responseJson(response);
  const error = record(body.error);
  expect(error.code).toBe("VALIDATION_FAILED");
  expect(error.message).toMatch(expectedMessage);
  return error;
}

async function postJson(
  request: APIRequestContext,
  path: string,
  body: JsonRecord,
): Promise<APIResponse> {
  return request.post(path, { data: body });
}

async function patchJson(
  request: APIRequestContext,
  path: string,
  body: JsonRecord,
): Promise<APIResponse> {
  return request.patch(path, { data: body });
}

async function putJson(
  request: APIRequestContext,
  path: string,
  body: JsonRecord,
): Promise<APIResponse> {
  return request.put(path, { data: body });
}

async function createAgendaCatalog(
  request: APIRequestContext,
  eventId: string,
): Promise<{ roomId: string; sessionId: string }> {
  const roomId = `${eventId}-room`;
  const sessionId = `${eventId}-session`;
  const sessionPath = `${adminEventPath}/${eventId}/sessions`;

  const roomResponse = await postJson(request, `${sessionPath}/rooms`, {
    id: roomId,
    name: "Temporal integrity room",
    capacity: 100,
  });
  expect(roomResponse.status()).toBe(201);
  const createdRoom = dataRecord(await responseJson(roomResponse));

  const sessionResponse = await postJson(request, sessionPath, {
    id: sessionId,
    title: "Temporal integrity session",
    status: "Accepted",
    durationMinutes: 60,
    roomId: createdRoom.id,
    trackIds: [],
    speakerIds: [],
  });
  expect(sessionResponse.status()).toBe(201);
  const createdSession = dataRecord(await responseJson(sessionResponse));
  const approvedResponse = await patchJson(request, `${sessionPath}/${String(createdSession.id)}`, {
    expectedVersion: createdSession.version,
    contentStatus: "Approved",
  });
  expect(approvedResponse.status()).toBe(200);
  const approvedSession = dataRecord(await responseJson(approvedResponse));

  return { roomId: String(createdRoom.id), sessionId: String(approvedSession.id) };
}

async function agendaDraft(request: APIRequestContext, eventId: string): Promise<JsonRecord> {
  const response = await request.get(`${adminEventPath}/${eventId}/agenda/draft`);
  expect(response.status()).toBe(200);
  return dataRecord(await responseJson(response));
}

async function screenshotSurface(
  page: import("@playwright/test").Page,
  path: string,
  outputPath: string,
): Promise<void> {
  await page.goto(path);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: outputPath, fullPage: true });
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: SESSION_TOKEN,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("fixture runtime preserves temporal integrity across organizer domains", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const request = context.request;

  await test.step("event and CFP bounds reject invalid windows and persist valid values", async () => {
    const eventId = "temporal-event-bounds-e2e";
    const invalid = await postJson(request, adminEventPath, {
      id: `${eventId}-invalid`,
      slug: `${eventId}-invalid`,
      name: "Invalid temporal event",
      timeZone: "America/Los_Angeles",
      startsAt: "2027-05-12T16:30:00.000Z",
      endsAt: "2027-05-12T23:30:00.000Z",
      cfpSettings: {
        enabled: true,
        opensAt: "2027-05-01T16:00:00.000Z",
        closesAt: "2027-05-12T17:00:00.000Z",
      },
    });
    await expectTemporalError(invalid, /CFP window must finish before the event begins/u);

    const createdResponse = await postJson(request, adminEventPath, {
      id: eventId,
      slug: eventId,
      name: "Temporal bounds event",
      timeZone: "America/Los_Angeles",
      startsAt: "2027-05-12T16:30:00.000Z",
      endsAt: "2027-05-12T23:30:00.000Z",
      cfpSettings: {
        enabled: true,
        opensAt: "2027-05-01T16:00:00.000Z",
        closesAt: "2027-05-10T23:00:00.000Z",
      },
    });
    expect(createdResponse.status()).toBe(201);
    const created = dataRecord(await responseJson(createdResponse));
    expect(created.cfpSettings).toEqual({
      enabled: true,
      opensAt: "2027-05-01T16:00:00.000Z",
      closesAt: "2027-05-10T23:00:00.000Z",
    });

    const rejectedUpdate = await patchJson(request, `${adminEventPath}/${eventId}`, {
      expectedVersion: created.version,
      cfpSettings: {
        enabled: true,
        opensAt: "2027-05-01T16:00:00.000Z",
        closesAt: "2027-05-12T17:00:00.000Z",
      },
    });
    await expectTemporalError(rejectedUpdate, /CFP window must finish before the event begins/u);

    const reloadedResponse = await request.get(`${adminEventPath}/${eventId}`);
    expect(reloadedResponse.status()).toBe(200);
    const reloaded = dataRecord(await responseJson(reloadedResponse));
    expect(reloaded.version).toBe(created.version);
    expect(reloaded.cfpSettings).toEqual(created.cfpSettings);

    await screenshotSurface(
      page,
      `/admin/organizations/${ORGANIZATION_ID}/events/${eventId}/settings`,
      testInfo.outputPath("event-cfp-bounds.png"),
    );
  });

  await test.step("review boundaries cannot exceed the event and a valid close persists", async () => {
    const plansResponse = await request.get(
      `/api/admin/evaluations/plans?eventId=${SEEDED_EVENT_ID}`,
    );
    expect(plansResponse.status()).toBe(200);
    const plansBody = await responseJson(plansResponse);
    const plans = plansBody.plans as JsonRecord[];
    expect(plans).toHaveLength(1);
    const plan = record(plans[0]);
    const planPath = "/api/admin/evaluations/plans";
    const rounds = (plan.rounds as JsonRecord[]).map((round, index) => ({
      ...round,
      id: `temporal-review-round-${index + 1}`,
    }));
    const planInput = {
      eventId: SEEDED_EVENT_ID,
      name: "Temporal integrity review",
      blindReview: plan.blindReview,
      assignmentRule: plan.assignmentRule,
      rounds,
      reviewerProjection: plan.reviewerProjection,
    };

    const eventResponse = await request.get(`${adminEventPath}/${SEEDED_EVENT_ID}`);
    expect(eventResponse.status()).toBe(200);
    const authoritativeEvent = dataRecord(await responseJson(eventResponse));
    const eventEnd = Date.parse(String(authoritativeEvent.endsAt));
    expect(Number.isFinite(eventEnd)).toBe(true);
    const invalidClose = new Date(eventEnd + 1).toISOString();
    const validClose = new Date(eventEnd - 60 * 60 * 1_000).toISOString();

    const invalidResponse = await postJson(request, planPath, {
      ...planInput,
      id: "temporal-review-invalid-e2e",
      closesAt: invalidClose,
    });
    await expectTemporalError(invalidResponse, /cannot be after the event ends/u);

    const validPlanId = "temporal-review-valid-e2e";
    const createResponse = await postJson(request, planPath, {
      ...planInput,
      id: validPlanId,
      closesAt: validClose,
    });
    expect(createResponse.status()).toBe(201);
    const created = await responseJson(createResponse);
    expect(created.closesAt).toBe(validClose);

    const reloadedResponse = await request.get(`${planPath}/${validPlanId}`);
    expect(reloadedResponse.status()).toBe(200);
    const reloaded = await responseJson(reloadedResponse);
    expect(reloaded.closesAt).toBe(validClose);
    expect(reloaded.version).toBe(1);

    await screenshotSurface(
      page,
      `/admin/organizations/${ORGANIZATION_ID}/events/${SEEDED_EVENT_ID}/reviews`,
      testInfo.outputPath("review-date-bounds.png"),
    );
  });

  await test.step("agenda enforces exact instants, sparse dates, and DST disambiguation", async () => {
    const exactEventId = "temporal-agenda-exact-e2e";
    const exactEventResponse = await postJson(request, adminEventPath, {
      id: exactEventId,
      slug: exactEventId,
      name: "Exact and sparse agenda event",
      timeZone: "America/Los_Angeles",
      startsAt: "2027-05-12T16:30:00.000Z",
      endsAt: "2027-05-15T00:30:00.000Z",
      scheduleDates: ["2027-05-12", "2027-05-14"],
      cfpSettings: { enabled: false, opensAt: null, closesAt: null },
    });
    expect(exactEventResponse.status()).toBe(201);
    const exactCatalog = await createAgendaCatalog(request, exactEventId);
    const exactDraft = await agendaDraft(request, exactEventId);
    const exactDraftPath = `${adminEventPath}/${exactEventId}/agenda/draft`;
    const exactEntry = (startsAtLocal: string, endsAtLocal: string): JsonRecord => ({
      id: "exact-entry",
      sessionId: exactCatalog.sessionId,
      roomId: exactCatalog.roomId,
      trackIds: [],
      startsAtLocal,
      endsAtLocal,
    });

    for (const [label, entry] of [
      ["before exact start", exactEntry("2027-05-12T09:00", "2027-05-12T10:00")],
      ["sparse excluded day", exactEntry("2027-05-13T10:00", "2027-05-13T11:00")],
      ["after exact end", exactEntry("2027-05-14T17:00", "2027-05-14T18:00")],
    ] as const) {
      const invalidResponse = await putJson(request, exactDraftPath, {
        expectedVersion: exactDraft.version,
        entries: [entry],
      });
      await test.step(label, async () => {
        await expectTemporalError(invalidResponse, /event|schedule date|outside/u);
      });
    }

    const validExactResponse = await putJson(request, exactDraftPath, {
      expectedVersion: exactDraft.version,
      entries: [exactEntry("2027-05-12T10:00", "2027-05-12T11:00")],
    });
    const validExactBody = await validExactResponse.text();
    expect(validExactResponse.status(), validExactBody).toBe(200);
    const validExact = dataRecord(record(JSON.parse(validExactBody)));
    const exactReload = await agendaDraft(request, exactEventId);
    expect(exactReload.version).toBe(validExact.version);
    expect(exactReload.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startsAtLocal: "2027-05-12T10:00:00",
          endsAtLocal: "2027-05-12T11:00:00",
        }),
      ]),
    );

    const dstEventId = "temporal-agenda-dst-e2e";
    const dstEventResponse = await postJson(request, adminEventPath, {
      id: dstEventId,
      slug: dstEventId,
      name: "DST fold agenda event",
      timeZone: "America/Los_Angeles",
      startsAt: "2026-11-01T07:00:00.000Z",
      endsAt: "2026-11-01T12:00:00.000Z",
      scheduleDates: ["2026-11-01"],
      cfpSettings: { enabled: false, opensAt: null, closesAt: null },
    });
    expect(dstEventResponse.status()).toBe(201);
    const dstCatalog = await createAgendaCatalog(request, dstEventId);
    const dstDraft = await agendaDraft(request, dstEventId);
    const dstDraftPath = `${adminEventPath}/${dstEventId}/agenda/draft`;
    const ambiguousEntry = {
      id: "dst-entry",
      sessionId: dstCatalog.sessionId,
      roomId: dstCatalog.roomId,
      trackIds: [],
      startsAtLocal: "2026-11-01T01:30",
      endsAtLocal: "2026-11-01T02:15",
    };

    const ambiguousResponse = await putJson(request, dstDraftPath, {
      expectedVersion: dstDraft.version,
      entries: [ambiguousEntry],
    });
    const ambiguousError = await expectTemporalError(ambiguousResponse, /occurs twice/u);
    expect(ambiguousError.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["entries", 0, "startsAtLocal"],
          code: "agenda.ambiguous_local_time",
        }),
      ]),
    );

    const resolvedResponse = await putJson(request, dstDraftPath, {
      expectedVersion: dstDraft.version,
      entries: [{ ...ambiguousEntry, startDisambiguation: "later" }],
    });
    expect(resolvedResponse.status()).toBe(200);
    const dstReload = await agendaDraft(request, dstEventId);
    expect(dstReload.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startsAtLocal: "2026-11-01T01:30:00",
          startDisambiguation: "later",
        }),
      ]),
    );

    await screenshotSurface(
      page,
      `/admin/organizations/${ORGANIZATION_ID}/events/${exactEventId}/agenda`,
      testInfo.outputPath("agenda-temporal-integrity.png"),
    );
  });

  await test.step("speaker deadlines are strict while valid out-of-event travel persists", async () => {
    const tasksPath = `/api/speaker/events/${SEEDED_EVENT_ID}/organizer/tasks`;
    const tasksResponse = await request.get(tasksPath);
    expect(tasksResponse.status()).toBe(200);
    const tasksEnvelope = dataRecord(await responseJson(tasksResponse));
    const tasks = tasksEnvelope.tasks as JsonRecord[];
    expect(tasks.length).toBeGreaterThan(0);
    const assignmentSource = record(tasks[0]);
    const taskInput = {
      type: "action",
      allowedMimeTypes: ["text/plain"],
      assignments: [
        {
          participantId: assignmentSource.participantId,
          submissionId: assignmentSource.submissionId ?? null,
        },
      ],
    };
    const invalidDeadlineResponse = await postJson(request, tasksPath, {
      ...taskInput,
      title: "Invalid temporal integrity deadline",
      dueAt: "2026-08-07",
    });
    await expectTemporalError(invalidDeadlineResponse, /due date must be on or after/u);

    const afterEventDeadline = "2026-09-20";
    const validDeadlineResponse = await postJson(request, tasksPath, {
      ...taskInput,
      title: "Temporal integrity deadline",
      dueAt: afterEventDeadline,
    });
    expect(validDeadlineResponse.status()).toBe(201);
    const updatedTask = dataRecord(await responseJson(validDeadlineResponse));
    expect(updatedTask.dueAt).toBe(afterEventDeadline);
    const task = updatedTask;

    const tasksReloadResponse = await request.get(tasksPath);
    const tasksReload = dataRecord(await responseJson(tasksReloadResponse)).tasks as JsonRecord[];
    expect(tasksReload).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: task.id, dueAt: afterEventDeadline })]),
    );

    const profilesPath = `/api/admin/organizations/${ORGANIZATION_ID}/events/${SEEDED_EVENT_ID}/speakers`;
    const profilesResponse = await request.get(profilesPath);
    expect(profilesResponse.status()).toBe(200);
    const profilesEnvelope = dataRecord(await responseJson(profilesResponse));
    const profiles = profilesEnvelope.speakers as JsonRecord[];
    expect(profiles.length).toBeGreaterThan(0);
    const profile = record(profiles[0]);

    const invalidTravelResponse = await patchJson(
      request,
      `${profilesPath}/${String(profile.participantId)}`,
      {
        expectedVersion: profile.version,
        displayName: profile.displayName,
        email: profile.email,
        jobTitle: profile.jobTitle,
        company: profile.company,
        biography: profile.biography,
        socialLinks: profile.socialLinks,
        status: profile.status,
        travelLogistics: {
          travelRequired: true,
          arrivalAt: "2026-09-20",
          departureAt: "2026-09-17",
        },
      },
    );
    await expectTemporalError(
      invalidTravelResponse,
      /departure date must be on or after arrival/iu,
    );

    const travelLogistics = {
      travelRequired: true,
      arrivalAt: "2026-09-17",
      departureAt: "2026-09-20",
    };
    const validTravelResponse = await patchJson(
      request,
      `${profilesPath}/${String(profile.participantId)}`,
      {
        expectedVersion: profile.version,
        displayName: profile.displayName,
        email: profile.email,
        jobTitle: profile.jobTitle,
        company: profile.company,
        biography: profile.biography,
        socialLinks: profile.socialLinks,
        status: profile.status,
        travelLogistics,
      },
    );
    expect(validTravelResponse.status()).toBe(200);

    const profilesReloadResponse = await request.get(profilesPath);
    expect(profilesReloadResponse.status()).toBe(200);
    const profilesReload = dataRecord(await responseJson(profilesReloadResponse))
      .speakers as JsonRecord[];
    expect(profilesReload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participantId: profile.participantId,
          travelLogistics: expect.objectContaining(travelLogistics),
        }),
      ]),
    );

    await screenshotSurface(
      page,
      `/admin/organizations/${ORGANIZATION_ID}/events/${SEEDED_EVENT_ID}/deliverables`,
      testInfo.outputPath("speaker-temporal-integrity.png"),
    );
  });

  await test.step("API keys reject non-instant DST values and persist a future explicit offset", async () => {
    const keysPath = `/api/admin/organizations/${ORGANIZATION_ID}/api-keys`;
    const ambiguousResponse = await postJson(request, keysPath, {
      label: "Ambiguous DST key",
      scopes: ["events:read"],
      expiresAt: "2026-11-01T01:30:00",
    });
    await expectTemporalError(ambiguousResponse, /explicit UTC offset/u);

    const pastResponse = await postJson(request, keysPath, {
      label: "Past key",
      scopes: ["events:read"],
      expiresAt: "2020-01-01T00:00:00Z",
    });
    await expectTemporalError(pastResponse, /must be in the future/u);

    const canonicalExpiration = "2026-11-01T09:30:00.000Z";
    const validResponse = await postJson(request, keysPath, {
      label: "Resolved DST key",
      scopes: ["events:read"],
      expiresAt: "2026-11-01T01:30:00-08:00",
    });
    expect(validResponse.status()).toBe(201);
    const createdSecret = dataRecord(await responseJson(validResponse));
    expect(createdSecret.id).toEqual(expect.any(String));
    expect(createdSecret.secret).toEqual(expect.stringMatching(/^osb_/u));

    const keysReloadResponse = await request.get(keysPath);
    expect(keysReloadResponse.status()).toBe(200);
    const keys = (await responseJson(keysReloadResponse)).data as JsonRecord[];
    expect(keys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdSecret.id,
          label: "Resolved DST key",
          expiresAt: canonicalExpiration,
        }),
      ]),
    );

    await screenshotSurface(
      page,
      `/admin/organizations/${ORGANIZATION_ID}/integrations`,
      testInfo.outputPath("api-key-temporal-integrity.png"),
    );
  });
});
