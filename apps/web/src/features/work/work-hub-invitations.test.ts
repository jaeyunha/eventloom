import { describe, expect, it, vi } from "vitest";
import { respondToEventInvitation } from "./work-event-invitation-model";

async function invitationMutation() {
  expect(respondToEventInvitation).toBeTypeOf("function");
  return respondToEventInvitation;
}

describe("respondToEventInvitation", () => {
  it.each([
    ["accept", "/api/account/event-invitations/invite%2Freviewer/accept"],
    ["decline", "/api/account/event-invitations/invite%2Freviewer/decline"],
  ] as const)("posts the strict %s request contract", async (response, expectedPath) => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          invitationId: "invite/reviewer",
          role: "reviewer",
          status: response === "accept" ? "accepted" : "declined",
          version: 8,
          organizationName: "Open Research Network",
          eventName: "Research Exchange 2027",
          workspaceHref: response === "accept" ? "/review?eventId=event%2Freview" : null,
        },
      }),
    );
    const mutate = await invitationMutation();

    await mutate(fetcher, {
      invitationId: "invite/reviewer",
      expectedVersion: 7,
      response,
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(expectedPath, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedVersion: 7 }),
    });
  });

  it("returns the accepted event-scoped workspace destination from the endpoint", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          invitationId: "invite-speaker",
          role: "speaker",
          status: "accepted",
          version: 2,
          organizationName: "Civic Design Guild",
          eventName: "Human-Centered Summit",
          workspaceHref: "/portal?event=event%2Fspeaker",
        },
      }),
    );
    const mutate = await invitationMutation();

    await expect(
      mutate(fetcher, {
        invitationId: "invite-speaker",
        expectedVersion: 1,
        response: "accept",
      }),
    ).resolves.toBe("/portal?event=event%2Fspeaker");
  });

  it("rejects endpoint failures instead of pretending the invitation changed", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { code: "VERSION_CONFLICT", message: "The invitation changed." } },
        { status: 409 },
      ),
    );
    const mutate = await invitationMutation();

    await expect(
      mutate(fetcher, {
        invitationId: "invite-review",
        expectedVersion: 1,
        response: "decline",
      }),
    ).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
  });
});
