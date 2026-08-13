import { expect, type Page, type Request, type Route } from "@playwright/test";
import { E2E_SESSION_COOKIE, type E2eAuthSession } from "./auth";

export interface PortalSubmissionSeed {
  id: string;
  eventId: string;
  title: string;
  status: "draft" | "submitted" | "under_review" | "accepted" | "declined" | "withdrawn";
  participantIds: string[];
  updatedAt: string;
}

export interface PortalProfileSeed {
  id: string;
  eventId: string;
  participantId: string;
  displayName: string;
  biography: string;
  headshotAssetId?: string;
  version: number;
  updatedAt: string;
}

export interface PortalTaskSeed {
  id: string;
  eventId: string;
  submissionId: string;
  participantId: string;
  type: "form" | "upload" | "action";
  owner: "speaker" | "organizer";
  title: string;
  description?: string;
  status:
    | "not_started"
    | "in_progress"
    | "submitted"
    | "needs_changes"
    | "completed"
    | "waived"
    | "overdue"
    | "reopened";
  dueAt?: string;
  dependencyIds: string[];
  reminderOffsetsMinutes: number[];
  acceptedAssetKinds?: Array<"headshot" | "slides" | "supporting_file">;
  version: number;
  updatedAt: string;
}

export type PortalCapabilitySeed =
  | "profile-self"
  | "submission-edit"
  | "roster-manage"
  | "task-response"
  | "asset-read"
  | "asset-write"
  | "asset-comment"
  | "resource-read";

export interface PortalContextSeed {
  id: string;
  eventId: string;
  name: string;
  slug?: string;
  status?: string;
  capabilities: PortalCapabilitySeed[];
  submissionIds: string[];
  participantIds: string[];
  primaryParticipantId?: string;
}

export interface PortalRosterMemberSeed {
  participantId: string;
  displayName: string;
  email: string | null;
  role: "primary" | "co_speaker";
  status: "pending" | "active" | "revoked";
  capabilities: {
    edit: boolean;
    remove: boolean;
  };
}

export interface PortalRosterEnvelopeSeed {
  organizationId: string;
  eventId: string;
  submissionId: string;
  capabilities: {
    manage: boolean;
    invite: boolean;
  };
  members: PortalRosterMemberSeed[];
}

export interface PortalAssetSeed {
  id: string;
  eventId: string;
  submissionId?: string;
  participantId: string;
  taskId?: string;
  kind: "headshot" | "slides" | "supporting_file";
  fileName: string;
  contentType: string;
  sizeBytes: number;
  state: "pending_upload" | "ready" | "rejected";
  createdAt: string;
  version?: number;
  versionFamilyId?: string;
  supersedesAssetId?: string;
  commentThreadId?: string;
  rejectionReason?: string;
  finalizedAt?: string;
}

interface PortalAssetRecord extends PortalAssetSeed {
  objectKey: string;
  privateNote?: string;
  uploaded: boolean;
}

export interface PortalAssetCommentSeed {
  id: string;
  assetId: string;
  body: string;
  authorLabel: string;
  createdAt: string;
  updatedAt?: string;
  version?: number;
}

export interface PortalResourceSeed {
  id: string;
  title: string;
  summary?: string;
  html?: string;
  url?: string;
  order: number;
  updatedAt: string;
}

export interface PortalWikiPageSeed extends PortalResourceSeed {
  slug?: string;
}

export interface PortalFormFieldSeed {
  id: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "rich_text"
    | "email"
    | "url"
    | "number"
    | "date"
    | "select"
    | "multiselect"
    | "checkbox"
    | "boolean"
    | "file_request";
  required: boolean;
  options: Array<{ value: string; label: string }>;
}

export type PortalFormAnswerSeed = string | number | boolean | string[] | null;

export interface PortalTaskResponseSeed {
  responseId: string;
  definitionVersion: number;
  answers: Record<string, PortalFormAnswerSeed>;
  submittedAt: string | null;
  status: "draft" | "submitted" | "needs_changes" | "reopened";
  organizerFeedback: string | null;
}

export interface PortalTaskFormSeed {
  taskId: string;
  definitionVersion: number;
  title: string;
  description: string;
  status: PortalTaskSeed["status"];
  fields: PortalFormFieldSeed[];
  latestResponse: PortalTaskResponseSeed | null;
}

export interface PortalTaskResponseEnvelopeSeed {
  organizationId: string;
  eventId: string;
  taskId: string;
  participantId: string;
  latestResponse: PortalTaskResponseSeed | null;
  history: PortalTaskResponseSeed[];
}

export interface PortalViewSeed {
  submissions: PortalSubmissionSeed[];
  profiles: PortalProfileSeed[];
  tasks: PortalTaskSeed[];
  outstandingTaskCount: number;
  context?: PortalContextSeed;
  capabilities?: PortalCapabilitySeed[];
  roster?: PortalRosterEnvelopeSeed;
  assets?: PortalAssetSeed[];
  resources?: PortalResourceSeed[];
  wiki?: PortalWikiPageSeed[];
}

interface PortalScenarioState {
  context: PortalContextSeed;
  submissions: PortalSubmissionSeed[];
  profiles: PortalProfileSeed[];
  tasks: PortalTaskSeed[];
  rosters: Record<string, PortalRosterEnvelopeSeed>;
  assets: PortalAssetRecord[];
  comments: Record<string, PortalAssetCommentSeed[]>;
  forms: Record<string, PortalTaskFormSeed>;
  responses: Record<string, PortalTaskResponseEnvelopeSeed>;
  resources: PortalResourceSeed[];
  wiki: PortalWikiPageSeed[];
  nextAssetNumber: number;
  nextParticipantNumber: number;
  nextCommentNumber: number;
  nextResponseNumber: number;
}

export interface PortalApiOptions {
  expiredDownloadAssetId?: string;
}

export interface PortalApiHarness {
  requests: Request[];
  /** The currently selected public portal DTO, updated after context or mutations. */
  view: PortalViewSeed;
  /** Public `{data}` payloads returned by the harness; server-only fields never enter this list. */
  payloads: unknown[];
}

const organizationId = "ai-engineer";
const now = "2026-08-09T00:00:00.000Z";
const later = "2026-08-09T01:00:00.000Z";
const allCapabilities: PortalCapabilitySeed[] = [
  "profile-self",
  "submission-edit",
  "roster-manage",
  "task-response",
  "asset-read",
  "asset-write",
  "asset-comment",
  "resource-read",
];

const evaluatorContext: PortalContextSeed = {
  id: "portal:ai-engineer:event-evaluator",
  eventId: "event-evaluator",
  name: "Evaluator Summit",
  slug: "evaluator-2026",
  status: "published",
  capabilities: allCapabilities,
  submissionIds: ["submission-evaluator"],
  participantIds: ["participant-ada"],
  primaryParticipantId: "participant-ada",
};

const collaborationContext: PortalContextSeed = {
  id: "portal:ai-engineer:event-collaboration",
  eventId: "event-collaboration",
  name: "Collaborative Systems Summit",
  slug: "collaboration-2026",
  status: "published",
  capabilities: ["profile-self", "asset-read", "resource-read"],
  submissionIds: ["submission-collaboration"],
  participantIds: ["participant-bea"],
  primaryParticipantId: "participant-bea",
};

function initialEvaluatorState(): PortalScenarioState {
  const assets: PortalAssetRecord[] = [
    {
      id: "asset-slides-v1",
      eventId: evaluatorContext.eventId,
      submissionId: "submission-evaluator",
      participantId: "participant-ada",
      kind: "slides",
      fileName: "calm-incident-response.pdf",
      contentType: "application/pdf",
      sizeBytes: 32_768,
      state: "ready",
      createdAt: now,
      version: 1,
      versionFamilyId: "asset-family-slides",
      commentThreadId: "asset-comments:asset-family-slides",
      finalizedAt: now,
      objectKey: "ai-engineer/event-evaluator/participant-ada/asset-slides-v1",
      privateNote: "Organizer-only malware scan receipt",
      uploaded: true,
    },
  ];
  return {
    context: structuredClone(evaluatorContext),
    submissions: [
      {
        id: "submission-evaluator",
        eventId: evaluatorContext.eventId,
        title: "Designing calm incident response",
        status: "accepted",
        participantIds: ["participant-ada"],
        updatedAt: now,
      },
    ],
    profiles: [
      {
        id: "profile-ada",
        eventId: evaluatorContext.eventId,
        participantId: "participant-ada",
        displayName: "Ada Speaker",
        biography: "Staff engineer and resilient-systems educator.",
        version: 3,
        updatedAt: now,
      },
    ],
    tasks: [
      {
        id: "task-agreement",
        eventId: evaluatorContext.eventId,
        submissionId: "submission-evaluator",
        participantId: "participant-ada",
        type: "action",
        owner: "speaker",
        title: "Confirm speaker agreement",
        description: "Read and confirm the event speaker agreement.",
        status: "not_started",
        dueAt: "2026-08-20T12:00:00.000Z",
        dependencyIds: [],
        reminderOffsetsMinutes: [1440],
        version: 1,
        updatedAt: now,
      },
      {
        id: "task-headshot",
        eventId: evaluatorContext.eventId,
        submissionId: "submission-evaluator",
        participantId: "participant-ada",
        type: "upload",
        owner: "speaker",
        title: "Upload a headshot",
        description: "Upload a program-ready portrait.",
        status: "not_started",
        dueAt: "2026-08-22T12:00:00.000Z",
        dependencyIds: ["task-agreement"],
        reminderOffsetsMinutes: [1440],
        acceptedAssetKinds: ["headshot"],
        allowedMimeTypes: ["image/png"],
        maxBytes: 5_000_000,
        version: 1,
        updatedAt: now,
      },
      {
        id: "task-speaker-details",
        eventId: evaluatorContext.eventId,
        submissionId: "submission-evaluator",
        participantId: "participant-ada",
        type: "form",
        owner: "speaker",
        title: "Share speaker details",
        description: "Tell the event team how to introduce your session.",
        status: "in_progress",
        dependencyIds: [],
        reminderOffsetsMinutes: [1440],
        version: 1,
        updatedAt: now,
      },
    ],
    rosters: {
      "submission-evaluator": {
        organizationId,
        eventId: evaluatorContext.eventId,
        submissionId: "submission-evaluator",
        capabilities: { manage: true, invite: true },
        members: [
          {
            participantId: "participant-ada",
            displayName: "Ada Speaker",
            email: null,
            role: "primary",
            status: "active",
            capabilities: { edit: true, remove: false },
          },
          {
            participantId: "participant-grace",
            displayName: "Grace Co-speaker",
            email: "grace@example.test",
            role: "co_speaker",
            status: "active",
            capabilities: { edit: true, remove: true },
          },
        ],
      },
    },
    assets,
    comments: {
      "asset-slides-v1": [
        {
          id: "comment-slides-1",
          assetId: "asset-slides-v1",
          body: "The current deck is ready for the program team.",
          authorLabel: "Event team",
          createdAt: now,
          version: 1,
        },
      ],
    },
    forms: {
      "task-speaker-details": {
        taskId: "task-speaker-details",
        definitionVersion: 2,
        title: "Speaker details",
        description: "Tell us about your session.",
        status: "in_progress",
        fields: [
          {
            id: "bio",
            label: "Biography",
            type: "textarea",
            required: true,
            options: [],
          },
          {
            id: "track",
            label: "Track",
            type: "select",
            required: true,
            options: [
              { value: "web", label: "Web" },
              { value: "systems", label: "Systems" },
            ],
          },
        ],
        latestResponse: null,
      },
    },
    responses: {
      "task-speaker-details": {
        organizationId,
        eventId: evaluatorContext.eventId,
        taskId: "task-speaker-details",
        participantId: "participant-ada",
        latestResponse: null,
        history: [],
      },
    },
    resources: [
      {
        id: "resource-speaker-guide",
        title: "Speaker guide",
        summary: "Everything you need before event day.",
        url: "https://sessionboard.namuh.co/speakers/guide",
        order: 1,
        updatedAt: now,
      },
      {
        id: "resource-production-checklist",
        title: "Production checklist",
        html: "<p>Bring your final slides and arrive ten minutes early.</p>",
        order: 2,
        updatedAt: now,
      },
    ],
    wiki: [
      {
        id: "wiki-evaluator-welcome",
        slug: "welcome",
        title: "Welcome to Evaluator Summit",
        summary: "Published event guidance.",
        html: "<p>Use the green room channel for event-day coordination.</p>",
        order: 1,
        updatedAt: now,
      },
    ],
    nextAssetNumber: 1,
    nextParticipantNumber: 1,
    nextCommentNumber: 2,
    nextResponseNumber: 1,
  };
}

function initialCollaborationState(): PortalScenarioState {
  return {
    context: structuredClone(collaborationContext),
    submissions: [
      {
        id: "submission-collaboration",
        eventId: collaborationContext.eventId,
        title: "Designing safer distributed changes",
        status: "accepted",
        participantIds: ["participant-bea"],
        updatedAt: now,
      },
    ],
    profiles: [
      {
        id: "profile-bea",
        eventId: collaborationContext.eventId,
        participantId: "participant-bea",
        displayName: "Bea Speaker",
        biography: "Platform engineer and systems facilitator.",
        version: 1,
        updatedAt: now,
      },
    ],
    tasks: [],
    rosters: {
      "submission-collaboration": {
        organizationId,
        eventId: collaborationContext.eventId,
        submissionId: "submission-collaboration",
        capabilities: { manage: false, invite: false },
        members: [
          {
            participantId: "participant-bea",
            displayName: "Bea Speaker",
            email: null,
            role: "primary",
            status: "active",
            capabilities: { edit: false, remove: false },
          },
        ],
      },
    },
    assets: [],
    comments: {},
    forms: {},
    responses: {},
    resources: [
      {
        id: "resource-collaboration-guide",
        title: "Collaboration guide",
        summary: "Published guidance for the collaboration event.",
        order: 1,
        updatedAt: later,
      },
    ],
    wiki: [
      {
        id: "wiki-collaboration-welcome",
        slug: "welcome",
        title: "Collaboration wiki",
        html: "<p>Coordinate with your co-speakers in the event workspace.</p>",
        order: 1,
        updatedAt: later,
      },
    ],
    nextAssetNumber: 1,
    nextParticipantNumber: 1,
    nextCommentNumber: 1,
    nextResponseNumber: 1,
  };
}

function cloneScenarios(): PortalScenarioState[] {
  return [initialEvaluatorState(), initialCollaborationState()].map((state) =>
    structuredClone(state),
  );
}

function outstandingTaskCount(tasks: readonly PortalTaskSeed[]): number {
  return tasks.filter((task) => task.status !== "completed" && task.status !== "waived").length;
}

function publicAsset(asset: PortalAssetRecord): PortalAssetSeed {
  const { objectKey: _objectKey, privateNote: _privateNote, uploaded: _uploaded, ...safe } = asset;
  return safe;
}

function publicRoster(roster: PortalRosterEnvelopeSeed): PortalRosterEnvelopeSeed {
  return structuredClone(roster);
}

function publicView(state: PortalScenarioState): PortalViewSeed {
  const accepted = state.submissions.find((submission) => submission.status === "accepted");
  const roster = accepted === undefined ? undefined : state.rosters[accepted.id];
  return {
    submissions: structuredClone(state.submissions),
    profiles: structuredClone(state.profiles),
    tasks: structuredClone(state.tasks),
    outstandingTaskCount: outstandingTaskCount(state.tasks),
    context: structuredClone(state.context),
    capabilities: [...state.context.capabilities],
    ...(roster === undefined || !state.context.capabilities.includes("roster-manage")
      ? {}
      : { roster: publicRoster(roster) }),
    ...(state.context.capabilities.includes("asset-read")
      ? { assets: state.assets.map(publicAsset) }
      : {}),
    ...(state.context.capabilities.includes("resource-read")
      ? { resources: structuredClone(state.resources), wiki: structuredClone(state.wiki) }
      : {}),
  };
}

function contextForEvent(
  scenarios: readonly PortalScenarioState[],
  eventId: string,
): PortalScenarioState | undefined {
  return scenarios.find((scenario) => scenario.context.eventId === eventId);
}

function eventIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/api\/speaker\/events\/([^/]+)/u);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

function errorPayload(
  code: string,
  message: string,
): { error: { code: string; message: string; traceId: string } } {
  return { error: { code, message, traceId: "e2e-portal-trace" } };
}

const webPort = process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3015";
const apiPort = process.env.PLAYWRIGHT_API_PORT?.trim() || "8787";
const e2eApiOrigin = `http://127.0.0.1:${apiPort}`;
const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "accept,content-type",
  "access-control-allow-methods": "GET,PATCH,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-origin": `http://127.0.0.1:${webPort}`,
};

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders,
    body: JSON.stringify({ data: payload }),
  });
}

async function fulfillError(
  route: Route,
  code: string,
  message: string,
  status: number,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders,
    body: JSON.stringify(errorPayload(code, message)),
  });
}

function expectAuthenticated(request: Request, session: E2eAuthSession): void {
  expect(request.headers().cookie).toContain(`${E2E_SESSION_COOKIE}=${session.token}`);
}

function requestBody(request: Request): Record<string, unknown> {
  const body = request.postDataJSON();
  expect(body).toBeDefined();
  expect(typeof body).toBe("object");
  expect(body).not.toBeNull();
  return body as Record<string, unknown>;
}

function stringValue(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  expect(typeof value).toBe("string");
  return value as string;
}

function numberValue(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  expect(typeof value).toBe("number");
  return value as number;
}

export async function installPortalApi(
  page: Page,
  session: E2eAuthSession,
  options: PortalApiOptions = {},
): Promise<PortalApiHarness> {
  const apiOrigin = e2eApiOrigin;
  const scenarios = cloneScenarios();
  let activeScenario = scenarios[0];
  if (!activeScenario) throw new Error("Missing E2E portal scenario");
  const view = publicView(activeScenario);
  const requests: Request[] = [];
  const payloads: unknown[] = [];
  let downloadNumber = 0;

  const send = async (route: Route, payload: unknown, status = 200): Promise<void> => {
    payloads.push(structuredClone(payload));
    await fulfillJson(route, payload, status);
  };

  const notFound = (route: Route, message = "The requested portal resource was not found.") =>
    fulfillError(route, "NOT_FOUND", message, 404);

  const syncView = (state: PortalScenarioState): void => {
    if (state !== activeScenario) return;
    const next = publicView(state);
    view.submissions = next.submissions;
    view.profiles = next.profiles;
    view.tasks = next.tasks;
    view.outstandingTaskCount = next.outstandingTaskCount;
    if (next.context === undefined) delete view.context;
    else view.context = next.context;
    if (next.capabilities === undefined) delete view.capabilities;
    else view.capabilities = next.capabilities;
    if (next.roster === undefined) delete view.roster;
    else view.roster = next.roster;
    if (next.assets === undefined) delete view.assets;
    else view.assets = next.assets;
    if (next.resources === undefined) delete view.resources;
    else view.resources = next.resources;
    if (next.wiki === undefined) delete view.wiki;
    else view.wiki = next.wiki;
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    requests.push(request);
    const url = new URL(request.url());
    const { pathname } = url;

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (pathname.startsWith("/api/auth/")) {
      await route.fallback();
      return;
    }

    const uploadCapability = pathname.match(
      /^\/api\/speaker\/assets\/capabilities\/upload\/([^/]+)\/([^/]+)$/u,
    );
    if (request.method() === "PUT" && uploadCapability) {
      expect(request.headers().cookie).toBeUndefined();
      const assetId = decodeURIComponent(uploadCapability[1] ?? "");
      const asset = scenarios
        .flatMap((scenario) => scenario.assets)
        .find((candidate) => candidate.id === assetId);
      expect(asset).toBeDefined();
      if (!asset) throw new Error("Missing E2E upload asset");
      expect(request.headers()["content-type"]).toBe(asset.contentType);
      asset.uploaded = true;
      syncView(activeScenario);
      await send(
        route,
        {
          contentType: asset.contentType,
          sizeBytes: Number(request.headers()["content-length"] ?? asset.sizeBytes),
          uploadedAt: later,
        },
        201,
      );
      return;
    }

    const downloadCapability = pathname.match(
      /^\/api\/speaker\/assets\/capabilities\/download\/([^/]+)\/([^/]+)$/u,
    );
    if (request.method() === "GET" && downloadCapability) {
      // A top-level navigation may carry the session cookie; the opaque grant remains the sole asset authority.
      const assetId = decodeURIComponent(downloadCapability[1] ?? "");
      const asset = scenarios
        .flatMap((scenario) => scenario.assets)
        .find((candidate) => candidate.id === assetId);
      expect(asset).toBeDefined();
      if (!asset) {
        await fulfillError(route, "NOT_FOUND", "The requested file was not found.", 404);
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          ...corsHeaders,
          "cache-control": "private, no-store",
          "content-disposition": `attachment; filename="${asset.fileName}"`,
          "content-type": asset.contentType,
        },
        body: `opaque-e2e-bytes:${asset.id}`,
      });
      return;
    }

    expectAuthenticated(request, session);

    if (request.method() === "GET" && pathname === "/api/speaker/portal/contexts") {
      await send(
        route,
        scenarios.map((scenario) => structuredClone(scenario.context)),
      );
      return;
    }

    const eventId = eventIdFromPath(pathname);
    const state = eventId === undefined ? undefined : contextForEvent(scenarios, eventId);

    if (request.method() === "GET" && pathname.endsWith("/portal/context")) {
      if (!state) {
        await notFound(route, "This event is not authorized for the speaker portal.");
        return;
      }
      await send(route, structuredClone(state.context));
      return;
    }

    if (request.method() === "GET" && pathname.endsWith("/portal")) {
      if (!state) {
        await notFound(route, "This event is not authorized for the speaker portal.");
        return;
      }
      activeScenario = state;
      syncView(state);
      await send(route, publicView(state));
      return;
    }

    if (!state || eventId === undefined) {
      await notFound(route, "This event is not authorized for the speaker portal.");
      return;
    }

    if (
      request.method() === "GET" &&
      pathname.includes("/submissions/") &&
      pathname.endsWith("/roster")
    ) {
      const submissionId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const roster = state.rosters[submissionId];
      if (!roster) {
        await notFound(route, "This accepted session is not authorized for the speaker portal.");
        return;
      }
      if (!roster.capabilities.manage) {
        await notFound(route, "The speaker is not authorized to manage this roster.");
        return;
      }
      await send(route, publicRoster(roster));
      return;
    }

    if (
      request.method() === "POST" &&
      pathname.includes("/submissions/") &&
      pathname.endsWith("/roster")
    ) {
      const submissionId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const roster = state.rosters[submissionId];
      if (roster?.capabilities.manage !== true || roster.capabilities.invite !== true) {
        await notFound(route, "The speaker is not authorized to manage this roster.");
        return;
      }
      const body = requestBody(request);
      const displayName = stringValue(body, "displayName").trim();
      const email = stringValue(body, "email").trim();
      expect(stringValue(body, "role")).toBe("co_speaker");
      const participantId = `participant-invite-${state.nextParticipantNumber}`;
      state.nextParticipantNumber += 1;
      roster.members.push({
        participantId,
        displayName,
        email,
        role: "co_speaker",
        status: "pending",
        capabilities: { edit: true, remove: true },
      });
      syncView(state);
      await send(route, publicRoster(roster), 201);
      return;
    }

    if (
      request.method() === "PATCH" &&
      pathname.includes("/submissions/") &&
      pathname.includes("/roster/")
    ) {
      const parts = pathname.split("/");
      const submissionId = decodeURIComponent(parts.at(-3) ?? "");
      const participantId = decodeURIComponent(parts.at(-1) ?? "");
      const roster = state.rosters[submissionId];
      const member = roster?.members.find((candidate) => candidate.participantId === participantId);
      if (!roster || !member || !roster.capabilities.manage || !member.capabilities.edit) {
        await notFound(route, "The speaker is not authorized to edit this roster entry.");
        return;
      }
      const body = requestBody(request);
      if (body.displayName !== undefined)
        member.displayName = stringValue(body, "displayName").trim();
      if (body.email !== undefined) member.email = stringValue(body, "email").trim();
      if (body.status !== undefined)
        member.status = stringValue(body, "status") as PortalRosterMemberSeed["status"];
      syncView(state);
      await send(route, publicRoster(roster));
      return;
    }

    if (
      request.method() === "DELETE" &&
      pathname.includes("/submissions/") &&
      pathname.includes("/roster/")
    ) {
      const parts = pathname.split("/");
      const submissionId = decodeURIComponent(parts.at(-3) ?? "");
      const participantId = decodeURIComponent(parts.at(-1) ?? "");
      const roster = state.rosters[submissionId];
      const member = roster?.members.find((candidate) => candidate.participantId === participantId);
      if (!roster || !member || !roster.capabilities.manage || !member.capabilities.remove) {
        await notFound(route, "The speaker is not authorized to remove this roster entry.");
        return;
      }
      member.status = "revoked";
      member.capabilities = { edit: false, remove: false };
      syncView(state);
      await send(route, publicRoster(roster));
      return;
    }

    if (request.method() === "PATCH" && pathname.includes("/profiles/")) {
      const participantId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
      const profile = state.profiles.find((candidate) => candidate.participantId === participantId);
      if (!profile || !state.context.capabilities.includes("profile-self")) {
        await notFound(route, "The speaker profile is not authorized for this event.");
        return;
      }
      const body = requestBody(request);
      expect(numberValue(body, "expectedVersion")).toBe(profile.version);
      profile.biography = stringValue(body, "biography");
      profile.version += 1;
      profile.updatedAt = later;
      syncView(state);
      await send(route, structuredClone(profile));
      return;
    }

    if (request.method() === "POST" && pathname.endsWith("/transitions")) {
      const taskId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      if (!task || !state.context.capabilities.includes("task-response")) {
        await notFound(route, "The task is not authorized for this event.");
        return;
      }
      const body = requestBody(request);
      expect(numberValue(body, "expectedVersion")).toBe(task.version);
      const note = body.note === undefined ? undefined : stringValue(body, "note");
      if (note !== undefined) {
        // Keep the transition note private; it is deliberately absent from the task DTO below.
        expect(note.length).toBeLessThanOrEqual(1_000);
      }
      const toStatus = stringValue(body, "toStatus") as PortalTaskSeed["status"];
      if (
        toStatus === "submitted" &&
        task.type === "upload" &&
        !state.assets.some(
          (asset) => asset.taskId === task.id && asset.uploaded && asset.state === "ready",
        )
      ) {
        await fulfillError(
          route,
          "TASK_ASSET_NOT_READY",
          "Upload and finalize at least one accepted asset before submitting this task.",
          409,
        );
        return;
      }
      task.status = toStatus;
      task.version += 1;
      task.updatedAt = later;
      syncView(state);
      await send(route, { task: structuredClone(task) });
      return;
    }

    if (request.method() === "POST" && pathname.endsWith("/uploads")) {
      if (!state.context.capabilities.includes("asset-write")) {
        await notFound(route, "The speaker is not authorized to upload files for this event.");
        return;
      }
      const body = requestBody(request);
      const participantId = stringValue(body, "participantId");
      const taskId = body.taskId === undefined ? undefined : stringValue(body, "taskId");
      const submissionId =
        body.submissionId === undefined ? undefined : stringValue(body, "submissionId");
      const kind = stringValue(body, "kind") as PortalAssetSeed["kind"];
      const fileName = stringValue(body, "fileName");
      const contentType = stringValue(body, "contentType");
      const sizeBytes = numberValue(body, "sizeBytes");
      const supersedesAssetId =
        body.supersedesAssetId === undefined ? undefined : stringValue(body, "supersedesAssetId");
      expect(state.context.participantIds).toContain(participantId);
      if (taskId !== undefined) expect(state.tasks.some((task) => task.id === taskId)).toBe(true);
      if (submissionId !== undefined) expect(state.context.submissionIds).toContain(submissionId);
      const superseded =
        supersedesAssetId === undefined
          ? undefined
          : state.assets.find((asset) => asset.id === supersedesAssetId);
      const id = `asset-e2e-${state.nextAssetNumber}`;
      state.nextAssetNumber += 1;
      const asset: PortalAssetRecord = {
        id,
        eventId,
        ...(submissionId === undefined ? {} : { submissionId }),
        participantId,
        ...(taskId === undefined ? {} : { taskId }),
        kind,
        fileName,
        contentType,
        sizeBytes,
        state: "pending_upload",
        createdAt: later,
        version: (superseded?.version ?? 0) + 1,
        versionFamilyId: superseded?.versionFamilyId ?? `asset-family:${id}`,
        ...(supersedesAssetId === undefined ? {} : { supersedesAssetId }),
        commentThreadId: `asset-comments:${superseded?.versionFamilyId ?? `asset-family:${id}`}`,
        objectKey: `ai-engineer/${eventId}/${participantId}/${id}`,
        privateNote: "Organizer-only upload scan receipt",
        uploaded: false,
      };
      state.assets.unshift(asset);
      syncView(state);
      const grant = {
        method: "PUT" as const,
        url: `${apiOrigin}/api/speaker/assets/capabilities/upload/${encodeURIComponent(id)}/opaque-upload-token-${state.nextAssetNumber}`,
        headers: { "content-type": contentType },
        expiresAt: "2026-08-09T02:00:00.000Z",
      };
      await send(route, { asset: publicAsset(asset), grant }, 201);
      return;
    }

    if (
      request.method() === "GET" &&
      pathname.includes("/assets") &&
      pathname.endsWith("/history")
    ) {
      const assetId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const asset = state.assets.find((candidate) => candidate.id === assetId);
      if (!asset || !state.context.capabilities.includes("asset-read")) {
        await notFound(route, "The file history is not authorized for this event.");
        return;
      }
      const familyId = asset.versionFamilyId ?? asset.id;
      await send(
        route,
        state.assets
          .filter((candidate) => (candidate.versionFamilyId ?? candidate.id) === familyId)
          .sort((left, right) => (left.version ?? 0) - (right.version ?? 0))
          .map(publicAsset),
      );
      return;
    }

    if (request.method() === "GET" && pathname.endsWith("/assets")) {
      if (!state.context.capabilities.includes("asset-read")) {
        await notFound(route, "Files are not authorized for this event.");
        return;
      }
      const participantId = url.searchParams.get("participantId");
      if (participantId !== null && !state.context.participantIds.includes(participantId)) {
        await notFound(route, "The speaker is not authorized for this participant.");
        return;
      }
      const versionFamilyId = url.searchParams.get("versionFamilyId");
      const assets = state.assets
        .filter((asset) => participantId === null || asset.participantId === participantId)
        .filter((asset) => versionFamilyId === null || asset.versionFamilyId === versionFamilyId)
        .map(publicAsset);
      await send(route, assets);
      return;
    }

    if (request.method() === "GET" && pathname.endsWith("/resources")) {
      if (!state.context.capabilities.includes("resource-read")) {
        await notFound(route, "Resources are not authorized for this event.");
        return;
      }
      await send(
        route,
        structuredClone(state.resources).sort((left, right) => left.order - right.order),
      );
      return;
    }

    if (request.method() === "GET" && pathname.endsWith("/wiki")) {
      if (!state.context.capabilities.includes("resource-read")) {
        await notFound(route, "Wiki pages are not authorized for this event.");
        return;
      }
      await send(
        route,
        structuredClone(state.wiki).sort((left, right) => left.order - right.order),
      );
      return;
    }

    if (
      request.method() === "GET" &&
      pathname.includes("/assets/") &&
      pathname.endsWith("/comments")
    ) {
      const assetId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      if (
        !state.assets.some((asset) => asset.id === assetId) ||
        !state.context.capabilities.includes("asset-read")
      ) {
        await notFound(route, "Comments are not authorized for this file.");
        return;
      }
      await send(route, structuredClone(state.comments[assetId] ?? []));
      return;
    }

    if (
      request.method() === "POST" &&
      pathname.includes("/assets/") &&
      pathname.endsWith("/comments")
    ) {
      const assetId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      if (
        !state.assets.some((asset) => asset.id === assetId) ||
        !state.context.capabilities.includes("asset-comment")
      ) {
        await notFound(route, "Comments are not authorized for this file.");
        return;
      }
      const body = requestBody(request);
      const expectedVersion =
        body.expectedVersion === undefined ? undefined : numberValue(body, "expectedVersion");
      const currentVersion = Math.max(
        0,
        ...(state.comments[assetId] ?? []).map((comment) => comment.version ?? 0),
      );
      if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
        await fulfillError(
          route,
          "VERSION_CONFLICT",
          "The comment thread changed. Reload it before posting.",
          409,
        );
        return;
      }
      const comment: PortalAssetCommentSeed = {
        id: `comment-e2e-${state.nextCommentNumber}`,
        assetId,
        body: stringValue(body, "body"),
        authorLabel: "You",
        createdAt: later,
        updatedAt: later,
        version: state.nextCommentNumber,
      };
      state.nextCommentNumber += 1;
      state.comments[assetId] = [...(state.comments[assetId] ?? []), comment];
      await send(route, structuredClone(comment), 201);
      return;
    }

    if (
      request.method() === "POST" &&
      pathname.includes("/assets/") &&
      pathname.endsWith("/finalize")
    ) {
      const assetId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const asset = state.assets.find((candidate) => candidate.id === assetId);
      if (!asset || !state.context.capabilities.includes("asset-write")) {
        await notFound(route, "The file is not authorized for this event.");
        return;
      }
      if (!asset.uploaded) {
        await fulfillError(
          route,
          "UPLOAD_NOT_CONFIRMED",
          "Upload the file before finalizing it.",
          409,
        );
        return;
      }
      if (asset.state !== "pending_upload") {
        await fulfillError(
          route,
          "ASSET_FINALIZATION_INVALID",
          "This asset has already been finalized.",
          409,
        );
        return;
      }
      const body = requestBody(request);
      const nextState = stringValue(body, "state") as PortalAssetSeed["state"];
      expect(["ready", "rejected"]).toContain(nextState);
      asset.state = nextState;
      asset.finalizedAt = later;
      if (body.rejectionReason !== undefined)
        asset.rejectionReason = stringValue(body, "rejectionReason");
      syncView(state);
      await send(route, publicAsset(asset));
      return;
    }

    if (
      request.method() === "POST" &&
      pathname.includes("/assets/") &&
      pathname.endsWith("/download")
    ) {
      const assetId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const asset = state.assets.find((candidate) => candidate.id === assetId);
      if (!asset || !state.context.capabilities.includes("asset-read")) {
        await notFound(route, "The file is not authorized for this event.");
        return;
      }
      if (asset.state !== "ready") {
        await notFound(route, "The file is not ready for download.");
        return;
      }
      if (options.expiredDownloadAssetId === assetId) {
        await fulfillError(
          route,
          "DOWNLOAD_EXPIRED",
          "This secure download link has expired.",
          410,
        );
        return;
      }
      downloadNumber += 1;
      await send(route, {
        method: "GET",
        url: `${apiOrigin}/api/speaker/assets/capabilities/download/${encodeURIComponent(asset.id)}/opaque-download-token-${downloadNumber}`,
        expiresAt: "2026-08-09T02:00:00.000Z",
      });
      return;
    }

    if (request.method() === "GET" && pathname.endsWith("/form")) {
      const taskId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const form = state.forms[taskId];
      if (!form || !state.context.capabilities.includes("task-response")) {
        await notFound(route, "The task form is not authorized for this event.");
        return;
      }
      await send(route, structuredClone(form));
      return;
    }

    if (request.method() === "GET" && pathname.endsWith("/responses")) {
      const taskId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const response = state.responses[taskId];
      if (!response || !state.context.capabilities.includes("task-response")) {
        await notFound(route, "The task response is not authorized for this event.");
        return;
      }
      await send(route, structuredClone(response));
      return;
    }

    if (request.method() === "PUT" && pathname.endsWith("/responses")) {
      const taskId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
      const form = state.forms[taskId];
      const response = state.responses[taskId];
      if (!form || !response || !state.context.capabilities.includes("task-response")) {
        await notFound(route, "The task response is not authorized for this event.");
        return;
      }
      const body = requestBody(request);
      const expectedVersion =
        body.expectedVersion === undefined
          ? response.history.length
          : numberValue(body, "expectedVersion");
      if (expectedVersion !== response.history.length) {
        await fulfillError(
          route,
          "VERSION_CONFLICT",
          "The task response has changed. Reload it before saving.",
          409,
        );
        return;
      }
      expect(numberValue(body, "definitionVersion")).toBe(form.definitionVersion);
      const answers = body.answers;
      expect(typeof answers).toBe("object");
      expect(answers).not.toBeNull();
      const next: PortalTaskResponseSeed = {
        responseId: `response-e2e-${state.nextResponseNumber}`,
        definitionVersion: form.definitionVersion,
        answers: structuredClone(answers as Record<string, PortalFormAnswerSeed>),
        submittedAt: null,
        status: "draft",
        organizerFeedback: null,
      };
      state.nextResponseNumber += 1;
      response.history.push(next);
      response.latestResponse = next;
      form.latestResponse = next;
      await send(route, structuredClone(response));
      return;
    }

    await notFound(route, `No E2E route for ${pathname}`);
  });

  return { requests, view, payloads };
}
