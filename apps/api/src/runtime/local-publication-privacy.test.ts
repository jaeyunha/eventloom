import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runtimeDir = dirname(fileURLToPath(import.meta.url));

describe("local publication speaker privacy", () => {
  it("uses neutral Speaker fallbacks instead of raw participant ids", () => {
    const sources = ["local.ts", "airtable.ts"].map((name) =>
      readFileSync(join(runtimeDir, name), "utf8"),
    );

    for (const source of sources) {
      expect(source).toContain('?? "Speaker"');
      expect(source).not.toMatch(/\?\?\s*participantId\b/);
    }
  });
});
