import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  mergeCloudflareEnvironment,
  renderApiWrangler,
  renderWebWrangler,
  resolveWebDeployment,
  rootEnvironmentForDeployment,
} from "./config.mjs";

const webWrangler = readFileSync(new URL("../../apps/web/wrangler.jsonc", import.meta.url), "utf8");
const apiWrangler = readFileSync(new URL("../../apps/api/wrangler.toml", import.meta.url), "utf8");

const template = `
account_id = ""
[env.staging.vars]
WEB_ORIGIN = "https://web-staging.example.invalid"
API_ORIGIN = "https://api-staging.example.invalid"
CACHE_INVALIDATION_URL = "https://web-staging.example.invalid/api/internal/cache-invalidation"
OPENSEND_API_URL = "https://opensend-staging.example.invalid"
AUTH_FROM_EMAIL = "auth@staging.example.invalid"
SPEAKERS_FROM_EMAIL = "speakers@staging.example.invalid"
CALENDAR_FROM_EMAIL = "calendar@staging.example.invalid"
CALENDAR_UID_DOMAIN = "calendar.staging.example.invalid"
AIRTABLE_OAUTH_CLIENT_ID = "staging-airtable-oauth-client-placeholder"
AIRTABLE_PAT_CONNECTION_ENABLED = "false"
AI_PROVIDER = "disabled"
OPENAI_MODEL = "staging-openai-model-placeholder"
OPENAI_AGENDA_MODEL = "staging-openai-agenda-model-placeholder"
OPENAI_EVALUATION_MODEL = "staging-openai-evaluation-model-placeholder"
OPENAI_REMIX_MODEL = "staging-openai-remix-model-placeholder"
database_id = "00000000-0000-0000-0000-000000000002"
[env.production.vars]
AIRTABLE_OAUTH_CLIENT_ID = "production-airtable-oauth-client-placeholder"
AIRTABLE_PAT_CONNECTION_ENABLED = "false"
AI_PROVIDER = "disabled"
[[env.production.routes]]
pattern = "api-production.example.invalid"
zone_name = "production.example.invalid"
custom_domain = true
`;

function tomlSection(source, name) {
  const header = `[${name}]`;
  const start = source.indexOf(header);
  assert.notEqual(start, -1, `Missing TOML section ${header}`);
  const next = source.indexOf("\n[", start + header.length);
  return source.slice(start, next < 0 ? source.length : next);
}

const productionConfiguration = {
  D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
  WEB_ORIGIN: "https://sessions.operator.example",
  API_URL: "https://api.sessions.operator.example",
  WEB_HOSTNAME: "sessions.operator.example",
  WEB_ZONE_NAME: "operator.example",
  API_HOSTNAME: "api.sessions.operator.example",
  API_ZONE_NAME: "operator.example",
  OPENSEND_API_URL: "https://mail.operator.example/opensend",
  AUTH_FROM_EMAIL: "login@operator.example",
  SPEAKERS_FROM_EMAIL: "program@operator.example",
  CALENDAR_FROM_EMAIL: "schedule@operator.example",
  CALENDAR_UID_DOMAIN: "calendar.operator.example",
  AIRTABLE_OAUTH_CLIENT_ID: "airtable-oauth-client",
  AIRTABLE_PAT_CONNECTION_ENABLED: "false",
  AI_PROVIDER: "openai",
  OPENAI_MODEL: "general-model",
  OPENAI_AGENDA_MODEL: "agenda-model",
  OPENAI_EVALUATION_MODEL: "evaluation-model",
  OPENAI_REMIX_MODEL: "remix-model",
};

test("renders target Cloudflare resources from environment configuration", () => {
  const rendered = renderApiWrangler(template, "staging", {
    ...productionConfiguration,
    WEB_ORIGIN: "https://web.example.test",
    API_URL: "https://api.example.test",
    OPENSEND_API_URL: "https://mail.example.test/opensend",
    AUTH_FROM_EMAIL: "login@example.test",
    SPEAKERS_FROM_EMAIL: "program@example.test",
    CALENDAR_FROM_EMAIL: "schedule@example.test",
    CALENDAR_UID_DOMAIN: "calendar.example.test",
    AIRTABLE_OAUTH_CLIENT_ID: "airtable-oauth-client",
    AIRTABLE_PAT_CONNECTION_ENABLED: "false",
  });

  assert.match(rendered, /database_id = "11111111-1111-4111-8111-111111111111"/);
  assert.match(rendered, /WEB_ORIGIN = "https:\/\/web\.example\.test"/);
  assert.match(rendered, /API_ORIGIN = "https:\/\/api\.example\.test"/);
  assert.match(
    rendered,
    /CACHE_INVALIDATION_URL = "https:\/\/web\.example\.test\/api\/internal\/cache-invalidation"/,
  );
  assert.match(rendered, /OPENSEND_API_URL = "https:\/\/mail\.example\.test\/opensend"/);
  assert.match(rendered, /AUTH_FROM_EMAIL = "login@example\.test"/);
  assert.match(rendered, /SPEAKERS_FROM_EMAIL = "program@example\.test"/);
  assert.match(rendered, /CALENDAR_FROM_EMAIL = "schedule@example\.test"/);
  assert.match(rendered, /CALENDAR_UID_DOMAIN = "calendar\.example\.test"/);
  assert.match(rendered, /AIRTABLE_OAUTH_CLIENT_ID = "airtable-oauth-client"/);
  assert.match(rendered, /AIRTABLE_PAT_CONNECTION_ENABLED = "false"/);
  assert.match(rendered, /AI_PROVIDER = "openai"/);
  assert.match(rendered, /OPENAI_MODEL = "general-model"/);
  assert.match(rendered, /OPENAI_AGENDA_MODEL = "agenda-model"/);
  assert.match(rendered, /OPENAI_EVALUATION_MODEL = "evaluation-model"/);
  assert.match(rendered, /OPENAI_REMIX_MODEL = "remix-model"/);
  assert.doesNotMatch(rendered, /account_id = "[^"]+"/);
});

test("rejects missing deployment values for the selected environment", () => {
  assert.throws(
    () =>
      renderApiWrangler(template, "staging", {
        D1_DATABASE_ID: "",
        WEB_ORIGIN: "",
        API_URL: "",
        OPENSEND_API_URL: "",
        AUTH_FROM_EMAIL: "",
        SPEAKERS_FROM_EMAIL: "",
        CALENDAR_FROM_EMAIL: "",
        CALENDAR_UID_DOMAIN: "",
        AI_PROVIDER: "",
        OPENAI_MODEL: "",
        OPENAI_AGENDA_MODEL: "",
        OPENAI_EVALUATION_MODEL: "",
        OPENAI_REMIX_MODEL: "",
      }),
    /staging D1_DATABASE_ID/,
  );
});

test("renders AI_PROVIDER only into the selected environment section", () => {
  const originalLocal = tomlSection(apiWrangler, "vars");
  const originalStaging = tomlSection(apiWrangler, "env.staging.vars");
  const originalProduction = tomlSection(apiWrangler, "env.production.vars");

  const stagingRendered = renderApiWrangler(apiWrangler, "staging", {
    ...productionConfiguration,
    WEB_ORIGIN: "https://staging.operator.example",
    API_URL: "https://api-staging.operator.example",
  });
  assert.equal(tomlSection(stagingRendered, "vars"), originalLocal);
  assert.match(tomlSection(stagingRendered, "env.staging.vars"), /^AI_PROVIDER = "openai"$/m);
  assert.equal(tomlSection(stagingRendered, "env.production.vars"), originalProduction);

  const productionRendered = renderApiWrangler(apiWrangler, "production", productionConfiguration);
  assert.equal(tomlSection(productionRendered, "vars"), originalLocal);
  assert.equal(tomlSection(productionRendered, "env.staging.vars"), originalStaging);
  assert.match(tomlSection(productionRendered, "env.production.vars"), /^AI_PROVIDER = "openai"$/m);
});

test("requires the target AI provider to live in its environment vars section", () => {
  assert.throws(
    () =>
      renderApiWrangler(template.replace("[env.staging.vars]\n", ""), "staging", {
        ...productionConfiguration,
        WEB_ORIGIN: "https://staging.operator.example",
        API_URL: "https://api-staging.operator.example",
      }),
    /Wrangler template is missing \[env\.staging\.vars\]/,
  );
});

test("rejects unsupported deployment AI providers", () => {
  for (const AI_PROVIDER of ["", "auto", "cloudflare", "other"]) {
    assert.throws(
      () =>
        renderApiWrangler(template, "staging", {
          ...productionConfiguration,
          AI_PROVIDER,
          WEB_ORIGIN: "https://staging.operator.example",
          API_URL: "https://api-staging.operator.example",
        }),
      AI_PROVIDER
        ? /staging AI_PROVIDER must be disabled or openai/
        : /staging AI_PROVIDER must be supplied by the environment file/,
    );
  }
});

test("renders operator-owned production routes for both Workers", () => {
  const apiRendered = renderApiWrangler(template, "production", productionConfiguration);
  assert.match(apiRendered, /pattern = "api\.sessions\.operator\.example"/);
  assert.match(apiRendered, /zone_name = "operator\.example"/);
  assert.doesNotMatch(apiRendered, /api-production\.example\.invalid/);

  const webRendered = renderWebWrangler(webWrangler, "production", {
    ...productionConfiguration,
    NEXT_PUBLIC_APP_URL: productionConfiguration.WEB_ORIGIN,
    API_UPSTREAM_ORIGIN: productionConfiguration.API_URL,
  });
  assert.match(webRendered, /"pattern": "sessions\.operator\.example"/);
  assert.match(webRendered, /"zone_name": "operator\.example"/);
  assert.doesNotMatch(webRendered, /web-production\.example\.invalid/);
});

test("requires explicit production hostnames and zones", () => {
  assert.throws(
    () =>
      renderApiWrangler(template, "production", { ...productionConfiguration, API_HOSTNAME: "" }),
    /production API_HOSTNAME/,
  );
  assert.throws(
    () =>
      renderWebWrangler(webWrangler, "production", {
        ...productionConfiguration,
        NEXT_PUBLIC_APP_URL: productionConfiguration.WEB_ORIGIN,
        API_UPSTREAM_ORIGIN: productionConfiguration.API_URL,
        WEB_ZONE_NAME: "unrelated.example",
      }),
    /WEB_HOSTNAME must belong to WEB_ZONE_NAME/,
  );
});

test("keeps staging on workers.dev without custom-domain routes", () => {
  const rendered = renderWebWrangler(webWrangler, "staging", {
    NEXT_PUBLIC_APP_URL: "https://open-sessionboard-web-staging.example.workers.dev",
    API_UPSTREAM_ORIGIN: "https://open-sessionboard-api-staging.example.workers.dev",
  });
  assert.match(rendered, /"staging":\s*\{[\s\S]*?"workers_dev": true/);
  assert.doesNotMatch(
    rendered.match(/"staging":\s*\{[\s\S]*?\n {4}\},\n {4}"production"/)?.[0] ?? "",
    /"routes"/,
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

test("keeps local web defaults on loopback IP origins", () => {
  assert.deepEqual(resolveWebDeployment("local", {}), {
    workerName: "open-sessionboard-web-local",
    appOrigin: "http://127.0.0.1:3015",
    apiOrigin: "http://127.0.0.1:8787",
  });
});

test("uses loopback IP origins in local web Wrangler configuration", () => {
  assert.match(webWrangler, /"NEXT_PUBLIC_APP_URL":\s*"http:\/\/127\.0\.0\.1:3015"/);
  assert.match(webWrangler, /"API_UPSTREAM_ORIGIN":\s*"http:\/\/127\.0\.0\.1:8787"/);
  assert.doesNotMatch(webWrangler, /http:\/\/localhost/);
});

test("disables Workers Dev for the production web Worker", () => {
  assert.match(webWrangler, /"production":\s*\{[\s\S]*?"workers_dev":\s*false/);
});

test("disables Workers Dev for the production API Worker", () => {
  assert.match(apiWrangler, /\[env\.production\][\s\S]*?workers_dev\s*=\s*false/);
});

test("keeps hosted production domains out of committed routing templates", () => {
  assert.doesNotMatch(webWrangler, /eventloom\.namuh\.co|"namuh\.co"/);
  assert.doesNotMatch(apiWrangler, /eventloom\.namuh\.co|"namuh\.co"/);
});

test("keeps API keys out of committed Wrangler vars", () => {
  assert.doesNotMatch(apiWrangler, /^OPENSEND_API_KEY\s*=/m);
});

test("keeps the Cloudflare account identity out of committed web configuration", () => {
  assert.doesNotMatch(webWrangler, /"account_id"\s*:/);
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

test("does not inherit local root secrets into staging or production", () => {
  const root = {
    AIRTABLE_ACCESS_TOKEN: "local-airtable-token",
    OPENAI_API_KEY: "local-openai-key",
  };

  assert.deepEqual(rootEnvironmentForDeployment("staging", root), {});
  assert.deepEqual(rootEnvironmentForDeployment("production", root), {});
  assert.deepEqual(rootEnvironmentForDeployment("local", root), root);
});
