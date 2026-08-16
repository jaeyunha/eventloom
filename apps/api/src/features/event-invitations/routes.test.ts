import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal, UserPrincipal } from "../auth/types";
import {
  createEventInvitationRoutes,
  type EventInvitationRouteEnvironment,
  type EventInvitationRouteService,
} from "./routes";

const verifiedUser: UserPrincipal & { readonly emailVerified: true } = {
  kind: "user",
  sessionId: "session-1",
  userId: "account-1",
  email: "recipient@example.test",
  emailVerified: true,
  memberships: [],
  speakerGrants: [],
  reviewerGrants: [],
};

const apiKey: AuthPrincipal = {
  kind: "apiKey",
  apiKeyId: "api-key-1",
  organizationId: "organization/research",
  scopes: ["events:read"],
};

const pending = {
  invitationId: "invitation-reviewer",
  role: "reviewer" as const,
  status: "pending" as const,
  version: 3,
  organizationId: "organization/research",
  organizationName: "Open Research Network",
  eventId: "event/review",
  eventName: "Research Exchange 2027",
  workspaceHref: null,
};

const accepted = {
  invitationId: "invitation-speaker",
  role: "speaker" as const,
  status: "accepted" as const,
  version: 5,
  organizationId: "organization/research",
  organizationName: "Open Research Network",
  eventId: "event/speaker",
  eventName: "Human-Centered Summit",
  workspaceHref: "/portal?event=event%2Fspeaker",
};

function service() {
  return {
    list: vi.fn<EventInvitationRouteService["list"]>(async () => [pending, accepted]),
    accept: vi.fn<EventInvitationRouteService["accept"]>(async (_actor, input) => ({
      ...pending,
      invitationId: input.invitationId,
      status: "accepted" as const,
      version: input.expectedVersion + 1,
      workspaceHref: "/review?eventId=event%2Freview",
    })),
    decline: vi.fn<EventInvitationRouteService["decline"]>(async (_actor, input) => ({
      ...pending,
      invitationId: input.invitationId,
      status: "declined" as const,
      version: input.expectedVersion + 1,
      workspaceHref: null,
    })),
  } satisfies EventInvitationRouteService;
}

function appFor(
  currentPrincipal: AuthPrincipal | null,
  invitationService: EventInvitationRouteService = service(),
) {
  const app = new Hono<EventInvitationRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("traceId", "trace-event-invitations");
    context.set("authPrincipal", currentPrincipal);
    await next();
  });
  app.route(
    "/api/account/event-invitations",
    createEventInvitationRoutes({
      service: invitationService,
    }),
  );
  return app;
}

async function responseError(response: Response) {
  const payload = (await response.json()) as {
    error: { code: string; message: string; traceId: string };
  };
  return payload.error;
}

describe("event invitation account routes", () => {
  it("lists pending and accepted invitations for the authenticated verified user", async () => {
    const invitationService = service();
    const response = await appFor(verifiedUser, invitationService).request(
      "/api/account/event-invitations",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ data: [pending, accepted] });
    expect(invitationService.list).toHaveBeenCalledExactlyOnceWith({
      kind: "user",
      userId: verifiedUser.userId,
      email: verifiedUser.email,
      emailVerified: true,
    });
  });

  it.each([
    ["accept", "accept"],
    ["decline", "decline"],
  ] as const)(
    "takes invitation identity from the path and only expectedVersion from the %s body",
    async (pathAction, serviceAction) => {
      const invitationService = service();
      const response = await appFor(verifiedUser, invitationService).request(
        `/api/account/event-invitations/invitation-reviewer/${pathAction}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion: 3 }),
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(invitationService[serviceAction]).toHaveBeenCalledExactlyOnceWith(
        {
          kind: "user",
          userId: verifiedUser.userId,
          email: verifiedUser.email,
          emailVerified: true,
        },
        { invitationId: "invitation-reviewer", expectedVersion: 3 },
      );
    },
  );

  it.each(["accept", "decline"] as const)(
    "rejects caller-controlled invitation scope in the %s body",
    async (action) => {
      const invitationService = service();
      const response = await appFor(verifiedUser, invitationService).request(
        `/api/account/event-invitations/invitation-reviewer/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: 3,
            invitationId: "another-invitation",
            organizationId: "another-organization",
            eventId: "another-event",
            role: "speaker",
            recipientUserId: "another-account",
          }),
        },
      );

      expect(response.status).toBe(400);
      expect(invitationService[action]).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["GET", "/api/account/event-invitations"],
    ["POST", "/api/account/event-invitations/invitation-reviewer/accept"],
    ["POST", "/api/account/event-invitations/invitation-reviewer/decline"],
  ] as const)("rejects API-key authentication for %s %s", async (method, path) => {
    const response = await appFor(apiKey).request(path, {
      method,
      ...(method === "POST"
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expectedVersion: 3 }),
          }
        : {}),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(responseError(response)).resolves.toMatchObject({
      code: "ACCESS_DENIED",
      traceId: "trace-event-invitations",
    });
  });

  it("maps another recipient to the same generic not-found response as a missing invitation", async () => {
    const notFound = Object.assign(new Error("The event invitation was not found."), {
      code: "NOT_FOUND",
      status: 404,
    });
    const invitationService = service();
    invitationService.accept.mockRejectedValue(notFound);

    const response = await appFor(verifiedUser, invitationService).request(
      "/api/account/event-invitations/invitation-for-another-recipient/accept",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
    );

    expect(response.status).toBe(404);
    await expect(responseError(response)).resolves.toEqual({
      code: "NOT_FOUND",
      message: "The event invitation was not found.",
      traceId: "trace-event-invitations",
    });
  });

  it("maps stale expectedVersion to conflict without retrying", async () => {
    const stale = Object.assign(new Error("The event invitation version is stale."), {
      code: "VERSION_CONFLICT",
      status: 409,
    });
    const invitationService = service();
    invitationService.accept.mockRejectedValue(stale);

    const response = await appFor(verifiedUser, invitationService).request(
      "/api/account/event-invitations/invitation-reviewer/accept",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 2 }),
      },
    );

    expect(response.status).toBe(409);
    expect(invitationService.accept).toHaveBeenCalledOnce();
    await expect(responseError(response)).resolves.toMatchObject({
      code: "CONFLICT",
      message: "The event invitation version is stale.",
    });
  });

  it("returns the exact accepted reviewer and speaker event workspace hrefs", async () => {
    const invitationService = service();
    invitationService.accept
      .mockResolvedValueOnce({
        ...pending,
        status: "accepted",
        version: 4,
        workspaceHref: "/review?eventId=event%2Freview",
      } as const)
      .mockResolvedValueOnce(accepted);
    const app = appFor(verifiedUser, invitationService);

    const reviewerResponse = await app.request(
      "/api/account/event-invitations/invitation-reviewer/accept",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 3 }),
      },
    );
    const speakerResponse = await app.request(
      "/api/account/event-invitations/invitation-speaker/accept",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 4 }),
      },
    );

    await expect(reviewerResponse.json()).resolves.toEqual({
      data: expect.objectContaining({
        invitationId: "invitation-reviewer",
        workspaceHref: "/review?eventId=event%2Freview",
      }),
    });
    await expect(speakerResponse.json()).resolves.toEqual({
      data: expect.objectContaining({
        invitationId: "invitation-speaker",
        workspaceHref: "/portal?event=event%2Fspeaker",
      }),
    });
  });
});
