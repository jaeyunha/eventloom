import assert from "node:assert/strict";
import test from "node:test";
import { mergeCloudflareEnvironment, renderApiWrangler, resolveWebDeployment } from "./config.mjs";

const template = `
account_id = ""
WEB_ORIGIN = "https://web-staging.example.invalid"
API_ORIGIN = "https://api-staging.example.invalid"
CACHE_INVALIDATION_URL = "https://web-staging.example.invalid/api/internal/cache-invalidation"
database_id = "00000000-0000-0000-0000-000000000002"
`;

test("renders target Cloudflare resources from environment configuration", () => {
  const rendered = renderApiWrangler(template, "staging", {
    D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
    WEB_ORIGIN: "https://web.example.test",
    API_URL: "https://api.example.test",
  });

  assert.match(rendered, /database_id = "11111111-1111-4111-8111-111111111111"/);
  assert.match(rendered, /WEB_ORIGIN = "https:\/\/web\.example\.test"/);
  assert.match(rendered, /API_ORIGIN = "https:\/\/api\.example\.test"/);
  assert.match(
    rendered,
    /CACHE_INVALIDATION_URL = "https:\/\/web\.example\.test\/api\/internal\/cache-invalidation"/,
  );
  assert.doesNotMatch(rendered, /account_id = "[^"]+"/);
});

test("rejects missing deployment values for the selected environment", () => {
  assert.throws(
    () =>
      renderApiWrangler(template, "staging", {
        D1_DATABASE_ID: "",
        WEB_ORIGIN: "",
        API_URL: "",
      }),
    /staging D1_DATABASE_ID/,
  );
});

test("resolves web deployment identity from environment values", () => {
  assert.deepEqual(
    resolveWebDeployment("production", {
      NEXT_PUBLIC_APP_URL: "https://sessionboard.example.test",
      API_UPSTREAM_ORIGIN: "https://api.sessionboard.example.test",
    }),
    {
      workerName: "open-sessionboard-web-production",
      appOrigin: "https://sessionboard.example.test",
      apiOrigin: "https://api.sessionboard.example.test",
    },
  );
});

test("keeps local web defaults when no remote configuration is needed", () => {
  assert.deepEqual(resolveWebDeployment("local", {}), {
    workerName: "open-sessionboard-web-local",
    appOrigin: "http://localhost:3015",
    apiOrigin: "http://localhost:8787",
  });
});

test("merges shell over target environment over root defaults", () => {
  assert.deepEqual(
    mergeCloudflareEnvironment(
      { CLOUDFLARE_ACCOUNT_ID: "root", D1_DATABASE_ID: "root-d1", SHARED: "root" },
      { CLOUDFLARE_ACCOUNT_ID: "target", D1_DATABASE_ID: "target-d1" },
      { CLOUDFLARE_ACCOUNT_ID: "shell" },
    ),
    {
      CLOUDFLARE_ACCOUNT_ID: "shell",
      D1_DATABASE_ID: "target-d1",
      SHARED: "root",
    },
  );
});
