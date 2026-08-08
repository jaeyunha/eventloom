import { type BrowserContext, test as base, expect } from "@playwright/test";

export const E2E_SESSION_COOKIE = "open-sessionboard.session";

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
      email: "organizer.e2e@example.test",
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

  return {
    ...identity,
    role,
    eventIds: ["event-evaluator"],
    token: `e2e-session-${role}-event-evaluator`,
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
      url: "http://127.0.0.1:3015",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
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
