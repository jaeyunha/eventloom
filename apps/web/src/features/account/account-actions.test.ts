import { describe, expect, it, vi } from "vitest";
import { signOutAccount } from "./account-actions";

describe("account sign-out", () => {
  it("navigates only after the session revocation succeeds", async () => {
    const navigate = vi.fn();
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(signOutAccount({ fetcher, navigate })).resolves.toBe(true);

    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("does not navigate or report completion when session revocation fails", async () => {
    const navigate = vi.fn();
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(signOutAccount({ fetcher, navigate })).resolves.toBe(false);

    expect(navigate).not.toHaveBeenCalled();
  });
});
