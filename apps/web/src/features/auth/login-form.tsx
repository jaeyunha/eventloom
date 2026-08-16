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
import type { LoginErrorKind, LoginFetcher } from "./login-form-model";
import {
  createLoginApi,
  failureFromUnknown,
  getLoginCallbackUrl,
  normalizedOrganizerEmail,
  ORGANIZER_DOMAIN_ERROR_MESSAGE,
  resolveLoginConfig,
  resolveLoginLandingRoute,
  resolveLoginWorkspace,
  SIGNUP_PASSWORD_POLICY_MESSAGE,
  signInAndRedirect,
  signupPasswordError,
} from "./login-form-model";

const SIGNUP_VERIFICATION_MESSAGE = "Account created. Check your email for a verification link.";
const MAGIC_LINK_SUCCESS_MESSAGE = "Magic link sent. Check your email for a link to sign in.";

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
function defaultNavigate(url: string): void {
  window.location.assign(url);
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
  const api = useMemo(() => createLoginApi(config.apiBaseUrl, fetcher), [config, fetcher]);
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
    const passwordError = signupPasswordError(password);
    if (passwordError !== null) nextErrors.password = passwordError;
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
      if (requestError.kind === "invalid-password") {
        setFieldErrors({ password: requestError.message });
        passwordInput.current?.focus();
      } else {
        setError({ kind: requestError.kind, message: requestError.message });
      }
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
        <div className={styles.headerActions} data-account-entry="single">
          <p className={styles.headerContext}>One account, all your work</p>
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
              {isSignup ? "Create account" : isPortalLogin ? "Sign in to your portal" : "Sign in"}
            </CardTitle>
            <CardDescription>
              {isSignup
                ? "Use the email tied to your event work. Memberships and invitations determine what you can access."
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
                        aria-describedby={
                          fieldErrors.password
                            ? "login-password-error"
                            : isSignup
                              ? "login-password-requirements"
                              : undefined
                        }
                        onChange={(event) => {
                          setPassword(event.currentTarget.value);
                          if (fieldErrors.password || error) clearErrors();
                        }}
                      />
                      {fieldErrors.password ? (
                        <p className={styles.fieldError} id="login-password-error" role="alert">
                          {fieldErrors.password}
                        </p>
                      ) : isSignup ? (
                        <p className={styles.fieldHint} id="login-password-requirements">
                          {SIGNUP_PASSWORD_POLICY_MESSAGE}
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
                          ? "Create account"
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

            <p className={styles.cfpNote}>
              One sign-in opens every workspace available to this account.
            </p>
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
