import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import styles from "@/features/portal/portal.module.css";
import { PortalAuthGuard } from "@/features/portal/portal-auth-guard";
import { PortalProvider } from "@/features/portal/portal-provider";
import { PortalFrame } from "@/features/portal/portal-shell";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Participant workspace",
  description: "Track event proposals, submission decisions, and accepted-speaker preparation.",
};

export default function SpeakerPortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense
      fallback={
        <div className={styles.portalRoot}>
          <div className={styles.statePanel} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <h1>Opening your participant workspace</h1>
          </div>
        </div>
      }
    >
      <PortalAuthGuard>
        <PortalProvider>
          <PortalFrame>{children}</PortalFrame>
        </PortalProvider>
      </PortalAuthGuard>
    </Suspense>
  );
}
