import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectOrganizationIdMigrationReadiness,
  PreflightError,
  parseDotEnv,
  validateReleaseConfiguration,
  verifyCloudflare,
  verifyForgePrivacy,
} from "./preflight-lib.mjs";

const environments = ["local", "staging", "production"];
const accountId = "7bcb73282d45e4294cc70dd3e2671bfb";

function configurationFor(environment, index) {
  const local = environment === "local";
  const webOrigin = local ? "http://localhost:3015" : `https://${environment}.example.test`;
  const apiOrigin = local ? "http://localhost:8787" : `https://api-${environment}.example.test`;
  return {
    APP_ENV: environment,
    WEB_ORIGIN: webOrigin,
    NEXT_PUBLIC_APP_URL: webOrigin,
    NEXT_PUBLIC_API_URL: apiOrigin,
    API_URL: apiOrigin,
    BETTER_AUTH_SECRET: `${environment}-${"a".repeat(40)}`,
    BETTER_AUTH_URL: apiOrigin,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: `cloudflare-token-${environment}`,
    CLOUDFLARE_API_AUDIT_TOKEN: `audit-token-${environment}`,
    CLOUDFLARE_TOKEN_KIND: "user",
    D1_DATABASE_ID: `11111111-1111-1111-1111-11111111111${index}`,
    R2_BUCKET_NAME: `open-sessionboard-private-files-${environment}`,
    QUEUE_NAME: `open-sessionboard-outbox-${environment}`,
    AIRTABLE_ACCESS_TOKEN: `airtable-token-${environment}`,
    AIRTABLE_BASE_ID: `airtable-base-${environment}`,
    OPENSEND_API_URL: "https://opensend.example.test",
    OPENSEND_API_KEY: `opensend-key-${environment}`,
    AUTH_FROM_EMAIL: "auth@foreverbrowsing.com",
    SPEAKERS_FROM_EMAIL: "speakers@foreverbrowsing.com",
    CALENDAR_FROM_EMAIL: "calendar@foreverbrowsing.com",
    ACCELEVENTS_API_BASE_URL: `https://api-${environment}.accelevents.example`,
    ACCELEVENTS_API_KEY: `accelevents-key-${environment}`,
    FORGE_API_URL: "https://forge.example.test",
    FORGE_REPOSITORY: "jaeyunha/open-sessionboard",
    FORGE_API_TOKEN: "forge-secret-token",
  };
}

function fixtures() {
  const configurations = Object.fromEntries(
    environments.map((environment, index) => [
      environment,
      configurationFor(environment, index + 1),
    ]),
  );
  const wranglerInventory = Object.fromEntries(
    environments.map((environment) => [
      environment,
      {
        accountId,
        webOrigin: configurations[environment].WEB_ORIGIN,
        databaseId: configurations[environment].D1_DATABASE_ID,
        databaseName: `open-sessionboard-${environment}`,
        bucketName: configurations[environment].R2_BUCKET_NAME,
        queueName: configurations[environment].QUEUE_NAME,
      },
    ]),
  );
  return { configurations, wranglerInventory };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("parses env files without expanding or exposing assignments", () => {
  assert.deepEqual(
    parseDotEnv('APP_ENV=staging\nQUOTED="literal value"\nTOKEN=secret # comment\n'),
    { APP_ENV: "staging", QUOTED: "literal value", TOKEN: "secret" },
  );
  assert.throws(
    () => parseDotEnv("TOKEN=first\nTOKEN=second\n"),
    (error) => error instanceof PreflightError && error.code === "INVALID_ENV_FILE",
  );
});

test("validates provider presence, Wrangler alignment, and three-environment isolation", () => {
  const { configurations, wranglerInventory } = fixtures();
  const result = validateReleaseConfiguration({
    configurations,
    targetEnvironment: "staging",
    requiredProviders: ["accelevents"],
    wranglerInventory,
  });
  assert.deepEqual(result.providerStates.staging, {
    accelevents: "configured",
  });
});
test("rejects a partial optional integration provider", () => {
  const { configurations, wranglerInventory } = fixtures();
  delete configurations.production.ACCELEVENTS_API_KEY;

  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "staging",
        wranglerInventory,
      }),
    (error) =>
      error instanceof PreflightError &&
      error.code === "PARTIAL_PROVIDER_CONFIGURATION" &&
      error.message.includes("production"),
  );
});

test("rejects shared secrets without putting their values in the error", () => {
  const { configurations, wranglerInventory } = fixtures();
  const secret = configurations.local.AIRTABLE_ACCESS_TOKEN;
  configurations.staging.AIRTABLE_ACCESS_TOKEN = secret;

  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "staging",
        wranglerInventory,
      }),
    (error) => {
      assert.equal(error.code, "INVALID_ISOLATION");
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});

test("verifies Cloudflare policy scopes and exact D1, R2, and Queue resources", async () => {
  const { configurations, wranglerInventory } = fixtures();
  const configuration = configurations.staging;
  const wrangler = wranglerInventory.staging;
  const requested = [];
  const fetchImplementation = async (url, options) => {
    requested.push({ url: String(url), authorization: options.headers.Authorization });
    if (String(url).endsWith("/user/tokens/verify")) {
      return jsonResponse({
        success: true,
        result: { id: "deployment-token-id", status: "active" },
      });
    }
    if (String(url).endsWith("/user/tokens/deployment-token-id")) {
      return jsonResponse({
        success: true,
        result: {
          policies: [
            {
              effect: "allow",
              resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
              permission_groups: [
                { name: "Workers Scripts Write" },
                { name: "D1 Write" },
                { name: "Workers R2 Storage Write" },
                { name: "Queues Write" },
              ],
            },
          ],
        },
      });
    }
    if (String(url).includes("/d1/database/")) {
      return jsonResponse({
        success: true,
        result: { uuid: wrangler.databaseId, name: wrangler.databaseName },
      });
    }
    if (String(url).includes("/r2/buckets/")) {
      return jsonResponse({ success: true, result: { name: wrangler.bucketName } });
    }
    if (String(url).includes("/queues?name=")) {
      return jsonResponse({ success: true, result: [{ queue_name: wrangler.queueName }] });
    }
    throw new Error("unexpected request");
  };

  assert.deepEqual(await verifyCloudflare({ configuration, wrangler, fetchImplementation }), {
    tokenActive: true,
    scopesVerified: true,
    resourcesVerified: true,
  });
  assert.equal(requested[0].authorization, `Bearer ${configuration.CLOUDFLARE_API_TOKEN}`);
  assert.equal(requested[1].authorization, `Bearer ${configuration.CLOUDFLARE_API_AUDIT_TOKEN}`);
});

test("rejects a token without D1 Edit even when D1 is readable", async () => {
  const { configurations, wranglerInventory } = fixtures();
  const configuration = configurations.staging;
  const fetchImplementation = async (url) => {
    if (String(url).endsWith("/verify")) {
      return jsonResponse({ success: true, result: { id: "token-id", status: "active" } });
    }
    return jsonResponse({
      success: true,
      result: {
        policies: [
          {
            effect: "allow",
            resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
            permission_groups: [
              { name: "Workers Scripts Write" },
              { name: "Workers R2 Storage Write" },
              { name: "Queues Write" },
            ],
          },
        ],
      },
    });
  };

  await assert.rejects(
    verifyCloudflare({ configuration, wrangler: wranglerInventory.staging, fetchImplementation }),
    (error) => error.code === "CLOUDFLARE_SCOPE_INVALID" && error.message.includes("D1 Edit"),
  );
});

test("requires Forge to report the exact repository as private", async () => {
  const { configurations } = fixtures();
  const configuration = configurations.production;
  const fetchImplementation = async (_url, options) => {
    assert.equal(options.headers.Authorization, `token ${configuration.FORGE_API_TOKEN}`);
    return jsonResponse({ private: true, full_name: configuration.FORGE_REPOSITORY });
  };
  assert.deepEqual(await verifyForgePrivacy({ configuration, fetchImplementation }), {
    private: true,
  });

  await assert.rejects(
    verifyForgePrivacy({
      configuration,
      fetchImplementation: async () =>
        jsonResponse({ private: false, full_name: configuration.FORGE_REPOSITORY }),
    }),
    (error) => error.code === "FORGE_NOT_PRIVATE",
  );
});
test("exposes bounded organization migration readiness without configuration values", () => {
  const { configurations, wranglerInventory } = fixtures();
  configurations.production.ORGANIZER_AUTOJOIN_ORGANIZATION_ID = "foreverbrowsing";
  const readiness = inspectOrganizationIdMigrationReadiness({
    configurations,
    wranglerInventory,
  });

  assert.equal(readiness.sourceId, "foreverbrowsing");
  assert.equal(readiness.targetId, "ai-engineer");
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.namespaces.d1.length, environments.length);
  assert.equal(readiness.namespaces.airtable.length, environments.length);
  assert.equal(readiness.namespaces.r2.length, environments.length);
  assert.equal(readiness.namespaces.queue.length, environments.length);
  assert.equal(
    readiness.blockers.some((blocker) => blocker.code === "LEGACY_ORGANIZATION_ID_CONFIGURATION"),
    true,
  );
  assert.equal(
    JSON.stringify(readiness).includes(configurations.production.CLOUDFLARE_API_TOKEN),
    false,
  );
  assert.equal(
    JSON.stringify(readiness).includes(configurations.production.AIRTABLE_ACCESS_TOKEN),
    false,
  );
});
