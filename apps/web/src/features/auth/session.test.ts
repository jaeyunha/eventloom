import { describe, expect, it } from "vitest";
import { sessionHasAuthenticatedUser } from "./session";

describe("authenticated session parsing", () => {
  it("accepts only a session payload containing a user", () => {
    expect(sessionHasAuthenticatedUser({ user: { id: "user-1" } })).toBe(true);
    expect(sessionHasAuthenticatedUser({ data: { user: { id: "user-1" } } })).toBe(true);
    expect(sessionHasAuthenticatedUser({ user: null })).toBe(false);
    expect(sessionHasAuthenticatedUser({ data: { user: null } })).toBe(false);
    expect(sessionHasAuthenticatedUser(null)).toBe(false);
  });
});
