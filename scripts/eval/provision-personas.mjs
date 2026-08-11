import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The only confirmation accepted for a production run. Keep this deliberately
 * long and unambiguous: a truthy flag is not sufficient for a destructive
 * identity operation.
 */
export const PRODUCTION_CONFIRMATION = "I_UNDERSTAND_PRODUCTION_EVAL_PERSONA_PROVISIONING";
export const PRODUCTION_CONFIRMATION_TOKEN = PRODUCTION_CONFIRMATION;
export const DEFAULT_EVAL_CONFIG_PATH = "/tmp/killmysaas-evals/evalconfig.json";
export const CANONICAL_ORGANIZATION_ID = "ai-engineer";

export const PERSONA_ORDER = Object.freeze(["organizer", "reviewer", "speaker", "submitter"]);
export const NAMED_SPEAKER_ORDER = Object.freeze(["speaker-priya", "speaker-marcus"]);
export const NAMED_ORGANIZER_ORDER = Object.freeze(["organizer-agenda", "organizer-fixture"]);

/**
 * Organizer and reviewer access live in D1 memberships. Speaker portal access
 * is a D1 speaker grant. A submitter only needs a verified Better Auth user;
 * CFP authorization is ownership-scoped and must not be widened into a tenant
 * membership or a speaker grant.
 */
export const PERSONA_DEFINITIONS = Object.freeze({
  organizer: Object.freeze({
    membershipRole: "admin",
    grant: false,
    defaultName: "Evaluator Organizer",
  }),
  reviewer: Object.freeze({
    membershipRole: "reviewer",
    grant: false,
    defaultName: "Evaluator Reviewer",
  }),
  speaker: Object.freeze({
    membershipRole: null,
    grant: true,
    defaultName: "Evaluator Speaker",
  }),
  submitter: Object.freeze({
    membershipRole: null,
    grant: false,
    defaultName: "Evaluator Submitter",
  }),
});

const ENVIRONMENT_VALUES = new Set(["local", "staging", "production"]);
const DUPLICATE_ACCOUNT_CODES = new Set([
  "USER_ALREADY_EXISTS",
  "USER_EXISTS",
  "EMAIL_ALREADY_EXISTS",
  "ACCOUNT_ALREADY_EXISTS",
]);

export class PersonaProvisionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PersonaProvisionError";
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

function requiredValue(environment, names, label) {
  const value = firstValue(environment, names);
  if (value === undefined) {
    throw new PersonaProvisionError(
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
  throw new PersonaProvisionError(
    "MISSING_ENVIRONMENT",
    `Missing explicit ${label}. Set ${names[0]}.`,
  );
}

function optionalValue(environment, names) {
  return firstValue(environment, names);
}
function exactOptionalValue(environment, names) {
  for (const name of names) {
    if (typeof environment[name] === "string") return environment[name];
  }
  return undefined;
}

function parseEnvironment(environment) {
  const value = requiredValue(
    environment,
    ["EVAL_ENVIRONMENT", "TARGET_ENVIRONMENT", "APP_ENV"],
    "evaluation environment",
  ).toLowerCase();
  if (!ENVIRONMENT_VALUES.has(value)) {
    throw new PersonaProvisionError(
      "INVALID_ENVIRONMENT",
      "EVAL_ENVIRONMENT must be local, staging, or production.",
    );
  }
  return value;
}

function parseOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new PersonaProvisionError("INVALID_ORIGIN", `${label} must be an absolute origin.`);
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new PersonaProvisionError("INVALID_ORIGIN", `${label} must contain only an origin.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PersonaProvisionError("INVALID_ORIGIN", `${label} must use http or https.`);
  }
  return parsed.origin;
}

function isLoopbackOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function assertTargetSafety(input) {
  const { environment, webOrigin, apiOrigin, productionConfirmation } = input;
  if (environment === "production" && productionConfirmation !== PRODUCTION_CONFIRMATION) {
    throw new PersonaProvisionError(
      "PRODUCTION_CONFIRMATION_REQUIRED",
      `Production provisioning requires EVAL_PRODUCTION_CONFIRMATION=${PRODUCTION_CONFIRMATION}.`,
    );
  }
  if (
    environment === "production" &&
    (!webOrigin.startsWith("https://") || !apiOrigin.startsWith("https://"))
  ) {
    throw new PersonaProvisionError(
      "UNSAFE_PRODUCTION_ORIGIN",
      "Production evaluator provisioning requires HTTPS web and API origins.",
    );
  }
  if (environment === "local" && (!isLoopbackOrigin(webOrigin) || !isLoopbackOrigin(apiOrigin))) {
    throw new PersonaProvisionError(
      "UNSAFE_LOCAL_ORIGIN",
      "Local evaluator provisioning requires loopback web and API origins.",
    );
  }
  if (
    environment === "staging" &&
    (!webOrigin.startsWith("https://") || !apiOrigin.startsWith("https://"))
  ) {
    throw new PersonaProvisionError(
      "UNSAFE_STAGING_ORIGIN",
      "Staging evaluator provisioning requires HTTPS web and API origins.",
    );
  }
}

function validEmail(value, persona) {
  // This is intentionally a small boundary check. Better Auth remains the
  // authority for the complete email policy and never receives a fallback.
  if (!/^\S+@\S+$/.test(value)) {
    throw new PersonaProvisionError("INVALID_EMAIL", `${persona} email is invalid.`);
  }
  return value;
}

function readPersona(environment, persona) {
  const upper = persona.toUpperCase();
  const email = validEmail(
    requiredValue(
      environment,
      [`EVAL_${upper}_EMAIL`, `EVAL_PERSONA_${upper}_EMAIL`],
      `${persona} email`,
    ),
    persona,
  );
  const password = requiredSecretValue(
    environment,
    [`EVAL_${upper}_PASSWORD`, `EVAL_PERSONA_${upper}_PASSWORD`],
    `${persona} password`,
  );
  const name =
    optionalValue(environment, [`EVAL_${upper}_NAME`, `EVAL_PERSONA_${upper}_NAME`]) ??
    PERSONA_DEFINITIONS[persona].defaultName;
  return { email, password, name };
}

function assertDistinctEmails(personas) {
  const seen = new Set();
  for (const persona of PERSONA_ORDER) {
    const email = personas[persona].email.toLowerCase();
    if (seen.has(email)) {
      throw new PersonaProvisionError(
        "DUPLICATE_PERSONA_EMAIL",
        "Each evaluator persona must use a distinct email.",
      );
    }
    seen.add(email);
  }
}
function assertCanonicalOrganizationId(organizationId) {
  if (organizationId !== CANONICAL_ORGANIZATION_ID) {
    throw new PersonaProvisionError(
      "SCOPE_MISMATCH",
      `EVAL_ORGANIZATION_ID must be ${CANONICAL_ORGANIZATION_ID}.`,
    );
  }
}

/**
 * Read all required values from explicitly named environment variables. There
 * are no fixture, host-account, tenant, event, origin, or password defaults.
 */
export function parseProvisioningEnvironment(environment = process.env) {
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
      "organization/tenant ID",
    ),
    eventId: requiredValue(environment, ["EVAL_EVENT_ID", "EVAL_CANONICAL_EVENT_ID"], "event ID"),
    productionConfirmation: exactOptionalValue(environment, [
      "EVAL_PRODUCTION_CONFIRMATION",
      "EVAL_CONFIRM_PRODUCTION",
      "EVAL_PRODUCTION_CONFIRMATION_TOKEN",
    ]),
    configPath: optionalValue(environment, ["EVAL_CONFIG_PATH"]) ?? DEFAULT_EVAL_CONFIG_PATH,
    speakerProfileId: optionalValue(environment, ["EVAL_SPEAKER_PROFILE_ID"]),
    namedSpeakers: parseNamedSpeakerEnvironment(environment),
    namedOrganizers: parseNamedOrganizerEnvironment(environment),
    personas: Object.fromEntries(
      PERSONA_ORDER.map((persona) => [persona, readPersona(environment, persona)]),
    ),
  };
  assertCanonicalOrganizationId(parsed.organizationId);
  assertDistinctEmails(parsed.personas);
  assertTargetSafety(parsed);
  return parsed;
}

function valueAt(payload, ...paths) {
  for (const path of paths) {
    let current = payload;
    for (const segment of path) {
      if (current === null || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = current[segment];
    }
    if (typeof current === "string" && current.trim().length > 0) return current.trim();
  }
  return undefined;
}

function accountIdFromPayload(payload) {
  return valueAt(
    payload,
    ["user", "id"],
    ["data", "user", "id"],
    ["session", "userId"],
    ["data", "session", "userId"],
    ["userId"],
  );
}

function responseCode(payload) {
  const code = valueAt(payload, ["code"], ["error", "code"], ["data", "code"]);
  return code?.toUpperCase();
}

function responseMessage(payload) {
  return (
    valueAt(payload, ["message"], ["error", "message"], ["data", "message"])?.toLowerCase() ?? ""
  );
}

function isDuplicateAccountResponse(status, payload) {
  if (status === 409) return true;
  const code = responseCode(payload);
  if (code !== undefined && DUPLICATE_ACCOUNT_CODES.has(code)) return true;
  return (
    /already exists|already registered|user exists|email exists/u.test(responseMessage(payload)) ||
    (code !== undefined &&
      /(?:USER|EMAIL|ACCOUNT).*?(?:EXISTS|REGISTERED)|ALREADY.*(?:USER|EMAIL|ACCOUNT)/u.test(code))
  );
}

async function readResponsePayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * Create one Better Auth credential account through the public endpoint. A
 * duplicate response is treated as an existing account, which makes reruns
 * safe; no sign-in or mail endpoint is called as a fallback.
 */
export async function createBetterAuthAccount({
  apiOrigin,
  webOrigin,
  persona,
  account,
  fetchImplementation = globalThis.fetch,
}) {
  if (typeof fetchImplementation !== "function") {
    throw new PersonaProvisionError("FETCH_UNAVAILABLE", "A fetch implementation is required.");
  }
  const url = `${String(apiOrigin).replace(/\/+$/u, "")}/api/auth/sign-up/email`;
  let response;
  try {
    response = await fetchImplementation(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: webOrigin,
      },
      body: JSON.stringify({
        name: account.name,
        email: account.email,
        password: account.password,
      }),
    });
  } catch {
    throw new PersonaProvisionError(
      "AUTH_REQUEST_FAILED",
      `Better Auth account creation failed for ${persona}.`,
    );
  }

  const payload = await readResponsePayload(response);
  if (response.ok && !isDuplicateAccountResponse(response.status, payload)) {
    return { state: "created", userId: accountIdFromPayload(payload) };
  }
  if (isDuplicateAccountResponse(response.status, payload)) {
    return { state: "existing", userId: accountIdFromPayload(payload) };
  }
  throw new PersonaProvisionError(
    "AUTH_REQUEST_REJECTED",
    `Better Auth rejected the ${persona} account request (status ${response.status}).`,
  );
}

function hasMethod(adapter, names) {
  if (adapter === null || adapter === undefined || typeof adapter !== "object") return undefined;
  return names.find((name) => typeof adapter[name] === "function");
}

async function dispatchCommand(adapter, command, methods, operation) {
  if (typeof adapter === "function") return adapter(command);
  const method = hasMethod(adapter, methods);
  if (method !== undefined) return adapter[method](command);
  if (adapter !== null && typeof adapter === "object") {
    if (typeof adapter.execute === "function") return adapter.execute(command);
    if (typeof adapter.run === "function") return adapter.run(command);
    if (typeof adapter.provision === "function") return adapter.provision(command);
  }
  throw new PersonaProvisionError(
    "D1_ADAPTER_REQUIRED",
    `The injected D1 command adapter cannot ${operation}.`,
  );
}

function safeCommandError(operation, persona) {
  return new PersonaProvisionError(
    "D1_COMMAND_FAILED",
    `D1 ${operation} provisioning failed for ${persona}.`,
  );
}
async function resolveUserId(adapter, input) {
  if (input.userId !== undefined) return input.userId;
  const method = hasMethod(adapter, ["resolveUserId", "findUserIdByEmail", "getUserIdByEmail"]);
  if (method === undefined) return undefined;
  try {
    const result = await adapter[method]({
      organizationId: input.organizationId,
      eventId: input.eventId,
      persona: input.persona,
      email: input.email,
    });
    if (typeof result === "string" && result.trim().length > 0) return result.trim();
    if (result !== null && typeof result === "object" && typeof result.userId === "string") {
      return result.userId;
    }
    return undefined;
  } catch {
    throw safeCommandError("account lookup", input.persona);
  }
}
function namedAccountEntries(value, kind) {
  if (value === undefined || value === null) return [];
  const entries = Array.isArray(value)
    ? value.map((account, index) => [
        account?.identityKey ?? account?.key ?? `${kind}-${index}`,
        account,
      ])
    : Object.entries(value);
  const result = [];
  const seenKeys = new Set();
  const allowedKeys = kind === "speaker" ? NAMED_SPEAKER_ORDER : NAMED_ORGANIZER_ORDER;
  for (const [identityKey, raw] of entries) {
    if (typeof identityKey !== "string" || identityKey.trim().length === 0) {
      throw new PersonaProvisionError("INVALID_INPUT", `A named ${kind} identity key is required.`);
    }
    if (!allowedKeys.includes(identityKey)) {
      throw new PersonaProvisionError(
        "UNKNOWN_PERSONA_IDENTITY",
        `Unsupported named ${kind} identity ${identityKey}.`,
      );
    }
    if (seenKeys.has(identityKey)) {
      throw new PersonaProvisionError(
        "DUPLICATE_PERSONA_IDENTITY",
        `Duplicate ${kind} identity key.`,
      );
    }
    seenKeys.add(identityKey);
    if (raw === null || typeof raw !== "object") {
      throw new PersonaProvisionError(
        "INVALID_INPUT",
        `Named ${kind} identity ${identityKey} is invalid.`,
      );
    }
    const email = validEmail(String(raw.email ?? ""), identityKey);
    if (typeof raw.password !== "string" || raw.password.length === 0) {
      throw new PersonaProvisionError(
        "INVALID_INPUT",
        `Named ${kind} identity ${identityKey} password is required.`,
      );
    }
    const userId =
      typeof raw.userId === "string" && raw.userId.trim().length > 0
        ? raw.userId.trim()
        : undefined;
    result.push({
      identityKey,
      email: email.trim(),
      password: raw.password,
      name:
        typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : identityKey,
      userId,
      speakerProfileId:
        typeof raw.speakerProfileId === "string" && raw.speakerProfileId.trim().length > 0
          ? raw.speakerProfileId.trim()
          : undefined,
      role: kind === "organizer" ? "admin" : null,
      grant: kind === "speaker",
    });
  }
  const emails = new Set();
  for (const account of result) {
    const email = account.email.toLowerCase();
    if (emails.has(email)) {
      throw new PersonaProvisionError(
        "DUPLICATE_PERSONA_EMAIL",
        "Named identities must use distinct emails.",
      );
    }
    emails.add(email);
  }
  return result;
}

export function parseNamedSpeakerEnvironment(environment = process.env) {
  const namedSpeakers = {};
  for (const identityKey of NAMED_SPEAKER_ORDER) {
    const suffix = identityKey.slice("speaker-".length).toUpperCase().replaceAll("-", "_");
    const email = firstValue(environment, [`EVAL_SPEAKER_${suffix}_EMAIL`]);
    const password = exactOptionalValue(environment, [`EVAL_SPEAKER_${suffix}_PASSWORD`]);
    if (email === undefined && password === undefined) continue;
    if (email === undefined || password === undefined) {
      throw new PersonaProvisionError(
        "MISSING_ENVIRONMENT",
        `Named speaker ${identityKey} requires both explicit email and password.`,
      );
    }
    namedSpeakers[identityKey] = { email, password, name: identityKey };
  }
  return namedSpeakers;
}
export function parseNamedOrganizerEnvironment(environment = process.env) {
  const namedOrganizers = {};
  for (const identityKey of NAMED_ORGANIZER_ORDER) {
    const suffix = identityKey.slice("organizer-".length).toUpperCase().replaceAll("-", "_");
    const email = firstValue(environment, [`EVAL_ORGANIZER_${suffix}_EMAIL`]);
    const password = exactOptionalValue(environment, [`EVAL_ORGANIZER_${suffix}_PASSWORD`]);
    if (email === undefined && password === undefined) continue;
    if (email === undefined || password === undefined) {
      throw new PersonaProvisionError(
        "MISSING_ENVIRONMENT",
        `Named organizer ${identityKey} requires both explicit email and password.`,
      );
    }
    namedOrganizers[identityKey] = { email, password, name: identityKey };
  }
  return namedOrganizers;
}

export async function provisionNamedAccounts({
  input,
  commandAdapter,
  fetchImplementation,
  verificationImplementation,
  namedSpeakers,
  namedOrganizers,
}) {
  const entries = [
    ...namedAccountEntries(namedOrganizers, "organizer"),
    ...namedAccountEntries(namedSpeakers, "speaker"),
  ];
  const states = {};
  const resolvedUserIds = {};
  const memberships = [];
  const grants = [];
  const verified = [];
  for (const account of entries) {
    const created = await createBetterAuthAccount({
      apiOrigin: input.apiOrigin,
      webOrigin: input.webOrigin,
      persona: account.identityKey,
      account,
      fetchImplementation,
    });
    states[account.identityKey] = created.state;
    const userId = await resolveUserId(commandAdapter, {
      organizationId: input.organizationId,
      eventId: input.eventId,
      persona: account.identityKey,
      email: account.email,
      userId: account.userId ?? created.userId,
    });
    if (typeof userId !== "string" || userId.trim().length === 0) {
      throw new PersonaProvisionError(
        "IDENTITY_UNRESOLVED",
        `Better Auth did not resolve a user ID for ${account.identityKey}.`,
      );
    }
    resolvedUserIds[account.identityKey] = userId.trim();
    const commandInput = {
      environment: input.environment,
      organizationId: input.organizationId,
      eventId: input.eventId,
      persona: account.identityKey,
      identityKey: account.identityKey,
      email: account.email,
      userId: userId.trim(),
      role: account.role,
      speakerProfileId: account.speakerProfileId,
    };
    if (account.role !== null) {
      await ensureMembership(commandAdapter, commandInput);
      memberships.push(account.identityKey);
    }
    if (account.grant) {
      await ensureSpeakerGrant(commandAdapter, commandInput);
      grants.push(account.identityKey);
    }
    const didVerify = await verifyAccount(commandAdapter, commandInput, verificationImplementation);
    if (!didVerify) {
      throw new PersonaProvisionError(
        "IDENTITY_UNVERIFIED",
        `Named identity ${account.identityKey} could not be verified.`,
      );
    }
    verified.push(account.identityKey);
  }
  return { states, resolvedUserIds, memberships, grants, verified };
}

async function ensureMembership(adapter, input) {
  const command = {
    type: "membership",
    kind: "membership",
    operation: "ensure",
    idempotencyKey: `eval-persona:${input.organizationId}:membership:${input.identityKey !== undefined ? (input.userId ?? input.identityKey) : input.persona}`,
    organizationId: input.organizationId,
    eventId: input.eventId,
    persona: input.persona,
    userId: input.userId,
    email: input.email,
    role: input.role,
  };
  try {
    await dispatchCommand(
      adapter,
      command,
      ["ensureMembership", "provisionMembership", "membership"],
      "ensure membership",
    );
  } catch {
    throw safeCommandError("membership", input.persona);
  }
}

async function ensureSpeakerGrant(adapter, input) {
  const command = {
    type: "speaker-grant",
    kind: "speaker-grant",
    operation: "ensure",
    idempotencyKey: `eval-persona:${input.organizationId}:${input.eventId}:speaker-grant:${input.identityKey !== undefined ? (input.userId ?? input.identityKey) : input.persona}`,
    organizationId: input.organizationId,
    eventId: input.eventId,
    persona: input.persona,
    userId: input.userId,
    email: input.email,
    ...(input.speakerProfileId === undefined ? {} : { speakerProfileId: input.speakerProfileId }),
  };
  try {
    await dispatchCommand(
      adapter,
      command,
      ["ensureSpeakerGrant", "provisionSpeakerGrant", "speakerGrant"],
      "ensure speaker grant",
    );
  } catch {
    throw safeCommandError("speaker grant", input.persona);
  }
}

async function verifyAccount(adapter, input, verificationImplementation) {
  if (typeof verificationImplementation === "function") {
    try {
      await verificationImplementation({
        type: "account-verification",
        operation: "ensure",
        idempotencyKey: `eval-persona:${input.organizationId}:verification:${input.identityKey !== undefined ? (input.userId ?? input.identityKey) : input.persona}`,
        organizationId: input.organizationId,
        eventId: input.eventId,
        persona: input.persona,
        userId: input.userId,
        email: input.email,
        environment: input.environment,
      });
      return true;
    } catch {
      throw safeCommandError("account verification", input.persona);
    }
  }
  const method = hasMethod(adapter, ["verifyAccount", "ensureVerified", "markEmailVerified"]);
  if (method === undefined) return false;
  try {
    await adapter[method]({
      type: "account-verification",
      operation: "ensure",
      idempotencyKey: `eval-persona:${input.organizationId}:verification:${input.identityKey !== undefined ? (input.userId ?? input.identityKey) : input.persona}`,
      organizationId: input.organizationId,
      eventId: input.eventId,
      persona: input.persona,
      userId: input.userId,
      email: input.email,
      environment: input.environment,
    });
    return true;
  } catch {
    throw safeCommandError("account verification", input.persona);
  }
}

/**
 * Build only fields understood by the official SessionBoard Eval Kit config.
 * The returned object intentionally contains credentials because it is written
 * to a file with mode 0600; callers must not print it.
 */
export function buildEvalConfig(input) {
  const personaEmails = Object.fromEntries(
    PERSONA_ORDER.map((persona) => [persona, input.personas[persona].email]),
  );
  const credentials = Object.fromEntries(
    PERSONA_ORDER.map((persona) => [
      persona,
      {
        email: input.personas[persona].email,
        password: input.personas[persona].password,
        notes: `Provisioned evaluator ${persona} account.`,
      },
    ]),
  );
  return {
    url: input.webOrigin,
    areas: [],
    includeOptional: false,
    personaEmails,
    credentials,
    headless: true,
    agentModel: "claude-sonnet-5",
    judgeModel: "claude-opus-5",
    maxTurnsPerScenario: 70,
    submissionNotes:
      "Synthetic evaluator personas were provisioned explicitly for this target. Do not replace them with a host account.",
  };
}

/** Write the official config as a private file without ever logging its contents. */
export async function writeEvalConfig(configPath, config) {
  const target = isAbsolute(configPath) ? configPath : resolve(configPath);
  try {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(target, 0o600);
  } catch {
    throw new PersonaProvisionError(
      "CONFIG_WRITE_FAILED",
      "The evaluator config could not be written.",
    );
  }
  return target;
}

function normalizeInput(input) {
  if (input === null || typeof input !== "object") {
    throw new PersonaProvisionError("INVALID_INPUT", "Provisioning input is required.");
  }
  const required = [
    "environment",
    "webOrigin",
    "apiOrigin",
    "organizationId",
    "eventId",
    "personas",
  ];
  for (const key of required) {
    if (key === "personas") {
      if (input.personas === null || typeof input.personas !== "object") {
        throw new PersonaProvisionError("INVALID_INPUT", "Provisioning input is missing personas.");
      }
      continue;
    }
    if (typeof input[key] !== "string") {
      throw new PersonaProvisionError("INVALID_INPUT", `Provisioning input is missing ${key}.`);
    }
  }
  const normalized = {
    ...input,
    environment: String(input.environment).toLowerCase(),
    webOrigin: parseOrigin(String(input.webOrigin), "Web origin"),
    apiOrigin: parseOrigin(String(input.apiOrigin), "API origin"),
    organizationId: String(input.organizationId).trim(),
    eventId: String(input.eventId).trim(),
    productionConfirmation: input.productionConfirmation,
    configPath: input.configPath ?? DEFAULT_EVAL_CONFIG_PATH,
  };
  if (
    !ENVIRONMENT_VALUES.has(normalized.environment) ||
    normalized.organizationId.length === 0 ||
    normalized.eventId.length === 0
  ) {
    throw new PersonaProvisionError(
      "INVALID_INPUT",
      "Provisioning input has an invalid environment or scope.",
    );
  }
  assertCanonicalOrganizationId(normalized.organizationId);
  for (const persona of PERSONA_ORDER) {
    const account = normalized.personas[persona];
    if (account === null || typeof account !== "object") {
      throw new PersonaProvisionError("INVALID_INPUT", `Provisioning input is missing ${persona}.`);
    }
    validEmail(String(account.email ?? ""), persona);
    if (typeof account.password !== "string" || account.password.length === 0) {
      throw new PersonaProvisionError("INVALID_INPUT", `${persona} password is required.`);
    }
  }
  normalized.personas = Object.fromEntries(
    PERSONA_ORDER.map((persona) => {
      const account = normalized.personas[persona];
      return [
        persona,
        {
          ...account,
          email: String(account.email).trim(),
          name:
            typeof account.name === "string" && account.name.trim().length > 0
              ? account.name.trim()
              : PERSONA_DEFINITIONS[persona].defaultName,
        },
      ];
    }),
  );
  assertDistinctEmails(normalized.personas);
  normalized.namedSpeakers = normalized.namedSpeakers ?? {};
  normalized.namedOrganizers = normalized.namedOrganizers ?? {};
  const knownEmails = new Set(
    PERSONA_ORDER.map((persona) => normalized.personas[persona].email.toLowerCase()),
  );
  for (const account of [
    ...namedAccountEntries(normalized.namedOrganizers, "organizer"),
    ...namedAccountEntries(normalized.namedSpeakers, "speaker"),
  ]) {
    const email = account.email.toLowerCase();
    if (knownEmails.has(email)) {
      throw new PersonaProvisionError(
        "DUPLICATE_PERSONA_EMAIL",
        "Named identities must not reuse a base persona email.",
      );
    }
    knownEmails.add(email);
  }
  assertTargetSafety(normalized);
  return normalized;
}

/**
 * Provision accounts first, then narrow D1 access. Every D1 operation is an
 * injected idempotent command; this script never shells out or writes D1.
 */
export async function provisionPersonas({
  input,
  environment,
  webOrigin,
  apiOrigin,
  organizationId,
  eventId,
  personas,
  productionConfirmation,
  namedSpeakers,
  namedOrganizers,
  configPath,
  fetchImplementation = globalThis.fetch,
  commandAdapter,
  writeConfig = writeEvalConfig,
  logger = () => {},
  verifyAccountImplementation,
  verifyImplementation,
  verificationImplementation,
} = {}) {
  const resolvedInput = normalizeInput(
    input === undefined
      ? {
          environment,
          webOrigin,
          apiOrigin,
          organizationId,
          eventId,
          personas,
          namedSpeakers,
          namedOrganizers,
          productionConfirmation,
          configPath,
        }
      : {
          ...input,
          ...(namedSpeakers === undefined ? {} : { namedSpeakers }),
          ...(namedOrganizers === undefined ? {} : { namedOrganizers }),
        },
  );
  if (commandAdapter === undefined || commandAdapter === null) {
    throw new PersonaProvisionError(
      "D1_ADAPTER_REQUIRED",
      "An injected D1 command adapter is required.",
    );
  }

  const accountStates = {};
  const verified = [];
  const provisionedMemberships = [];
  const provisionedSpeakerGrants = [];
  const accountRecords = {};

  for (const persona of PERSONA_ORDER) {
    const account = resolvedInput.personas[persona];
    const accountResult = await createBetterAuthAccount({
      apiOrigin: resolvedInput.apiOrigin,
      webOrigin: resolvedInput.webOrigin,
      persona,
      account,
      fetchImplementation,
    });
    accountStates[persona] = accountResult.state;
    accountRecords[persona] = { ...account, userId: accountResult.userId };
  }

  for (const persona of PERSONA_ORDER) {
    const definition = PERSONA_DEFINITIONS[persona];
    const account = accountRecords[persona];
    const resolvedUserId = await resolveUserId(commandAdapter, {
      organizationId: resolvedInput.organizationId,
      eventId: resolvedInput.eventId,
      persona,
      email: account.email,
      userId: account.userId,
    });
    const commandInput = {
      environment: resolvedInput.environment,
      organizationId: resolvedInput.organizationId,
      eventId: resolvedInput.eventId,
      persona,
      email: account.email,
      userId: resolvedUserId,
      role: definition.membershipRole,
      speakerProfileId: persona === "speaker" ? resolvedInput.speakerProfileId : undefined,
    };
    if (definition.membershipRole !== null) {
      await ensureMembership(commandAdapter, commandInput);
      provisionedMemberships.push(persona);
    }
    if (definition.grant) {
      await ensureSpeakerGrant(commandAdapter, commandInput);
      provisionedSpeakerGrants.push(persona);
    }
    if (
      await verifyAccount(
        commandAdapter,
        commandInput,
        verifyAccountImplementation ?? verificationImplementation ?? verifyImplementation,
      )
    ) {
      verified.push(persona);
    }
  }
  const namedResult = await provisionNamedAccounts({
    input: resolvedInput,
    commandAdapter,
    fetchImplementation,
    verificationImplementation:
      verifyAccountImplementation ?? verificationImplementation ?? verifyImplementation,
    namedSpeakers: resolvedInput.namedSpeakers,
    namedOrganizers: resolvedInput.namedOrganizers,
  });
  Object.assign(accountStates, namedResult.states);
  Object.assign(accountRecords, namedResult.resolvedUserIds);
  provisionedMemberships.push(...namedResult.memberships);
  provisionedSpeakerGrants.push(...namedResult.grants);
  verified.push(...namedResult.verified);

  const config = buildEvalConfig(resolvedInput);
  let writtenPath;
  try {
    writtenPath = await writeConfig(resolvedInput.configPath, config);
  } catch {
    throw new PersonaProvisionError(
      "CONFIG_WRITE_FAILED",
      "The evaluator config could not be written.",
    );
  }

  const summary = {
    environment: resolvedInput.environment,
    organizationId: resolvedInput.organizationId,
    eventId: resolvedInput.eventId,
    webOrigin: resolvedInput.webOrigin,
    configPath: writtenPath ?? resolvedInput.configPath,
    accountStates,
    namedIdentityKeys: Object.keys(namedResult.states),
    namedResolvedUserIds: { ...namedResult.resolvedUserIds },
    membershipPersonas: provisionedMemberships,
    speakerGrantPersonas: provisionedSpeakerGrants,
    verifiedPersonas: verified,
  };
  logger({
    event: "evaluator-personas-provisioned",
    environment: summary.environment,
    organizationId: summary.organizationId,
    eventId: summary.eventId,
    accountCount: PERSONA_ORDER.length,
  });
  return summary;
}

async function loadCommandAdapter(environment) {
  const spec = firstValue(environment, ["EVAL_D1_COMMAND_ADAPTER", "EVAL_COMMAND_ADAPTER_MODULE"]);
  if (spec === undefined) {
    throw new PersonaProvisionError(
      "D1_ADAPTER_REQUIRED",
      "Set EVAL_D1_COMMAND_ADAPTER to an adapter module; no D1 command runs by default.",
    );
  }
  let module;
  try {
    const moduleUrl = spec.startsWith("file:")
      ? spec
      : pathToFileURL(isAbsolute(spec) ? spec : resolve(spec)).href;
    module = await import(moduleUrl);
  } catch {
    throw new PersonaProvisionError(
      "D1_ADAPTER_LOAD_FAILED",
      "The injected D1 command adapter could not be loaded.",
    );
  }
  const adapter =
    module.default ?? module.commandAdapter ?? (await module.createCommandAdapter?.());
  if (adapter === undefined || adapter === null) {
    throw new PersonaProvisionError(
      "D1_ADAPTER_LOAD_FAILED",
      "The adapter module did not export a command adapter.",
    );
  }
  return adapter;
}

export async function main(environment = process.env) {
  const input = parseProvisioningEnvironment(environment);
  const commandAdapter = await loadCommandAdapter(environment);
  const summary = await provisionPersonas({ input, commandAdapter });
  console.log(
    `Provisioned ${Object.keys(summary.accountStates).length} evaluator personas for ${summary.environment}; config written privately.`,
  );
  return summary;
}

const entryPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
if (entryPath !== undefined && entryPath === modulePath) {
  main().catch((error) => {
    if (error instanceof PersonaProvisionError) {
      console.error(error.message);
    } else {
      console.error("Evaluator persona provisioning failed.");
    }
    process.exitCode = 1;
  });
}
