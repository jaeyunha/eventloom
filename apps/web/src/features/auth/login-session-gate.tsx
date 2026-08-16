"use client";

import { type ReactNode, useEffect, useState } from "react";
import { loadAuthenticatedLoginDestination } from "./login-session-loader";
import styles from "./login-form.module.css";

export function LoginSessionGate({
  children,
  returnTo,
}: Readonly<{ children: ReactNode; returnTo?: string | undefined }>) {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void loadAuthenticatedLoginDestination({ returnTo, signal: controller.signal })
      .then((destination) => {
        if (destination !== null) {
          window.location.replace(destination);
          return;
        }
        setChecking(false);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setChecking(false);
        }
      });
    return () => controller.abort();
  }, [returnTo]);

  if (!checking) return children;

  return (
    <div className={styles.pageShell} data-login-session-gate="checking">
      <main className={styles.main} aria-busy="true">
        <section className={styles.intro}>
          <p className={styles.kicker}>Account access</p>
          <h1>Checking your workspace</h1>
        </section>
      </main>
    </div>
  );
}
