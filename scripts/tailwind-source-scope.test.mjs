import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Tailwind scans authored web sources instead of generated Next caches", async () => {
  // Given
  const stylesheetUrl = new URL("../apps/web/src/app/globals.css", import.meta.url);

  // When
  const stylesheet = await readFile(stylesheetUrl, "utf8");
  const tailwindImport = stylesheet
    .split("\n")
    .find((line) => line.startsWith('@import "tailwindcss"'));

  // Then
  assert.equal(tailwindImport, '@import "tailwindcss" source("../");');
});
