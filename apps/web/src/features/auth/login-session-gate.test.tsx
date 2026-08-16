import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoginSessionGate } from "./login-session-gate";
import { loadAuthenticatedLoginDestination } from "./login-session-loader";

describe("LoginSessionGate", () => {
  it("resolves an existing reviewer session away from the login route", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            session: { id: "session-1" },
            user: { id: "reviewer-1" },
            memberships: [{ organizationId: "org-1", role: "reviewer" }],
            speakerGrants: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    await expect(loadAuthenticatedLoginDestination({ fetcher })).resolves.toBe("/work");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/get-session",
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
  });

  it("keeps the login route available without an authenticated session", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));

    await expect(loadAuthenticatedLoginDestination({ fetcher })).resolves.toBeNull();
  });

  it("renders only the pending gate before the session check completes", () => {
    const markup = renderToStaticMarkup(
      createElement(LoginSessionGate, null, createElement("div", null, "login form")),
    );

    expect(markup).toContain('data-login-session-gate="checking"');
    expect(markup).not.toContain("login form");
  });
});
