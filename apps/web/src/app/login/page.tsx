import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to an authorized Open Sessionboard workspace.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const requested = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  return <LoginForm {...(requested === undefined ? {} : { returnTo: requested })} />;
}
