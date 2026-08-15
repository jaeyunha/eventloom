import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Inbox } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleWorkspaceShell } from "./role-workspace-shell";

describe("RoleWorkspaceShell", () => {
  it("reuses the inset sidebar shell for role-specific navigation", () => {
    const markup = renderToStaticMarkup(
      <RoleWorkspaceShell
        brandHref="/review"
        currentPageLabel="Review queue"
        footer={<span>Reviewer account</span>}
        mainId="reviewer-content"
        navigationGroups={[
          {
            label: "Review",
            items: [
              {
                current: true,
                href: "/review",
                icon: Inbox,
                label: "Review queue",
              },
            ],
          },
        ]}
        navigationLabel="Reviewer workspace navigation"
        roleLabel="Reviewer workspace"
        skipLabel="Skip to reviewer content"
        workspace="reviewer"
      >
        <p>Assigned submissions</p>
      </RoleWorkspaceShell>,
    );

    expect(markup).toContain('data-role-workspace-shell="true"');
    expect(markup).toContain('data-role-workspace="reviewer"');
    expect(markup).toContain('data-slot="sidebar"');
    expect(markup).toContain('data-slot="sidebar-inset"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('id="reviewer-content"');
    expect(markup).toContain("Assigned submissions");
  });

  it("keeps the role sidebar edge borderless beside the inset panel", () => {
    const css = readFileSync(
      fileURLToPath(new URL("./role-workspace-shell.module.css", import.meta.url)),
      "utf8",
    );

    expect(css).toMatch(/\.sidebar\s*\{[\s\S]*border-right:\s*0;/u);
    expect(css).toMatch(/\.inset\s*\{[\s\S]*border:\s*1px solid[\s\S]*border-radius:\s*0\.75rem;/u);
  });
});
