import { type BrowserContext, test as base, expect } from "@playwright/test";

export const E2E_SESSION_COOKIE = "open-sessionboard.session";
const e2eWebBaseUrl = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3015"}`;

export type E2eRole = "organizer" | "reviewer" | "speaker" | "submitter";

export interface E2eAuthSession {
  userId: string;
  email: string;
  displayName: string;
  role: E2eRole;
  eventIds: readonly string[];
  token: string;
}

interface AuthFixtures {
  authRole: E2eRole;
  authSession: E2eAuthSession;
}

function sessionFor(role: E2eRole): E2eAuthSession {
  const identities: Record<E2eRole, Pick<E2eAuthSession, "userId" | "email" | "displayName">> = {
    organizer: {
      userId: "user-organizer-e2e",
      email: "jaeyunha0317@gmail.com",
      displayName: "Olivia Organizer",
    },
    reviewer: {
      userId: "user-reviewer-e2e",
      email: "reviewer.e2e@example.test",
      displayName: "Ravi Reviewer",
    },
    speaker: {
      userId: "user-speaker-e2e",
      email: "speaker.e2e@example.test",
      displayName: "Ada Speaker",
    },
    submitter: {
      userId: "user-submitter-e2e",
      email: "submitter.e2e@example.test",
      displayName: "Sam Submitter",
    },
  };
  const identity = identities[role];

  const eventScope = role === "organizer" ? "open-sessionboard-conf" : "event-evaluator";
  return {
    ...identity,
    role,
    eventIds: [eventScope],
    token: `e2e-session-${role}-${eventScope}`,
  };
}

async function installAuthenticatedSession(
  context: BrowserContext,
  session: E2eAuthSession,
): Promise<void> {
  await context.addCookies([
    {
      name: E2E_SESSION_COOKIE,
      value: session.token,
      url: e2eWebBaseUrl,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
    {
      name: "better-auth.session_token",
      value: "local-session",
      url: e2eWebBaseUrl,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
  await context.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: session.token, userId: session.userId },
        user: {
          id: session.userId,
          email: session.email,
          name: session.displayName,
        },
        memberships:
          session.role === "organizer"
            ? [{ organizationId: "local-organization", role: "owner" }]
            : session.role === "reviewer"
              ? [{ organizationId: "local-organization", role: "reviewer" }]
              : [],
        speakerGrants: [],
      }),
    });
  });
  await context.addInitScript((authenticatedSession) => {
    window.localStorage.setItem(
      "open-sessionboard:e2e-auth:v1",
      JSON.stringify(authenticatedSession),
    );
  }, session);
}

export const test = base.extend<AuthFixtures>({
  authRole: ["speaker", { option: true }],
  authSession: [
    async ({ authRole, context }, use) => {
      const session = sessionFor(authRole);
      await installAuthenticatedSession(context, session);
      await use(session);
    },
    { auto: true },
  ],
});

export { expect };
