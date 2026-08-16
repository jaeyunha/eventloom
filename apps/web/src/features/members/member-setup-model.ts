import { type LoginApi, resolveLoginLandingRoute } from "@/features/auth/login-form-model";
import { type MemberApi, MemberApiError } from "./api";

export const MEMBER_SETUP_PASSWORD_POLICY_MESSAGE =
  "Use 8–128 characters with uppercase, lowercase, a number, and a special character.";

export function memberSetupPasswordIssues(
  password: string,
  confirmation: string,
): readonly string[] {
  const issues: string[] = [];
  if (password.length < 8 || password.length > 128)
    issues.push(MEMBER_SETUP_PASSWORD_POLICY_MESSAGE);
  if (!/[A-Z]/u.test(password)) issues.push("Add an uppercase letter.");
  if (!/[a-z]/u.test(password)) issues.push("Add a lowercase letter.");
  if (!/[0-9]/u.test(password)) issues.push("Add a number.");
  if (!/[^A-Za-z0-9]/u.test(password)) issues.push("Add a special character.");
  if (confirmation !== password) issues.push("Password confirmation must match.");
  return [...new Set(issues)];
}

export class MemberSetupActivatedSignInRequiredError extends Error {
  readonly code = "activated-sign-in-required" as const;
  readonly email: string;

  constructor(email: string) {
    super("Your invitation was activated. Sign in to continue.");
    this.name = "MemberSetupActivatedSignInRequiredError";
    this.email = email;
  }
}

export function setupUrlWithoutToken(value: string): string {
  const url = new URL(value, "https://member-setup.invalid");
  url.searchParams.delete("token");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function clearMemberSetupTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  const current = window.location.href;
  const next = setupUrlWithoutToken(current);
  const visible = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== visible) {
    window.history.replaceState(window.history.state, "", next);
  }
}

export async function completeMemberSetup(input: {
  readonly memberApi: Pick<MemberApi, "activateMember">;
  readonly loginApi: Pick<LoginApi, "signInWithEmail" | "getSession">;
  readonly token: string;
  readonly name?: string;
  readonly password: string;
}): Promise<string> {
  const activated = await input.memberApi.activateMember({
    token: input.token,
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    password: input.password,
  });
  try {
    await input.loginApi.signInWithEmail({
      email: activated.member.email,
      password: input.password,
    });
    return resolveLoginLandingRoute(await input.loginApi.getSession());
  } catch {
    throw new MemberSetupActivatedSignInRequiredError(activated.member.email);
  }
}

export function setupError(error: unknown): string {
  if (error instanceof MemberApiError) {
    if (error.code === "INVITATION_INVALID" || error.status === 400) {
      return "This invitation link is invalid or has already been used.";
    }
    if (error.code === "INVITATION_EXPIRED" || error.status === 409) {
      return "This invitation link has expired. Ask an organization owner for a new invitation.";
    }
  }
  return "Member setup could not be completed. Try again.";
}
