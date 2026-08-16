import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  inspectOrganizationIdMigrationReadiness,
  ORGANIZATION_ID_MIGRATION,
  PreflightError,
  parseDotEnv,
  parseWranglerInventory,
  validateOrganizationIdMigrationReport,
  validateReleaseConfiguration,
  verifyCloudflare,
  verifyForgePrivacy,
} from "./preflight-lib.mjs";

const environments = ["local", "staging", "production"];
const accountId = "11111111-1111-4111-8111-111111111111";
const apiWrangler = readFileSync(new URL("../../apps/api/wrangler.toml", import.meta.url), "utf8");

function configurationFor(environment, index) {
  const local = environment === "local";
  const webOrigin = local ? "http://127.0.0.1:3015" : `https://${environment}.example.test`;
  const apiOrigin = local ? "http://127.0.0.1:8787" : `https://api-${environment}.example.test`;
  return {
    APP_ENV: environment,
    WEB_ORIGIN: webOrigin,
    NEXT_PUBLIC_APP_URL: webOrigin,
    API_UPSTREAM_ORIGIN: apiOrigin,
    API_URL: apiOrigin,
    BETTER_AUTH_SECRET: `${environment}-${"a".repeat(40)}`,
    BETTER_AUTH_URL: apiOrigin,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: `cloudflare-token-${environment}`,
    CLOUDFLARE_API_AUDIT_TOKEN: `audit-token-${environment}`,
    CLOUDFLARE_TOKEN_KIND: "user",
    D1_DATABASE_ID: `11111111-1111-1111-1111-11111111111${index}`,
    R2_BUCKET_NAME: `eventloom-private-files-${environment}`,
    QUEUE_NAME: `eventloom-outbox-${environment}`,
    AIRTABLE_ACCESS_TOKEN: `airtable-token-${environment}`,
    AIRTABLE_BASE_ID: `airtable-base-${environment}`,
    OPENSEND_API_URL: "https://opensend.example.test",
    OPENSEND_API_KEY: `opensend-key-${environment}`,
    AUTH_FROM_EMAIL: "auth@foreverbrowsing.com",
    SPEAKERS_FROM_EMAIL: "speakers@foreverbrowsing.com",
    CALENDAR_FROM_EMAIL: "calendar@foreverbrowsing.com",
    CALENDAR_UID_DOMAIN: "calendar.foreverbrowsing.com",
    AI_PROVIDER: "disabled",
    OPENAI_MODEL: "general-model",
    OPENAI_AGENDA_MODEL: "agenda-model",
    OPENAI_EVALUATION_MODEL: "evaluation-model",
    OPENAI_REMIX_MODEL: "remix-model",
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
        databaseName: `eventloom-${environment}`,
        bucketName: configurations[environment].R2_BUCKET_NAME,
        queueName: configurations[environment].QUEUE_NAME,
      },
    ]),
  );
  return { configurations, wranglerInventory };
}
function migrationReport(overrides = {}) {
  return {
    sourceId: ORGANIZATION_ID_MIGRATION.sourceId,
    targetId: ORGANIZATION_ID_MIGRATION.targetId,
    mode: "dry-run",
    status: "ready",
    ready: true,
    readyForApply: true,
    namespaces: {
      d1: environments.map((environment, index) => ({
        environment,
        databaseId: `migration-d1-${index + 1}`,
        databaseName: `migration-${environment}`,
        tables: 1,
      })),
      airtable: environments.map((environment) => ({
        environment,
        baseId: `migration-base-${environment}`,
        tables: 1,
      })),
      r2: environments.map((environment) => ({
        environment,
        bucketName: `migration-bucket-${environment}`,
        objectInventoryComplete: true,
      })),
      queue: environments.map((environment) => ({
        environment,
        queueName: `migration-queue-${environment}`,
        deadLetterQueueName: `migration-dlq-${environment}`,
        messagesInspectable: true,
        drainConfirmed: true,
      })),
    },
    counts: {
      d1: { sourceRows: 0, targetRows: 0, rewritableRows: 0 },
      airtable: { sourceRecords: 0, targetRecords: 0, rewritableRecords: 0 },
      r2: { legacyKeys: 0, targetCollisions: 0 },
      queue: { queues: 3, deadLetterQueues: 0, messages: 0 },
    },
    blockers: [],
    protectedBoundaries: [...ORGANIZATION_ID_MIGRATION.protectedBoundaries],
    ...overrides,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("inventories current Worker names from the API Wrangler fixture", () => {
  const inventory = parseWranglerInventory(apiWrangler);

  assert.deepEqual(
    Object.fromEntries(
      environments.map((environment) => [environment, inventory[environment].workerName]),
    ),
    {
      local: "open-sessionboard-api-local",
      staging: "open-sessionboard-api-staging",
      production: "open-sessionboard-api-production",
    },
  );
});

test("inventories operator-chosen Worker names by Wrangler environment structure", () => {
  const customizedWrangler = apiWrangler
    .replace('name = "open-sessionboard-api-local"', 'name = "community-worker"')
    .replace('name = "open-sessionboard-api-staging"', 'name = "preview-service"')
    .replace('name = "open-sessionboard-api-production"', 'name = "conference-backend"');

  const inventory = parseWranglerInventory(customizedWrangler);
  assert.equal(inventory.local.workerName, "community-worker");
  assert.equal(inventory.staging.workerName, "preview-service");
  assert.equal(inventory.production.workerName, "conference-backend");
});

test("rejects missing, repeated, or shared Worker names", () => {
  const missingName = apiWrangler.replace('name = "open-sessionboard-api-staging"\n', "");
  assert.throws(
    () => parseWranglerInventory(missingName),
    (error) =>
      error instanceof PreflightError &&
      error.code === "INVALID_WRANGLER_CONFIGURATION" &&
      error.message.includes("Worker name"),
  );

  const repeatedDeclaration = apiWrangler.replace(
    'name = "open-sessionboard-api-staging"',
    'name = "preview-service"\nname = "preview-service-copy"',
  );
  assert.throws(
    () => parseWranglerInventory(repeatedDeclaration),
    (error) =>
      error instanceof PreflightError &&
      error.code === "INVALID_WRANGLER_CONFIGURATION" &&
      error.message.includes("Worker name"),
  );

  const sharedName = apiWrangler.replace(
    'name = "open-sessionboard-api-production"',
    'name = "open-sessionboard-api-staging"',
  );
  assert.throws(
    () => parseWranglerInventory(sharedName),
    (error) =>
      error instanceof PreflightError &&
      error.code === "INVALID_WRANGLER_CONFIGURATION" &&
      error.message.includes("Worker name"),
  );
});

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

test("validates D1-only configuration without legacy business-authority providers", () => {
  const { configurations, wranglerInventory } = fixtures();
  for (const configuration of Object.values(configurations)) {
    delete configuration.AIRTABLE_ACCESS_TOKEN;
    delete configuration.AIRTABLE_BASE_ID;
    delete configuration.ACCELEVENTS_API_BASE_URL;
    delete configuration.ACCELEVENTS_API_KEY;
  }
  assert.deepEqual(
    validateReleaseConfiguration({
      configurations,
      targetEnvironment: "staging",
      wranglerInventory,
    }),
    {},
  );
});

test("allows disabled AI without an OpenAI secret", () => {
  const { configurations, wranglerInventory } = fixtures();
  for (const configuration of Object.values(configurations)) {
    delete configuration.OPENAI_API_KEY;
  }

  assert.doesNotThrow(() =>
    validateReleaseConfiguration({
      configurations,
      targetEnvironment: "production",
      wranglerInventory,
    }),
  );
});

test("requires an OpenAI secret when the deployment selects OpenAI", () => {
  const { configurations, wranglerInventory } = fixtures();
  configurations.production.AI_PROVIDER = "openai";

  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "production",
        wranglerInventory,
      }),
    (error) => error.code === "MISSING_CONFIGURATION" && error.message.includes("OPENAI_API_KEY"),
  );

  configurations.production.OPENAI_API_KEY = "production-openai-secret";
  assert.doesNotThrow(() =>
    validateReleaseConfiguration({
      configurations,
      targetEnvironment: "production",
      wranglerInventory,
    }),
  );
});

test("rejects unsupported deployment AI providers", () => {
  for (const AI_PROVIDER of ["", "auto", "cloudflare", "other"]) {
    const { configurations, wranglerInventory } = fixtures();
    configurations.staging.AI_PROVIDER = AI_PROVIDER;
    assert.throws(
      () =>
        validateReleaseConfiguration({
          configurations,
          targetEnvironment: "staging",
          wranglerInventory,
        }),
      (error) =>
        error.code === (AI_PROVIDER ? "INVALID_CONFIGURATION" : "MISSING_CONFIGURATION") &&
        error.message.includes("AI_PROVIDER"),
    );
  }
});

test("requires valid deployment-owned sender and calendar UID identities", () => {
  const { configurations, wranglerInventory } = fixtures();

  configurations.staging.AUTH_FROM_EMAIL = "not-an-email";
  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "staging",
        wranglerInventory,
      }),
    (error) => error.code === "INVALID_CONFIGURATION" && error.message.includes("AUTH_FROM_EMAIL"),
  );

  configurations.staging.AUTH_FROM_EMAIL = "auth@foreverbrowsing.com";
  configurations.staging.CALENDAR_UID_DOMAIN = "https://calendar.example.test";
  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "staging",
        wranglerInventory,
      }),
    (error) =>
      error.code === "INVALID_CONFIGURATION" && error.message.includes("CALENDAR_UID_DOMAIN"),
  );
});

test("requires one consistent web and API origin contract per environment", () => {
  const { configurations, wranglerInventory } = fixtures();

  configurations.staging.NEXT_PUBLIC_APP_URL = "https://different-web.example.test";
  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "staging",
        wranglerInventory,
      }),
    (error) => error.code === "ORIGIN_CONTRACT_MISMATCH",
  );

  configurations.staging.NEXT_PUBLIC_APP_URL = configurations.staging.WEB_ORIGIN;
  configurations.staging.API_UPSTREAM_ORIGIN = "https://different-api.example.test";
  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "staging",
        wranglerInventory,
      }),
    (error) => error.code === "ORIGIN_CONTRACT_MISMATCH",
  );

  configurations.staging.API_UPSTREAM_ORIGIN = configurations.staging.API_URL;
  configurations.staging.BETTER_AUTH_URL = `${configurations.staging.API_URL}/unexpected`;
  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "staging",
        wranglerInventory,
      }),
    (error) => error.code === "ORIGIN_CONTRACT_MISMATCH",
  );

  configurations.staging.BETTER_AUTH_URL = configurations.staging.API_URL;
  configurations.staging.API_URL = configurations.staging.WEB_ORIGIN;
  configurations.staging.API_UPSTREAM_ORIGIN = configurations.staging.WEB_ORIGIN;
  configurations.staging.BETTER_AUTH_URL = configurations.staging.WEB_ORIGIN;
  assert.throws(
    () =>
      validateReleaseConfiguration({
        configurations,
        targetEnvironment: "staging",
        wranglerInventory,
      }),
    (error) => error.code === "ORIGIN_CONTRACT_MISMATCH",
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

test("requires Forge to report the exact repository identity", async () => {
  const { configurations } = fixtures();
  const configuration = configurations.production;
  const fetchImplementation = async (_url, options) => {
    assert.equal(options.headers.Authorization, `token ${configuration.FORGE_API_TOKEN}`);
    return jsonResponse({ private: true, full_name: configuration.FORGE_REPOSITORY });
  };
  assert.deepEqual(await verifyForgePrivacy({ configuration, fetchImplementation }), {
    private: true,
  });

  assert.deepEqual(
    await verifyForgePrivacy({
      configuration,
      fetchImplementation: async () =>
        jsonResponse({ private: false, full_name: configuration.FORGE_REPOSITORY }),
    }),
    { private: false },
  );

  await assert.rejects(
    verifyForgePrivacy({
      configuration,
      fetchImplementation: async () => jsonResponse({ private: false }),
    }),
    (error) => error.code === "FORGE_REPOSITORY_MISMATCH",
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
test("requires bounded dry-run evidence before online migration readiness", () => {
  const { configurations, wranglerInventory } = fixtures();
  const validation = validateOrganizationIdMigrationReport(undefined);
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "MIGRATION_REPORT_REQUIRED");

  const readiness = inspectOrganizationIdMigrationReadiness({
    configurations,
    wranglerInventory,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "requires-dry-run");
  assert.equal(readiness.evidence.supplied, false);
  assert.equal(readiness.evidence.valid, false);
  assert.equal(readiness.blockers[0].code, "MIGRATION_REPORT_REQUIRED");
});

test("rejects migration evidence with an unapproved identity target", () => {
  const { configurations, wranglerInventory } = fixtures();
  const report = migrationReport({ targetId: "unexpected-organization" });
  const validation = validateOrganizationIdMigrationReport(report);
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "INVALID_MIGRATION_REPORT");

  const readiness = inspectOrganizationIdMigrationReadiness({
    configurations,
    wranglerInventory,
    migrationReport: report,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockers[0].code, "INVALID_MIGRATION_REPORT");
});

test("rejects migration evidence that reports blocking findings", () => {
  const { configurations, wranglerInventory } = fixtures();
  const report = migrationReport({
    status: "blocked",
    blockers: [{ code: "TARGET_COLLISION", message: "target collision" }],
  });
  const validation = validateOrganizationIdMigrationReport(report);
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "MIGRATION_REPORT_BLOCKED");

  const readiness = inspectOrganizationIdMigrationReadiness({
    configurations,
    wranglerInventory,
    migrationReport: report,
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.blockers[0].code, "MIGRATION_REPORT_BLOCKED");
});

test("accepts only a ready, bounded dry-run report", () => {
  const { configurations, wranglerInventory } = fixtures();
  const report = migrationReport();
  const validation = validateOrganizationIdMigrationReport(report);
  assert.equal(validation.valid, true);

  const readiness = inspectOrganizationIdMigrationReadiness({
    configurations,
    wranglerInventory,
    migrationReport: report,
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.evidence.supplied, true);
  assert.equal(readiness.evidence.valid, true);
  assert.deepEqual(readiness.blockers, []);
  assert.equal(
    JSON.stringify(readiness).includes(configurations.production.CLOUDFLARE_API_TOKEN),
    false,
  );
});

test("keeps static organization blockers authoritative over valid migration evidence", () => {
  const { configurations, wranglerInventory } = fixtures();
  configurations.production.ORGANIZER_AUTOJOIN_ORGANIZATION_ID = ORGANIZATION_ID_MIGRATION.sourceId;

  const readiness = inspectOrganizationIdMigrationReadiness({
    configurations,
    wranglerInventory,
    migrationReport: migrationReport(),
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "blocked");
  assert.equal(
    readiness.blockers.some((blocker) => blocker.code === "LEGACY_ORGANIZATION_ID_CONFIGURATION"),
    true,
  );
});

test("rejects secret-bearing migration evidence without exposing its value", () => {
  const { configurations, wranglerInventory } = fixtures();
  const secret = "migration-report-secret";
  const report = migrationReport({ credentials: { token: secret } });
  const validation = validateOrganizationIdMigrationReport(report);
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "INVALID_MIGRATION_REPORT");

  const readiness = inspectOrganizationIdMigrationReadiness({
    configurations,
    wranglerInventory,
    migrationReport: report,
  });
  assert.equal(readiness.ready, false);
  assert.equal(JSON.stringify(readiness).includes(secret), false);
});
