import { expect, test } from "@playwright/test";

const ORGANIZATION_ID = "ai-engineer";
const REVIEWER_EMAIL = "evaluator.e2e@example.test";
const SETUP_TOKEN = "one-time-evaluator-token";
const PASSWORD = "StrongPass1!";
const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-origin": "http://127.0.0.1:3015",
} as const;

const reviewerMember = {
  organizationId: ORGANIZATION_ID,
  userId: "user-evaluator-e2e",
  email: REVIEWER_EMAIL,
  name: "Evelyn Evaluator",
  emailVerified: true,
  status: "active",
  role: "reviewer",
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:01:00.000Z",
} as const;

const acceptedInvitation = {
  id: "invitation-evaluator-e2e",
  organizationId: ORGANIZATION_ID,
  userId: reviewerMember.userId,
  email: REVIEWER_EMAIL,
  name: reviewerMember.name,
  role: "reviewer",
  idempotencyKey: "member-invitation-e2e",
  status: "accepted",
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:01:00.000Z",
  expiresAt: "2026-08-18T00:00:00.000Z",
  deliveredAt: "2026-08-11T00:00:01.000Z",
  acceptedAt: "2026-08-11T00:01:00.000Z",
} as const;

test("an invited evaluator sets a password, reaches the work hub, and opens the reviewer queue", async ({
  page,
}) => {
  const requests: string[] = [];

  await page.route(
    `**/api/admin/organizations/${ORGANIZATION_ID}/members/setup/activate`,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      requests.push("activate");
      const requestBody = route.request().postDataJSON();
      expect(requestBody).toEqual({ token: SETUP_TOKEN, password: PASSWORD });
      expect(route.request().headers().cookie).toBeUndefined();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({ data: { member: reviewerMember, invitation: acceptedInvitation } }),
      });
    },
  );
  await page.route("**/api/auth/sign-in/email", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    requests.push("sign-in");
    expect(route.request().postDataJSON()).toEqual({ email: REVIEWER_EMAIL, password: PASSWORD });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        ...corsHeaders,
        "set-cookie": "better-auth.session_token=evaluator-session; Path=/; HttpOnly",
      },
      body: JSON.stringify({
        token: "evaluator-session",
        session: { id: "evaluator-session", userId: reviewerMember.userId },
        user: { id: reviewerMember.userId, email: REVIEWER_EMAIL, name: reviewerMember.name },
      }),
    });
  });
  await page.route("**/api/auth/get-session", async (route) => {
    requests.push("session");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        session: { id: "evaluator-session", userId: reviewerMember.userId },
        user: { id: reviewerMember.userId, email: REVIEWER_EMAIL, name: reviewerMember.name },
        memberships: [{ organizationId: ORGANIZATION_ID, role: "reviewer" }],
        speakerGrants: [],
      }),
    });
  });
  await page.route("**/api/account/reviewer-workspace", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        data: {
          organizations: [
            {
              organization: { id: ORGANIZATION_ID, name: "AI Engineer" },
              assignments: [
                {
                  assignment: { status: "assigned" },
                  plan: { eventName: "Evaluation Event" },
                },
              ],
            },
          ],
        },
      }),
    });
  });
  await page.route("**/api/admin/evaluations/reviewer/workspace", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        data: {
          assignments: [
            {
              plan: {
                id: "evaluation-plan",
                eventId: "evaluation-event",
                name: "Program review",
                status: "open",
                blindReview: true,
                createdAt: "2026-08-10T00:00:00.000Z",
                updatedAt: "2026-08-10T01:00:00.000Z",
              },
              assignment: {
                id: "evaluation-assignment",
                eventId: "evaluation-event",
                planId: "evaluation-plan",
                submissionId: "evaluation-submission",
                roundId: "evaluation-round",
                reviewerId: reviewerMember.userId,
                status: "assigned",
                version: 1,
              },
              round: {
                id: "evaluation-round",
                name: "Committee review",
                sequence: 1,
                opensAt: null,
                closesAt: "2026-08-18T00:00:00.000Z",
                rubric: {
                  id: "evaluation-rubric",
                  name: "Program rubric",
                  criteria: [],
                },
              },
              submission: {
                id: "evaluation-submission",
                title: "Reliable event systems",
                abstract: "A practical session about reliable event systems.",
              },
              review: null,
              rubricRevision: 1,
              submissionRevision: 1,
              suggestions: [],
            },
          ],
        },
      }),
    });
  });

  const warmedReviewRoute = await page.request.get("/review");
  expect(warmedReviewRoute.ok()).toBe(true);
  await page.goto(
    `/admin/organizations/${ORGANIZATION_ID}/members/setup?token=${encodeURIComponent(SETUP_TOKEN)}`,
  );

  await expect(page.getByRole("heading", { name: "Set up organization access" })).toBeVisible();
  expect(requests).toEqual([]);

  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accept invitation and sign in" }).click();

  await expect(page).toHaveURL("/work");
  await expect(page.getByRole("heading", { name: "Where do you want to work?" })).toBeVisible();
  const reviewerWorkspace = page.locator('[data-workspace="reviewer"]');
  await expect(reviewerWorkspace).toBeVisible();
  await expect(reviewerWorkspace).toContainText("Reviewer workspace");
  const reviewAssignments = reviewerWorkspace.getByRole("link", { name: "Review assignments" });
  await expect(reviewAssignments).toBeVisible();
  await expect(reviewAssignments).toHaveAttribute("href", "/review");
  expect(requests.slice(0, 3)).toEqual(["activate", "sign-in", "session"]);

  await Promise.all([page.waitForURL("/review"), reviewAssignments.click()]);
  await expect(page.getByRole("heading", { name: "Reviewer queue" })).toBeVisible();
});

test("activation success survives an automatic sign-in failure without reusing the token", async ({
  page,
}) => {
  let activationCount = 0;

  await page.route(
    `**/api/admin/organizations/${ORGANIZATION_ID}/members/setup/activate`,
    async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      activationCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({ data: { member: reviewerMember, invitation: acceptedInvitation } }),
      });
    },
  );
  await page.route("**/api/auth/sign-in/email", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ error: { code: "AUTH_UNAVAILABLE" } }),
    });
  });

  await page.goto(
    `/admin/organizations/${ORGANIZATION_ID}/members/setup?token=${encodeURIComponent(SETUP_TOKEN)}`,
  );
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Accept invitation and sign in" }).click();

  await expect(page.getByRole("heading", { name: "Invitation activated" })).toBeVisible();
  await expect(page).toHaveURL(`/admin/organizations/${ORGANIZATION_ID}/members/setup`);
  await expect(page.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute(
    "href",
    "/login",
  );
  expect(activationCount).toBe(1);
});
