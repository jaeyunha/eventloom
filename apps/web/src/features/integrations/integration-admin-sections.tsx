"use client";

import type { ApiScope, WebhookEventType } from "@eventloom/contracts";
import Link from "next/link";
import { SettingsShell } from "@/components/workspace/settings-ui";
import {
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
} from "@/components/workspace/workspace-ui";
import { workspaceClassNames } from "@/components/workspace/workspace-ui-model";
import { Button } from "../../components/ui/button";
import {
  ApiKeysSection,
  DeliverySection,
  OneTimeSecretPanel,
  OverviewSection,
  WebhooksSection,
} from "./integration-sections";
import styles from "./integrations.module.css";
import type { IntegrationAdminSnapshot, OneTimeSecret } from "./types";

type SupportedSection = "overview" | "api-keys" | "webhooks" | "delivery";

type IntegrationTab = Readonly<{
  section: SupportedSection;
  label: string;
  href: string;
}>;

interface IntegrationAdminActions {
  readonly busy: boolean;
  saveCredential(provider: "opensend", secret: string): Promise<boolean>;
  createApiKey(input: {
    label: string;
    scopes: readonly ApiScope[];
    expiresAt: string | null;
  }): Promise<boolean>;
  revokeApiKey(apiKeyId: string): Promise<boolean>;
  createWebhook(input: {
    endpointUrl: string;
    events: readonly WebhookEventType[];
  }): Promise<boolean>;
  setWebhookActive(subscriptionId: string, active: boolean): Promise<boolean>;
  rotateWebhookSecret(subscriptionId: string): Promise<boolean>;
  deleteWebhook(subscriptionId: string): Promise<boolean>;
  retryCalendarDelivery(deliveryId: string): Promise<boolean>;
}
export function IntegrationAdminSections({
  eventName,
  eventId,
  organizationId,
  title,
  description,
  tabs,
  section,
  basePath,
  snapshot,
  loading,
  loadError,
  notice,
  mutationError,
  oneTimeSecret,
  actions,
  onRetry,
  onDismissError,
  onDismissSecret,
}: Readonly<{
  eventName: string;
  eventId: string;
  organizationId: string;
  title: string;
  description: string;
  tabs: readonly IntegrationTab[];
  section: SupportedSection;
  basePath: string;
  snapshot: IntegrationAdminSnapshot | null;
  loading: boolean;
  loadError: string | null;
  notice: string | null;
  mutationError: string | null;
  oneTimeSecret: { readonly value: OneTimeSecret; readonly label: string } | null;
  actions: IntegrationAdminActions;
  onRetry(): void;
  onDismissError(): void;
  onDismissSecret(): void;
}>) {
  const eventBase = `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`;

  return (
    <main className={`${workspaceClassNames.page} ${styles.integrationPage}`}>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <Link href={eventBase}>{eventName}</Link>
            <span aria-hidden="true">/</span>
            <span>Integrations</span>
          </WorkspaceBreadcrumb>
        }
        description={description}
        metadata={
          <>
            <WorkspaceMetaItem>Event {eventId}</WorkspaceMetaItem>
            <WorkspaceMetaItem>Organization {organizationId}</WorkspaceMetaItem>
          </>
        }
        title={title}
      />

      <SettingsShell
        wide
        navigation={
          <nav className={styles.settingsNavigation} aria-label="Integration settings">
            {tabs.map((tab) => (
              <Link
                key={tab.section}
                href={tab.href}
                aria-current={tab.section === section ? "page" : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        }
      >
        <div className={styles.integrationContent}>
          {notice ? (
            <div className={styles.successPanel} role="status" aria-live="polite">
              <p>{notice}</p>
            </div>
          ) : null}
          {mutationError ? (
            <div className={styles.errorPanel} role="alert">
              <div>
                <h2>Could not save the change</h2>
                <p>{mutationError}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={onDismissError}>
                Dismiss
              </Button>
            </div>
          ) : null}
          {oneTimeSecret ? (
            <OneTimeSecretPanel
              secret={oneTimeSecret.value}
              label={oneTimeSecret.label}
              onDismiss={onDismissSecret}
            />
          ) : null}

          {loading && !snapshot ? (
            <div className={styles.statePanel} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <h2>Loading integration settings</h2>
              <p>Retrieving tenant-scoped connection and delivery status.</p>
            </div>
          ) : null}
          {loadError && !snapshot ? (
            <div className={styles.statePanel} role="alert">
              <h2>Integration settings are unavailable</h2>
              <p>{loadError}</p>
              <Button type="button" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : null}

          {snapshot ? (
            section === "overview" ? (
              <OverviewSection basePath={basePath} snapshot={snapshot} />
            ) : section === "api-keys" ? (
              <ApiKeysSection keys={snapshot.apiKeys} actions={actions} />
            ) : section === "webhooks" ? (
              <WebhooksSection webhooks={snapshot.webhooks} actions={actions} />
            ) : (
              <DeliverySection snapshot={snapshot} actions={actions} />
            )
          ) : null}
        </div>
      </SettingsShell>
    </main>
  );
}
