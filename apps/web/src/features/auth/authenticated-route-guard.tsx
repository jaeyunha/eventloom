"use client";

import { type ReactNode, useEffect, useState } from "react";
import { sessionHasAuthenticatedUser } from "./session";

type AuthenticationState = "checking" | "authenticated" | "denied";

export function AuthenticatedRouteGuard({ children }: Readonly<{ children: ReactNode }>) {
  const [authentication, setAuthentication] = useState<AuthenticationState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    const redirectToLogin = () => {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(returnTo)}`);
    };

    void fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          redirectToLogin();
          setAuthentication("denied");
          return;
        }
        const session: unknown = await response.json();
        if (!sessionHasAuthenticatedUser(session)) {
          redirectToLogin();
          setAuthentication("denied");
          return;
        }
        setAuthentication("authenticated");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        redirectToLogin();
        setAuthentication("denied");
      });

    return () => controller.abort();
  }, []);

  if (authentication !== "authenticated") {
    return <span aria-hidden="true" data-authenticated-route-state={authentication} hidden />;
  }

  return children;
}
