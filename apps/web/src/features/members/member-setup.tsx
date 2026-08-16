"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import { createLoginApi, type LoginApi } from "@/features/auth/login-form-model";
import { createMemberApi, type MemberApi } from "./api";
import {
  clearMemberSetupTokenFromUrl,
  completeMemberSetup,
  MemberSetupActivatedSignInRequiredError,
  memberSetupPasswordIssues,
  PASSWORD_REQUIREMENTS,
  setupError,
} from "./member-setup-model";

const shellStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "2rem",
  background: "#f5f7fb",
} as const;
const cardStyle = {
  width: "min(100%, 34rem)",
  display: "grid",
  gap: "1rem",
  padding: "2rem",
  border: "1px solid #d8deea",
  borderRadius: "1rem",
  background: "white",
  boxShadow: "0 1rem 3rem rgba(31, 43, 68, 0.08)",
} as const;
const fieldStyle = { display: "grid", gap: "0.4rem", fontWeight: 600 } as const;
const inputStyle = {
  minHeight: "2.75rem",
  padding: "0.65rem 0.75rem",
  border: "1px solid #aeb8ca",
  borderRadius: "0.55rem",
  font: "inherit",
} as const;

export interface MemberSetupProps {
  readonly organizationId: string;
  readonly token: string | null;
  readonly apiBaseUrl?: string;
  readonly memberApi?: Pick<MemberApi, "activateMember">;
  readonly loginApi?: Pick<LoginApi, "signInWithEmail" | "getSession">;
  readonly navigate?: (path: string) => void;
}

export function MemberSetup({
  organizationId,
  token,
  apiBaseUrl,
  memberApi: providedMemberApi,
  loginApi: providedLoginApi,
  navigate,
}: MemberSetupProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupState, setSetupState] = useState<"ready" | "activated-sign-in-required">("ready");
  const [activatedEmail, setActivatedEmail] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const setupTokenRef = useRef(token?.trim() ?? "");
  const configured = useMemo(() => {
    if (providedMemberApi && providedLoginApi) {
      return { memberApi: providedMemberApi, loginApi: providedLoginApi };
    }
    const baseUrl = apiBaseUrl?.trim().replace(/\/+$/u, "") ?? "";
    try {
      return {
        memberApi: createMemberApi(baseUrl, organizationId),
        loginApi: createLoginApi(baseUrl),
      };
    } catch {
      return null;
    }
  }, [apiBaseUrl, organizationId, providedLoginApi, providedMemberApi]);
  const setupToken = setupTokenRef.current;

  if (setupState === "activated-sign-in-required" && activatedEmail !== null) {
    return (
      <main style={shellStyle}>
        <section style={cardStyle} aria-labelledby="member-setup-title">
          <h1 id="member-setup-title">Invitation activated</h1>
          <p>
            Your invitation was activated for <strong>{activatedEmail}</strong>, but automatic
            sign-in could not be completed.
          </p>
          <a href="/login">Sign in to continue</a>
        </section>
      </main>
    );
  }

  if (!setupToken) {
    return (
      <main style={shellStyle}>
        <section style={cardStyle} aria-labelledby="member-setup-title">
          <h1 id="member-setup-title">Invitation link required</h1>
          <p>
            This member setup link is missing its one-time token. Ask the organization owner for a
            new invitation.
          </p>
        </section>
      </main>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const issues = memberSetupPasswordIssues(password, confirmation);
    if (issues.length > 0) {
      setError(issues.join(" "));
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    if (configured === null) {
      setError("Member setup is unavailable because the API client could not be initialized.");
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    clearMemberSetupTokenFromUrl();
    setBusy(true);
    setError(null);
    try {
      const destination = await completeMemberSetup({
        memberApi: configured.memberApi,
        loginApi: configured.loginApi,
        token: setupToken,
        name,
        password,
      });
      (navigate ?? ((path) => window.location.assign(path)))(destination);
    } catch (reason) {
      if (reason instanceof MemberSetupActivatedSignInRequiredError) {
        setActivatedEmail(reason.email);
        setSetupState("activated-sign-in-required");
        setError(null);
      } else {
        setError(setupError(reason));
        queueMicrotask(() => errorRef.current?.focus());
      }
      setBusy(false);
    }
  }

  return (
    <main style={shellStyle}>
      <section style={cardStyle} aria-labelledby="member-setup-title">
        <div>
          <p style={{ margin: 0, color: "#53617a", fontWeight: 700 }}>Eventloom</p>
          <h1 id="member-setup-title">Set up organization access</h1>
          <p>
            Choose a password to accept your invitation. Evaluators are routed to My Evaluations
            after sign-in.
          </p>
        </div>
        {error ? (
          <div ref={errorRef} tabIndex={-1} role="alert" style={{ color: "#9f1d2f" }}>
            {error}
          </div>
        ) : null}
        <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: "1rem" }}>
          <label style={fieldStyle}>
            Display name
            <input
              style={inputStyle}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              maxLength={200}
              autoComplete="name"
            />
          </label>
          <label style={fieldStyle}>
            Password
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
              aria-describedby="member-password-help"
            />
          </label>
          <p id="member-password-help" style={{ margin: 0, color: "#53617a" }}>
            {PASSWORD_REQUIREMENTS}
          </p>
          <label style={fieldStyle}>
            Confirm password
            <input
              style={inputStyle}
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            style={{
              minHeight: "2.9rem",
              border: 0,
              borderRadius: "0.6rem",
              background: "#145ee8",
              color: "white",
              font: "inherit",
              fontWeight: 700,
            }}
          >
            {busy ? "Setting up access…" : "Accept invitation and sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
