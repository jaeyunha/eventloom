"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LoginFormCard, LoginPageShell } from "./login-form-fields";
import type { LoginErrorKind, LoginFetcher } from "./login-form-model";
import {
  createLoginApi,
  failureFromUnknown,
  getLoginCallbackUrl,
  normalizedOrganizerEmail,
  ORGANIZER_DOMAIN_ERROR_MESSAGE,
  resolveLoginConfig,
  resolveLoginWorkspace,
  safeLoginLandingRoute,
  signInAndRedirect,
  signupPasswordError,
} from "./login-form-model";

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
  const submissionGenerationRef = useRef(0);

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
    const submissionGeneration = ++submissionGenerationRef.current;
    setSubmitting(true);
    try {
      const signup = await api.signUpWithEmail(credentials);
      setPassword("");
      if (signup.verificationRequired) {
        setVerificationRequired(true);
      } else {
        const session = await api.getSession();
        redirect(safeLoginLandingRoute(session, returnTo));
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
    } finally {
      if (submissionGeneration === submissionGenerationRef.current) setSubmitting(false);
    }
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const credentials = validateCredentials();
    if (credentials === null) return;

    clearErrors();
    const submissionGeneration = ++submissionGenerationRef.current;
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
      return;
    } finally {
      if (submissionGeneration === submissionGenerationRef.current) setSubmitting(false);
    }
  }

  async function submitMagicLink(): Promise<void> {
    const normalizedEmail = validateMagicLinkEmail();
    if (normalizedEmail === null) return;

    clearErrors();
    const submissionGeneration = ++submissionGenerationRef.current;
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
      return;
    } finally {
      if (submissionGeneration === submissionGenerationRef.current) setSubmitting(false);
    }
  }
  const isSignup = mode === "sign-up";
  const isPortalLogin = resolveLoginWorkspace(returnTo) === "portal";

  return (
    <LoginPageShell isPortalLogin={isPortalLogin}>
      <LoginFormCard
        mode={mode}
        isSignup={isSignup}
        isPortalLogin={isPortalLogin}
        verificationRequired={verificationRequired}
        name={name}
        email={email}
        password={password}
        fieldErrors={fieldErrors}
        error={error}
        submitting={submitting}
        magicLinkSent={magicLinkSent}
        nameInput={nameInput}
        emailInput={emailInput}
        passwordInput={passwordInput}
        errorSummary={errorSummary}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          clearErrors();
        }}
        onSubmit={(event) =>
          void (isSignup ? submitOrganizerSignup(event) : submitCredentials(event))
        }
        onNameChange={(value) => {
          setName(value);
          if (fieldErrors.name || error) clearErrors();
        }}
        onEmailChange={(value) => {
          setEmail(value);
          if (fieldErrors.email || error || magicLinkSent) clearErrors();
        }}
        onPasswordChange={(value) => {
          setPassword(value);
          if (fieldErrors.password || error) clearErrors();
        }}
        onMagicLinkSend={() => void submitMagicLink()}
      />
    </LoginPageShell>
  );
}
