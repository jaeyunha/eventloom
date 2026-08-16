import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function productionTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(join(ROOT, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => /\.(?:ts|tsx)$/u.test(path))
    .filter((path) => !/\.(?:test|spec)\.(?:ts|tsx)$/u.test(path));
}

describe("hardcoded product data boundaries", () => {
  it("does not let production workspaces bypass APIs with frontend fixture records", () => {
    const forbiddenSymbols = new Map<string, readonly RegExp[]>([
      [
        "apps/web/src/features/admin/submission-workspace.tsx",
        [/\bseededSubmissions\b/u, /\bgetSeededSubmission\b/u, /\blocalDemoEnabled\b/u],
      ],
      [
        "apps/web/src/features/admin/cfp-editor.tsx",
        [/\bSEEDED_CONFIGURATION\b/u, /\bcreateSeededCfpConfiguration\b/u],
      ],
      [
        "apps/web/src/features/agenda/agenda-workspace.tsx",
        [/\bcreateLocalAgendaDemoApi\b/u, /\bresolveLocalDemoApi\b/u, /\bfixtureMode\b/u],
      ],
      [
        "apps/web/src/features/cfp/cfp-wizard.tsx",
        [
          /\bFORMAT_OPTIONS\b/u,
          /\bTRACK_OPTIONS\b/u,
          /\bLEVEL_OPTIONS\b/u,
          /\bLANGUAGE_OPTIONS\b/u,
          /\bTAG_OPTIONS\b/u,
          /\bpublishedOptions\b/u,
        ],
      ],
    ]);

    for (const [path, patterns] of forbiddenSymbols) {
      const contents = source(path);
      for (const pattern of patterns) {
        expect(contents, `${path} still contains ${pattern.source}`).not.toMatch(pattern);
      }
    }
  });

  it("does not import demo projections from production modules", () => {
    const productionFiles = productionTypeScriptFiles("apps/web/src");
    const offenders = productionFiles.filter((path) => {
      if (path.includes("/demo/")) return false;
      const contents = readFileSync(path, "utf8");
      return /from\s+["'][^"']*\/demo\/(?:agenda-demo-api|projections)["']/u.test(contents);
    });

    expect(offenders).toEqual([]);
  });

  it("does not fabricate event names from fixture route identifiers", () => {
    const paths = [
      "apps/web/src/features/admin/admin-shell.tsx",
      "apps/web/src/features/events/event-overview-workspace.tsx",
      "apps/web/src/features/portal/portal-provider.tsx",
      "apps/web/src/features/admin/submission-workspace.tsx",
    ];

    for (const path of paths) {
      expect(source(path), `${path} maps a fixture id to a product name`).not.toMatch(
        /eventId\s*===\s*["']demo-event["']/u,
      );
    }
  });

  it("does not silently assign missing local event scope to the demo event", () => {
    const localRuntime = source("apps/api/src/runtime/local.ts");

    expect(localRuntime).not.toMatch(/\?\?\s*["']demo-event["']/u);
    expect(localRuntime).not.toMatch(/return\s+["']demo-event["']/u);
  });

  it("does not retain disconnected local runtime snapshots or browser-backed seed tools", () => {
    expect(source("apps/api/src/runtime/cfp.ts")).not.toMatch(/\bseededEvent\b/u);
    expect(source("apps/api/src/runtime/local.ts")).not.toContain("local-session-keynote");
    expect(existsSync(join(ROOT, "scripts/airtable/seed-demo.mjs"))).toBe(false);
  });
});
