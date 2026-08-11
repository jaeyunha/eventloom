import type { Page, Request, Route } from "@playwright/test";
import { E2E_SESSION_COOKIE, type E2eAuthSession } from "./auth";

const DEFAULT_ORGANIZATION_ID = "ai-engineer";
const DEFAULT_FORM_VERSION = 1;
const UPDATED_AT = "2026-08-08T12:00:00.000Z";

export interface CfpFixtureOptions {
  eventId: string;
  formId?: string;
  eventName?: string;
  formName?: string;
  formVersion?: number;
}

export interface CfpFixtureHarness {
  event: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    opensAt: string;
    closesAt: string;
  };
  form: {
    id: string;
    name: string;
    version: number;
    status: "published";
    welcomeContent: string;
    settings: {
      speakerLimit: number;
      maxSubmissionsPerAccount: number;
      confirmationMessage: string;
      successContent: string;
    };
    sections: unknown[];
    submissionFields: unknown[];
    participantFields: unknown[];
    rules: unknown[];
  };
  submission: {
    id: string;
    tenantId: string;
    eventId: string;
    formId: string;
    ownerAccountId: string;
    formVersion: number;
    version: number;
    status: "draft" | "submitted";
    completedSteps: string[];
    answers: Record<string, unknown>;
    participants: Array<Record<string, unknown>>;
    secondaryContacts: Array<Record<string, unknown>>;
    createdAt: string;
    updatedAt: string;
    submittedAt?: string;
  };
  requests: Request[];
}

const CORS_HEADERS = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,idempotency-key",
  "access-control-allow-methods": "GET,PATCH,POST,PUT,OPTIONS",
  "access-control-allow-origin": "http://127.0.0.1:3015",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorBody(code: string, message: string): string {
  return JSON.stringify({ error: { code, message, traceId: "trace-cfp-fixture" } });
}

async function fulfillJson(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: CORS_HEADERS,
    body: JSON.stringify({ data }),
  });
}

async function fulfillError(
  route: Route,
  code: string,
  message: string,
  status: 409 | 404,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: CORS_HEADERS,
    body: errorBody(code, message),
  });
}

export async function installCfpApi(
  page: Page,
  session: E2eAuthSession,
  options: CfpFixtureOptions,
): Promise<CfpFixtureHarness> {
  const formId = options.formId ?? `${options.eventId}-cfp`;
  const formVersion = options.formVersion ?? DEFAULT_FORM_VERSION;
  const event = {
    id: options.eventId,
    slug: options.eventId,
    name: options.eventName ?? "Welcome to our event!",
    timezone: "America/Los_Angeles",
    opensAt: "2026-08-01T07:00:00.000Z",
    closesAt: "2026-09-15T07:00:00.000Z",
  };
  const form = {
    id: formId,
    name: options.formName ?? "Main call for speakers",
    version: formVersion,
    status: "published" as const,
    welcomeContent: "Share the session you want to bring to our community.",
    settings: {
      speakerLimit: 3,
      maxSubmissionsPerAccount: 3,
      confirmationMessage: "Your proposal has been received.",
      successContent: "Thank you for contributing to the program.",
    },
    sections: [],
    submissionFields: [],
    participantFields: [],
    rules: [],
  };
  const submission: CfpFixtureHarness["submission"] = {
    id: `submission-${options.eventId}-e2e`,
    tenantId: DEFAULT_ORGANIZATION_ID,
    eventId: options.eventId,
    formId,
    ownerAccountId: session.userId,
    formVersion,
    version: 1,
    status: "draft",
    completedSteps: ["welcome"],
    answers: {},
    participants: [],
    secondaryContacts: [],
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  };
  const requests: Request[] = [];
  const publicPath = `/api/public/cfp/organizations/${DEFAULT_ORGANIZATION_ID}/events/${options.eventId}`;
  const apiPath = `/api/cfp/organizations/${DEFAULT_ORGANIZATION_ID}/events/${options.eventId}`;
  const draftPath = `${apiPath}/submissions/${submission.id}/draft`;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    requests.push(request);
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    if (request.headers().cookie?.includes(`${E2E_SESSION_COOKIE}=${session.token}`) !== true) {
      await fulfillError(route, "AUTHENTICATION_REQUIRED", "Authentication is required.", 404);
      return;
    }

    if (
      request.method() === "GET" &&
      (url.pathname === publicPath || url.pathname === `${publicPath}/forms/${formId}`)
    ) {
      await fulfillJson(route, { event: clone(event), form: clone(form) });
      return;
    }
    if (request.method() === "GET" && url.pathname === draftPath) {
      await fulfillJson(route, clone(submission));
      return;
    }
    if (request.method() === "POST" && url.pathname === `${apiPath}/forms/${formId}/drafts`) {
      submission.version = 1;
      submission.status = "draft";
      submission.completedSteps = ["welcome"];
      submission.answers = {};
      submission.participants = [];
      submission.secondaryContacts = [];
      submission.updatedAt = UPDATED_AT;
      await fulfillJson(route, clone(submission), 201);
      return;
    }
    if (request.method() === "PATCH" && url.pathname === draftPath) {
      const body = record(request.postDataJSON()) ?? {};
      if (body.formVersion !== formVersion) {
        await fulfillError(route, "CONFLICT", "The submission schema version is stale.", 409);
        return;
      }
      if (body.expectedVersion !== submission.version) {
        await fulfillError(route, "CONFLICT", "The CFP submission has changed.", 409);
        return;
      }
      const answers = record(body.answers);
      if (answers !== null) submission.answers = { ...submission.answers, ...clone(answers) };
      if (
        typeof body.completedStep === "string" &&
        !submission.completedSteps.includes(body.completedStep)
      ) {
        submission.completedSteps = [...submission.completedSteps, body.completedStep];
      }
      submission.version += 1;
      submission.updatedAt = "2026-08-08T13:00:00.000Z";
      await fulfillJson(route, clone(submission));
      return;
    }
    if (
      request.method() === "PUT" &&
      url.pathname === `${apiPath}/submissions/${submission.id}/participants`
    ) {
      const body = record(request.postDataJSON()) ?? {};
      if (body.formVersion !== formVersion) {
        await fulfillError(route, "CONFLICT", "The submission schema version is stale.", 409);
        return;
      }
      if (body.expectedVersion !== submission.version) {
        await fulfillError(route, "CONFLICT", "The CFP submission has changed.", 409);
        return;
      }
      if (Array.isArray(body.participants)) {
        submission.participants = clone(body.participants) as Array<Record<string, unknown>>;
      }
      if (Array.isArray(body.secondaryContacts)) {
        submission.secondaryContacts = clone(body.secondaryContacts) as Array<
          Record<string, unknown>
        >;
      }
      submission.completedSteps = submission.completedSteps.includes("participant")
        ? submission.completedSteps
        : [...submission.completedSteps, "participant"];
      submission.version += 1;
      submission.updatedAt = "2026-08-08T13:00:00.000Z";
      await fulfillJson(route, clone(submission));
      return;
    }
    if (
      request.method() === "POST" &&
      url.pathname === `${apiPath}/submissions/${submission.id}/review`
    ) {
      await fulfillJson(route, {
        submissionId: submission.id,
        version: submission.version,
        canSubmit: true,
        issues: [],
        matchedRuleIds: [],
        routes: [],
      });
      return;
    }
    if (
      request.method() === "POST" &&
      url.pathname === `${apiPath}/submissions/${submission.id}/submit`
    ) {
      const body = record(request.postDataJSON()) ?? {};
      if (body.formVersion !== formVersion || body.expectedVersion !== submission.version) {
        await fulfillError(route, "CONFLICT", "The CFP submission has changed.", 409);
        return;
      }
      submission.status = "submitted";
      submission.completedSteps = submission.completedSteps.includes("review")
        ? submission.completedSteps
        : [...submission.completedSteps, "review"];
      submission.version += 1;
      const submittedAt = "2026-08-08T13:05:00.000Z";
      submission.submittedAt = submittedAt;
      submission.updatedAt = submittedAt;
      await fulfillJson(route, {
        submission: clone(submission),
        receipt: {
          id: `receipt-${options.eventId}-e2e`,
          submissionId: submission.id,
          version: submission.version,
          submittedAt,
        },
        confirmationQueued: true,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      url.pathname === `${apiPath}/submissions/${submission.id}/receipt`
    ) {
      if (submission.status !== "submitted" || submission.submittedAt === undefined) {
        await fulfillError(route, "NOT_FOUND", "A submission receipt is not available.", 404);
        return;
      }
      await fulfillJson(route, {
        id: `receipt-${options.eventId}-e2e`,
        submissionId: submission.id,
        version: submission.version,
        submittedAt: submission.submittedAt,
      });
      return;
    }

    await fulfillError(route, "E2E_ROUTE_NOT_FOUND", `No E2E route for ${url.pathname}`, 404);
  });

  return { event: clone(event), form: clone(form), submission, requests };
}
