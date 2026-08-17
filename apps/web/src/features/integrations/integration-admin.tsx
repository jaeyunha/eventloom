"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui";
import { SettingsShell } from "@/components/workspace/settings-ui";
import {
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
  workspaceClassNames,
} from "@/components/workspace/workspace-ui";
import {
  createIntegrationAdminApi,
  type IntegrationAdminApi,
  IntegrationAdminApiError,
} from "./api";
import {
  ApiKeysSection,
  DeliverySection,
  OneTimeSecretPanel,
  OverviewSection,
  WebhooksSection,
} from "./integration-sections";
import styles from "./integrations.module.css";
import type { IntegrationAdminSnapshot, OneTimeSecret } from "./types";

type SupportedIntegrationSection = "overview" | "api-keys" | "webhooks" | "delivery";

export interface IntegrationAdminProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly section: SupportedIntegrationSection;
  readonly initialSnapshot?: IntegrationAdminSnapshot;
  readonly api?: IntegrationAdminApi;
}

const sectionCopy: Record<
  SupportedIntegrationSection,
  { readonly title: string; readonly description: string }
> = {
  overview: {
    title: "Integrations",
    description: "Connect distribution services and monitor every outbound program handoff.",
  },
  "api-keys": {
    title: "Organization API keys",
    description:
      "Issue organization-scoped credentials. Event context is operational metadata, not an authorization boundary.",
  },
  webhooks: {
    title: "Webhooks",
    description: "Deliver signed event notifications and inspect endpoint health.",
  },
  delivery: {
    title: "Delivery operations",
    description:
      "Monitor deployment-managed email delivery, verified identities, and RFC 5545 operations.",
  },
};

function messageFrom(error: unknown): string {
  if (error instanceof IntegrationAdminApiError || error instanceof Error) {
    return error.message;
  }
  return "The integration request could not be completed.";
}

export function IntegrationAdmin({
  eventId,
  organizationId,
  section,
  initialSnapshot,
  api: injectedApi,
}: IntegrationAdminProps) {
  const api = useMemo(() => injectedApi ?? createIntegrationAdminApi(""), [injectedApi]);
  const [snapshot, setSnapshot] = useState<IntegrationAdminSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [loading, setLoading] = useState(initialSnapshot === undefined);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<{
    readonly value: OneTimeSecret;
    readonly label: string;
  } | null>(null);

  const loadSnapshot = useCallback(
    async (signal?: AbortSignal) => {
      setLoadError(null);
      try {
        setSnapshot(await api.getSnapshot(organizationId, eventId, signal));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoadError(messageFrom(error));
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [api, eventId, organizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot(controller.signal);
    return () => controller.abort();
  }, [loadSnapshot]);

  const mutate = useCallback(
    async <T,>(operation: () => Promise<T>, successMessage: string): Promise<T | null> => {
      setBusy(true);
      setMutationError(null);
      setNotice(null);
      try {
        const result = await operation();
        setNotice(successMessage);
        return result;
      } catch (error) {
        setMutationError(messageFrom(error));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const refreshAfter = useCallback(async () => {
    try {
      setSnapshot(await api.getSnapshot(organizationId, eventId));
    } catch (error) {
      setMutationError(`The change was saved, but status could not refresh: ${messageFrom(error)}`);
    }
  }, [api, eventId, organizationId]);

  const actions = {
    busy,
    async saveCredential(provider: "opensend", secret: string) {
      const saved = await mutate(
        () => api.saveCredential({ organizationId, eventId, provider, secret }),
        "OpenSend credential saved.",
      );
      if (saved === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
    async createApiKey(
      input: Parameters<IntegrationAdminApi["createApiKey"]>[0] extends infer P
        ? Omit<Extract<P, object>, "organizationId" | "eventId">
        : never,
    ) {
      const secret = await mutate(
        () => api.createApiKey({ ...input, organizationId, eventId }),
        "API key created. Copy it before leaving this page.",
      );
      if (!secret) {
        return false;
      }
      setOneTimeSecret({ value: secret, label: "API key" });
      await refreshAfter();
      return true;
    },
    async revokeApiKey(apiKeyId: string) {
      const revoked = await mutate(
        () => api.revokeApiKey(organizationId, eventId, apiKeyId),
        "API key revoked.",
      );
      if (revoked === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
    async createWebhook(
      input: Parameters<IntegrationAdminApi["createWebhook"]>[0] extends infer P
        ? Omit<Extract<P, object>, "organizationId" | "eventId">
        : never,
    ) {
      const secret = await mutate(
        () => api.createWebhook({ ...input, organizationId, eventId }),
        "Webhook endpoint created. Copy its signing secret now.",
      );
      if (!secret) {
        return false;
      }
      setOneTimeSecret({ value: secret, label: "webhook signing secret" });
      await refreshAfter();
      return true;
    },
    async setWebhookActive(subscriptionId: string, active: boolean) {
      const updated = await mutate(
        () => api.setWebhookActive(organizationId, eventId, subscriptionId, active),
        active ? "Webhook deliveries resumed." : "Webhook deliveries paused.",
      );
      if (updated === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
    async rotateWebhookSecret(subscriptionId: string) {
      const secret = await mutate(
        () => api.rotateWebhookSecret(organizationId, eventId, subscriptionId),
        "Signing secret rotated. Update the endpoint before dismissing it.",
      );
      if (!secret) {
        return false;
      }
      setOneTimeSecret({ value: secret, label: "webhook signing secret" });
      await refreshAfter();
      return true;
    },
    async deleteWebhook(subscriptionId: string) {
      const removed = await mutate(
        () => api.deleteWebhook(organizationId, eventId, subscriptionId),
        "Webhook endpoint removed.",
      );
      if (removed === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
    async retryCalendarDelivery(deliveryId: string) {
      const retried = await mutate(
        () => api.retryCalendarDelivery(organizationId, eventId, deliveryId),
        "Calendar delivery queued for retry.",
      );
      if (retried === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
  };

  const eventBase = `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`;
  const base = `${eventBase}/integrations`;
  const tabs: readonly {
    readonly section: SupportedIntegrationSection;
    readonly label: string;
    readonly href: string;
  }[] = [
    { section: "overview", label: "Overview", href: base },
    {
      section: "api-keys",
      label: "Organization API keys",
      href: `${base}/api-keys`,
    },
    { section: "webhooks", label: "Webhooks", href: `${base}/webhooks` },
    { section: "delivery", label: "Email & calendar", href: `${base}/delivery` },
  ];
  const copy = sectionCopy[section];

  return (
    <main className={`${workspaceClassNames.page} ${styles.integrationPage}`}>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <a href={eventBase}>{snapshot?.event.name ?? "Event"}</a>
            <span aria-hidden="true">/</span>
            <span>Integrations</span>
          </WorkspaceBreadcrumb>
        }
        description={copy.description}
        metadata={
          <>
            <WorkspaceMetaItem>Event {eventId}</WorkspaceMetaItem>
            <WorkspaceMetaItem>Organization {organizationId}</WorkspaceMetaItem>
          </>
        }
        title={copy.title}
      />

      <SettingsShell
        wide
        navigation={
          <nav className={styles.settingsNavigation} aria-label="Integration settings">
            <p className={styles.settingsNavigationTitle}>Event</p>
            {tabs.map((tab) => (
              <a
                key={tab.section}
                href={tab.href}
                aria-current={tab.section === section ? "page" : undefined}
              >
                {tab.label}
              </a>
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMutationError(null)}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
          {oneTimeSecret ? (
            <OneTimeSecretPanel
              secret={oneTimeSecret.value}
              label={oneTimeSecret.label}
              onDismiss={() => setOneTimeSecret(null)}
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
              <Button type="button" onClick={() => void loadSnapshot()}>
                Try again
              </Button>
            </div>
          ) : null}

          {snapshot ? (
            section === "overview" ? (
              <OverviewSection basePath={base} snapshot={snapshot} />
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
