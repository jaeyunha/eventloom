const ENVIRONMENTS = ["local", "staging", "production"];

const REQUIRED_CONFIGURATION = [
  "APP_ENV",
  "WEB_ORIGIN",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_API_URL",
  "API_URL",
  "BETTER_AUTH_SECRET",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "D1_DATABASE_ID",
  "R2_BUCKET_NAME",
  "QUEUE_NAME",
  "AIRTABLE_ACCESS_TOKEN",
  "AIRTABLE_BASE_ID",
  "OPENSEND_API_URL",
  "OPENSEND_API_KEY",
  "AUTH_FROM_EMAIL",
  "SPEAKERS_FROM_EMAIL",
  "CALENDAR_FROM_EMAIL",
];

const OPTIONAL_PROVIDERS = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  microsoft: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
  accelevents: ["ACCELEVENTS_API_BASE_URL", "ACCELEVENTS_API_KEY"],
};

const ISOLATED_CONFIGURATION = [
  "BETTER_AUTH_SECRET",
  "CLOUDFLARE_API_TOKEN",
  "D1_DATABASE_ID",
  "R2_BUCKET_NAME",
  "QUEUE_NAME",
  "AIRTABLE_ACCESS_TOKEN",
  "AIRTABLE_BASE_ID",
  "OPENSEND_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "ACCELEVENTS_API_KEY",
];

const REQUIRED_CLOUDFLARE_PERMISSIONS = {
  "Workers Scripts Edit": ["workersscriptsedit", "workersscriptswrite"],
  "D1 Edit": ["d1edit", "d1write"],
  "Workers R2 Storage Edit": ["workersr2storageedit", "workersr2storagewrite"],
  "Queues Edit": ["queuesedit", "queueswrite"],
};

const PLACEHOLDER_D1_ID = /^00000000-0000-0000-0000-00000000000\d$/;
const PLACEHOLDER_VALUE = /^(?:<[^>]+>|change[-_ ]?me|replace[-_ ]?me|todo)$/i;

export class PreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PreflightError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PreflightError(code, message);
}

function configValue(configuration, key) {
  return typeof configuration[key] === "string" ? configuration[key].trim() : "";
}

function assertPresent(configuration, key, environment) {
  const value = configValue(configuration, key);
  if (!value || PLACEHOLDER_VALUE.test(value)) {
    fail("MISSING_CONFIGURATION", `${environment} is missing a non-placeholder ${key}`);
  }
  return value;
}

function assertHttps(configuration, key, environment) {
  const value = assertPresent(configuration, key, environment);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("INVALID_CONFIGURATION", `${environment} has an invalid ${key} URL`);
  }
  if (environment === "local") {
    if (!new Set(["http:", "https:"]).has(url.protocol)) {
      fail("INVALID_CONFIGURATION", `local ${key} must use HTTP or HTTPS`);
    }
  } else if (url.protocol !== "https:") {
    fail("INVALID_CONFIGURATION", `${environment} ${key} must use HTTPS`);
  }
}

function normalizePermissionName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function collectWranglerValues(source, key) {
  const pattern = new RegExp(`^${key}\\s*=\\s*"([^"]+)"$`, "gm");
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function accountIsRestricted(resources, accountId) {
  return Object.entries(resources ?? {}).some(([key, rawValue]) => {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return key.includes(accountId) || values.some((value) => String(value).includes(accountId));
  });
}

function policyPermissionNames(policy, permissionNamesById) {
  const groups = Array.isArray(policy?.permission_groups) ? policy.permission_groups : [];
  return groups.map((group) => {
    if (typeof group === "string") return permissionNamesById.get(group) ?? group;
    return group?.name ?? permissionNamesById.get(group?.id) ?? "";
  });
}

async function requestJson(
  fetchImplementation,
  url,
  token,
  provider,
  authorizationScheme = "Bearer",
) {
  let response;
  try {
    response = await fetchImplementation(url, {
      headers: {
        Accept: "application/json",
        Authorization: `${authorizationScheme} ${token}`,
      },
    });
  } catch {
    fail("ONLINE_CHECK_FAILED", `${provider} did not return a response`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok || payload?.success === false) {
    const providerCode =
      typeof payload?.errors?.[0]?.code === "number" ? payload.errors[0].code : undefined;
    const suffix = providerCode === undefined ? "" : `, provider code ${providerCode}`;
    fail("ONLINE_CHECK_FAILED", `${provider} check failed with HTTP ${response.status}${suffix}`);
  }
  return payload;
}

function providerState(configuration, keys) {
  const present = keys.filter((key) => Boolean(configValue(configuration, key)));
  if (present.length === 0) return "disabled";
  if (present.length !== keys.length) return "partial";
  return "configured";
}

export function parseDotEnv(source) {
  const configuration = {};
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) fail("INVALID_ENV_FILE", `Invalid environment assignment on line ${index + 1}`);

    const [, key, rawValue] = match;
    if (Object.hasOwn(configuration, key)) {
      fail("INVALID_ENV_FILE", `Duplicate environment assignment for ${key}`);
    }

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    configuration[key] = value;
  }

  return configuration;
}

export function parseWranglerInventory(source) {
  const accountIds = collectWranglerValues(source, "account_id");
  const appEnvironments = collectWranglerValues(source, "APP_ENV");
  const webOrigins = collectWranglerValues(source, "WEB_ORIGIN");
  const workerNames = collectWranglerValues(source, "name").filter((name) =>
    name.startsWith("open-sessionboard-api-"),
  );
  const databaseNames = collectWranglerValues(source, "database_name");
  const databaseIds = collectWranglerValues(source, "database_id");
  const bucketNames = collectWranglerValues(source, "bucket_name");
  const queueNames = collectWranglerValues(source, "queue");

  for (const [label, values] of [
    ["APP_ENV", appEnvironments],
    ["WEB_ORIGIN", webOrigins],
    ["Worker name", workerNames],
    ["D1 database name", databaseNames],
    ["D1 database ID", databaseIds],
    ["R2 bucket name", bucketNames],
    ["Queue name", queueNames],
  ]) {
    if (values.length !== ENVIRONMENTS.length) {
      fail("INVALID_WRANGLER_CONFIGURATION", `${label} must be declared once per environment`);
    }
  }
  if (accountIds.length !== 1) {
    fail("INVALID_WRANGLER_CONFIGURATION", "Wrangler must declare exactly one Cloudflare account");
  }
  if (appEnvironments.join(",") !== ENVIRONMENTS.join(",")) {
    fail(
      "INVALID_WRANGLER_CONFIGURATION",
      "Wrangler environments are not ordered local, staging, production",
    );
  }

  return Object.fromEntries(
    ENVIRONMENTS.map((environment, index) => [
      environment,
      {
        accountId: accountIds[0],
        appEnvironment: appEnvironments[index],
        webOrigin: webOrigins[index],
        workerName: workerNames[index],
        databaseName: databaseNames[index],
        databaseId: databaseIds[index],
        bucketName: bucketNames[index],
        queueName: queueNames[index],
      },
    ]),
  );
}

export function validateReleaseConfiguration({
  configurations,
  targetEnvironment,
  requiredProviders = [],
  wranglerInventory,
}) {
  if (!ENVIRONMENTS.includes(targetEnvironment)) {
    fail("INVALID_ARGUMENT", "Target environment must be local, staging, or production");
  }

  for (const provider of requiredProviders) {
    if (!Object.hasOwn(OPTIONAL_PROVIDERS, provider)) {
      fail("INVALID_ARGUMENT", "Unknown required provider");
    }
  }

  const providerStates = {};
  for (const environment of ENVIRONMENTS) {
    const configuration = configurations[environment];
    if (!configuration)
      fail("MISSING_CONFIGURATION", `No configuration was supplied for ${environment}`);

    for (const key of REQUIRED_CONFIGURATION) assertPresent(configuration, key, environment);
    if (configValue(configuration, "APP_ENV") !== environment) {
      fail("INVALID_CONFIGURATION", `${environment} APP_ENV does not match its environment`);
    }
    if (assertPresent(configuration, "BETTER_AUTH_SECRET", environment).length < 32) {
      fail(
        "INVALID_CONFIGURATION",
        `${environment} BETTER_AUTH_SECRET must be at least 32 characters`,
      );
    }

    for (const key of [
      "WEB_ORIGIN",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_API_URL",
      "API_URL",
      "OPENSEND_API_URL",
    ]) {
      assertHttps(configuration, key, environment);
    }
    for (const key of ["AUTH_FROM_EMAIL", "SPEAKERS_FROM_EMAIL", "CALENDAR_FROM_EMAIL"]) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assertPresent(configuration, key, environment))) {
        fail("INVALID_CONFIGURATION", `${environment} has an invalid ${key}`);
      }
    }

    providerStates[environment] = {};
    for (const [provider, keys] of Object.entries(OPTIONAL_PROVIDERS)) {
      const state = providerState(configuration, keys);
      providerStates[environment][provider] = state;
      if (state === "partial") {
        fail(
          "PARTIAL_PROVIDER_CONFIGURATION",
          `${environment} has partial ${provider} configuration`,
        );
      }
      if (
        environment === targetEnvironment &&
        requiredProviders.includes(provider) &&
        state !== "configured"
      ) {
        fail(
          "MISSING_PROVIDER_CONFIGURATION",
          `${targetEnvironment} requires ${provider} configuration`,
        );
      }
      if (provider === "accelevents" && state === "configured") {
        assertHttps(configuration, "ACCELEVENTS_API_BASE_URL", environment);
      }
    }

    const wrangler = wranglerInventory?.[environment];
    if (!wrangler) fail("INVALID_WRANGLER_CONFIGURATION", `Wrangler is missing ${environment}`);
    for (const [configurationKey, wranglerKey] of [
      ["CLOUDFLARE_ACCOUNT_ID", "accountId"],
      ["WEB_ORIGIN", "webOrigin"],
      ["D1_DATABASE_ID", "databaseId"],
      ["R2_BUCKET_NAME", "bucketName"],
      ["QUEUE_NAME", "queueName"],
    ]) {
      if (configValue(configuration, configurationKey) !== wrangler[wranglerKey]) {
        fail("WRANGLER_ENV_MISMATCH", `${environment} ${configurationKey} does not match Wrangler`);
      }
    }

    for (const [key, expected] of [
      ["R2_BUCKET_NAME", `-${environment}`],
      ["QUEUE_NAME", `-${environment}`],
    ]) {
      if (!configValue(configuration, key).endsWith(expected)) {
        fail("INVALID_ISOLATION", `${environment} ${key} must end with ${expected}`);
      }
    }
  }

  for (const key of ISOLATED_CONFIGURATION) {
    const ownersByValue = new Map();
    for (const environment of ENVIRONMENTS) {
      const value = configValue(configurations[environment], key);
      if (!value) continue;
      const priorEnvironment = ownersByValue.get(value);
      if (priorEnvironment) {
        fail("INVALID_ISOLATION", `${key} is shared by ${priorEnvironment} and ${environment}`);
      }
      ownersByValue.set(value, environment);
    }
  }

  for (const key of ["WEB_ORIGIN", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_API_URL", "API_URL"]) {
    const values = ENVIRONMENTS.map((environment) => configValue(configurations[environment], key));
    if (new Set(values).size !== ENVIRONMENTS.length) {
      fail("INVALID_ISOLATION", `${key} must be unique across environments`);
    }
  }

  if (
    targetEnvironment !== "local" &&
    PLACEHOLDER_D1_ID.test(wranglerInventory[targetEnvironment].databaseId)
  ) {
    fail("UNPROVISIONED_RESOURCE", `${targetEnvironment} D1 database is still a placeholder`);
  }

  return { providerStates };
}

export async function verifyCloudflare({ configuration, wrangler, fetchImplementation = fetch }) {
  const token = assertPresent(configuration, "CLOUDFLARE_API_TOKEN", configuration.APP_ENV);
  const auditToken = assertPresent(
    configuration,
    "CLOUDFLARE_API_AUDIT_TOKEN",
    configuration.APP_ENV,
  );
  const accountId = assertPresent(configuration, "CLOUDFLARE_ACCOUNT_ID", configuration.APP_ENV);
  const tokenKind = configValue(configuration, "CLOUDFLARE_TOKEN_KIND") || "user";
  if (!new Set(["user", "account"]).has(tokenKind)) {
    fail("INVALID_CONFIGURATION", "CLOUDFLARE_TOKEN_KIND must be user or account");
  }

  const baseUrl = "https://api.cloudflare.com/client/v4";
  const tokenBase = tokenKind === "account" ? `/accounts/${accountId}/tokens` : "/user/tokens";
  const verification = await requestJson(
    fetchImplementation,
    `${baseUrl}${tokenBase}/verify`,
    token,
    "Cloudflare token verification",
  );
  const tokenId = verification?.result?.id;
  if (!tokenId || verification?.result?.status !== "active") {
    fail("CLOUDFLARE_TOKEN_INVALID", "Cloudflare deployment token is not active");
  }

  const details = await requestJson(
    fetchImplementation,
    `${baseUrl}${tokenBase}/${encodeURIComponent(tokenId)}`,
    auditToken,
    "Cloudflare token policy",
  );
  const policies = Array.isArray(details?.result?.policies) ? details.result.policies : [];
  if (policies.length === 0) {
    fail("CLOUDFLARE_SCOPE_INVALID", "Cloudflare token policy has no inspectable allow policies");
  }

  let permissionNamesById = new Map();
  const hasUnnamedGroup = policies.some((policy) =>
    (policy?.permission_groups ?? []).some(
      (group) => typeof group === "object" && group?.id && !group?.name,
    ),
  );
  if (hasUnnamedGroup) {
    const permissions = await requestJson(
      fetchImplementation,
      `${baseUrl}${tokenBase}/permission_groups`,
      auditToken,
      "Cloudflare permission groups",
    );
    const groups = Array.isArray(permissions?.result) ? permissions.result : [];
    permissionNamesById = new Map(groups.map((group) => [group.id, group.name]));
  }

  for (const [requiredName, aliases] of Object.entries(REQUIRED_CLOUDFLARE_PERMISSIONS)) {
    const matchingPolicies = policies.filter((policy) => {
      if (String(policy?.effect ?? "allow").toLowerCase() !== "allow") return false;
      const names = policyPermissionNames(policy, permissionNamesById).map(normalizePermissionName);
      return aliases.some((alias) => names.includes(alias));
    });
    if (matchingPolicies.length === 0) {
      fail("CLOUDFLARE_SCOPE_INVALID", `Cloudflare token is missing ${requiredName}`);
    }
    if (matchingPolicies.some((policy) => !accountIsRestricted(policy.resources, accountId))) {
      fail("CLOUDFLARE_SCOPE_INVALID", `${requiredName} is not restricted to the approved account`);
    }
  }

  const d1 = await requestJson(
    fetchImplementation,
    `${baseUrl}/accounts/${accountId}/d1/database/${encodeURIComponent(wrangler.databaseId)}`,
    token,
    "Cloudflare D1 resource",
  );
  if (d1?.result?.uuid !== wrangler.databaseId || d1?.result?.name !== wrangler.databaseName) {
    fail("CLOUDFLARE_RESOURCE_MISMATCH", "Cloudflare D1 resource does not match Wrangler");
  }

  const r2 = await requestJson(
    fetchImplementation,
    `${baseUrl}/accounts/${accountId}/r2/buckets/${encodeURIComponent(wrangler.bucketName)}`,
    token,
    "Cloudflare R2 resource",
  );
  if (r2?.result?.name !== wrangler.bucketName) {
    fail("CLOUDFLARE_RESOURCE_MISMATCH", "Cloudflare R2 resource does not match Wrangler");
  }

  const queues = await requestJson(
    fetchImplementation,
    `${baseUrl}/accounts/${accountId}/queues?name=${encodeURIComponent(wrangler.queueName)}`,
    token,
    "Cloudflare Queue resource",
  );
  const queueList = Array.isArray(queues?.result) ? queues.result : (queues?.result?.queues ?? []);
  if (!queueList.some((queue) => (queue.queue_name ?? queue.name) === wrangler.queueName)) {
    fail("CLOUDFLARE_RESOURCE_MISMATCH", "Cloudflare Queue resource does not match Wrangler");
  }

  return { tokenActive: true, scopesVerified: true, resourcesVerified: true };
}

export async function verifyForgePrivacy({ configuration, fetchImplementation = fetch }) {
  const environment = configValue(configuration, "APP_ENV") || "target";
  const baseUrl = assertPresent(configuration, "FORGE_API_URL", environment).replace(/\/$/, "");
  const repository = assertPresent(configuration, "FORGE_REPOSITORY", environment);
  const token = assertPresent(configuration, "FORGE_API_TOKEN", environment);
  if (!/^https:\/\//.test(baseUrl)) fail("INVALID_CONFIGURATION", "FORGE_API_URL must use HTTPS");
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    fail("INVALID_CONFIGURATION", "FORGE_REPOSITORY must be owner/repository");
  }

  const [owner, name] = repository.split("/");
  const payload = await requestJson(
    fetchImplementation,
    `${baseUrl}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    token,
    "Forge repository privacy",
    "token",
  );
  if (payload?.private !== true) {
    fail("FORGE_NOT_PRIVATE", "Forge repository is not private; release must stop");
  }
  if (payload?.full_name && payload.full_name !== repository) {
    fail("FORGE_REPOSITORY_MISMATCH", "Forge returned a different repository identity");
  }
  return { private: true };
}

export { ENVIRONMENTS };
