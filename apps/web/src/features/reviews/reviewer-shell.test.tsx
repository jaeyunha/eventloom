import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewerShell } from "./reviewer-shell";

describe("ReviewerShell", () => {
  it("uses the shared role shell for scope, current queue navigation, and account actions", () => {
    const markup = renderToStaticMarkup(
      <ReviewerShell>
        <h1>Reviewer queue</h1>
      </ReviewerShell>,
    );

    expect(markup).toContain('data-reviewer-shell="true"');
    expect(markup).toContain('data-role-workspace-shell="true"');
    expect(markup).toContain('data-role-workspace="reviewer"');
    expect(markup).toContain('href="#reviewer-main"');
    expect(markup).toContain('id="reviewer-main"');
    expect(markup).toContain('aria-label="Reviewer workspace"');
    expect(markup).toContain('data-slot="sidebar"');
    expect(markup).toContain('data-slot="sidebar-inset"');
    expect(markup).toContain('href="/review"');
    expect(markup).toContain('href="/work"');
    expect(markup).toContain("Review queue");
    expect(markup).toContain("All work");
    expect(markup).toContain("Reviewer");
    expect(markup).toContain("All assigned events");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Choose color theme"');
    expect(markup).toContain('data-reviewer-sign-out="true"');
    expect((markup.match(/<main\b/gu) ?? []).length).toBe(1);
  });

  it("keeps reviewer shell styling on semantic tokens without the obsolete topbar frame", () => {
    const css = readFileSync(
      fileURLToPath(new URL("./reviewer-shell.module.css", import.meta.url)),
      "utf8",
    );

    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toMatch(/\brgba?\(/u);
    expect(css).not.toContain(".topbar");
    expect(css).not.toContain(".main");
    expect(css).not.toContain(".rail");
    expect(css).not.toContain(".brand");
    expect(css).toContain("height: 100svh");
    expect(css).toContain("overflow: hidden");
    expect(css).toContain("var(--sidebar-border)");
    expect(css).toContain("var(--muted-foreground)");
  });
});
