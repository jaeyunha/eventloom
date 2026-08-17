import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

const localSource = readFileSync(fileURLToPath(new URL("./local.ts", import.meta.url)), "utf8");
const airtableSource = readFileSync(
  fileURLToPath(new URL("./airtable.ts", import.meta.url)),
  "utf8",
);

describe("local publication speaker privacy", () => {
  it("routes speaker labels through neutralSpeakerDisplayName instead of raw ids", () => {
    for (const source of [localSource, airtableSource]) {
      expect(source).toContain("neutralSpeakerDisplayName(");
      expect(source).not.toMatch(/\?\?\s*participantId\b/);
      expect(source).not.toMatch(
        /displayName:\s*profile\?\.displayName\s*\?\?\s*approvedSpeakerNameById/,
      );
    }
  });
});
