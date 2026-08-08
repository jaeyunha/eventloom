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

export interface PortalViewSeed {
  submissions: PortalSubmissionSeed[];
  profiles: PortalProfileSeed[];
  tasks: PortalTaskSeed[];
  outstandingTaskCount: number;
}

export const seededPortalView: PortalViewSeed = {
  submissions: [
    {
      id: "submission-evaluator",
      eventId: "event-evaluator",
      title: "Designing calm incident response",
      status: "accepted",
      participantIds: ["participant-ada"],
      updatedAt: "2026-08-08T12:00:00.000Z",
    },
  ],
  profiles: [
    {
      id: "profile-ada",
      eventId: "event-evaluator",
      participantId: "participant-ada",
      displayName: "Ada Speaker",
      biography: "Staff engineer and resilient-systems educator.",
      version: 3,
      updatedAt: "2026-08-08T12:00:00.000Z",
    },
  ],
  tasks: [
    {
      id: "task-agreement",
      eventId: "event-evaluator",
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
      updatedAt: "2026-08-08T12:00:00.000Z",
    },
    {
      id: "task-headshot",
      eventId: "event-evaluator",
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
      version: 1,
      updatedAt: "2026-08-08T12:00:00.000Z",
    },
  ],
  outstandingTaskCount: 2,
};

export interface PortalApiHarness {
  requests: Request[];
  view: PortalViewSeed;
}

const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,PATCH,POST,PUT,OPTIONS",
  "access-control-allow-origin": "http://127.0.0.1:3015",
};

function cloneView(): PortalViewSeed {
  return structuredClone(seededPortalView);
}

function refreshOutstandingCount(view: PortalViewSeed): void {
  view.outstandingTaskCount = view.tasks.filter(
    (task) => task.status !== "completed" && task.status !== "waived",
  ).length;
}

async function fulfillJson(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders,
    body: JSON.stringify({ data }),
  });
}

function expectAuthenticated(request: Request, session: E2eAuthSession): void {
  expect(request.headers().cookie).toContain(`${E2E_SESSION_COOKIE}=${session.token}`);
}

export async function installPortalApi(
  page: Page,
  session: E2eAuthSession,
): Promise<PortalApiHarness> {
  const view = cloneView();
  const requests: Request[] = [];

  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const request = route.request();
    requests.push(request);

    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (request.method() === "PUT" && url.pathname.startsWith("/e2e-upload/")) {
      expect(request.headers().cookie).toBeUndefined();
      await route.fulfill({ status: 200, headers: corsHeaders });
      return;
    }

    expectAuthenticated(request, session);

    if (request.method() === "GET" && url.pathname.endsWith("/portal")) {
      await fulfillJson(route, view);
      return;
    }

    if (request.method() === "PATCH" && url.pathname.includes("/profiles/")) {
      const input = request.postDataJSON() as { biography: string; expectedVersion: number };
      const profile = view.profiles.find((candidate) => url.pathname.endsWith(candidate.participantId));
      expect(profile).toBeDefined();
      expect(input.expectedVersion).toBe(profile?.version);
      if (!profile) throw new Error("Missing seeded profile");
      profile.biography = input.biography;
      profile.version += 1;
      profile.updatedAt = "2026-08-08T13:00:00.000Z";
      await fulfillJson(route, profile);
      return;
    }

    if (request.method() === "POST" && url.pathname.endsWith("/transitions")) {
      const task = view.tasks.find((candidate) => url.pathname.includes(`/${candidate.id}/`));
      expect(task).toBeDefined();
      if (!task) throw new Error("Missing seeded task");
      const input = request.postDataJSON() as { toStatus: PortalTaskSeed["status"]; expectedVersion: number };
      expect(input.expectedVersion).toBe(task.version);
      task.status = input.toStatus;
      task.version += 1;
      task.updatedAt = "2026-08-08T13:00:00.000Z";
      refreshOutstandingCount(view);
      await fulfillJson(route, { task });
      return;
    }

    if (request.method() === "POST" && url.pathname.endsWith("/uploads")) {
      const input = request.postDataJSON() as { taskId: string };
      expect(view.tasks.some((task) => task.id === input.taskId)).toBe(true);
      await fulfillJson(route, {
        asset: { id: "asset-headshot-e2e" },
        grant: {
          method: "PUT",
          url: "http://127.0.0.1:8787/e2e-upload/asset-headshot-e2e",
          headers: { "content-type": "image/png" },
          expiresAt: "2026-08-08T14:00:00.000Z",
        },
      });
      return;
    }


    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        error: { code: "E2E_ROUTE_NOT_FOUND", message: `No E2E route for ${url.pathname}` },
      }),
    });
  });

  return { requests, view };
}
