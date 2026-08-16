import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ownedStyles = [
  "./settings-ui.module.css",
  "./workspace-brand-mark.module.css",
  "./workspace-content.module.css",
  "./workspace-navigation.module.css",
  "./role-workspace-shell.module.css",
  "./workspace-shell.module.css",
  "./workspace-state.module.css",
  "./workspace-ui.module.css",
  "../../features/admin/admin-shell.module.css",
  "../../features/cfp/cfp-progress.module.css",
  "../../features/cfp/cfp-submission-window.module.css",
  "../../features/cfp/cfp-wizard.module.css",
  "../../features/events/event-overview-workspace.module.css",
  "../../features/portal/portal-dashboard.module.css",
  "../../features/portal/portal-profile.module.css",
  "../../features/portal/portal-shell.module.css",
  "../../features/portal/portal-task-assets.module.css",
  "../../features/portal/portal-task-detail.module.css",
  "../../features/portal/portal-task-form.module.css",
  "../../features/portal/portal-tasks.module.css",
  "../../features/portal/portal-workspace.module.css",
  "../../features/portal/portal.module.css",
  "../../features/reviews/organizer-review-overview.module.css",
  "../../features/reviews/review-workspace.module.css",
  "../../features/reviews/reviewer-shell.module.css",
  "../../features/speakers/speaker-workspace.module.css",
  "../../features/work/work-hub.module.css",
] as const;

const styleSource = new Map(
  ownedStyles.map((file) => [
    file,
    readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
  ]),
);
const globalStyles = readFileSync(
  fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
  "utf8",
);
const workspaceShellSource = readFileSync(
  fileURLToPath(new URL("./workspace-shell.tsx", import.meta.url)),
  "utf8",
);
const roleWorkspaceSource = readFileSync(
  fileURLToPath(new URL("./role-workspace-shell.tsx", import.meta.url)),
  "utf8",
);
const adminRailSource = readFileSync(
  fileURLToPath(new URL("../../features/admin/admin-shell-rail.tsx", import.meta.url)),
  "utf8",
);
const cfpWizardSource = readFileSync(
  fileURLToPath(new URL("../../features/cfp/cfp-wizard.tsx", import.meta.url)),
  "utf8",
);
const workHubSource = readFileSync(
  fileURLToPath(new URL("../../features/work/work-hub.tsx", import.meta.url)),
  "utf8",
);

const directColorDeclaration =
  /^\s*(?:--[\w-]+|background(?:-color)?|border(?:-(?:block|inline)(?:-(?:start|end))?|-(?:top|right|bottom|left))?(?:-color)?|box-shadow|color|outline):[^;]*(?:#[\da-f]{3,8}\b|\brgba?\(|\b(?:black|white)\b)/imu;

describe("workspace semantic surfaces", () => {
  it("defines one reusable light and dark workspace layer contract", () => {
    expect(globalStyles).toMatch(
      /:root\s*\{[\s\S]*--workspace-outer:\s*#f3f3f5;[\s\S]*--workspace-pane:\s*#f7f7f8;[\s\S]*--workspace-surface:\s*#ffffff;[\s\S]*--workspace-subtle:\s*#f4f4f6;/u,
    );
    expect(globalStyles).toMatch(
      /\.dark\s*\{[\s\S]*--workspace-outer:\s*#0b0b0d;[\s\S]*--workspace-pane:\s*#151517;[\s\S]*--workspace-surface:\s*#1c1c1f;[\s\S]*--workspace-subtle:\s*#232327;/u,
    );
    expect(globalStyles).toContain("--workspace-pane-edge:");
    expect(globalStyles).toContain("--workspace-pane-shadow:");
    expect(globalStyles).toContain("--workspace-accent:");
    expect(globalStyles).toContain("--workspace-accent-soft:");
    expect(globalStyles).toContain("--workspace-progress-idle:");
    expect(globalStyles).toMatch(
      /:root\s*\{[\s\S]*--workspace-pane-edge:\s*var\(--workspace-divider\)/su,
    );
    expect(globalStyles).toMatch(/\.dark\s*\{[\s\S]*--workspace-pane-edge:\s*transparent/su);
    expect(globalStyles).toMatch(
      /\[data-role-workspace-shell="true"\]\s*\{[\s\S]*--background:\s*var\(--workspace-pane\);[\s\S]*--sidebar:\s*var\(--workspace-outer\);/su,
    );
  });

  it("uses the shared tonal layers in both workspace shell implementations", () => {
    const standardShell = styleSource.get("./workspace-shell.module.css") ?? "";
    const roleShell = styleSource.get("./role-workspace-shell.module.css") ?? "";

    for (const [name, css] of [
      ["WorkspaceShell", standardShell],
      ["RoleWorkspaceShell", roleShell],
    ] as const) {
      expect(css, name).toMatch(/\.shell\s*\{[^}]*background:\s*var\(--workspace-outer\)/su);
      expect(css, name).toMatch(
        /\.(?:insetPanel|inset)\s*\{[^}]*border:\s*1px solid var\(--workspace-pane-edge\)/su,
      );
      expect(css, name).toMatch(
        /\.(?:insetPanel|inset)\s*\{[^}]*background:\s*var\(--workspace-pane\)/su,
      );
      expect(css, name).toMatch(
        /\.(?:insetPanel|inset)\s*\{[^}]*box-shadow:\s*var\(--workspace-pane-shadow\)/su,
      );
    }
  });

  it("marks every shared and account shell with the workspace theme scope", () => {
    expect(workspaceShellSource).toContain('data-role-workspace-shell="true"');
    expect(workHubSource).toContain('data-role-workspace-shell="true"');
    expect(workHubSource).toContain("className={styles.frame}");
  });

  it("uses the organizer brand mark across organizer, participant, speaker, and CFP shells", () => {
    const brandMarkStyles = styleSource.get("./workspace-brand-mark.module.css") ?? "";

    expect(adminRailSource).toMatch(/import\s+\{\s*WorkspaceBrandMark\s*\}/u);
    expect(roleWorkspaceSource).toMatch(/import\s+\{\s*WorkspaceBrandMark\s*\}/u);
    expect(cfpWizardSource).toMatch(/import\s+\{\s*WorkspaceBrandMark\s*\}/u);
    expect(adminRailSource).toMatch(/<WorkspaceBrandMark\s*\/>/u);
    expect(roleWorkspaceSource).toMatch(/<WorkspaceBrandMark\s*\/>/u);
    expect(cfpWizardSource).toMatch(/<WorkspaceBrandMark\s*\/>/u);
    expect(brandMarkStyles).toMatch(
      /\.mark\s*\{[^}]*width:\s*var\(--space-7\)[^}]*height:\s*var\(--space-7\)[^}]*border-radius:\s*var\(--radius-md\)[^}]*background:\s*var\(--primary\)[^}]*color:\s*var\(--primary-foreground\)[^}]*font-size:\s*0\.75rem[^}]*font-weight:\s*600/su,
    );
  });

  it("keeps the account hub inside the same layered workspace frame", () => {
    const css = styleSource.get("../../features/work/work-hub.module.css") ?? "";

    expect(css).toMatch(/\.shell\s*\{[^}]*background:\s*var\(--workspace-outer\)/su);
    expect(css).toMatch(
      /\.frame\s*\{[^}]*border:\s*1px solid var\(--workspace-pane-edge\)[^}]*background:\s*var\(--workspace-pane\)/su,
    );
  });

  it("keeps the CFP document quiet inside the shared inset pane", () => {
    const css = styleSource.get("../../features/cfp/cfp-wizard.module.css") ?? "";

    expect(css).toMatch(/\.publicWorkspace\s*\{[^}]*background:\s*var\(--workspace-outer\)/su);
    expect(css).toMatch(/\.publicMain\s*\{[^}]*background:\s*var\(--workspace-pane\)/su);
    expect(css).toMatch(
      /\.card\s*\{[^}]*border:\s*0;[^}]*background:\s*var\(--workspace-surface\)/su,
    );
  });

  it("keeps organizer progress states on shared workspace accent tokens", () => {
    const css = styleSource.get("../../features/events/event-overview-workspace.module.css") ?? "";

    expect(css).toMatch(/\.phaseActive\s*\{[^}]*background:\s*var\(--workspace-accent-soft\)/su);
    expect(css).toMatch(
      /\.phaseProgress\s*\{[\s\S]*background:\s*var\(--workspace-progress-idle\)/su,
    );
    expect(css).toMatch(
      /\.phaseActive \.phaseProgress,\s*\.phaseDone \.phaseProgress\s*\{[\s\S]*background:\s*var\(--workspace-accent\)/su,
    );
    expect(css).toMatch(
      /\.attentionIcon,\s*\.activityIcon\s*\{[\s\S]*color:\s*var\(--workspace-accent\);[\s\S]*background:\s*var\(--workspace-accent-soft\)/su,
    );
  });

  it("keeps owned workspace colors on global semantic tokens", () => {
    for (const [file, css] of styleSource) {
      expect(css, file).not.toMatch(directColorDeclaration);
    }
  });

  it("uses theme-aware surfaces for each workspace route", () => {
    const routeStyles = [
      "../../features/admin/admin-shell.module.css",
      "../../features/portal/portal-dashboard.module.css",
      "../../features/portal/portal-tasks.module.css",
      "../../features/reviews/review-workspace.module.css",
      "../../features/speakers/speaker-workspace.module.css",
    ] as const;

    for (const file of routeStyles) {
      const css = styleSource.get(file) ?? "";
      expect(css, file).toMatch(/var\(--(?:background|card|workspace-(?:pane|surface))\)/u);
      expect(css, file).toContain("var(--foreground)");
      expect(css, file).toContain("var(--muted-foreground)");
      expect(css, file).toContain("var(--border)");
    }
  });

  it("preserves reviewer horizontal controls at narrow widths and zoom", () => {
    const css = styleSource.get("../../features/reviews/review-workspace.module.css") ?? "";
    const evaluatorRefinement = css.split("/* Evaluator workspace refinement */")[1] ?? "";

    expect(evaluatorRefinement).toContain(".reviewerStatusViews");
    expect(evaluatorRefinement).toContain("flex-wrap: nowrap");
    expect(evaluatorRefinement).toContain("overflow-x: auto");
    expect(evaluatorRefinement).toContain("flex: 0 0 auto");
  });

  it("keeps the viewport minimum width stable under text zoom", () => {
    expect(globalStyles).toMatch(/body\s*\{[^}]*min-width:\s*320px/su);
    expect(globalStyles).not.toMatch(/body\s*\{[^}]*min-width:\s*\d+(?:\.\d+)?rem/su);
    expect(globalStyles).toMatch(
      /\.dialog-grid\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0/su,
    );
    expect(globalStyles).toMatch(
      /@media\s*\(max-width:\s*42rem\)\s*\{[\s\S]*?\[data-slot="dialog-content"\]:has\(\.dialog-grid\)\s*\{[^}]*padding:\s*16px/su,
    );
  });

  it("lets context bars and speaker detail shrink at text zoom", () => {
    const shell = styleSource.get("./workspace-shell.module.css") ?? "";
    const workspaceUi = styleSource.get("./workspace-ui.module.css") ?? "";
    const portalShell = styleSource.get("../../features/portal/portal-shell.module.css") ?? "";
    const speakers = styleSource.get("../../features/speakers/speaker-workspace.module.css") ?? "";

    expect(shell).toMatch(/\.contextBar\s*\{[^}]*min-width:\s*0/su);
    expect(shell).toMatch(
      /@media\s*\(max-width:\s*48rem\)\s*\{[\s\S]*?\.contextBar\s*\{[^}]*display:\s*grid/su,
    );
    expect(shell).toMatch(
      /@media\s*\(max-width:\s*48rem\)\s*\{[\s\S]*?\.contextActions\s*\{[^}]*width:\s*100%/su,
    );
    expect(speakers).toMatch(
      /\.actionsStack\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/su,
    );
    expect(speakers).toMatch(/\.workspace\s*\{[^}]*width:\s*100%[^}]*max-width:\s*76rem/su);
    expect(speakers).toMatch(/\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/su);
    expect(speakers).toMatch(
      /\.tabs,\s*\.view\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/su,
    );
    expect(speakers).toMatch(/:global\(\.dialog-grid\)\s*>\s*\.view\s*\{[^}]*max-width:\s*100%/su);
    expect(workspaceUi).toMatch(/\.titleRow\s*\{[^}]*min-width:\s*0/su);
    expect(workspaceUi).toMatch(/\.titleBlock\s*\{[^}]*max-width:\s*100%/su);
    expect(speakers).toMatch(
      /\.workspace\s+\[data-slot="card-header"\],\s*\.workspace\s+\[data-slot="card-title"\],\s*\.workspace\s+\[data-slot="card-description"\]\s*\{[^}]*min-width:\s*0/su,
    );
    expect(portalShell).toMatch(
      /@media\s*\(max-width:\s*48rem\)\s*\{[\s\S]*?\.contextSelect\s*\{[^}]*width:\s*100%/su,
    );
    expect(speakers).toMatch(
      /\.actionsStack\s*>\s*\*,\s*\.actionGrid\s*>\s*\*,\s*\.details\s*>\s*\*\s*\{[^}]*min-width:\s*0/su,
    );
    expect(speakers).toMatch(
      /\.workspace\s+\[data-slot="card-header"\]\s*>\s*:not\(\[data-slot="card-action"\]\)\s*\{[^}]*max-width:\s*100%/su,
    );
    expect(speakers).toMatch(
      /\.detailGrid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*12rem\),\s*1fr\)\)/su,
    );
    expect(speakers).toMatch(
      /@media\s*\(max-width:\s*42rem\)\s*\{[\s\S]*?\.tabs\s*>\s*\[data-slot="tabs-list"\]\s*\{[^}]*flex-wrap:\s*wrap/su,
    );
    expect(speakers).toMatch(
      /@media\s*\(max-width:\s*42rem\)\s*\{[\s\S]*?\.tabs\s*>\s*\[data-slot="tabs-list"\]\s*>\s*\[data-slot="tabs-trigger"\]\s*\{[^}]*white-space:\s*normal/su,
    );
  });

  it("disables owned shell navigation and sheet transitions for reduced motion", () => {
    const shellCss = [
      styleSource.get("./workspace-shell.module.css") ?? "",
      styleSource.get("./workspace-navigation.module.css") ?? "",
      styleSource.get("../../features/admin/admin-shell.module.css") ?? "",
    ].join("\n");

    expect(shellCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(shellCss).toMatch(/\.skipLink\s*\{[^}]*transition:\s*none/su);
    expect(shellCss).toMatch(/\.navigationLink,[^}]*transition:\s*none/su);
    expect(shellCss).toMatch(/\.eventContextChevron\s*\{[^}]*transition:\s*none/su);
  });
});
