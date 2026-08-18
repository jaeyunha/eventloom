import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const apiWranglerTemplatePath = join(repositoryRoot, "apps/api/wrangler.toml");
const generatedApiWranglerPath = join(repositoryRoot, "apps/api/wrangler.generated.toml");
const webWranglerTemplatePath = join(repositoryRoot, "apps/web/wrangler.jsonc");
const generatedWebWranglerPath = join(repositoryRoot, "apps/web/wrangler.generated.jsonc");
const environments = ["staging", "production"];
const placeholders = {
  staging: {
    D1_DATABASE_ID: "00000000-0000-0000-0000-000000000002",
    WEB_ORIGIN: "https://web-staging.example.invalid",
    API_URL: "https://api-staging.example.invalid",
    OPENSEND_API_URL: "https://opensend-staging.example.invalid",
    AUTH_FROM_EMAIL: "auth@staging.example.invalid",
    SPEAKERS_FROM_EMAIL: "speakers@staging.example.invalid",
    CALENDAR_FROM_EMAIL: "calendar@staging.example.invalid",
    CALENDAR_UID_DOMAIN: "calendar.staging.example.invalid",
    AIRTABLE_OAUTH_CLIENT_ID: "staging-airtable-oauth-client-placeholder",
    OPENAI_MODEL: "staging-openai-model-placeholder",
    OPENAI_AGENDA_MODEL: "staging-openai-agenda-model-placeholder",
    OPENAI_EVALUATION_MODEL: "staging-openai-evaluation-model-placeholder",
    OPENAI_REMIX_MODEL: "staging-openai-remix-model-placeholder",
  },
  production: {
    D1_DATABASE_ID: "00000000-0000-0000-0000-000000000003",
    WEB_ORIGIN: "https://web-production.example.invalid",
    API_URL: "https://api-production.example.invalid",
    OPENSEND_API_URL: "https://opensend-production.example.invalid",
    AUTH_FROM_EMAIL: "auth@production.example.invalid",
    SPEAKERS_FROM_EMAIL: "speakers@production.example.invalid",
    CALENDAR_FROM_EMAIL: "calendar@production.example.invalid",
    CALENDAR_UID_DOMAIN: "calendar.production.example.invalid",
    AIRTABLE_OAUTH_CLIENT_ID: "production-airtable-oauth-client-placeholder",
    OPENAI_MODEL: "production-openai-model-placeholder",
    OPENAI_AGENDA_MODEL: "production-openai-agenda-model-placeholder",
    OPENAI_EVALUATION_MODEL: "production-openai-evaluation-model-placeholder",
    OPENAI_REMIX_MODEL: "production-openai-remix-model-placeholder",
    API_HOSTNAME: "api-production.example.invalid",
    API_ZONE_NAME: "production.example.invalid",
    WEB_HOSTNAME: "web-production.example.invalid",
    WEB_ZONE_NAME: "production.example.invalid",
  },
};

function required(configuration, key, environment) {
  const value = configuration[key]?.trim();
  if (!value) throw new Error(`${environment} ${key} must be supplied by the environment file.`);
  return value;
}

function origin(configuration, key, environment) {
  const parsed = new URL(required(configuration, key, environment));
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${environment} ${key} must be an HTTPS origin without a path.`);
  }
  return parsed.origin;
}

function httpsEndpoint(configuration, key, environment) {
  const value = required(configuration, key, environment);
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${environment} ${key} must be an HTTPS URL without credentials, query, or fragment.`,
    );
  }
  return parsed.toString().replace(/\/$/u, "");
}

function email(configuration, key, environment) {
  const value = required(configuration, key, environment).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
    throw new Error(`${environment} ${key} must be a valid email address.`);
  }
  return value;
}

function domain(configuration, key, environment) {
  const value = required(configuration, key, environment).toLowerCase();
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
  if (
    value.length > 253 ||
    value.endsWith(".") ||
    !value.includes(".") ||
    !value.split(".").every((part) => label.test(part))
  ) {
    throw new Error(`${environment} ${key} must be a valid domain name.`);
  }
  return value;
}

function productionRoute(configuration, service, originKey, environment) {
  const hostnameKey = `${service}_HOSTNAME`;
  const zoneKey = `${service}_ZONE_NAME`;
  const hostname = domain(configuration, hostnameKey, environment);
  const zoneName = domain(configuration, zoneKey, environment);
  const serviceOrigin = origin(configuration, originKey, environment);
  if (new URL(serviceOrigin).hostname !== hostname) {
    throw new Error(`${environment} ${hostnameKey} must match the hostname in ${originKey}.`);
  }
  if (hostname !== zoneName && !hostname.endsWith(`.${zoneName}`)) {
    throw new Error(`${environment} ${hostnameKey} must belong to ${zoneKey}.`);
  }
  return { hostname, zoneName };
}

function tomlString(configuration, key, environment) {
  const value = required(configuration, key, environment);
  if (/['"\\\r\n]/u.test(value)) {
    throw new Error(`${environment} ${key} contains unsupported characters.`);
  }
  return value;
}

function aiProvider(configuration, environment) {
  const value = required(configuration, "AI_PROVIDER", environment).toLowerCase();
  if (value !== "disabled" && value !== "openai") {
    throw new Error(`${environment} AI_PROVIDER must be disabled or openai.`);
  }
  return value;
}

function patConnectionEnabled(configuration, environment) {
  const value = configuration.AIRTABLE_PAT_CONNECTION_ENABLED?.trim().toLowerCase() || "false";
  if (value !== "true" && value !== "false") {
    throw new Error(`${environment} AIRTABLE_PAT_CONNECTION_ENABLED must be true or false.`);
  }
  return value;
}

const reasoningEfforts = ["none", "low", "medium", "high", "xhigh", "max"];

function optionalReasoningEffort(configuration, environment, key) {
  const value = configuration[key]?.trim().toLowerCase();
  if (value === undefined || value === "") return null;
  if (!reasoningEfforts.includes(value)) {
    throw new Error(`${environment} ${key} must be one of ${reasoningEfforts.join(", ")}.`);
  }
  return value;
}

function replaceEnvironmentVariable(template, environment, key, value) {
  const sectionHeader = `[env.${environment}.vars]`;
  const sectionStart = template.indexOf(sectionHeader);
  if (sectionStart < 0) {
    throw new Error(`Wrangler template is missing ${sectionHeader}.`);
  }
  const nextSection = template.indexOf("\n[", sectionStart + sectionHeader.length);
  const sectionEnd = nextSection < 0 ? template.length : nextSection;
  const section = template.slice(sectionStart, sectionEnd);
  const assignment = new RegExp(`^${key}\\s*=\\s*"[^"]*"$`, "m");
  if (!assignment.test(section)) {
    throw new Error(`Wrangler template is missing ${key} in ${sectionHeader}.`);
  }
  const renderedSection = section.replace(assignment, `${key} = "${value}"`);
  return `${template.slice(0, sectionStart)}${renderedSection}${template.slice(sectionEnd)}`;
}

function databaseId(configuration, environment) {
  const id = required(configuration, "D1_DATABASE_ID", environment);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${environment} D1_DATABASE_ID must be a UUID.`);
  }
  return id;
}

export function renderApiWrangler(template, environment, configuration) {
  if (!environments.includes(environment)) throw new Error("Unknown Cloudflare environment.");
  const placeholder = placeholders[environment];
  const id = databaseId(configuration, environment);
  const webOrigin = origin(configuration, "WEB_ORIGIN", environment);
  const apiOrigin = origin(configuration, "API_URL", environment);
  const replacements = {
    D1_DATABASE_ID: id,
    WEB_ORIGIN: webOrigin,
    API_URL: apiOrigin,
    OPENSEND_API_URL: httpsEndpoint(configuration, "OPENSEND_API_URL", environment),
    AUTH_FROM_EMAIL: email(configuration, "AUTH_FROM_EMAIL", environment),
    SPEAKERS_FROM_EMAIL: email(configuration, "SPEAKERS_FROM_EMAIL", environment),
    CALENDAR_FROM_EMAIL: email(configuration, "CALENDAR_FROM_EMAIL", environment),
    CALENDAR_UID_DOMAIN: domain(configuration, "CALENDAR_UID_DOMAIN", environment),
    AIRTABLE_OAUTH_CLIENT_ID: tomlString(configuration, "AIRTABLE_OAUTH_CLIENT_ID", environment),
    OPENAI_MODEL: tomlString(configuration, "OPENAI_MODEL", environment),
    OPENAI_AGENDA_MODEL: tomlString(configuration, "OPENAI_AGENDA_MODEL", environment),
    OPENAI_EVALUATION_MODEL: tomlString(configuration, "OPENAI_EVALUATION_MODEL", environment),
    OPENAI_REMIX_MODEL: tomlString(configuration, "OPENAI_REMIX_MODEL", environment),
  };
  if (environment === "production") {
    const route = productionRoute(configuration, "API", "API_URL", environment);
    replacements.API_HOSTNAME = route.hostname;
    replacements.API_ZONE_NAME = route.zoneName;
  }
  const rendered = Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(placeholder[key], value),
    template,
  );
  let configured = replaceEnvironmentVariable(
    replaceEnvironmentVariable(
      rendered,
      environment,
      "AI_PROVIDER",
      aiProvider(configuration, environment),
    ),
    environment,
    "AIRTABLE_PAT_CONNECTION_ENABLED",
    patConnectionEnabled(configuration, environment),
  );
  for (const key of [
    "OPENAI_AGENDA_REASONING_EFFORT",
    "OPENAI_EVALUATION_REASONING_EFFORT",
    "OPENAI_REMIX_REASONING_EFFORT",
  ]) {
    const effort = optionalReasoningEffort(configuration, environment, key);
    if (effort !== null) {
      configured = replaceEnvironmentVariable(configured, environment, key, effort);
    }
  }
  return configured;
}

export function renderWebWrangler(template, environment, configuration) {
  if (!environments.includes(environment)) throw new Error("Unknown Cloudflare environment.");
  const placeholder = placeholders[environment];
  const replacements = {
    WEB_ORIGIN: origin(configuration, "NEXT_PUBLIC_APP_URL", environment),
    API_URL: origin(configuration, "API_UPSTREAM_ORIGIN", environment),
  };
  if (environment === "production") {
    const route = productionRoute(configuration, "WEB", "NEXT_PUBLIC_APP_URL", environment);
    replacements.WEB_HOSTNAME = route.hostname;
    replacements.WEB_ZONE_NAME = route.zoneName;
  }
  return Object.entries(replacements).reduce(
    (rendered, [key, value]) => rendered.replaceAll(placeholder[key], value),
    template,
  );
}

export function resolveWebDeployment(environment, configuration) {
  if (environment === "local") {
    return {
      workerName: "open-sessionboard-web-local",
      appOrigin: "http://127.0.0.1:3015",
      apiOrigin: "http://127.0.0.1:8787",
    };
  }
  if (!environments.includes(environment)) throw new Error("Unknown Cloudflare environment.");
  return {
    workerName: `open-sessionboard-web-${environment}`,
    appOrigin: origin(configuration, "NEXT_PUBLIC_APP_URL", environment),
    apiOrigin: origin(configuration, "API_UPSTREAM_ORIGIN", environment),
  };
}

export function writeApiWrangler(
  environment,
  configuration,
  outputPath = generatedApiWranglerPath,
) {
  const template = readFileSync(apiWranglerTemplatePath, "utf8");
  const rendered = renderApiWrangler(template, environment, configuration);
  writeFileSync(outputPath, rendered, { encoding: "utf8", mode: 0o600 });
  return outputPath;
}

export function writeWebWrangler(
  environment,
  configuration,
  outputPath = generatedWebWranglerPath,
) {
  const template = readFileSync(webWranglerTemplatePath, "utf8");
  const rendered = renderWebWrangler(template, environment, configuration);
  writeFileSync(outputPath, rendered, { encoding: "utf8", mode: 0o600 });
  return outputPath;
}

function parseEnvironmentFile(path) {
  if (!existsSync(path)) return {};
  const configuration = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/u, "").trim();
    }
    configuration[key] = value;
  }
  return configuration;
}

export function cloudflareEnvironmentPath(environment) {
  if (!environments.includes(environment)) {
    throw new Error(`Unsupported Cloudflare environment: ${environment}`);
  }
  return join(repositoryRoot, `.env.cloudflare-${environment}`);
}

export function readCloudflareEnvironmentFile(environment) {
  const path = cloudflareEnvironmentPath(environment);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}`);
  }
  return parseEnvironmentFile(path);
}

export function mergeCloudflareEnvironment(root, target, shell) {
  const merged = { ...root, ...target };
  for (const [key, value] of Object.entries(shell)) {
    if (typeof value === "string") merged[key] = value;
  }
  return merged;
}

export function rootEnvironmentForDeployment(environment, root) {
  return environment === "local" ? root : {};
}

export function loadCloudflareEnvironment(environment) {
  const environmentPath = cloudflareEnvironmentPath(environment);
  const rootPath = join(repositoryRoot, ".env");
  const shell = { ...process.env };
  const merged = mergeCloudflareEnvironment(
    rootEnvironmentForDeployment(environment, parseEnvironmentFile(rootPath)),
    parseEnvironmentFile(environmentPath),
    shell,
  );
  Object.assign(process.env, merged);
  return merged;
}

export {
  apiWranglerTemplatePath,
  generatedApiWranglerPath,
  generatedWebWranglerPath,
  webWranglerTemplatePath,
};
