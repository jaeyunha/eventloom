import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createSpeakerApi,
  ORGANIZER_HEADSHOT_ACCEPTED_TYPES,
  ORGANIZER_HEADSHOT_MAX_BYTES,
  type SpeakerApi,
  type SpeakerAsset,
  type SpeakerRecord,
  type SpeakerRosterEnvelope,
  type SpeakerTask,
} from "./api";
import {
  createSpeakerTaskAssignment,
  duplicateEmailConflicts,
  filterSpeakerRoster,
  organizerHeadshotPreviewPath,
  retainInvitationHistory,
  SpeakerAssetDownload,
  SpeakerAssetMetadata,
  SpeakerHeadshot,
  SpeakerInvitationControls,
  SpeakerWorkspace,
  speakerInvitationReady,
  speakerOnboardingTaskDefinitions,
  speakerProgressMatches,
  travelLogisticsFor,
  validateOrganizerHeadshotFile,
  validateSpeakerTaskAssignment,
} from "./speaker-workspace";

const speaker: SpeakerRecord = {
  participantId: "participant-1",
  displayName: "Priya Raman",
  email: "priya@example.test",
  jobTitle: "Principal Engineer",
  company: "Latticework Systems",
  biography: "Builds reliable developer platforms.",
  socialLinks: { twitter: "https://x.com/priya", linkedin: "https://linkedin.com/in/priya" },
  headshotAssetId: null,
  status: "confirmed",
  sessions: [{ submissionId: "session-1", title: "Incremental builds", status: "accepted" }],
  taskSummary: { total: 3, completed: 2, overdue: 0 },
  assets: [],
  version: 3,
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const roster: SpeakerRosterEnvelope = {
  organizationId: "org-1",
  eventId: "event-1",
  speakers: [speaker],
};
const readyAsset: SpeakerAsset = {
  assetId: "asset-ready",
  fileName: "slides.pdf",
  contentType: "application/pdf",
  byteSize: 1_024,
  status: "ready",
  uploadedAt: "2026-08-09T00:00:00.000Z",
  downloadUrl: null,
};
const headshotAsset: SpeakerAsset = {
  assetId: "asset-headshot",
  fileName: "priya.webp",
  contentType: "image/webp",
  byteSize: 2_048,
  status: "ready",
  uploadedAt: "2026-08-09T00:00:00.000Z",
  downloadUrl: null,
};

const pendingAsset: SpeakerAsset = {
  ...readyAsset,
  assetId: "asset-pending",
  fileName: "draft.pdf",
  status: "pending",
};

const task = {
  taskId: "task-1",
  participantId: "participant-1",
  title: "Confirm participation",
  description: "General speaker onboarding task.",
  type: "general" as const,
  dueAt: "2027-04-01",
  status: "pending" as const,
  completedAt: null,
  sessionId: null,
  latestAssetId: null,
};

describe("speaker API adapter", () => {
  it("qualifies roster, multipart preview, and canonical commit requests by organization and event", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      const path = String(input);
      if (path.endsWith("/imports/preview")) {
        return new Response(JSON.stringify({ data: { validRows: [], invalidRows: [] } }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ data: roster }), { status: 200 });
    };
    const api = createSpeakerApi("https://api.example.test/", "org/1", "event/1", fetcher);

    await api.list();
    await api.previewImport(
      new File(["displayName,email\nPriya,priya@example.test"], "speakers.csv", {
        type: "text/csv",
      }),
    );
    await api.commitImport({ rows: [], idempotencyKey: "import-once" });

    expect(String(calls[0]?.input)).toBe(
      "https://api.example.test/api/admin/organizations/org%2F1/events/event%2F1/speakers",
    );
    expect(String(calls[1]?.input)).toContain("/speakers/imports/preview");
    expect(calls[1]?.init?.body).toBeInstanceOf(FormData);
    expect(String(calls[2]?.input)).toContain("/speakers/imports");
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({
      rows: [],
      idempotencyKey: "import-once",
    });
    expect(calls[0]?.init).toMatchObject({ credentials: "include", cache: "no-store" });
  });
  it("keeps default speaker requests on the same-origin API gateway", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const api = createSpeakerApi("", "org-1", "event-1", async (input, init) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      return new Response(JSON.stringify({ data: roster }), { status: 200 });
    });

    await expect(api.list()).resolves.toEqual(roster);

    expect(String(calls[0]?.input)).toBe("/api/admin/organizations/org-1/events/event-1/speakers");
    expect(calls[0]?.init).toMatchObject({ credentials: "include", cache: "no-store" });
  });
  it("replaces and relinks a headshot entirely through same-origin API paths", async () => {
    const pendingAsset = {
      id: "asset-headshot-v2",
      eventId: "event-1",
      participantId: "participant-1",
      kind: "headshot" as const,
      fileName: "speaker.png",
      contentType: "image/png",
      sizeBytes: 2,
      state: "pending_upload" as const,
      createdAt: "2026-08-10T00:00:00.000Z",
    };
    const finalizedAsset = { ...pendingAsset, state: "ready" as const };
    const profile = {
      id: "profile-1",
      eventId: "event-1",
      participantId: "participant-1",
      displayName: "Priya Raman",
      biography: "Build systems engineer.",
      headshotAssetId: finalizedAsset.id,
      version: 4,
      updatedAt: "2026-08-10T00:01:00.000Z",
    };
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const api = createSpeakerApi("", "org-1", "event-1", async (input, init) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      switch (calls.length) {
        case 1:
          return Response.json({
            data: {
              asset: pendingAsset,
              grant: {
                method: "PUT",
                url: "/api/speaker/assets/capabilities/upload/asset-headshot-v2/opaque-token",
                headers: { "content-type": "image/png" },
                expiresAt: "2026-08-10T00:05:00.000Z",
              },
            },
          });
        case 2:
          return new Response(null, { status: 204 });
        case 3:
          return Response.json({ data: finalizedAsset });
        default:
          return Response.json({ data: profile });
      }
    });
    if (api.replaceHeadshot === undefined)
      throw new Error("Expected organizer headshot replacement.");

    const replacement = await api.replaceHeadshot({
      participantId: "participant-1",
      file: new File(["ok"], "speaker.png", { type: "image/png" }),
      expectedVersion: 3,
    });

    expect(replacement).toEqual({ asset: finalizedAsset, profile });
    expect(calls.map(({ input }) => String(input))).toEqual([
      "/api/speaker/events/event-1/organizer/profiles/participant-1/headshot",
      "/api/speaker/assets/capabilities/upload/asset-headshot-v2/opaque-token",
      "/api/speaker/events/event-1/organizer/assets/asset-headshot-v2/finalize",
      "/api/speaker/events/event-1/organizer/profiles/participant-1",
    ]);
    expect(calls[1]?.init).toMatchObject({ method: "PUT", credentials: "omit" });
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({
      headshotAssetId: "asset-headshot-v2",
      expectedVersion: 3,
    });
  });
  it("rejects provider upload URLs outside the same-origin API gateway", async () => {
    const api = createSpeakerApi("", "org-1", "event-1", async () =>
      Response.json({
        data: {
          asset: {
            id: "asset-headshot-v2",
            eventId: "event-1",
            participantId: "participant-1",
            kind: "headshot",
            fileName: "speaker.png",
            contentType: "image/png",
            sizeBytes: 2,
            state: "pending_upload",
            createdAt: "2026-08-10T00:00:00.000Z",
          },
          grant: {
            method: "PUT",
            url: "https://uploads.example.test/headshot",
            headers: { "content-type": "image/png" },
            expiresAt: "2026-08-10T00:05:00.000Z",
          },
        },
      }),
    );
    if (api.replaceHeadshot === undefined)
      throw new Error("Expected organizer headshot replacement.");

    await expect(
      api.replaceHeadshot({
        participantId: "participant-1",
        file: new File(["ok"], "speaker.png", { type: "image/png" }),
        expectedVersion: 3,
      }),
    ).rejects.toThrow("same-origin /api/* path");
  });
  it("posts an idempotent manual speaker with status and logistics metadata", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const api = createSpeakerApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async (input, init) => {
        calls.push({ input, ...(init === undefined ? {} : { init }) });
        return new Response(JSON.stringify({ data: roster }), { status: 201 });
      },
    );

    await api.create({
      idempotencyKey: "manual-speaker-once",
      displayName: "Priya Raman",
      email: "priya@example.test",
      jobTitle: "Principal Engineer",
      company: "Latticework Systems",
      biography: "Bio",
      socialLinks: {},
      travelLogistics: {
        travelRequired: true,
        arrivalAt: "2027-03-30",
        departureAt: "2027-04-03",
        accommodation: "Conference hotel",
      },
      status: "confirmed",
    });

    expect(String(calls[0]?.input)).toBe(
      "https://api.example.test/api/admin/organizations/org-1/events/event-1/speakers",
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      idempotencyKey: "manual-speaker-once",
      displayName: "Priya Raman",
      status: "confirmed",
      travelLogistics: {
        travelRequired: true,
        arrivalAt: "2027-03-30",
        departureAt: "2027-04-03",
        accommodation: "Conference hotel",
      },
    });
  });
  it("posts the canonical organizer download route and returns its grant URL", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const api = createSpeakerApi(
      "https://api.example.test",
      "org/1",
      "event/1",
      async (input, init) => {
        calls.push({ input, ...(init === undefined ? {} : { init }) });
        return new Response(
          JSON.stringify({
            data: {
              url: "https://downloads.example.test/grant",
              expiresAt: "2026-08-10T12:02:00.000Z",
            },
          }),
          { status: 200 },
        );
      },
    );

    const grant = await api.getDownloadGrant("asset/1");

    expect(grant.url).toBe("https://downloads.example.test/grant");
    expect(String(calls[0]?.input)).toBe(
      "https://api.example.test/api/speaker/events/event%2F1/organizer/assets/asset%2F1/download",
    );
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
    expect(calls[0]?.init?.body).toBeUndefined();
  });
  it("redacts list-returned asset grants until an organizer explicitly requests one", async () => {
    const api = createSpeakerApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                ...readyAsset,
                downloadUrl: "https://downloads.example.test/legacy-grant",
              },
            ],
          }),
          { status: 200 },
        ),
    );

    await expect(api.getAssets("participant-1")).resolves.toEqual([
      { ...readyAsset, downloadUrl: null },
    ]);
  });

  it("sends versioned profile edits, multi-speaker tasks, progress reads, and invitations", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      const path = String(input);
      if (path.includes("/speaker-tasks")) {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              data: {
                organizationId: "org-1",
                eventId: "event-1",
                speakerProfileId: "",
                tasks: [
                  task,
                  {
                    ...task,
                    taskId: "task-1:participant-2",
                    participantId: "participant-2",
                  },
                ],
              },
            }),
            { status: 201 },
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              organizationId: "org-1",
              eventId: "event-1",
              speakerProfileId: "participant-1",
              tasks: [task],
            },
          }),
          { status: 200 },
        );
      }
      if (path.endsWith("/invitations/preview")) {
        return new Response(
          JSON.stringify({
            data: [
              { participantId: "participant-1", recipientEmail: speaker.email, state: "ready" },
            ],
          }),
          { status: 200 },
        );
      }
      if (path.endsWith("/invitations/send")) {
        return new Response(
          JSON.stringify({
            data: {
              organizationId: "org-1",
              eventId: "event-1",
              idempotencyKey: "invite-once",
              status: "queued",
              duplicate: false,
              recipients: [
                {
                  participantId: "participant-1",
                  recipientEmail: speaker.email,
                  status: "queued",
                  receiptId: null,
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: speaker }), { status: 200 });
    };
    const api = createSpeakerApi("https://api.example.test", "org-1", "event-1", fetcher);

    await api.update("participant-1", {
      expectedVersion: 3,
      displayName: speaker.displayName,
      email: speaker.email,
      jobTitle: speaker.jobTitle ?? "",
      company: speaker.company ?? "",
      biography: speaker.biography,
      socialLinks: speaker.socialLinks,
      travelLogistics: {
        travelRequired: true,
        arrivalAt: "2027-03-30",
        departureAt: "2027-04-03",
        accommodation: "Conference hotel",
        dietaryRequirements: "Vegan",
        accessibilityNeeds: "Step-free access",
        travelNotes: "Arrives after 18:00",
      },
      status: "confirmed",
    });
    await api.assignTasks({
      title: task.title,
      description: task.description,
      dueAt: task.dueAt ?? "",
      participantIds: ["participant-1", "participant-2"],
    });
    await api.listTasks("participant-1");
    await api.previewInvitations({ participantIds: ["participant-1"] });
    await api.sendInvitations({
      participantIds: ["participant-1"],
      templateId: "speaker-welcome",
      idempotencyKey: "invite-once",
    });

    expect(String(calls[0]?.input)).toContain("/speakers/participant-1");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      expectedVersion: 3,
      jobTitle: "Principal Engineer",
      travelLogistics: {
        travelRequired: true,
        arrivalAt: "2027-03-30",
        departureAt: "2027-04-03",
        accommodation: "Conference hotel",
      },
    });
    expect(String(calls[1]?.input)).toContain("/speaker-tasks");
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      participantIds: ["participant-1", "participant-2"],
    });
    expect(String(calls[2]?.input)).toContain("/speaker-tasks?participantId=participant-1");
    expect(String(calls[3]?.input)).toContain("/speakers/invitations/preview");
    expect(JSON.parse(String(calls[4]?.init?.body))).toMatchObject({
      templateId: "speaker-welcome",
      idempotencyKey: "invite-once",
    });
  });

  it("rejects invitation receipts without recipient delivery results", async () => {
    const api = createSpeakerApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async () =>
        new Response(
          JSON.stringify({
            data: {
              organizationId: "org-1",
              eventId: "event-1",
              idempotencyKey: "invite-invalid",
              status: "queued",
              duplicate: false,
            },
          }),
          { status: 200 },
        ),
    );

    await expect(
      api.sendInvitations({
        participantIds: ["participant-1"],
        templateId: "speaker-welcome",
        idempotencyKey: "invite-invalid",
      }),
    ).rejects.toThrow("The invitation result is invalid.");
  });
  it("surfaces server conflicts and rejects missing tenant scope", async () => {
    const api = createSpeakerApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async () =>
        new Response(JSON.stringify({ error: { code: "CONFLICT", message: "stale profile" } }), {
          status: 409,
        }),
    );
    await expect(
      api.update("participant-1", {
        expectedVersion: 3,
        displayName: "Priya Raman",
        email: "priya@example.test",
        jobTitle: "Principal Engineer",
        company: "Latticework Systems",
        biography: "Bio",
        socialLinks: {},
        status: "confirmed",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(() => createSpeakerApi("https://api.example.test", " ", "event-1")).toThrow(
      "organization ID is required",
    );
    expect(() => createSpeakerApi("https://api.example.test", "org-1", " ")).toThrow(
      "event ID is required",
    );
  });
});

describe("speaker workspace contracts", () => {
  it("applies exact roster and progress filters, including zero-task speakers as incomplete", () => {
    const secondSpeaker: SpeakerRecord = {
      ...speaker,
      participantId: "participant-2",
      displayName: "Marcus Chen",
      email: "marcus@example.test",
      status: "invited",
      sessions: [{ submissionId: "session-2", title: "Reliable queues", status: "accepted" }],
      taskSummary: { total: 0, completed: 0, overdue: 0 },
    };
    const completedTask: SpeakerTask = {
      ...task,
      status: "completed",
      completedAt: "2026-08-10T00:00:00.000Z",
    };
    const rows = [
      {
        participantId: speaker.participantId,
        displayName: speaker.displayName,
        tasks: [completedTask],
      },
      {
        participantId: secondSpeaker.participantId,
        displayName: secondSpeaker.displayName,
        tasks: [],
      },
    ];

    expect(speakerProgressMatches([completedTask], "complete")).toBe(true);
    expect(speakerProgressMatches([], "complete")).toBe(false);
    expect(speakerProgressMatches([], "incomplete")).toBe(true);
    expect(
      filterSpeakerRoster([speaker, secondSpeaker], rows, {
        query: " marcus ",
        status: "invited",
        session: "session-2",
        progress: "incomplete",
      }).map((candidate) => candidate.participantId),
    ).toEqual(["participant-2"]);
    expect(
      filterSpeakerRoster([speaker, secondSpeaker], rows, {
        query: "",
        status: "all",
        session: "all",
        progress: "complete",
      }).map((candidate) => candidate.participantId),
    ).toEqual(["participant-1"]);
  });

  it("reconstructs three API-loaded onboarding definitions with exact assignees and dates", () => {
    const tasks: SpeakerTask[] = [
      { ...task, taskId: "definition-1:participant-1", participantId: "participant-1" },
      { ...task, taskId: "definition-1:participant-2", participantId: "participant-2" },
      {
        ...task,
        taskId: "definition-2",
        title: "Review biography",
        dueAt: "2027-04-05",
      },
      {
        ...task,
        taskId: "definition-3",
        title: "Confirm logistics",
        dueAt: "2027-04-09",
      },
      {
        ...task,
        taskId: "file-request-1",
        title: "Upload slides",
        description: "A deliverable task.",
        type: "file_request",
      },
    ];
    const definitions = speakerOnboardingTaskDefinitions([
      {
        participantId: "participant-1",
        displayName: "Priya Raman",
        tasks: tasks.filter((candidate) => candidate.participantId === "participant-1"),
      },
      {
        participantId: "participant-2",
        displayName: "Marcus Chen",
        tasks: tasks.filter((candidate) => candidate.participantId === "participant-2"),
      },
    ]);

    expect(definitions).toEqual([
      {
        definitionId: "definition-1",
        title: "Confirm participation",
        dueAt: "2027-04-01",
        participantIds: ["participant-1", "participant-2"],
      },
      {
        definitionId: "definition-2",
        title: "Review biography",
        dueAt: "2027-04-05",
        participantIds: ["participant-1"],
      },
      {
        definitionId: "definition-3",
        title: "Confirm logistics",
        dueAt: "2027-04-09",
        participantIds: ["participant-1"],
      },
    ]);
    expect(
      validateSpeakerTaskAssignment(
        { title: "Fourth", dueAt: "2027-04-10", participantIds: ["participant-1"] },
        definitions.length,
      ),
    ).toContain("Exactly 3");
    expect(
      createSpeakerTaskAssignment({
        title: " Confirm logistics ",
        dueAt: " 2027-04-09 ",
        participantIds: ["participant-1", "participant-1", " participant-2 "],
      }),
    ).toMatchObject({
      title: "Confirm logistics",
      dueAt: "2027-04-09",
      participantIds: ["participant-1", "participant-2"],
    });
  });

  it("maps logistics fields and retains terminal invitation results without replacing history", () => {
    expect(
      travelLogisticsFor({
        displayName: "Priya Raman",
        email: "priya@example.test",
        title: "Principal Engineer",
        company: "Latticework Systems",
        biography: "Bio",
        twitter: "",
        linkedin: "",
        website: "",
        status: "confirmed",
        travelRequired: true,
        arrivalAt: " 2027-03-30 ",
        departureAt: "2027-04-03",
        accommodation: " Conference hotel ",
        dietaryRequirements: " Vegan ",
        accessibilityNeeds: " Step-free access ",
        travelNotes: " Arrives after 18:00 ",
      }),
    ).toEqual({
      travelRequired: true,
      arrivalAt: "2027-03-30",
      departureAt: "2027-04-03",
      accommodation: "Conference hotel",
      dietaryRequirements: "Vegan",
      accessibilityNeeds: "Step-free access",
      travelNotes: "Arrives after 18:00",
    });

    const preview = [
      {
        participantId: "participant-1",
        recipientEmail: "priya@example.test",
        state: "ready" as const,
      },
    ];
    const readyPreview = preview[0];
    if (readyPreview === undefined) throw new Error("Expected a ready invitation preview.");
    expect(speakerInvitationReady(preview, speaker)).toBe(true);
    expect(speakerInvitationReady(preview, { ...speaker, email: "changed@example.test" })).toBe(
      false,
    );
    expect(speakerInvitationReady([{ ...readyPreview, state: "blocked" }], speaker)).toBe(false);
    expect(speakerInvitationReady(preview, { ...speaker, status: "revoked" })).toBe(false);
    const first = retainInvitationHistory(
      [],
      preview,
      {
        organizationId: "org-1",
        eventId: "event-1",
        idempotencyKey: "invite-1",
        status: "sent",
        duplicate: false,
        recipients: [
          {
            participantId: "participant-1",
            recipientEmail: "priya@example.test",
            status: "sent",
            receiptId: "receipt-1",
          },
        ],
      },
      "2026-08-11T10:00:00.000Z",
    );
    const second = retainInvitationHistory(
      first,
      preview,
      {
        organizationId: "org-1",
        eventId: "event-1",
        idempotencyKey: "invite-2",
        status: "failed",
        duplicate: false,
        recipients: [
          {
            participantId: "participant-1",
            recipientEmail: "priya@example.test",
            status: "failed",
            receiptId: null,
          },
        ],
      },
      "2026-08-11T11:00:00.000Z",
    );

    expect(second.map((entry) => entry.result.status)).toEqual(["failed", "sent"]);
    expect(second[1]?.occurredAt).toBe("2026-08-11T10:00:00.000Z");
  });
});

describe("speaker workspace", () => {
  it("validates organizer headshots at the browser boundary", () => {
    expect(
      validateOrganizerHeadshotFile(new File(["ok"], "headshot.jpg", { type: "image/jpeg" })),
    ).toBe(null);
    expect(
      validateOrganizerHeadshotFile(new File(["ok"], "headshot.png", { type: "IMAGE/PNG" })),
    ).toBeNull();
    expect(
      validateOrganizerHeadshotFile(new File(["bad"], "headshot.gif", { type: "image/gif" })),
    ).toContain("JPEG, PNG, or WebP");
    expect(
      validateOrganizerHeadshotFile(
        new File([new Uint8Array(ORGANIZER_HEADSHOT_MAX_BYTES + 1)], "large.webp", {
          type: ORGANIZER_HEADSHOT_ACCEPTED_TYPES[2],
        }),
      ),
    ).toContain("5 MB");
  });

  it("accepts only relative same-origin API paths for headshot previews", () => {
    expect(
      organizerHeadshotPreviewPath(
        "/api/speaker/assets/capabilities/download/asset-headshot/opaque-token",
      ),
    ).toBe("/api/speaker/assets/capabilities/download/asset-headshot/opaque-token");
    expect(organizerHeadshotPreviewPath("https://downloads.example.test/headshot")).toBeNull();
    expect(organizerHeadshotPreviewPath("//downloads.example.test/headshot")).toBeNull();
    expect(organizerHeadshotPreviewPath("/api/../private/headshot")).toBeNull();
  });

  it("renders a secure headshot preview and a graceful unavailable fallback", () => {
    const imageMarkup = renderToStaticMarkup(
      createElement(SpeakerHeadshot, {
        speakerName: speaker.displayName,
        asset: headshotAsset,
        imageUrl: "/api/speaker/events/event-1/organizer/assets/asset-headshot/download",
        loading: false,
        error: null,
        revision: 2,
      }),
    );
    const externalMarkup = renderToStaticMarkup(
      createElement(SpeakerHeadshot, {
        speakerName: speaker.displayName,
        asset: headshotAsset,
        imageUrl: "https://downloads.example.test/headshot",
        loading: false,
        error: null,
        revision: 2,
      }),
    );
    const fallbackMarkup = renderToStaticMarkup(
      createElement(SpeakerHeadshot, {
        speakerName: speaker.displayName,
        asset: null,
        imageUrl: null,
        loading: false,
        error: null,
        revision: 0,
      }),
    );

    expect(imageMarkup).toContain('alt="Priya Raman headshot"');
    expect(imageMarkup).toContain(
      "/api/speaker/events/event-1/organizer/assets/asset-headshot/download",
    );
    expect(fallbackMarkup).toContain("No headshot uploaded");
    expect(fallbackMarkup).not.toContain("<img");
    expect(externalMarkup).toContain("Headshot preview unavailable");
    expect(externalMarkup).not.toContain("<img");
  });
  it("does not request a grant on initial asset render and keeps non-ready assets unavailable", () => {
    const requests: SpeakerAsset[] = [];
    const readyMarkup = renderToStaticMarkup(
      createElement(SpeakerAssetDownload, {
        asset: readyAsset,
        downloadUrl: null,
        busy: false,
        disabled: false,
        error: null,
        onRequest: (asset: SpeakerAsset) => requests.push(asset),
      }),
    );
    const pendingMarkup = renderToStaticMarkup(
      createElement(SpeakerAssetDownload, {
        asset: pendingAsset,
        downloadUrl: null,
        busy: false,
        disabled: false,
        error: null,
        onRequest: (asset: SpeakerAsset) => requests.push(asset),
      }),
    );

    expect(requests).toHaveLength(0);
    expect(readyMarkup).toContain("Download / view");
    expect(readyMarkup).toContain("<button");
    expect(pendingMarkup).toContain("Download is not available for this asset.");
    expect(pendingMarkup).not.toContain("<button");
  });
  it("renders organizer asset metadata and keeps preview separate from invitation send", () => {
    const metadata = renderToStaticMarkup(
      createElement(SpeakerAssetMetadata, { asset: readyAsset }),
    );
    const controls = renderToStaticMarkup(
      createElement(SpeakerInvitationControls, {
        previewBusy: false,
        sendBusy: false,
        disabled: false,
        canSend: false,
        onPreview: () => undefined,
        onSend: () => undefined,
      }),
    );

    expect(metadata).toContain("application/pdf");
    expect(metadata).toContain("1 KB");
    expect(metadata).toContain("Ready");
    expect(metadata).toContain("Aug 9, 2026");
    expect(controls).toContain("Preview portal invite");
    expect(controls).toContain("Send portal invite");
    expect(controls.match(/<button/g)).toHaveLength(2);
    expect(controls.match(/disabled=""/g)).toHaveLength(1);
  });

  it("requests exactly one grant when the ready-asset button is clicked", () => {
    const requests: SpeakerAsset[] = [];
    const rendered = SpeakerAssetDownload({
      asset: readyAsset,
      downloadUrl: null,
      busy: false,
      disabled: false,
      error: null,
      onRequest: (asset) => requests.push(asset),
    });
    const fragment = rendered as {
      props?: {
        children?: unknown;
      };
    };
    const children = Array.isArray(fragment.props?.children)
      ? fragment.props.children
      : [fragment.props?.children];
    const button = children.find(
      (child): child is { props: { onClick?: () => void; type?: string } } =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        (child as { props?: { type?: string } }).props?.type === "button",
    );
    const onClick = button?.props.onClick;
    if (onClick === undefined) throw new Error("Expected a ready-asset download button.");
    onClick();

    expect(requests).toEqual([readyAsset]);
  });
  it("renders the roster controls and keeps private storage fields out of the UI", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeakerWorkspace, {
        organizationId: "org-1",
        eventId: "event-1",
      }),
    );

    expect(markup).toContain("Speaker roster");
    expect(markup).toContain("Search speakers");
    expect(markup).toContain("Add speaker");
    expect(markup).toContain("Import speakers from CSV");
    expect(markup).toContain("General speaker tasks");
    expect(markup).toContain("Onboarding progress");
    expect(markup).not.toContain("objectKey");
  });

  it("keeps duplicate authoritative speakers visible to conflict presentation", () => {
    const duplicate = {
      ...speaker,
      participantId: "participant-2",
      displayName: "Marcus Chen",
      email: " PRIYA@EXAMPLE.TEST ",
    };
    const conflicts = duplicateEmailConflicts([speaker, duplicate]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.email).toBe("priya@example.test");
    expect(conflicts[0]?.speakers.map((candidate) => candidate.participantId)).toEqual([
      "participant-1",
      "participant-2",
    ]);
  });

  it("renders independently recoverable CSV and bulk-email action controls", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeakerWorkspace, {
        organizationId: "org-1",
        eventId: "event-1",
        api: {} as SpeakerApi,
      }),
    );

    expect(markup).toContain("Import speakers from CSV");
    expect(markup).toContain("Preview merge");
    expect(markup).toContain("Queue speaker email");
    expect(markup).toContain('aria-label="Refresh speaker email history"');
    expect(markup).toContain("Refresh email history");
    const csvInput = markup.match(/<input[^>]*accept="\.csv,text\/csv"[^>]*>/u)?.[0] ?? "";
    expect(csvInput).not.toContain("disabled");
  });
});
