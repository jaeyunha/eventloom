import { describe, expect, it } from "vitest";
import { THEME_BOOTSTRAP_SCRIPT } from "./theme-provider";

describe("local theme bootstrap", () => {
  it("is standalone and does not serialize a helper function", () => {
    expect(THEME_BOOTSTRAP_SCRIPT).not.toContain(".toString()");
    expect(THEME_BOOTSTRAP_SCRIPT).not.toMatch(/\bt\s*\(/u);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("document.documentElement");
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('window.localStorage.getItem("theme")');
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('window.matchMedia("(prefers-color-scheme: dark)")');
  });

  it("keeps all supported theme modes in the bootstrap validation", () => {
    for (const theme of ["light", "dark", "system"]) {
      expect(THEME_BOOTSTRAP_SCRIPT).toContain(`"${theme}"`);
    }
  });
});
