import { describe, expect, it } from "vitest";
import { shouldRenderAdminShell } from "./admin-shell";

describe("organizer shell authentication boundary", () => {
  it("renders only after organizer authorization resolves", () => {
    expect(shouldRenderAdminShell("checking", false)).toBe(false);
    expect(shouldRenderAdminShell("denied", false)).toBe(false);
    expect(shouldRenderAdminShell("authenticated", false)).toBe(true);
  });

  it("preserves the public member setup route", () => {
    expect(shouldRenderAdminShell("checking", true)).toBe(true);
  });
});
