import { safeLoginReturnTo } from "./return-path";
import { normalizeSessionSpeakerGrants } from "./session";

const AUTH_PATH = "/api/auth";
const ADMIN_PATH = "/admin";
const WORK_PATH = "/work";
const INVALID_CREDENTIALS_MESSAGE = "The email or password is incorrect.";
const UNVERIFIED_EMAIL_MESSAGE =
  "Your email is not verified yet. Check your inbox for a verification link.";
const SERVER_ERROR_MESSAGE = "We couldn't sign you in right now. Try again in a moment.";
const MAGIC_LINK_ERROR_MESSAGE =
  "We couldn't send a sign-in link right now. Try again in a moment.";
const RATE_LIMIT_MESSAGE = "Too many sign-in attempts. Wait a moment and try again.";
const TIMEOUT_MESSAGE =
  "The sign-in service took too long to respond. Check your connection and try again.";
const UNEXPECTED_RESPONSE_MESSAGE =
  "The sign-in service returned an unexpected response. Try again. If it continues, contact an administrator.";
export const LOGIN_REQUEST_TIMEOUT_MS = 15_000;
export const ORGANIZER_DOMAIN_ERROR_MESSAGE = "Enter a valid email address.";
export const SIGNUP_PASSWORD_POLICY_MESSAGE =
  "Use 8–128 characters with an uppercase letter, a number, and a symbol.";
const NETWORK_ERROR_MESSAGE =
  "We couldn't reach the sign-in service. Check your connection and try again.";
const PORTAL_PATH = "/portal";
const AUTHENTICATION_ERROR_MESSAGE =
  "We couldn't verify your account access. Sign in again or contact an administrator.";
const LOGIN_MEMBERSHIP_ROLES = new Set(["owner", "admin", "reviewer"]);

type UnknownRecord = Record<string, unknown>;

export type LoginErrorKind =
  | "invalid-credentials"
  | "email-unverified"
  | "server"
  | "network"
  | "organization-domain"
  | "invalid-password"
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "unexpected-response";

export interface LoginEnvironment {
  readonly apiBaseUrl?: string | undefined;
}

export type LoginConfig = { readonly apiBaseUrl: string };

export type LoginFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const defaultFetcher: LoginFetcher = (input, init) => globalThis.fetch(input, init);
export type LoginMembershipRole = "owner" | "admin" | "reviewer";

export interface LoginMembership {
  readonly role: LoginMembershipRole;
  readonly organizationId?: string;
}

export interface LoginSpeakerGrant {
  readonly organizationId?: string;
  readonly speakerProfileId?: string;
}

export interface LoginSession {
  readonly memberships: readonly LoginMembership[];
  readonly speakerGrants: readonly LoginSpeakerGrant[];
}

export class LoginRequestError extends Error {
  readonly kind: LoginErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;

  constructor(
    kind: LoginErrorKind,
    message: string,
    options: { readonly status?: number | undefined; readonly code?: string | undefined } = {},
  ) {
    super(message);
    this.name = "LoginRequestError";
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
  }
}

export interface LoginApi {
  signInWithEmail(input: { readonly email: string; readonly password: string }): Promise<void>;
  requestMagicLink(input: { readonly email: string; readonly callbackURL: string }): Promise<void>;
  getSession(): Promise<LoginSession>;
  signUpWithEmail(input: {
    readonly name: string;
    readonly email: string;
    readonly password: string;
  }): Promise<{ readonly verificationRequired: boolean }>;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function explicitSafeLoginReturnTo(value: unknown): string | undefined {
  if (!nonEmptyString(value)) return undefined;
  const safe = safeLoginReturnTo(value);
  return safe === value ? safe : undefined;
}

function collectionValue(
  candidates: readonly UnknownRecord[],
  keys: readonly string[],
): { found: boolean; value: unknown } {
  for (const candidate of candidates) {
    for (const key of keys) {
      if (key in candidate) return { found: true, value: candidate[key] };
    }
  }
  return { found: false, value: undefined };
}

function parseMemberships(value: unknown): readonly LoginMembership[] | null {
  if (!Array.isArray(value)) return null;
  const memberships: LoginMembership[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.role !== "string") return null;
    const role = item.role.toLowerCase();
    if (!LOGIN_MEMBERSHIP_ROLES.has(role)) return null;
    if (
      ("organizationId" in item && typeof item.organizationId !== "string") ||
      ("organization_id" in item && typeof item.organization_id !== "string")
    ) {
      return null;
    }
    const organizationId =
      typeof item.organizationId === "string"
        ? item.organizationId
        : typeof item.organization_id === "string"
          ? item.organization_id
          : undefined;
    if (organizationId !== undefined && !nonEmptyString(organizationId)) return null;
    memberships.push({
      role: role as LoginMembershipRole,
      ...(organizationId === undefined ? {} : { organizationId }),
    });
  }
  return memberships;
}

function parseSpeakerGrants(value: unknown): readonly LoginSpeakerGrant[] | null {
  if (!Array.isArray(value)) return null;
  const grants: LoginSpeakerGrant[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (
      ("organizationId" in item && typeof item.organizationId !== "string") ||
      ("organization_id" in item && typeof item.organization_id !== "string") ||
      ("speakerProfileId" in item && typeof item.speakerProfileId !== "string") ||
      ("speaker_profile_id" in item && typeof item.speaker_profile_id !== "string")
    ) {
      return null;
    }
    const organizationId =
      typeof item.organizationId === "string"
        ? item.organizationId
        : typeof item.organization_id === "string"
          ? item.organization_id
          : undefined;
    const speakerProfileId =
      typeof item.speakerProfileId === "string"
        ? item.speakerProfileId
        : typeof item.speaker_profile_id === "string"
          ? item.speaker_profile_id
          : undefined;
    if (
      (organizationId !== undefined && !nonEmptyString(organizationId)) ||
      (speakerProfileId !== undefined && !nonEmptyString(speakerProfileId))
    ) {
      return null;
    }
    if (organizationId === undefined && speakerProfileId === undefined) return null;
    grants.push({
      ...(organizationId === undefined ? {} : { organizationId }),
      ...(speakerProfileId === undefined ? {} : { speakerProfileId }),
    });
  }
  return grants;
}

function parseLoginSession(payload: unknown): LoginSession | null {
  if (!isRecord(payload)) return null;
  const root =
    isRecord(payload.data) && isRecord(payload.data.session) && isRecord(payload.data.user)
      ? payload.data
      : payload;
  if (!isRecord(root.session) || !isRecord(root.user)) return null;
  const sessionId = root.session.id ?? root.session.sessionId;
  const userId = root.user.id ?? root.user.userId;
  if (!nonEmptyString(sessionId) || !nonEmptyString(userId)) return null;

  const candidates = [
    root,
    payload,
    payload.data,
    root.session,
    root.user,
    root.session.user,
  ].filter(isRecord);
  const membershipsValue = collectionValue(candidates, [
    "memberships",
    "organizationMemberships",
    "organization_memberships",
  ]);
  const memberships = membershipsValue.found ? parseMemberships(membershipsValue.value) : [];
  const speakerGrants = normalizeSessionSpeakerGrants(payload);
  if (memberships === null) return null;
  return { memberships, speakerGrants };
}

function normalizeLoginSession(value: unknown): LoginSession | null {
  if (isRecord(value) && Array.isArray(value.memberships)) {
    const memberships = parseMemberships(value.memberships);
    const speakerGrants = parseSpeakerGrants(value.speakerGrants ?? value.speaker_grants ?? []);
    if (memberships !== null && speakerGrants !== null) return { memberships, speakerGrants };
  }
  return parseLoginSession(value);
}

export function safeLoginLandingRoute(value: unknown, returnTo?: unknown): string {
  const session = normalizeLoginSession(value);
  if (session === null) {
    throw new LoginRequestError("authentication", AUTHENTICATION_ERROR_MESSAGE);
  }

  const explicit = explicitSafeLoginReturnTo(returnTo);
  if (explicit !== undefined) return explicit;

  return WORK_PATH;
}

export function resolveLoginWorkspace(returnTo: unknown): "operator" | "portal" {
  const destination = explicitSafeLoginReturnTo(returnTo);
  return destination?.startsWith(PORTAL_PATH) ? "portal" : "operator";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function normalizeEnvironment(environment: LoginEnvironment): string {
  return trimTrailingSlash(environment.apiBaseUrl?.trim() ?? "");
}

export function normalizedOrganizerEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at !== normalized.indexOf("@") || at === normalized.length - 1) return null;
  return normalized;
}

export function signupPasswordError(value: string): string | null {
  if (!value) return "Enter a password.";
  const valid =
    value.length >= 8 &&
    value.length <= 128 &&
    /[^A-Za-z0-9]/u.test(value) &&
    /[0-9]/u.test(value) &&
    /[A-Z]/u.test(value);
  return valid ? null : SIGNUP_PASSWORD_POLICY_MESSAGE;
}

export function resolveLoginConfig(environment: LoginEnvironment = {}): LoginConfig {
  return { apiBaseUrl: normalizeEnvironment(environment) };
}

function responseFields(payload: unknown): {
  code?: string | undefined;
  message?: string | undefined;
} {
  const candidates: UnknownRecord[] = [];
  if (isRecord(payload)) {
    candidates.push(payload);
    if (isRecord(payload.error)) candidates.push(payload.error);
    if (isRecord(payload.data)) {
      candidates.push(payload.data);
      if (isRecord(payload.data.error)) candidates.push(payload.data.error);
    }
  }

  let code: string | undefined;
  let message: string | undefined;
  for (const candidate of candidates) {
    if (code === undefined && typeof candidate.code === "string" && candidate.code.trim()) {
      code = candidate.code;
    }
    if (
      message === undefined &&
      typeof candidate.message === "string" &&
      candidate.message.trim()
    ) {
      message = candidate.message;
    }
  }
  return { code, message };
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function classifyRequestFailure(
  response: Response,
  payload: unknown,
  fallbackKind: LoginErrorKind,
  fallbackMessage: string,
): LoginRequestError {
  const fields = responseFields(payload);
  const code = fields.code?.toUpperCase() ?? "";
  const message = fields.message?.toLowerCase() ?? "";
  const rateLimited =
    response.status === 429 ||
    code.includes("RATE_LIMIT") ||
    code.includes("TOO_MANY_REQUESTS") ||
    message.includes("rate limit") ||
    message.includes("too many request");
  if (rateLimited) {
    return new LoginRequestError("rate-limit", RATE_LIMIT_MESSAGE, {
      status: response.status,
      code: fields.code,
    });
  }

  const timedOut =
    response.status === 408 ||
    response.status === 504 ||
    code.includes("TIMEOUT") ||
    message.includes("timed out") ||
    message.includes("gateway deadline");
  if (timedOut) {
    return new LoginRequestError("timeout", TIMEOUT_MESSAGE, {
      status: response.status,
      code: fields.code,
    });
  }

  return new LoginRequestError(fallbackKind, fallbackMessage, {
    status: response.status,
    code: fields.code,
  });
}

function classifyEmailFailure(response: Response, payload: unknown): LoginRequestError {
  const transportFailure = classifyRequestFailure(
    response,
    payload,
    "server",
    SERVER_ERROR_MESSAGE,
  );
  if (transportFailure.kind !== "server") return transportFailure;
  const fields = responseFields(payload);
  const code = fields.code?.toUpperCase() ?? "";
  const message = fields.message?.toLowerCase() ?? "";
  const verificationFailure =
    code.includes("VERIF") || message.includes("verify") || message.includes("verification");
  if (verificationFailure) {
    return new LoginRequestError("email-unverified", UNVERIFIED_EMAIL_MESSAGE, {
      status: response.status,
      code: fields.code,
    });
  }

  const invalidCredentials =
    response.status === 401 ||
    code.includes("INVALID_EMAIL_OR_PASSWORD") ||
    code.includes("INVALID_CREDENTIAL") ||
    code === "USER_NOT_FOUND" ||
    (message.includes("password") && message.includes("email"));
  if (invalidCredentials) {
    return new LoginRequestError("invalid-credentials", INVALID_CREDENTIALS_MESSAGE, {
      status: response.status,
      code: fields.code,
    });
  }

  return classifyRequestFailure(response, payload, "server", SERVER_ERROR_MESSAGE);
}

function classifyMagicLinkFailure(response: Response, payload: unknown): LoginRequestError {
  return classifyRequestFailure(response, payload, "server", MAGIC_LINK_ERROR_MESSAGE);
}

function hasAuthSession(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const candidates: UnknownRecord[] = [payload];
  if (isRecord(payload.data)) candidates.push(payload.data);
  return candidates.some((candidate) => {
    if (typeof candidate.token === "string" && candidate.token.trim()) return true;
    if (!isRecord(candidate.session)) return false;
    return nonEmptyString(candidate.session.id ?? candidate.session.sessionId);
  });
}

function authEndpoint(apiBaseUrl: string): string {
  const normalized = trimTrailingSlash(apiBaseUrl.trim());
  return normalized.endsWith(AUTH_PATH) ? normalized : `${normalized}${AUTH_PATH}`;
}
interface LoginResponsePayload {
  readonly response: Response;
  readonly payload: unknown;
}

function loginTimeoutError(): LoginRequestError {
  return new LoginRequestError("timeout", TIMEOUT_MESSAGE, {
    status: 504,
    code: "LOGIN_REQUEST_TIMEOUT",
  });
}

async function requestLoginResponse(
  fetcher: LoginFetcher,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<LoginResponsePayload> {
  const controller = new AbortController();
  let timedOut = false;
  let timeout!: ReturnType<typeof setTimeout>;
  const request = Promise.resolve().then(async () => {
    const response = await fetcher(input, { ...init, signal: controller.signal });
    return { response, payload: await responseBody(response) };
  });
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(loginTimeoutError());
    }, LOGIN_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request, deadline]);
  } catch (error) {
    if (timedOut) throw loginTimeoutError();
    if (error instanceof LoginRequestError) throw error;
    throw new LoginRequestError("network", NETWORK_ERROR_MESSAGE);
  } finally {
    clearTimeout(timeout);
  }
}

export function createLoginApi(
  apiBaseUrl: string,
  fetcher: LoginFetcher = defaultFetcher,
): LoginApi {
  const endpoint = authEndpoint(apiBaseUrl);
  return {
    async signInWithEmail(input) {
      const { response, payload } = await requestLoginResponse(
        fetcher,
        `${endpoint}/sign-in/email`,
        {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ email: input.email, password: input.password }),
        },
      );
      if (!response.ok) throw classifyEmailFailure(response, payload);
      if (!hasAuthSession(payload)) {
        throw new LoginRequestError("unexpected-response", UNEXPECTED_RESPONSE_MESSAGE, {
          status: response.status,
        });
      }
    },
    async requestMagicLink(input) {
      const { response, payload } = await requestLoginResponse(
        fetcher,
        `${endpoint}/sign-in/magic-link`,
        {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ email: input.email, callbackURL: input.callbackURL }),
        },
      );
      if (!response.ok) throw classifyMagicLinkFailure(response, payload);
    },
    async getSession() {
      const { response, payload } = await requestLoginResponse(fetcher, `${endpoint}/get-session`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw classifyRequestFailure(
          response,
          payload,
          "authentication",
          AUTHENTICATION_ERROR_MESSAGE,
        );
      }
      const session = parseLoginSession(payload);
      if (session === null) {
        throw new LoginRequestError("unexpected-response", UNEXPECTED_RESPONSE_MESSAGE, {
          status: response.status,
        });
      }
      return session;
    },
    async signUpWithEmail(input) {
      const email = normalizedOrganizerEmail(input.email);
      if (email === null) {
        throw new LoginRequestError("organization-domain", ORGANIZER_DOMAIN_ERROR_MESSAGE);
      }
      const passwordError = signupPasswordError(input.password);
      if (passwordError !== null) {
        throw new LoginRequestError("invalid-password", passwordError);
      }

      const { response, payload } = await requestLoginResponse(
        fetcher,
        `${endpoint}/sign-up/email`,
        {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ name: input.name, email, password: input.password }),
        },
      );
      if (!response.ok) throw classifyEmailFailure(response, payload);
      // A server may issue a session directly on sign-up (local development
      // does); skip the verification interstitial in that case.
      return { verificationRequired: !hasAuthSession(payload) };
    },
  };
}
export function getLoginCallbackUrl(origin: string, returnTo?: string): string {
  return `${trimTrailingSlash(origin.trim())}${explicitSafeLoginReturnTo(returnTo) ?? ADMIN_PATH}`;
}

export async function signInAndRedirect(input: {
  readonly api: Pick<LoginApi, "signInWithEmail" | "getSession">;
  readonly email: string;
  readonly password: string;
  readonly navigate: (url: string) => void;
  readonly returnTo?: string;
}): Promise<void> {
  await input.api.signInWithEmail({ email: input.email, password: input.password });
  const session = await input.api.getSession();
  input.navigate(safeLoginLandingRoute(session, input.returnTo));
}

export function failureFromUnknown(
  error: unknown,
  fallbackKind: LoginErrorKind,
): LoginRequestError {
  if (error instanceof LoginRequestError) return error;
  if (error instanceof TypeError) return new LoginRequestError("network", NETWORK_ERROR_MESSAGE);
  if (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (error instanceof Error && error.name === "TimeoutError")
  ) {
    return loginTimeoutError();
  }
  return new LoginRequestError(fallbackKind, SERVER_ERROR_MESSAGE);
}
