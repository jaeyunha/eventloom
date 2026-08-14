import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the standard test command runs every repository test suite", () => {
  assert.deepEqual(packageJson.scripts, {
    ...packageJson.scripts,
    test: "bun run test:unit && bun run test:scripts && bun run test:api && bun run test:runtime",
    "test:unit": "vitest run",
    "test:scripts":
      "node --test scripts/*.test.mjs scripts/airtable/*.test.mjs scripts/cloudflare/*.test.mjs scripts/d1-airtable-migration/*/*.test.mjs scripts/db/*.test.mjs scripts/release/*.test.mjs",
    "test:eval": "node --test scripts/eval/*.test.mjs",
    "test:api": "vitest run --config tests/api/vitest.config.ts",
    "test:runtime": "vitest run --config tests/runtime/vitest.config.ts",
  });
});
