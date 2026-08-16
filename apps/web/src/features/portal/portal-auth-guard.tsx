"use client";

import { type ReactNode, useEffect, useState } from "react";
import { sessionHasAuthenticatedUser } from "../auth/session";
import styles from "./portal.module.css";

export function PortalAuthGuard({ children }: Readonly<{ children: ReactNode }>) {
  const [authentication, setAuthentication] = useState<"checking" | "authenticated">("checking");

  useEffect(() => {
    const controller = new AbortController();
    const redirectToLogin = () => {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(returnTo)}`);
    };
    void fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (!response.ok) {
          redirectToLogin();
          return;
        }
        const session = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!sessionHasAuthenticatedUser(session)) {
          redirectToLogin();
          return;
        }
        setAuthentication("authenticated");
      })
      .catch(() => {
        if (!controller.signal.aborted) redirectToLogin();
      });
    return () => controller.abort();
  }, []);

  if (authentication === "checking") {
    return (
      <main className={styles.portalRoot} aria-busy="true" aria-live="polite">
        <div className={styles.statePanel}>Checking account access…</div>
      </main>
    );
  }

  return children;
}
