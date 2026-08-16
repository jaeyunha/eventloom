import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the standard test command runs every required non-browser suite", () => {
  assert.equal(
    packageJson.scripts.test,
    "bun run test:unit && bun run test:scripts && bun run test:api && bun run test:runtime",
  );
  assert.equal(packageJson.scripts["test:unit"], "vitest run");
  assert.equal(
    packageJson.scripts["test:scripts"],
    "node --test scripts/*.test.mjs scripts/airtable/*.test.mjs scripts/cloudflare/*.test.mjs scripts/d1-airtable-migration/*/*.test.mjs scripts/db/*.test.mjs scripts/release/*.test.mjs",
  );
  assert.equal(packageJson.scripts["test:api"], "vitest run --config tests/api/vitest.config.ts");
  assert.equal(
    packageJson.scripts["test:runtime"],
    "vitest run --config tests/runtime/vitest.config.ts",
  );
  assert.equal(packageJson.scripts["test:e2e"], "node scripts/run-isolated-playwright.mjs");
  assert.equal(packageJson.scripts["test:eval"], "node --test scripts/eval/*.test.mjs");
});
