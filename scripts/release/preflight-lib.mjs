const ENVIRONMENTS = ["local", "staging", "production"];

const REQUIRED_CONFIGURATION = [
  "APP_ENV",
  "WEB_ORIGIN",
  "NEXT_PUBLIC_APP_URL",
  "API_UPSTREAM_ORIGIN",
  "API_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "D1_DATABASE_ID",
  "R2_BUCKET_NAME",
  "QUEUE_NAME",
  "OPENSEND_API_URL",
  "OPENSEND_API_KEY",
  "AUTH_FROM_EMAIL",
  "SPEAKERS_FROM_EMAIL",
  "CALENDAR_FROM_EMAIL",
  "CALENDAR_UID_DOMAIN",
  "AI_PROVIDER",
  "OPENAI_MODEL",
  "OPENAI_AGENDA_MODEL",
  "OPENAI_EVALUATION_MODEL",
  "OPENAI_REMIX_MODEL",
];

const ISOLATED_CONFIGURATION = [
  "BETTER_AUTH_SECRET",
  "CLOUDFLARE_API_TOKEN",
  "D1_DATABASE_ID",
  "R2_BUCKET_NAME",
  "QUEUE_NAME",
  "OPENSEND_API_KEY",
];

const REQUIRED_CLOUDFLARE_PERMISSIONS = {
  "Workers Scripts Edit": ["workersscriptsedit", "workersscriptswrite"],
  "D1 Edit": ["d1edit", "d1write"],
  "Workers R2 Storage Edit": ["workersr2storageedit", "workersr2storagewrite"],
  "Queues Edit": ["queuesedit", "queueswrite"],
};

const PLACEHOLDER_D1_ID = /^00000000-0000-0000-0000-00000000000\d$/;
const PLACEHOLDER_VALUE = /^(?:<[^>]+>|change[-_ ]?me|replace[-_ ]?me|todo)$/i;
const ORGANIZATION_ID_MIGRATION = Object.freeze({
  sourceId: "foreverbrowsing",
  targetId: "ai-engineer",
  protectedBoundaries: Object.freeze([
    "official evaluator specs",
    "official evaluator fixtures",
    "official evaluator docs",
    "official evaluator scenarios",
  ]),
});
const ORGANIZATION_ID_KEYS = Object.freeze([
  "ORGANIZATION_ID",
  "NEXT_PUBLIC_ORGANIZATION_ID",
  "ORGANIZER_AUTOJOIN_ORGANIZATION_ID",
  "EVAL_ORGANIZATION_ID",
]);
const MIGRATION_RESOURCE_KEYS = Object.freeze([
  ["d1", "D1_DATABASE_ID", "databaseId"],
  ["airtable", "AIRTABLE_BASE_ID", "baseId"],
  ["r2", "R2_BUCKET_NAME", "bucketName"],
  ["queue", "QUEUE_NAME", "queueName"],
]);
const MIGRATION_REPORT_MAX_BYTES = 256 * 1024;
const MIGRATION_REPORT_ALLOWED_KEYS = new Set([
  "sourceId",
  "targetId",
  "mode",
  "status",
  "ready",
  "readyForApply",
  "namespaces",
  "counts",
  "blockers",
  "protectedBoundaries",
]);
const MIGRATION_REPORT_NAMESPACE_KEYS = Object.freeze({
  d1: new Set(["environment", "databaseId", "databaseName", "tables"]),
  airtable: new Set(["environment", "baseId", "tables"]),
  r2: new Set(["environment", "bucketName", "objectInventoryComplete"]),
  queue: new Set([
    "environment",
    "queueName",
    "deadLetterQueueName",
    "messagesInspectable",
    "drainConfirmed",
  ]),
});
const MIGRATION_REPORT_COUNT_KEYS = Object.freeze({
  d1: new Set(["sourceRows", "targetRows", "rewritableRows"]),
  airtable: new Set(["sourceRecords", "targetRecords", "rewritableRecords"]),
  r2: new Set(["legacyKeys", "targetCollisions"]),
  queue: new Set(["queues", "deadLetterQueues", "messages"]),
});
const MIGRATION_REPORT_SECRET_KEY =
  /(?:token|secret|password|credential|private[_-]?key|api[_-]?key|authorization|bearer)/i;
const MIGRATION_REPORT_ENVIRONMENTS = new Set(ENVIRONMENTS);

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

function collectWorkerNames(source) {
  const namesByEnvironment = Object.fromEntries(
    ENVIRONMENTS.map((environment) => [environment, []]),
  );
  let environment = "local";

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      environment = /^\[env\.(staging|production)\](?:\s*#.*)?$/.exec(line)?.[1];
      continue;
    }
    if (!environment) continue;

    const match = /^name\s*=\s*"([^"]+)"\s*(?:#.*)?$/.exec(line);
    if (match) namesByEnvironment[environment].push(match[1]);
  }

  return namesByEnvironment;
}

function collapseConsecutiveDuplicates(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
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
  const workerNamesByEnvironment = collectWorkerNames(source);
  const databaseNames = collectWranglerValues(source, "database_name");
  const databaseIds = collectWranglerValues(source, "database_id");
  const bucketNames = collectWranglerValues(source, "bucket_name");
  const queueNames = collapseConsecutiveDuplicates(collectWranglerValues(source, "queue"));

  for (const [label, values] of [
    ["APP_ENV", appEnvironments],
    ["WEB_ORIGIN", webOrigins],
    ["D1 database name", databaseNames],
    ["D1 database ID", databaseIds],
    ["R2 bucket name", bucketNames],
    ["Queue name", queueNames],
  ]) {
    if (values.length !== ENVIRONMENTS.length) {
      fail("INVALID_WRANGLER_CONFIGURATION", `${label} must be declared once per environment`);
    }
  }
  const workerNames = ENVIRONMENTS.map((environment) => {
    const names = workerNamesByEnvironment[environment];
    if (names.length !== 1) {
      fail(
        "INVALID_WRANGLER_CONFIGURATION",
        `Worker name must be declared once for ${environment}`,
      );
    }
    return names[0];
  });
  if (new Set(workerNames).size !== ENVIRONMENTS.length) {
    fail("INVALID_WRANGLER_CONFIGURATION", "Worker names must be unique across environments");
  }
  if (accountIds.length > 1) {
    fail("INVALID_WRANGLER_CONFIGURATION", "Wrangler may declare at most one Cloudflare account");
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
        accountId: accountIds[0] ?? "",
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
  wranglerInventory,
}) {
  if (!ENVIRONMENTS.includes(targetEnvironment)) {
    fail("INVALID_ARGUMENT", "Target environment must be local, staging, or production");
  }

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
      "API_UPSTREAM_ORIGIN",
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
    const aiProvider = assertPresent(configuration, "AI_PROVIDER", environment).toLowerCase();
    if (aiProvider !== "disabled" && aiProvider !== "openai") {
      fail("INVALID_CONFIGURATION", `${environment} AI_PROVIDER must be disabled or openai`);
    }
    if (aiProvider === "openai") {
      assertPresent(configuration, "OPENAI_API_KEY", environment);
    }

    const calendarUidDomain = assertPresent(configuration, "CALENDAR_UID_DOMAIN", environment);
    const domainLabel = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
    if (
      calendarUidDomain.length > 253 ||
      calendarUidDomain.endsWith(".") ||
      !calendarUidDomain.includes(".") ||
      !calendarUidDomain.split(".").every((label) => domainLabel.test(label))
    ) {
      fail("INVALID_CONFIGURATION", `${environment} has an invalid CALENDAR_UID_DOMAIN`);
    }

    const wrangler = wranglerInventory?.[environment];
    if (!wrangler) fail("INVALID_WRANGLER_CONFIGURATION", `Wrangler is missing ${environment}`);
    for (const [configurationKey, wranglerKey] of [
      ["R2_BUCKET_NAME", "bucketName"],
      ["QUEUE_NAME", "queueName"],
    ]) {
      if (configValue(configuration, configurationKey) !== wrangler[wranglerKey]) {
        fail("WRANGLER_ENV_MISMATCH", `${environment} ${configurationKey} does not match Wrangler`);
      }
    }
    if (
      wrangler.accountId &&
      wrangler.accountId !== "00000000-0000-0000-0000-000000000000" &&
      configValue(configuration, "CLOUDFLARE_ACCOUNT_ID") !== wrangler.accountId
    ) {
      fail("WRANGLER_ENV_MISMATCH", `${environment} CLOUDFLARE_ACCOUNT_ID does not match Wrangler`);
    }
    if (
      !wrangler.webOrigin.endsWith(".example.invalid") &&
      configValue(configuration, "WEB_ORIGIN") !== wrangler.webOrigin
    ) {
      fail("WRANGLER_ENV_MISMATCH", `${environment} WEB_ORIGIN does not match Wrangler`);
    }
    if (
      !/^00000000-0000-0000-0000-00000000000\d$/.test(wrangler.databaseId) &&
      configValue(configuration, "D1_DATABASE_ID") !== wrangler.databaseId
    ) {
      fail("WRANGLER_ENV_MISMATCH", `${environment} D1_DATABASE_ID does not match Wrangler`);
    }
    const webOrigin = configValue(configuration, "WEB_ORIGIN");
    const appOrigin = configValue(configuration, "NEXT_PUBLIC_APP_URL");
    const apiOrigin = configValue(configuration, "API_URL");
    const upstreamOrigin = configValue(configuration, "API_UPSTREAM_ORIGIN");
    const authOrigin = configValue(configuration, "BETTER_AUTH_URL");
    if (
      webOrigin !== appOrigin ||
      apiOrigin !== upstreamOrigin ||
      apiOrigin !== authOrigin ||
      webOrigin === apiOrigin
    ) {
      fail(
        "ORIGIN_CONTRACT_MISMATCH",
        `${environment} web, API, proxy, and auth origins must form one consistent contract`,
      );
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

  for (const key of ["WEB_ORIGIN", "NEXT_PUBLIC_APP_URL", "API_UPSTREAM_ORIGIN", "API_URL"]) {
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

  return {};
}
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function migrationReportFailure(code, message) {
  return { valid: false, code, message };
}

function reportHasSensitiveKey(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => reportHasSensitiveKey(entry, seen));
  return Object.entries(value).some(
    ([key, entry]) => MIGRATION_REPORT_SECRET_KEY.test(key) || reportHasSensitiveKey(entry, seen),
  );
}

function reportContainsKnownSecret(value, secretValues, seen = new Set()) {
  if (typeof value === "string") {
    return secretValues.some((secret) => secret && value.includes(secret));
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((entry) => reportContainsKnownSecret(entry, secretValues, seen));
  }
  return Object.values(value).some((entry) => reportContainsKnownSecret(entry, secretValues, seen));
}

function reportObjectShapeFailure(value, allowedKeys) {
  if (!isPlainObject(value)) return "Migration report contains an invalid structure";
  for (const key of Object.keys(value)) {
    if (MIGRATION_REPORT_SECRET_KEY.test(key)) return "Migration report contains secret material";
    if (!allowedKeys.has(key)) return "Migration report contains an unsupported field";
  }
  return undefined;
}

function migrationSecretValues(configurations) {
  const values = [];
  for (const configuration of Object.values(configurations ?? {})) {
    for (const [key, value] of Object.entries(configuration ?? {})) {
      if (
        /(?:secret|token|password|credential|private[_-]?key|api[_-]?key)/i.test(key) &&
        !/_TOKEN_KIND$/i.test(key) &&
        typeof value === "string" &&
        value.trim()
      ) {
        values.push(value.trim());
      }
    }
  }
  return values;
}

export function validateOrganizationIdMigrationReport(report, { secretValues = [] } = {}) {
  if (report === undefined || report === null) {
    return migrationReportFailure(
      "MIGRATION_REPORT_REQUIRED",
      "Supply the organization ID migration dry-run report",
    );
  }
  if (!isPlainObject(report)) {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report must be a JSON object",
    );
  }

  let serialized;
  try {
    serialized = JSON.stringify(report);
  } catch {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report must be finite JSON",
    );
  }
  if (typeof serialized !== "string") {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report must be finite JSON",
    );
  }
  if (Buffer.byteLength(serialized, "utf8") > MIGRATION_REPORT_MAX_BYTES) {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report exceeds the bounded evidence limit",
    );
  }
  if (reportHasSensitiveKey(report)) {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report contains secret material",
    );
  }
  if (reportContainsKnownSecret(report, secretValues)) {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report contains secret material",
    );
  }
  const topLevelFailure = reportObjectShapeFailure(report, MIGRATION_REPORT_ALLOWED_KEYS);
  if (topLevelFailure) {
    return migrationReportFailure("INVALID_MIGRATION_REPORT", topLevelFailure);
  }
  if (
    report.sourceId !== ORGANIZATION_ID_MIGRATION.sourceId ||
    report.targetId !== ORGANIZATION_ID_MIGRATION.targetId
  ) {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report does not match the approved identity change",
    );
  }
  if (report.mode !== "dry-run") {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report must be a dry-run report",
    );
  }
  if (report.status !== "ready") {
    return migrationReportFailure("MIGRATION_REPORT_BLOCKED", "Migration report is not ready");
  }
  if (report.ready !== undefined && report.ready !== true) {
    return migrationReportFailure("MIGRATION_REPORT_BLOCKED", "Migration report is not ready");
  }
  if (report.readyForApply !== undefined && report.readyForApply !== true) {
    return migrationReportFailure(
      "MIGRATION_REPORT_BLOCKED",
      "Migration report is not ready for apply",
    );
  }
  if (!Array.isArray(report.blockers)) {
    return migrationReportFailure(
      "INVALID_MIGRATION_REPORT",
      "Migration report blockers must be an array",
    );
  }
  if (report.blockers.length > 0) {
    return migrationReportFailure(
      "MIGRATION_REPORT_BLOCKED",
      "Migration report contains blocking findings",
    );
  }
  if (report.protectedBoundaries !== undefined) {
    if (
      !Array.isArray(report.protectedBoundaries) ||
      JSON.stringify(report.protectedBoundaries) !==
        JSON.stringify(ORGANIZATION_ID_MIGRATION.protectedBoundaries)
    ) {
      return migrationReportFailure(
        "INVALID_MIGRATION_REPORT",
        "Migration report protected boundaries are not approved",
      );
    }
  }
  if (report.namespaces !== undefined) {
    if (!isPlainObject(report.namespaces)) {
      return migrationReportFailure(
        "INVALID_MIGRATION_REPORT",
        "Migration report namespaces are not bounded",
      );
    }
    for (const [kind, entries] of Object.entries(report.namespaces)) {
      const allowedKeys = Object.hasOwn(MIGRATION_REPORT_NAMESPACE_KEYS, kind)
        ? MIGRATION_REPORT_NAMESPACE_KEYS[kind]
        : undefined;
      if (!allowedKeys || !Array.isArray(entries) || entries.length > ENVIRONMENTS.length) {
        return migrationReportFailure(
          "INVALID_MIGRATION_REPORT",
          "Migration report namespaces are not bounded",
        );
      }
      const seenEnvironments = new Set();
      for (const entry of entries) {
        const failure = reportObjectShapeFailure(entry, allowedKeys);
        if (failure) return migrationReportFailure("INVALID_MIGRATION_REPORT", failure);
        if (
          entry.environment !== undefined &&
          (!MIGRATION_REPORT_ENVIRONMENTS.has(entry.environment) ||
            seenEnvironments.has(entry.environment))
        ) {
          return migrationReportFailure(
            "INVALID_MIGRATION_REPORT",
            "Migration report namespaces are not bounded",
          );
        }
        if (entry.environment !== undefined) seenEnvironments.add(entry.environment);
      }
    }
  }
  if (report.counts !== undefined) {
    if (!isPlainObject(report.counts)) {
      return migrationReportFailure(
        "INVALID_MIGRATION_REPORT",
        "Migration report counts are not bounded",
      );
    }
    for (const [kind, counts] of Object.entries(report.counts)) {
      const allowedKeys = Object.hasOwn(MIGRATION_REPORT_COUNT_KEYS, kind)
        ? MIGRATION_REPORT_COUNT_KEYS[kind]
        : undefined;
      if (!allowedKeys || !isPlainObject(counts)) {
        return migrationReportFailure(
          "INVALID_MIGRATION_REPORT",
          "Migration report counts are not bounded",
        );
      }
      const failure = reportObjectShapeFailure(counts, allowedKeys);
      if (failure) return migrationReportFailure("INVALID_MIGRATION_REPORT", failure);
      for (const [key, value] of Object.entries(counts)) {
        if (kind === "queue" && key === "messages" && value === null) continue;
        if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
          return migrationReportFailure(
            "INVALID_MIGRATION_REPORT",
            "Migration report counts are not bounded",
          );
        }
      }
    }
  }

  return { valid: true };
}
export function inspectOrganizationIdMigrationReadiness({
  configurations = {},
  wranglerInventory = {},
  migrationReport,
} = {}) {
  const reportValidation = validateOrganizationIdMigrationReport(migrationReport, {
    secretValues: migrationSecretValues(configurations),
  });
  const namespaces = {
    d1: [],
    airtable: [],
    r2: [],
    queue: [],
  };
  const blockers = [];
  if (!reportValidation.valid) {
    blockers.push({
      code: reportValidation.code,
      message: reportValidation.message,
    });
  }
  const seenResources = new Map();

  for (const environment of ENVIRONMENTS) {
    const configuration = configurations?.[environment];
    const wrangler = wranglerInventory?.[environment];
    if (!configuration || !wrangler) {
      blockers.push({
        code: "MIGRATION_NAMESPACE_UNCONFIGURED",
        environment,
        message: `${environment} migration namespaces are not fully configured`,
      });
      continue;
    }

    for (const key of ORGANIZATION_ID_KEYS) {
      const value = configValue(configuration, key);
      if (!value) continue;
      if (value === ORGANIZATION_ID_MIGRATION.sourceId) {
        blockers.push({
          code: "LEGACY_ORGANIZATION_ID_CONFIGURATION",
          environment,
          key,
          message: `${environment} still declares the legacy organization identity`,
        });
      } else if (value !== ORGANIZATION_ID_MIGRATION.targetId) {
        blockers.push({
          code: "AMBIGUOUS_ORGANIZATION_ID_CONFIGURATION",
          environment,
          key,
          message: `${environment} declares an unsupported organization identity`,
        });
      }
    }

    for (const [kind, configurationKey, wranglerKey] of MIGRATION_RESOURCE_KEYS) {
      const configuredValue = configValue(configuration, configurationKey);
      const inventoryValue =
        typeof wrangler[wranglerKey] === "string" ? wrangler[wranglerKey].trim() : "";
      const value = configuredValue || inventoryValue;
      if (!value || (configuredValue && inventoryValue && configuredValue !== inventoryValue)) {
        blockers.push({
          code: "MIGRATION_NAMESPACE_UNCONFIGURED",
          environment,
          namespace: kind,
          message: `${environment} ${kind} namespace is missing or disagrees with Wrangler`,
        });
        continue;
      }
      if (value.includes(ORGANIZATION_ID_MIGRATION.sourceId)) {
        blockers.push({
          code: "LEGACY_NAMESPACE_ID",
          environment,
          namespace: kind,
          message: `${environment} ${kind} namespace embeds the legacy organization identity`,
        });
      }
      const resourceKey = `${kind}:${value}`;
      const priorEnvironment = seenResources.get(resourceKey);
      if (priorEnvironment) {
        blockers.push({
          code: "MIGRATION_NAMESPACE_COLLISION",
          environment,
          namespace: kind,
          message: `${kind} namespace is shared by ${priorEnvironment} and ${environment}`,
        });
      } else {
        seenResources.set(resourceKey, environment);
      }
      namespaces[kind].push({ environment, value });
    }
  }

  const status =
    blockers.length === 0
      ? "ready"
      : reportValidation.code === "MIGRATION_REPORT_REQUIRED" && blockers.length === 1
        ? "requires-dry-run"
        : "blocked";
  return {
    sourceId: ORGANIZATION_ID_MIGRATION.sourceId,
    targetId: ORGANIZATION_ID_MIGRATION.targetId,
    mode: "dry-run",
    status,
    ready: blockers.length === 0,
    evidence: {
      supplied: migrationReport !== undefined && migrationReport !== null,
      valid: reportValidation.valid,
    },
    namespaces,
    blockers,
    protectedBoundaries: [...ORGANIZATION_ID_MIGRATION.protectedBoundaries],
  };
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
    "Forge repository visibility",
    "token",
  );
  if (payload?.full_name !== repository) {
    fail("FORGE_REPOSITORY_MISMATCH", "Forge returned a different repository identity");
  }
  return { private: payload?.private === true };
}

export { ENVIRONMENTS, ORGANIZATION_ID_MIGRATION };
