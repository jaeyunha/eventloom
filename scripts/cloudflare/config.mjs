import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const apiWranglerTemplatePath = join(repositoryRoot, "apps/api/wrangler.toml");
const generatedApiWranglerPath = join(repositoryRoot, "apps/api/wrangler.generated.toml");
const environments = ["staging", "production"];
const placeholders = {
  staging: {
    D1_DATABASE_ID: "00000000-0000-0000-0000-000000000002",
    WEB_ORIGIN: "https://web-staging.example.invalid",
    API_URL: "https://api-staging.example.invalid",
  },
  production: {
    D1_DATABASE_ID: "00000000-0000-0000-0000-000000000003",
    WEB_ORIGIN: "https://web-production.example.invalid",
    API_URL: "https://api-production.example.invalid",
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
  return template
    .replaceAll(placeholder.D1_DATABASE_ID, id)
    .replaceAll(placeholder.WEB_ORIGIN, webOrigin)
    .replaceAll(placeholder.API_URL, apiOrigin);
}

export function resolveWebDeployment(environment, configuration) {
  if (environment === "local") {
    return {
      workerName: "open-sessionboard-web-local",
      appOrigin: "http://localhost:3015",
      apiOrigin: "http://localhost:8787",
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

export function mergeCloudflareEnvironment(root, target, shell) {
  const merged = { ...root, ...target };
  for (const [key, value] of Object.entries(shell)) {
    if (typeof value === "string") merged[key] = value;
  }
  return merged;
}

export function loadCloudflareEnvironment(environment) {
  const environmentPath = join(repositoryRoot, `.env.cloudflare-${environment}`);
  const rootPath = join(repositoryRoot, ".env");
  const shell = { ...process.env };
  const merged = mergeCloudflareEnvironment(
    parseEnvironmentFile(rootPath),
    parseEnvironmentFile(environmentPath),
    shell,
  );
  Object.assign(process.env, merged);
  return merged;
}

export { apiWranglerTemplatePath, generatedApiWranglerPath };
