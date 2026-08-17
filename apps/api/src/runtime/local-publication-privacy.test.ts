import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

const localSource = readFileSync(fileURLToPath(new URL("./local.ts", import.meta.url)), "utf8");
const airtableSource = readFileSync(
  fileURLToPath(new URL("./airtable.ts", import.meta.url)),
  "utf8",
);

describe("local publication speaker privacy", () => {
  it("uses neutral Speaker fallbacks instead of raw participant ids", () => {
    for (const source of [localSource, airtableSource]) {
      expect(source).toContain('?? "Speaker"');
      expect(source).not.toMatch(/\?\?\s*participantId\b/);
    }
  });
});
