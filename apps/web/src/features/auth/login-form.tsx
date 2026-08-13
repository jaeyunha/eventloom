"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import styles from "./login-form.module.css";
import { safeLoginReturnTo } from "./return-path";
import { normalizeSessionSpeakerGrants } from "./session";

const AUTH_PATH = "/api/auth";
const ADMIN_PATH = "/admin";
const INVALID_CREDENTIALS_MESSAGE = "The email or password is incorrect.";
const UNVERIFIED_EMAIL_MESSAGE =
  "Your email is not verified yet. Check your inbox for a verification link.";
const SERVER_ERROR_MESSAGE = "We couldn't sign you in right now. Try again in a moment.";
const MAGIC_LINK_ERROR_MESSAGE =
  "We couldn't send a sign-in link right now. Try again in a moment.";
const ORGANIZER_DOMAIN_ERROR_MESSAGE = "Enter a valid email address.";
const SIGNUP_VERIFICATION_MESSAGE = "Account created. Check your email for a verification link.";
const MAGIC_LINK_SUCCESS_MESSAGE = "Magic link sent. Check your email for a link to sign in.";
const NETWORK_ERROR_MESSAGE =
  "We couldn't reach the sign-in service. Check your connection and try again.";
const REVIEW_PATH = "/review";
const PORTAL_PATH = "/portal";
const PORTAL_LOGIN_PATH = "/login?next=%2Fportal";
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
  | "authentication";

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

export interface LoginFormProps {
  /** A test/injection seam; production uses the same-origin browser gateway. */
  readonly apiBaseUrl?: string;
  /** A test seam; production uses the browser fetch implementation. */
  readonly fetcher?: LoginFetcher;
  /** A test seam; production navigates the current browser window. */
  readonly navigate?: (url: string) => void;
  /** A test seam; production defaults to sign-in mode. */
  readonly initialMode?: "sign-in" | "sign-up";
  /** Internal destination used after a successful sign-in. */
  readonly returnTo?: string;
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

export function resolveLoginLandingRoute(value: unknown, returnTo?: unknown): string {
  const session = normalizeLoginSession(value);
  if (session === null) {
    throw new LoginRequestError("authentication", AUTHENTICATION_ERROR_MESSAGE);
  }

  const explicit = explicitSafeLoginReturnTo(returnTo);
  if (explicit !== undefined) return explicit;

  if (session.memberships.some(({ role }) => role === "owner" || role === "admin")) {
    return ADMIN_PATH;
  }
  if (session.memberships.some(({ role }) => role === "reviewer")) {
    return REVIEW_PATH;
  }
  if (session.memberships.length === 0) {
    return PORTAL_PATH;
  }
  throw new LoginRequestError("authentication", AUTHENTICATION_ERROR_MESSAGE);
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
function normalizedOrganizerEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at !== normalized.indexOf("@") || at === normalized.length - 1) return null;
  return normalized;
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

function classifyEmailFailure(response: Response, payload: unknown): LoginRequestError {
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

  return new LoginRequestError("server", SERVER_ERROR_MESSAGE, {
    status: response.status,
    code: fields.code,
  });
}
function classifyMagicLinkFailure(response: Response, payload: unknown): LoginRequestError {
  const fields = responseFields(payload);
  return new LoginRequestError("server", MAGIC_LINK_ERROR_MESSAGE, {
    status: response.status,
    code: fields.code,
  });
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

export function createLoginApi(
  apiBaseUrl: string,
  fetcher: LoginFetcher = defaultFetcher,
): LoginApi {
  const endpoint = authEndpoint(apiBaseUrl);
  return {
    async signInWithEmail(input) {
      let response: Response;
      try {
        response = await fetcher(`${endpoint}/sign-in/email`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ email: input.email, password: input.password }),
        });
      } catch {
        throw new LoginRequestError("network", NETWORK_ERROR_MESSAGE);
      }

      const payload = await responseBody(response);
      if (!response.ok) throw classifyEmailFailure(response, payload);
      if (!hasAuthSession(payload)) {
        throw new LoginRequestError("authentication", AUTHENTICATION_ERROR_MESSAGE, {
          status: response.status,
        });
      }
    },
    async requestMagicLink(input) {
      let response: Response;
      try {
        response = await fetcher(`${endpoint}/sign-in/magic-link`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ email: input.email, callbackURL: input.callbackURL }),
        });
      } catch {
        throw new LoginRequestError("network", NETWORK_ERROR_MESSAGE);
      }

      const payload = await responseBody(response);
      if (!response.ok) throw classifyMagicLinkFailure(response, payload);
    },
    async getSession() {
      let response: Response;
      try {
        response = await fetcher(`${endpoint}/get-session`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
      } catch {
        throw new LoginRequestError("network", NETWORK_ERROR_MESSAGE);
      }

      const payload = await responseBody(response);
      if (!response.ok) {
        throw new LoginRequestError("authentication", AUTHENTICATION_ERROR_MESSAGE, {
          status: response.status,
          code: responseFields(payload).code,
        });
      }
      const session = parseLoginSession(payload);
      if (session === null) {
        throw new LoginRequestError("authentication", AUTHENTICATION_ERROR_MESSAGE, {
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

      let response: Response;
      try {
        response = await fetcher(`${endpoint}/sign-up/email`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ name: input.name, email, password: input.password }),
        });
      } catch {
        throw new LoginRequestError("network", NETWORK_ERROR_MESSAGE);
      }

      const payload = await responseBody(response);
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
  input.navigate(resolveLoginLandingRoute(session, input.returnTo));
}
function defaultNavigate(url: string): void {
  window.location.assign(url);
}

function failureFromUnknown(error: unknown, fallbackKind: LoginErrorKind): LoginRequestError {
  if (error instanceof LoginRequestError) return error;
  if (error instanceof TypeError) return new LoginRequestError("network", NETWORK_ERROR_MESSAGE);
  return new LoginRequestError(fallbackKind, SERVER_ERROR_MESSAGE);
}

export function LoginForm({
  apiBaseUrl,
  fetcher,
  navigate,
  initialMode,
  returnTo,
}: LoginFormProps) {
  const config = useMemo(
    () => (apiBaseUrl === undefined ? resolveLoginConfig() : resolveLoginConfig({ apiBaseUrl })),
    [apiBaseUrl],
  );
  const api = useMemo(
    () => createLoginApi(config.apiBaseUrl, fetcher ?? defaultFetcher),
    [config, fetcher],
  );
  const redirect = navigate ?? defaultNavigate;
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode ?? "sign-in");
  const [name, setName] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<{ kind: LoginErrorKind; message: string } | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (error !== null) errorSummary.current?.focus();
  }, [error]);

  function clearErrors(): void {
    setFieldErrors({});
    setError(null);
    setVerificationRequired(false);
    setMagicLinkSent(false);
  }

  function validateCredentials(): { email: string; password: string } | null {
    const normalizedEmail = email.trim().toLowerCase();
    const nextErrors: { email?: string; password?: string } = {};
    if (!normalizedEmail) {
      nextErrors.email = "Enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) nextErrors.password = "Enter your password.";
    if (nextErrors.email || nextErrors.password) {
      setFieldErrors(nextErrors);
      setError(null);
      if (nextErrors.email) emailInput.current?.focus();
      else passwordInput.current?.focus();
      return null;
    }
    return { email: normalizedEmail, password };
  }

  function validateMagicLinkEmail(): string | null {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setFieldErrors({ email: "Enter your email address." });
      setError(null);
      setMagicLinkSent(false);
      emailInput.current?.focus();
      return null;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)) {
      setFieldErrors({ email: "Enter a valid email address." });
      setError(null);
      setMagicLinkSent(false);
      emailInput.current?.focus();
      return null;
    }
    return normalizedEmail;
  }
  function validateOrganizerSignup(): { name: string; email: string; password: string } | null {
    const normalizedEmail = normalizedOrganizerEmail(email);
    const nextErrors: { name?: string; email?: string; password?: string } = {};
    if (!name.trim()) nextErrors.name = "Enter your name.";
    if (!normalizedEmail) nextErrors.email = ORGANIZER_DOMAIN_ERROR_MESSAGE;
    if (!password) nextErrors.password = "Enter a password.";
    if (nextErrors.name || nextErrors.email || nextErrors.password) {
      setFieldErrors(nextErrors);
      setError(null);
      if (nextErrors.name) nameInput.current?.focus();
      else if (nextErrors.email) emailInput.current?.focus();
      else passwordInput.current?.focus();
      return null;
    }
    if (normalizedEmail === null) return null;
    return { name: name.trim(), email: normalizedEmail, password };
  }

  async function submitOrganizerSignup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const credentials = validateOrganizerSignup();
    if (credentials === null) return;

    clearErrors();
    setSubmitting(true);
    try {
      const signup = await api.signUpWithEmail(credentials);
      setPassword("");
      if (signup.verificationRequired) {
        setVerificationRequired(true);
      } else {
        const session = await api.getSession();
        redirect(resolveLoginLandingRoute(session, returnTo));
        return;
      }
    } catch (failure) {
      const requestError = failureFromUnknown(failure, "server");
      setError({ kind: requestError.kind, message: requestError.message });
    }
    setSubmitting(false);
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const credentials = validateCredentials();
    if (credentials === null) return;

    clearErrors();
    setSubmitting(true);
    try {
      await signInAndRedirect({
        api,
        ...credentials,
        navigate: redirect,
        ...(returnTo === undefined ? {} : { returnTo }),
      });
    } catch (failure) {
      const requestError = failureFromUnknown(failure, "server");
      setError({ kind: requestError.kind, message: requestError.message });
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  async function submitMagicLink(): Promise<void> {
    const normalizedEmail = validateMagicLinkEmail();
    if (normalizedEmail === null) return;

    clearErrors();
    setSubmitting(true);
    try {
      await api.requestMagicLink({
        email: normalizedEmail,
        callbackURL: getLoginCallbackUrl(window.location.origin, returnTo),
      });
      setMagicLinkSent(true);
    } catch (failure) {
      const requestError = failureFromUnknown(failure, "server");
      setError({ kind: requestError.kind, message: requestError.message });
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }
  const isSignup = mode === "sign-up";
  const isPortalLogin = resolveLoginWorkspace(returnTo) === "portal";

  return (
    <div className={styles.pageShell} data-login-workspace={isPortalLogin ? "portal" : "operator"}>
      <a className={styles.skipLink} href="#login-main">
        Skip to sign in
      </a>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Eventloom home">
          <span className={styles.brandMark} aria-hidden="true">
            EL
          </span>
          <span>
            <strong>Eventloom</strong>
            <small>Program operations</small>
          </span>
        </a>
        <div className={styles.headerActions}>
          <nav className={styles.workspaceSwitcher} aria-label="Sign-in workspace">
            <a href="/login" aria-current={!isPortalLogin ? "page" : undefined}>
              Organizer
            </a>
            <a href={PORTAL_LOGIN_PATH} aria-current={isPortalLogin ? "page" : undefined}>
              Applicant / speaker
            </a>
          </nav>
          <p className={styles.headerContext}>One account, separate workspaces</p>
        </div>
      </header>

      <main className={styles.main} id="login-main" tabIndex={-1}>
        <section className={styles.intro} aria-labelledby="login-title">
          <p className={styles.kicker}>{isPortalLogin ? "Speaker access" : "Operator access"}</p>
          <h1 id="login-title">
            {isPortalLogin ? "Applicant and speaker sign in" : "Sign in to Eventloom"}
          </h1>
          <p>
            {isPortalLogin
              ? "Track your proposals and finish accepted-event speaker tasks."
              : "Sign in once, then enter the workspace your event role allows."}
          </p>
          <ul className={styles.accessList} aria-label="Workspace access">
            {isPortalLogin ? (
              <>
                <li>
                  <strong>My proposals</strong>
                  <span>Review submitted sessions and their current status.</span>
                </li>
                <li>
                  <strong>Speaker profile</strong>
                  <span>Keep your biography and public details current.</span>
                </li>
                <li>
                  <strong>Event tasks</strong>
                  <span>Complete forms, files, and accepted-speaker requests.</span>
                </li>
              </>
            ) : (
              <>
                <li>
                  <strong>Organizers</strong>
                  <span>Manage events, CFPs, and review operations.</span>
                </li>
                <li>
                  <strong>Reviewers</strong>
                  <span>Access assigned review work and decisions.</span>
                </li>
                <li>
                  <strong>Applicants and speakers</strong>
                  <span>Track proposals and open accepted-event speaker tools.</span>
                </li>
              </>
            )}
          </ul>
        </section>

        <Card className={styles.card} aria-labelledby="login-form-title">
          <CardHeader className={styles.cardHeader}>
            <CardTitle id="login-form-title">
              {isSignup
                ? "Create organizer account"
                : isPortalLogin
                  ? "Sign in to your portal"
                  : "Sign in"}
            </CardTitle>
            <CardDescription>
              {isSignup
                ? "Use your work email. Organization access is granted by an owner or administrator."
                : isPortalLogin
                  ? "Use the same email address you used for your proposal."
                  : "Your memberships and speaker access determine where you land."}
            </CardDescription>
          </CardHeader>

          <CardContent className={styles.cardContent}>
            <Tabs
              value={mode}
              onValueChange={(value) => {
                if (value === "sign-in" || value === "sign-up") {
                  setMode(value);
                  clearErrors();
                }
              }}
            >
              {!isPortalLogin ? (
                <TabsList className={styles.tabsList} aria-label="Account access mode">
                  <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                  <TabsTrigger value="sign-up">Create account</TabsTrigger>
                </TabsList>
              ) : null}

              <TabsContent value={mode} className={styles.tabPanel}>
                {verificationRequired ? (
                  <Alert className={styles.notice} role="status" aria-live="polite">
                    <AlertTitle>Verify your email</AlertTitle>
                    <AlertDescription>{SIGNUP_VERIFICATION_MESSAGE}</AlertDescription>
                  </Alert>
                ) : (
                  <form
                    className={styles.form}
                    method="post"
                    onSubmit={(event) =>
                      void (isSignup ? submitOrganizerSignup(event) : submitCredentials(event))
                    }
                    noValidate
                  >
                    {isSignup ? (
                      <div className={styles.field}>
                        <Label htmlFor="login-name">Name</Label>
                        <Input
                          ref={nameInput}
                          id="login-name"
                          name="name"
                          type="text"
                          value={name}
                          autoComplete="name"
                          required
                          aria-invalid={fieldErrors.name ? true : undefined}
                          aria-describedby={fieldErrors.name ? "login-name-error" : undefined}
                          onChange={(event) => {
                            setName(event.currentTarget.value);
                            if (fieldErrors.name || error) clearErrors();
                          }}
                        />
                        {fieldErrors.name ? (
                          <p className={styles.fieldError} id="login-name-error" role="alert">
                            {fieldErrors.name}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className={styles.field}>
                      <Label htmlFor="login-email">Email address</Label>
                      <Input
                        ref={emailInput}
                        id="login-email"
                        name="email"
                        type="email"
                        value={email}
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        aria-invalid={fieldErrors.email ? true : undefined}
                        aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                        onChange={(event) => {
                          setEmail(event.currentTarget.value);
                          if (fieldErrors.email || error || magicLinkSent) clearErrors();
                        }}
                      />
                      {fieldErrors.email ? (
                        <p className={styles.fieldError} id="login-email-error" role="alert">
                          {fieldErrors.email}
                        </p>
                      ) : null}
                    </div>

                    <div className={styles.field}>
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        ref={passwordInput}
                        id="login-password"
                        name="password"
                        type="password"
                        value={password}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                        required
                        aria-invalid={fieldErrors.password ? true : undefined}
                        aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                        onChange={(event) => {
                          setPassword(event.currentTarget.value);
                          if (fieldErrors.password || error) clearErrors();
                        }}
                      />
                      {fieldErrors.password ? (
                        <p className={styles.fieldError} id="login-password-error" role="alert">
                          {fieldErrors.password}
                        </p>
                      ) : null}
                    </div>

                    {error ? (
                      <div
                        className={styles.alert}
                        id="login-error"
                        role="alert"
                        aria-live="assertive"
                        tabIndex={-1}
                        ref={errorSummary}
                      >
                        <Alert variant="destructive" role="presentation">
                          <AlertTitle>
                            {isSignup ? "Account creation failed" : "Sign-in failed"}
                          </AlertTitle>
                          <AlertDescription>{error.message}</AlertDescription>
                        </Alert>
                      </div>
                    ) : null}

                    <Button
                      className="w-full"
                      type="submit"
                      disabled={submitting}
                      aria-busy={submitting}
                      size="lg"
                    >
                      {submitting
                        ? isSignup
                          ? "Creating account…"
                          : "Signing in…"
                        : isSignup
                          ? "Create organizer account"
                          : isPortalLogin
                            ? "Sign in to portal"
                            : "Sign in to workspace"}
                    </Button>
                  </form>
                )}

                {!isSignup ? (
                  <>
                    <div className={styles.magicDivider}>
                      <Separator decorative={false} />
                      <span>or</span>
                      <Separator decorative={false} />
                    </div>

                    <Button
                      className="w-full"
                      type="button"
                      variant="outline"
                      onClick={() => void submitMagicLink()}
                      disabled={submitting}
                      aria-busy={submitting}
                      size="lg"
                    >
                      {submitting ? "Sending magic link…" : "Email me a magic link"}
                    </Button>

                    {magicLinkSent ? (
                      <p className={styles.success} role="status" aria-live="polite">
                        {MAGIC_LINK_SUCCESS_MESSAGE}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </TabsContent>
            </Tabs>

            {!isPortalLogin ? (
              <p className={styles.cfpNote}>
                Submitted a proposal or speaking at an event?{" "}
                <a href={PORTAL_LOGIN_PATH}>Sign in to the applicant and speaker portal</a>.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </main>

      <footer className={styles.footer}>
        <span>Eventloom</span>
        <span>Organizer, reviewer, applicant, and speaker access</span>
      </footer>
    </div>
  );
}
