import { describe, expect, it } from "vitest";
import { type ApiBindings, createApp } from "../app";
import type { EvaluationActor } from "../features/evaluations/types";
import { createEvaluationActorResolver } from "./evaluation-actor";

const environment: ApiBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "http://127.0.0.1:3015",
};

const principal = {
  kind: "user" as const,
  sessionId: "session-reviewer",
  userId: "reviewer-shared",
  email: "reviewer@example.test",
  memberships: [
    { organizationId: "org-a", role: "reviewer" as const },
    { organizationId: "org-b", role: "reviewer" as const },
  ],
  reviewerGrants: [
    { organizationId: "org-a", eventId: "shared-event" },
    { organizationId: "org-b", eventId: "shared-event" },
  ],
  speakerGrants: [],
};

function actorResolver() {
  return createEvaluationActorResolver({
    cfpRepository: {
      getEvent: async (organizationId, eventId) =>
        ["org-a", "org-b"].includes(organizationId) && eventId === "shared-event" ? {} : null,
    },
    evaluationRepository: {
      getAssignment: async (organizationId, assignmentId) =>
        ["org-a", "org-b"].includes(organizationId) && assignmentId === "shared-assignment"
          ? { eventId: "shared-event" }
          : null,
      getPlan: async (organizationId, planId) =>
        ["org-a", "org-b"].includes(organizationId) && planId === "shared-plan"
          ? { eventId: "shared-event" }
          : null,
      listPlans: async () => [],
    },
  });
}

describe("evaluation actor request scope", () => {
  it("selects one organization for duplicate reviewer identifiers through app middleware", async () => {
    const actors: EvaluationActor[] = [];
    const app = createApp({
      authenticator: {
        authenticate: async () => principal,
      },
      evaluations: {
        actorFor: actorResolver(),
        service: {
          listReviewerWorkspace: async (actor: EvaluationActor) => {
            actors.push(actor);
            return { assignments: [] };
          },
          saveReview: async (actor: EvaluationActor) => {
            actors.push(actor);
            return { id: "review-org-b" };
          },
        } as never,
      },
    });
    const scope = "organizationId=org-b&eventId=shared-event";

    const workspace = await app.request(
      `/api/admin/evaluations/reviewer/workspace?${scope}`,
      undefined,
      environment,
    );
    const save = await app.request(
      `/api/admin/evaluations/assignments/shared-assignment/review?${scope}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scores: [], comment: "Scoped draft" }),
      },
      environment,
    );

    expect(workspace.status).toBe(200);
    expect(save.status).toBe(200);
    expect(actors).toHaveLength(2);
    for (const actor of actors) {
      expect(actor).toMatchObject({
        tenantId: "org-b",
        userId: principal.userId,
        kind: "human",
        grants: [{ eventId: "shared-event", role: "reviewer" }],
      });
    }
  });
});
