import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createBetterAuthAccount,
  PRODUCTION_CONFIRMATION as PERSONA_PRODUCTION_CONFIRMATION,
} from "./provision-personas.mjs";

/** The production confirmation shared with evaluator persona provisioning. */
export const PRODUCTION_CONFIRMATION = PERSONA_PRODUCTION_CONFIRMATION;
export const PRODUCTION_CONFIRMATION_TOKEN = PRODUCTION_CONFIRMATION;

const ENVIRONMENT_VALUES = new Set(["staging", "production"]);
const MEMBERSHIP_ROLES = new Set(["owner", "admin"]);

export class HostProvisionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HostProvisionError";
    this.code = code;
  }
}

function firstValue(environment, names) {
  for (const name of names) {
    const value = environment[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function exactOptionalValue(environment, names) {
  for (const name of names) {
    if (typeof environment[name] === "string") return environment[name];
  }
  return undefined;
}

function requiredValue(environment, names, label) {
  const value = firstValue(environment, names);
  if (value === undefined) {
    throw new HostProvisionError(
      "MISSING_ENVIRONMENT",
      `Missing explicit ${label}. Set ${names[0]}.`,
    );
  }
  return value;
}

function requiredSecretValue(environment, names, label) {
  for (const name of names) {
    const value = environment[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new HostProvisionError(
    "MISSING_ENVIRONMENT",
    `Missing explicit ${label}. Set ${names[0]}.`,
  );
}

function parseEnvironment(environment) {
  const value = requiredValue(
    environment,
    ["EVAL_ENVIRONMENT", "TARGET_ENVIRONMENT", "APP_ENV"],
    "evaluation environment",
  ).toLowerCase();
  if (!ENVIRONMENT_VALUES.has(value)) {
    throw new HostProvisionError(
      "INVALID_ENVIRONMENT",
      "Host provisioning requires a staging or production environment.",
    );
  }
  return value;
}

function parseOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new HostProvisionError("INVALID_ORIGIN", `${label} must be an absolute origin.`);
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new HostProvisionError("INVALID_ORIGIN", `${label} must contain only an origin.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HostProvisionError("INVALID_ORIGIN", `${label} must use http or https.`);
  }
  return parsed.origin;
}

function assertTargetSafety(input) {
  if (
    input.environment === "production" &&
    input.productionConfirmation !== PRODUCTION_CONFIRMATION
  ) {
    throw new HostProvisionError(
      "PRODUCTION_CONFIRMATION_REQUIRED",
      "Production host provisioning requires the exact production confirmation value.",
    );
  }
  if (input.environment === "production" || input.environment === "staging") {
    if (!input.webOrigin.startsWith("https://") || !input.apiOrigin.startsWith("https://")) {
      throw new HostProvisionError(
        "UNSAFE_ORIGIN",
        "Staging and production host provisioning requires HTTPS web and API origins.",
      );
    }
  }
}

function validEmail(value) {
  if (!/^\S+@\S+$/.test(value)) {
    throw new HostProvisionError("INVALID_EMAIL", "The host email is invalid.");
  }
  return value;
}

function parseRole(value) {
  const role = String(value).trim().toLowerCase();
  if (!MEMBERSHIP_ROLES.has(role)) {
    throw new HostProvisionError(
      "INVALID_ROLE",
      "The host membership role must be owner or admin.",
    );
  }
  return role;
}

function parseOutputPath(value) {
  if (value === undefined) return undefined;
  const path = value.trim();
  if (path.length === 0) return undefined;
  if (!isAbsolute(path)) {
    throw new HostProvisionError(
      "INVALID_OUTPUT_PATH",
      "Host credential output requires an absolute path.",
    );
  }
  return path;
}

function assertStringInput(input, key, label) {
  if (typeof input[key] !== "string" || input[key].trim().length === 0) {
    throw new HostProvisionError("INVALID_INPUT", `Provisioning input is missing ${label}.`);
  }
}

/**
 * Read the explicit host provisioning environment. No evaluator persona values
 * or credential defaults are consulted.
 */
export function parseHostProvisioningEnvironment(environment = process.env) {
  const parsed = {
    environment: parseEnvironment(environment),
    webOrigin: parseOrigin(
      requiredValue(
        environment,
        ["EVAL_WEB_ORIGIN", "EVAL_TARGET_WEB_ORIGIN", "EVAL_TARGET_ORIGIN", "EVAL_TARGET_URL"],
        "web origin",
      ),
      "Web origin",
    ),
    apiOrigin: parseOrigin(
      requiredValue(
        environment,
        ["EVAL_API_ORIGIN", "EVAL_TARGET_API_ORIGIN", "EVAL_API_URL"],
        "API origin",
      ),
      "API origin",
    ),
    organizationId: requiredValue(
      environment,
      ["EVAL_ORGANIZATION_ID", "EVAL_TENANT_ID", "EVAL_CANONICAL_ORGANIZATION_ID"],
      "organization ID",
    ),
    eventId: requiredValue(environment, ["EVAL_EVENT_ID", "EVAL_CANONICAL_EVENT_ID"], "event ID"),
    hostEmail: validEmail(
      requiredValue(environment, ["EVAL_HOST_EMAIL", "EVAL_HOST_ACCOUNT_EMAIL"], "host email"),
    ),
    hostName: requiredValue(environment, ["EVAL_HOST_NAME", "EVAL_HOST_ACCOUNT_NAME"], "host name"),
    hostPassword: requiredSecretValue(
      environment,
      ["EVAL_HOST_PASSWORD", "EVAL_HOST_ACCOUNT_PASSWORD"],
      "host password",
    ),
    role: parseRole(
      requiredValue(
        environment,
        ["EVAL_HOST_ROLE", "EVAL_HOST_MEMBERSHIP_ROLE", "EVAL_MEMBERSHIP_ROLE"],
        "host membership role",
      ),
    ),
    adapterModule: requiredValue(
      environment,
      ["EVAL_D1_COMMAND_ADAPTER", "EVAL_COMMAND_ADAPTER_MODULE", "EVAL_HOST_ADAPTER_MODULE"],
      "adapter module",
    ),
    productionConfirmation: exactOptionalValue(environment, [
      "EVAL_PRODUCTION_CONFIRMATION",
      "EVAL_CONFIRM_PRODUCTION",
      "EVAL_PRODUCTION_CONFIRMATION_TOKEN",
    ]),
    credentialsPath: parseOutputPath(
      firstValue(environment, [
        "EVAL_HOST_CREDENTIALS_PATH",
        "EVAL_HOST_OUTPUT_PATH",
        "EVAL_HOST_CREDENTIAL_OUTPUT_PATH",
        "EVAL_HOST_CREDENTIALS_OUTPUT_PATH",
        "EVAL_CREDENTIALS_PATH",
      ]),
    ),
  };
  assertTargetSafety(parsed);
  return parsed;
}

function normalizeInput(input) {
  if (input === null || typeof input !== "object") {
    throw new HostProvisionError("INVALID_INPUT", "Provisioning input is required.");
  }
  const host =
    input.host !== null && typeof input.host === "object"
      ? input.host
      : input.hostAccount !== null && typeof input.hostAccount === "object"
        ? input.hostAccount
        : {};
  const normalized = {
    environment: input.environment,
    webOrigin: input.webOrigin,
    apiOrigin: input.apiOrigin,
    organizationId: input.organizationId,
    eventId: input.eventId,
    hostEmail: input.hostEmail ?? input.email ?? host.email,
    hostName: input.hostName ?? input.name ?? host.name,
    hostPassword: input.hostPassword ?? input.password ?? host.password,
    role: input.role ?? input.membershipRole ?? host.role,
    productionConfirmation: input.productionConfirmation,
    credentialsPath: input.credentialsPath ?? input.outputPath ?? input.credentialOutputPath,
  };
  for (const [key, label] of [
    ["environment", "environment"],
    ["webOrigin", "web origin"],
    ["apiOrigin", "API origin"],
    ["organizationId", "organization ID"],
    ["eventId", "event ID"],
    ["hostEmail", "host email"],
    ["hostName", "host name"],
    ["hostPassword", "host password"],
    ["role", "host membership role"],
  ]) {
    if (key === "hostPassword") {
      if (typeof normalized[key] !== "string" || normalized[key].length === 0) {
        throw new HostProvisionError("INVALID_INPUT", `Provisioning input is missing ${label}.`);
      }
    } else {
      assertStringInput(normalized, key, label);
    }
  }
  normalized.environment = normalized.environment.trim().toLowerCase();
  normalized.webOrigin = parseOrigin(normalized.webOrigin.trim(), "Web origin");
  normalized.apiOrigin = parseOrigin(normalized.apiOrigin.trim(), "API origin");
  normalized.organizationId = normalized.organizationId.trim();
  normalized.eventId = normalized.eventId.trim();
  normalized.hostEmail = validEmail(normalized.hostEmail.trim());
  normalized.hostName = normalized.hostName.trim();
  normalized.role = parseRole(normalized.role);
  normalized.credentialsPath = parseOutputPath(normalized.credentialsPath);
  if (!ENVIRONMENT_VALUES.has(normalized.environment)) {
    throw new HostProvisionError(
      "INVALID_INPUT",
      "Host provisioning requires a staging or production environment.",
    );
  }
  assertTargetSafety(normalized);
  return normalized;
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function assertAdapter(adapter) {
  if (!isObject(adapter)) {
    throw new HostProvisionError(
      "ADAPTER_REQUIRED",
      "An injected host command adapter is required.",
    );
  }
  for (const method of ["resolveUserId", "verifyIdentity", "execute"]) {
    if (typeof adapter[method] !== "function") {
      throw new HostProvisionError(
        "ADAPTER_INVALID",
        `The injected host command adapter must expose ${method}.`,
      );
    }
  }
}

function userIdFromResult(value) {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (!isObject(value)) return undefined;
  const candidates = [
    value.userId,
    value.id,
    value.data?.userId,
    value.data?.user?.id,
    value.user?.id,
  ];
  return candidates
    .find((candidate) => typeof candidate === "string" && candidate.trim().length > 0)
    ?.trim();
}

async function lookupHostUserId(adapter, input) {
  let resolved;
  try {
    resolved = await adapter.resolveUserId({
      organizationId: input.organizationId,
      eventId: input.eventId,
      email: input.hostEmail,
    });
  } catch {
    throw new HostProvisionError(
      "IDENTITY_LOOKUP_FAILED",
      "The host identity could not be resolved.",
    );
  }
  return userIdFromResult(resolved);
}

async function resolveHostUserId(adapter, input, accountUserId) {
  const userId = (await lookupHostUserId(adapter, input)) ?? userIdFromResult(accountUserId);
  if (userId === undefined) {
    throw new HostProvisionError(
      "IDENTITY_UNRESOLVED",
      "The host identity did not resolve to a user ID.",
    );
  }
  return userId;
}

async function verifyHostIdentity(adapter, input, userId) {
  try {
    const result = await adapter.verifyIdentity({
      type: "identity-verification",
      operation: "ensure",
      idempotencyKey: `eval-host:${input.organizationId}:verification:${userId}`,
      organizationId: input.organizationId,
      eventId: input.eventId,
      userId,
      email: input.hostEmail,
      credentialBacked: true,
    });
    if (result === false || (isObject(result) && result.verified === false)) {
      throw new Error("verification rejected");
    }
  } catch {
    throw new HostProvisionError(
      "IDENTITY_VERIFICATION_FAILED",
      "The host identity could not be verified.",
    );
  }
}

async function ensureHostMembership(adapter, input, userId) {
  const command = {
    type: "membership",
    operation: "ensure",
    organizationId: input.organizationId,
    eventId: input.eventId,
    userId,
    email: input.hostEmail,
    role: input.role,
    idempotencyKey: `eval-host:${input.organizationId}:membership:${userId}`,
  };
  try {
    await adapter.execute(command);
  } catch {
    throw new HostProvisionError(
      "MEMBERSHIP_FAILED",
      "The host organization membership could not be ensured.",
    );
  }
}

/** Write only the supplied credentials to a private 0600 file. */
export async function writeHostCredentials(credentialsPath, credentials) {
  if (typeof credentialsPath !== "string" || !isAbsolute(credentialsPath)) {
    throw new HostProvisionError(
      "INVALID_OUTPUT_PATH",
      "Host credential output requires an absolute path.",
    );
  }
  const target = credentialsPath;
  try {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, `${JSON.stringify(credentials, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(target, 0o600);
  } catch {
    throw new HostProvisionError(
      "CREDENTIAL_WRITE_FAILED",
      "Host credentials could not be written privately.",
    );
  }
  return target;
}

/**
 * Create or reuse one Better Auth credential account, verify it, then ensure one
 * idempotent organization membership command. No evaluator personas are read.
 */
export async function provisionHost({
  input,
  environment,
  webOrigin,
  apiOrigin,
  organizationId,
  eventId,
  hostEmail,
  hostName,
  hostPassword,
  role,
  membershipRole,
  productionConfirmation,
  credentialsPath,
  outputPath,
  commandAdapter,
  fetchImplementation = globalThis.fetch,
  writeCredentials = writeHostCredentials,
  logger = () => {},
} = {}) {
  const resolvedInput = normalizeInput(
    input === undefined
      ? {
          environment,
          webOrigin,
          apiOrigin,
          organizationId,
          eventId,
          hostEmail,
          hostName,
          hostPassword,
          role: role ?? membershipRole,
          productionConfirmation,
          credentialsPath: credentialsPath ?? outputPath,
        }
      : input,
  );
  assertAdapter(commandAdapter);
  if (typeof fetchImplementation !== "function") {
    throw new HostProvisionError("FETCH_UNAVAILABLE", "A fetch implementation is required.");
  }
  if (typeof writeCredentials !== "function") {
    throw new HostProvisionError("CREDENTIAL_WRITER_INVALID", "A credential writer is required.");
  }

  const existingUserId = await lookupHostUserId(commandAdapter, resolvedInput);
  let accountResult;
  if (existingUserId === undefined) {
    try {
      accountResult = await createBetterAuthAccount({
        apiOrigin: resolvedInput.apiOrigin,
        webOrigin: resolvedInput.webOrigin,
        persona: "host",
        account: {
          email: resolvedInput.hostEmail,
          name: resolvedInput.hostName,
          password: resolvedInput.hostPassword,
        },
        fetchImplementation,
      });
    } catch {
      throw new HostProvisionError(
        "ACCOUNT_CREATE_FAILED",
        "The Better Auth host account request failed.",
      );
    }
    if (!isObject(accountResult) || !["created", "existing"].includes(accountResult.state)) {
      throw new HostProvisionError(
        "ACCOUNT_CREATE_FAILED",
        "The Better Auth host account response was invalid.",
      );
    }
  } else {
    accountResult = { state: "existing", userId: existingUserId };
  }

  const userId = await resolveHostUserId(commandAdapter, resolvedInput, accountResult.userId);
  await verifyHostIdentity(commandAdapter, resolvedInput, userId);
  await ensureHostMembership(commandAdapter, resolvedInput, userId);

  let writtenCredentialsPath;
  if (resolvedInput.credentialsPath !== undefined && accountResult.state === "created") {
    try {
      writtenCredentialsPath = await writeCredentials(resolvedInput.credentialsPath, {
        email: resolvedInput.hostEmail,
        name: resolvedInput.hostName,
        password: resolvedInput.hostPassword,
      });
    } catch {
      throw new HostProvisionError(
        "CREDENTIAL_WRITE_FAILED",
        "Host credentials could not be written privately.",
      );
    }
  }

  const summary = {
    event: "host-provisioned",
    environment: resolvedInput.environment,
    webOrigin: resolvedInput.webOrigin,
    apiOrigin: resolvedInput.apiOrigin,
    organizationId: resolvedInput.organizationId,
    eventId: resolvedInput.eventId,
    email: resolvedInput.hostEmail,
    name: resolvedInput.hostName,
    role: resolvedInput.role,
    accountState: accountResult.state,
    userId,
    verified: true,
    membershipEnsured: true,
    ...(writtenCredentialsPath === undefined ? {} : { credentialsPath: writtenCredentialsPath }),
  };
  try {
    logger({ ...summary });
  } catch {
    throw new HostProvisionError(
      "LOGGING_FAILED",
      "The host provisioning summary could not be logged.",
    );
  }
  return summary;
}

export async function loadCommandAdapter(environment = process.env) {
  const spec = firstValue(environment, [
    "EVAL_D1_COMMAND_ADAPTER",
    "EVAL_COMMAND_ADAPTER_MODULE",
    "EVAL_HOST_ADAPTER_MODULE",
  ]);
  if (spec === undefined) {
    throw new HostProvisionError(
      "ADAPTER_REQUIRED",
      "Set EVAL_D1_COMMAND_ADAPTER to an injected adapter module.",
    );
  }
  let module;
  try {
    const moduleUrl = spec.startsWith("file:")
      ? spec
      : pathToFileURL(isAbsolute(spec) ? spec : resolve(spec)).href;
    module = await import(moduleUrl);
  } catch {
    throw new HostProvisionError(
      "ADAPTER_LOAD_FAILED",
      "The injected host adapter could not be loaded.",
    );
  }
  let adapter;
  try {
    adapter = module.default ?? module.commandAdapter ?? (await module.createCommandAdapter?.());
  } catch {
    throw new HostProvisionError(
      "ADAPTER_LOAD_FAILED",
      "The injected host adapter could not be loaded.",
    );
  }
  assertAdapter(adapter);
  return adapter;
}

export async function main(environment = process.env) {
  const input = parseHostProvisioningEnvironment(environment);
  const commandAdapter = await loadCommandAdapter(environment);
  const summary = await provisionHost({ input, commandAdapter });
  console.log(JSON.stringify(summary));
  return summary;
}

const entryPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
if (entryPath !== undefined && entryPath === modulePath) {
  main().catch((error) => {
    if (error instanceof HostProvisionError) {
      console.error(error.message);
    } else {
      console.error("Host provisioning failed.");
    }
    process.exitCode = 1;
  });
}
