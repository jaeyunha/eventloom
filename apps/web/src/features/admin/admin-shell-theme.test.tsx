import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellSource = ["./admin-shell.tsx", "./admin-shell-view.tsx"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const shellStyles = readFileSync(new URL("./admin-shell.module.css", import.meta.url), "utf8");
const workspaceShellStyles = readFileSync(
  new URL("../../components/workspace/workspace-shell.module.css", import.meta.url),
  "utf8",
);
const navigationStyles = readFileSync(
  new URL("../../components/workspace/workspace-navigation.module.css", import.meta.url),
  "utf8",
);
const railSource = readFileSync(new URL("./admin-shell-rail.tsx", import.meta.url), "utf8");

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
    expect(shellStyles).toContain("--admin-border: var(--workspace-divider)");
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
    expect(shellStyles).toMatch(
      /\.adminMain\s*\{[\s\S]*scroll-padding-top:\s*var\(--admin-sticky-offset\);/u,
    );
    expect(workspaceShellStyles).toMatch(
      /\.insetPanel\s*\{[\s\S]*border:\s*1px solid var\(--workspace-pane-edge\);/u,
    );
    expect(workspaceShellStyles).toMatch(
      /\.desktopNavigation\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/u,
    );
    expect(shellStyles).toMatch(
      /\.rail\s*\{[\s\S]*height:\s*100%;[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/u,
    );
    expect(railSource).toContain('variant="embedded"');
    expect(navigationStyles).toMatch(/\.embedded\s*\{[\s\S]*min-height:\s*0;[\s\S]*padding:\s*0;/u);
    expect(navigationStyles).toMatch(
      /\.embedded \.navigationLink\s*\{[\s\S]*min-height:\s*1\.75rem;[\s\S]*font-size:\s*0\.8125rem;/u,
    );
  });
});
