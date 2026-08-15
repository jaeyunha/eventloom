import { describe, expect, it, vi } from "vitest";
import { shouldRenderAdminShell } from "./admin-shell";
import { signOutAdminSession } from "./admin-shell-controller";

describe("organizer shell authentication boundary", () => {
  it("renders only after organizer authorization resolves", () => {
    expect(shouldRenderAdminShell("checking", false)).toBe(false);
    expect(shouldRenderAdminShell("denied", false)).toBe(false);
    expect(shouldRenderAdminShell("authenticated", false)).toBe(true);
  });

  it("preserves the public member setup route", () => {
    expect(shouldRenderAdminShell("checking", true)).toBe(true);
  });

  it("leaves the admin shell only after session revocation succeeds", async () => {
    const navigate = vi.fn();
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(signOutAdminSession({ fetcher, navigate })).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("does not leave the admin shell when session revocation fails", async () => {
    const navigate = vi.fn();
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(signOutAdminSession({ fetcher, navigate })).resolves.toBe(false);

    expect(navigate).not.toHaveBeenCalled();
  });
});
