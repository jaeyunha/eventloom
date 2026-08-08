import { apiErrorSchema } from "../../packages/contracts/src";
import { describe, expect, it } from "vitest";
import { createApp, type ApiBindings } from "../../apps/api/src/app";
import {
  InMemoryEvaluationRepository,
  InMemorySubmissionReviewSource,
} from "../../apps/api/src/features/evaluations/repository";
import { EvaluationService } from "../../apps/api/src/features/evaluations/service";
import type { AuthPrincipal } from "../../apps/api/src/features/auth/types";

const environment: ApiBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "https://app.example.test",
};
const traceId = "64002360-5a03-4ac6-95ed-852eee74f51b";

const organizer: AuthPrincipal = {
  kind: "user",
  sessionId: "session-1",
  userId: "organizer-1",
  email: "organizer@example.test",
  memberships: [{ organizationId: "org-1", role: "admin" }],
  speakerGrants: [],
};
const apiKey: AuthPrincipal = {
  kind: "apiKey",
  apiKeyId: "api-key-1",
  organizationId: "org-1",
  scopes: ["events:read"],
};

function fixture() {
  const service = new EvaluationService(
    new InMemoryEvaluationRepository(),
    new InMemorySubmissionReviewSource(),
    { clock: () => new Date("2026-08-08T12:00:00.000Z") },
  );
  return createApp({
    authenticator: {
      authenticate: async (request) => {
        if (request.headers.get("cookie") === "session=organizer") return organizer;
        if (request.headers.get("authorization") === "Bearer integration-key") return apiKey;
        return null;
      },
    },
    evaluations: {
      service,
      actorFor: (principal) =>
        principal.kind === "user" &&
        principal.memberships.some((membership) => membership.organizationId === "org-1")
          ? {
              tenantId: "org-1",
              userId: principal.userId,
              kind: "human",
              grants: [{ eventId: "event-1", role: "organizer" }],
            }
          : null,
    },
  });
}

const plan = {
  id: "plan-1",
  eventId: "event-1",
  name: "Program review",
  blindReview: true,
  closesAt: null,
  assignmentRule: { reviewsPerSubmission: 2, maxAssignmentsPerReviewer: 20 },
  rounds: [
    {
      id: "round-1",
      name: "First round",
      sequence: 1,
      closesAt: null,
      rubric: {
        id: "rubric-1",
        name: "Program rubric",
        criteria: [
          {
            id: "criterion-1",
            label: "Relevance",
            description: "Fit for the audience",
            minimum: 1,
            maximum: 5,
            weight: 1,
            required: true,
          },
        ],
      },
    },
  ],
};

async function error(response: Response, status: number, code: string) {
  const body = apiErrorSchema.parse(await response.json());
  expect(response.status).toBe(status);
  expect(body.error.code).toBe(code);
  expect(body.error.traceId).toBe(traceId);
}

describe("domain route assembly", () => {
  it("fails fast when a protected route is configured without authentication", () => {
    const service = new EvaluationService(
      new InMemoryEvaluationRepository(),
      new InMemorySubmissionReviewSource(),
    );
    expect(() =>
      createApp({
        evaluations: {
          service,
          actorFor: () => null,
        },
      }),
    ).toThrow("Authentication must be configured");
  });

  it("mounts evaluation routes with 401 and 403 adapters", async () => {
    const app = fixture();
    const unauthenticated = await app.request(
      "/api/admin/evaluations/plans",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": traceId },
        body: JSON.stringify(plan),
      },
      environment,
    );
    const forbidden = await app.request(
      "/api/admin/evaluations/plans",
      {
        method: "POST",
        headers: {
          authorization: "Bearer integration-key",
          "content-type": "application/json",
          "x-request-id": traceId,
        },
        body: JSON.stringify(plan),
      },
      environment,
    );

    await error(unauthenticated, 401, "AUTHENTICATION_REQUIRED");
    await error(forbidden, 403, "ACCESS_DENIED");
  });

  it("normalizes domain validation failures into the shared trace-bearing error contract", async () => {
    const response = await fixture().request(
      "/api/admin/evaluations/plans",
      {
        method: "POST",
        headers: {
          cookie: "session=organizer",
          "content-type": "application/json",
          "x-request-id": traceId,
        },
        body: JSON.stringify({ unexpected: true }),
      },
      environment,
    );

    await error(response, 400, "VALIDATION_FAILED");
  });

  it("serves a mounted organizer evaluation operation through injected adapters", async () => {
    const response = await fixture().request(
      "/api/admin/evaluations/plans",
      {
        method: "POST",
        headers: {
          cookie: "session=organizer",
          "content-type": "application/json",
          "x-request-id": traceId,
        },
        body: JSON.stringify(plan),
      },
      environment,
    );
    const body = (await response.json()) as { id: string; tenantId: string; status: string };

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ id: "plan-1", tenantId: "org-1", status: "draft" });
    expect(response.headers.get("x-request-id")).toBe(traceId);
  });
});
