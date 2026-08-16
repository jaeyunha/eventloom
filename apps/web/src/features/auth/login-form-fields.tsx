"use client";

import Link from "next/link";
import type { FormEventHandler, ReactNode, RefObject } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import styles from "./login-form.module.css";
import { SIGNUP_PASSWORD_POLICY_MESSAGE } from "./login-form-model";

const SIGNUP_VERIFICATION_MESSAGE = "Account created. Check your email for a verification link.";
const MAGIC_LINK_SUCCESS_MESSAGE = "Magic link sent. Check your email for a link to sign in.";

type LoginFieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

type LoginError = Readonly<{
  message: string;
}>;

type LoginFormFieldsProps = Readonly<{
  isSignup: boolean;
  name: string;
  email: string;
  password: string;
  fieldErrors: LoginFieldErrors;
  error: LoginError | null;
  submitting: boolean;
  nameInput: RefObject<HTMLInputElement | null>;
  emailInput: RefObject<HTMLInputElement | null>;
  passwordInput: RefObject<HTMLInputElement | null>;
  errorSummary: RefObject<HTMLDivElement | null>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}>;

export function LoginPageShell({
  isPortalLogin,
  children,
}: Readonly<{ isPortalLogin: boolean; children: ReactNode }>) {
  return (
    <div className={styles.pageShell} data-login-workspace={isPortalLogin ? "portal" : "operator"}>
      <a className={styles.skipLink} href="#login-main">
        Skip to sign in
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Eventloom home">
          <span className={styles.brandMark} aria-hidden="true">
            EL
          </span>
          <span>
            <strong>Eventloom</strong>
            <small>Program operations</small>
          </span>
        </Link>
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
        {children}
      </main>

      <footer className={styles.footer}>
        <span>Eventloom</span>
        <span>Organizer, reviewer, applicant, and speaker access</span>
      </footer>
    </div>
  );
}
type LoginFormCardProps = Readonly<{
  mode: "sign-in" | "sign-up";
  isSignup: boolean;
  isPortalLogin: boolean;
  verificationRequired: boolean;
  name: string;
  email: string;
  password: string;
  fieldErrors: LoginFieldErrors;
  error: LoginError | null;
  submitting: boolean;
  magicLinkSent: boolean;
  nameInput: RefObject<HTMLInputElement | null>;
  emailInput: RefObject<HTMLInputElement | null>;
  passwordInput: RefObject<HTMLInputElement | null>;
  errorSummary: RefObject<HTMLDivElement | null>;
  onModeChange: (mode: "sign-in" | "sign-up") => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onMagicLinkSend: () => void;
}>;

export function LoginFormCard({
  mode,
  isSignup,
  isPortalLogin,
  verificationRequired,
  name,
  email,
  password,
  fieldErrors,
  error,
  submitting,
  magicLinkSent,
  nameInput,
  emailInput,
  passwordInput,
  errorSummary,
  onModeChange,
  onSubmit,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onMagicLinkSend,
}: LoginFormCardProps) {
  return (
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
            if (value === "sign-in" || value === "sign-up") onModeChange(value);
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
              <LoginVerificationNotice />
            ) : (
              <LoginFormFields
                isSignup={isSignup}
                name={name}
                email={email}
                password={password}
                fieldErrors={fieldErrors}
                error={error}
                submitting={submitting}
                nameInput={nameInput}
                emailInput={emailInput}
                passwordInput={passwordInput}
                errorSummary={errorSummary}
                onSubmit={onSubmit}
                onNameChange={onNameChange}
                onEmailChange={onEmailChange}
                onPasswordChange={onPasswordChange}
              />
            )}

            {!isSignup ? (
              <LoginMagicLink
                submitting={submitting}
                magicLinkSent={magicLinkSent}
                onSend={onMagicLinkSend}
              />
            ) : null}
          </TabsContent>
        </Tabs>

        <p className={styles.cfpNote}>
          One sign-in opens every workspace available to this account.
        </p>
      </CardContent>
    </Card>
  );
}
function LoginFormFields({
  isSignup,
  name,
  email,
  password,
  fieldErrors,
  error,
  submitting,
  nameInput,
  emailInput,
  passwordInput,
  errorSummary,
  onSubmit,
  onNameChange,
  onEmailChange,
  onPasswordChange,
}: LoginFormFieldsProps) {
  return (
    <form className={styles.form} method="post" onSubmit={onSubmit} noValidate>
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
            onChange={(event) => onNameChange(event.currentTarget.value)}
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
          onChange={(event) => onEmailChange(event.currentTarget.value)}
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
          onChange={(event) => onPasswordChange(event.currentTarget.value)}
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
            <AlertTitle>{isSignup ? "Account creation failed" : "Sign-in failed"}</AlertTitle>
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
  );
}

function LoginVerificationNotice() {
  return (
    <Alert className={styles.notice} role="status" aria-live="polite">
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription>{SIGNUP_VERIFICATION_MESSAGE}</AlertDescription>
    </Alert>
  );
}

function LoginMagicLink({
  submitting,
  magicLinkSent,
  onSend,
}: Readonly<{
  submitting: boolean;
  magicLinkSent: boolean;
  onSend: () => void;
}>) {
  return (
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
        onClick={onSend}
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
  );
}
