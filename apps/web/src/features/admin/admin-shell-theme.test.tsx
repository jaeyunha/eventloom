import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = ["./admin-shell.tsx", "./admin-shell-view.tsx"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
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
    expect(shellSource).toContain("<WorkspaceShell");
    expect(shellSource).toContain("className={styles.adminShell");
    expect(shellSource).toContain("mainClassName={styles.adminMain");
    expect(shellSource).toContain('data-role-workspace="organizer"');
    expect(shellStyles).toMatch(
      /\.adminShell\s*\{[\s\S]*grid-template-columns:\s*14rem[\s\S]*height:\s*100svh;[\s\S]*overflow:\s*hidden;/,
    );
    expect(shellStyles).toMatch(/\.railBody\s*\{[\s\S]*overflow-y:\s*auto;/);
    expect(shellStyles).toMatch(/\.adminMain\s*\{[\s\S]*overflow-y:\s*auto;/);
    expect(shellStyles).toMatch(/\.adminMain\s*\{[\s\S]*border:\s*1px solid var\(--border\);/);
  });
});
