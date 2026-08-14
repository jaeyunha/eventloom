import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";
import { LoginSessionGate } from "@/features/auth/login-session-gate";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to an authorized Eventloom workspace.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const requested = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  return (
    <LoginSessionGate {...(requested === undefined ? {} : { returnTo: requested })}>
      <LoginForm {...(requested === undefined ? {} : { returnTo: requested })} />
    </LoginSessionGate>
  );
}
