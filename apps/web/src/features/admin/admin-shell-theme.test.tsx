import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = readFileSync(new URL("./admin-shell.tsx", import.meta.url), "utf8");
const shellStyles = readFileSync(new URL("./admin-shell.module.css", import.meta.url), "utf8");

describe("organizer workspace theme", () => {
  it("exposes the shared theme control from the workspace header", () => {
    expect(shellSource).toContain(
      'import { ThemeToggle } from "@/components/product-shell/theme-toggle";',
    );
    expect(shellSource).toContain("<ThemeToggle />");
  });

  it("defines organizer aliases on the mounted shell in both themes", () => {
    expect(shellStyles).toContain(".adminShell {");
    expect(shellStyles).toContain("--admin-ink: var(--foreground)");
    expect(shellStyles).toContain("--admin-border: var(--border)");
    expect(shellStyles).toContain("--admin-settings-content-width: 52rem");
    expect(shellStyles).toContain(":global(.dark) .adminShell");
    expect(shellStyles).toContain(":global(.dark) .workspaceHeader");
    expect(shellStyles).toContain(":global(.dark) .metricsSection");
  });

  it("keeps calendar rail and outside-month cells on dark surfaces", () => {
    expect(shellStyles).toContain(":global(.dark) .calendarRail");
    expect(shellStyles).toContain(":global(.dark) .calendarCellOutside");
  });

  it("keeps every organizer route inside one inset workspace shell", () => {
    expect(shellSource).toContain('variant="inset"');
    expect(shellStyles).toMatch(
      /\.adminShell\s*\{[\s\S]*height:\s*100svh;[\s\S]*overflow:\s*hidden;/,
    );
    expect(shellStyles).toMatch(/\.sidebarContent\s*\{[\s\S]*flex:\s*1;[\s\S]*overflow-y:\s*auto;/);
    expect(shellStyles).toMatch(/\.accountFooter\s*\{[\s\S]*flex:\s*0 0 auto;/);
  });
});
