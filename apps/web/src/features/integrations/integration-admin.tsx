"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/layout";
import { Button } from "../../components/ui";
import { createIntegrationAdminApi, IntegrationAdminApiError, type IntegrationAdminApi } from "./api";
import {
  AcceleventsSection,
  ApiKeysSection,
  DeliverySection,
  OneTimeSecretPanel,
  OverviewSection,
  WebhooksSection,
} from "./integration-sections";
import styles from "./integrations.module.css";
import type {
  AcceleventsAdminPreview,
  AcceleventsPublishResult,
  IntegrationAdminSnapshot,
  IntegrationSection,
  OneTimeSecret,
} from "./types";

export interface IntegrationAdminProps {
  readonly eventId: string;
  readonly section: IntegrationSection;
  readonly initialSnapshot?: IntegrationAdminSnapshot;
  readonly initialPreview?: AcceleventsAdminPreview;
  readonly api?: IntegrationAdminApi;
}

const sectionCopy: Record<
  IntegrationSection,
  { readonly title: string; readonly description: string }
> = {
  overview: {
    title: "Integrations",
    description: "Connect distribution services and monitor every outbound program handoff.",
  },
  accelevents: {
    title: "Accelevents publication",
    description: "Preview immutable agenda changes before an explicit, outbound-only publication.",
  },
  "api-keys": {
    title: "API keys",
    description: "Issue least-privilege credentials for tenant-scoped API clients.",
  },
  webhooks: {
    title: "Webhooks",
    description: "Deliver signed event notifications and inspect endpoint health.",
  },
  delivery: {
    title: "Email & calendar",
    description: "Monitor OpenSend identities, transactional email, and RFC 5545 delivery.",
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
  section,
  initialSnapshot,
  initialPreview,
  api: injectedApi,
}: IntegrationAdminProps) {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const api = useMemo(
    () => injectedApi ?? (configuredApiUrl ? createIntegrationAdminApi(configuredApiUrl) : null),
    [configuredApiUrl, injectedApi],
  );
  const [snapshot, setSnapshot] = useState<IntegrationAdminSnapshot | null>(initialSnapshot ?? null);
  const [preview, setPreview] = useState<AcceleventsAdminPreview | null>(initialPreview ?? null);
  const [publishResult, setPublishResult] = useState<AcceleventsPublishResult | null>(null);
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
      if (!api) {
        if (!initialSnapshot) {
          setLoadError("The admin API URL is not configured.");
          setLoading(false);
        }
        return;
      }
      setLoadError(null);
      try {
        setSnapshot(await api.getSnapshot(eventId, signal));
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
    [api, eventId, initialSnapshot],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot(controller.signal);
    return () => controller.abort();
  }, [loadSnapshot]);

  const mutate = useCallback(
    async <T,>(operation: () => Promise<T>, successMessage: string): Promise<T | null> => {
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return null;
      }
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
    [api],
  );

  const refreshAfter = useCallback(async () => {
    if (!api) {
      return;
    }
    try {
      setSnapshot(await api.getSnapshot(eventId));
    } catch (error) {
      setMutationError(`The change was saved, but status could not refresh: ${messageFrom(error)}`);
    }
  }, [api, eventId]);

  const actions = {
    busy,
    async saveCredential(provider: "opensend" | "accelevents", secret: string) {
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const saved = await mutate(
        () => api.saveCredential({ eventId, provider, secret }),
        `${provider === "opensend" ? "OpenSend" : "Accelevents"} credential saved.`,
      );
      if (saved === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
    async createApiKey(input: Parameters<IntegrationAdminApi["createApiKey"]>[0] extends infer P
      ? Omit<Extract<P, object>, "eventId">
      : never) {
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const secret = await mutate(
        () => api.createApiKey({ ...input, eventId }),
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
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const revoked = await mutate(() => api.revokeApiKey(eventId, apiKeyId), "API key revoked.");
      if (revoked === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
    async createWebhook(input: Parameters<IntegrationAdminApi["createWebhook"]>[0] extends infer P
      ? Omit<Extract<P, object>, "eventId">
      : never) {
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const secret = await mutate(
        () => api.createWebhook({ ...input, eventId }),
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
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const updated = await mutate(
        () => api.setWebhookActive(eventId, subscriptionId, active),
        active ? "Webhook deliveries resumed." : "Webhook deliveries paused.",
      );
      if (updated === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
    async rotateWebhookSecret(subscriptionId: string) {
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const secret = await mutate(
        () => api.rotateWebhookSecret(eventId, subscriptionId),
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
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const removed = await mutate(
        () => api.deleteWebhook(eventId, subscriptionId),
        "Webhook endpoint removed.",
      );
      if (removed === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
    async previewAccelevents() {
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      setPublishResult(null);
      const nextPreview = await mutate(
        () => api.previewAccelevents(eventId),
        "Publication preview is ready for review.",
      );
      if (!nextPreview) {
        return false;
      }
      setPreview(nextPreview);
      return true;
    },
    async publishAccelevents(currentPreview: AcceleventsAdminPreview) {
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const result = await mutate(
        () =>
          api.publishAccelevents({
            eventId,
            publicationId: currentPreview.publicationId,
            snapshotHash: currentPreview.snapshotHash,
            confirmationToken: currentPreview.confirmationToken,
            idempotencyKey: `accelevents-${crypto.randomUUID()}`,
          }),
        "Accelevents publication finished.",
      );
      if (!result) {
        return false;
      }
      setPublishResult(result);
      await refreshAfter();
      return true;
    },
    async retryCalendarDelivery(deliveryId: string) {
      if (!api) {
        setMutationError("The admin API URL is not configured.");
        return false;
      }
      const retried = await mutate(
        () => api.retryCalendarDelivery(eventId, deliveryId),
        "Calendar delivery queued for retry.",
      );
      if (retried === null) {
        return false;
      }
      await refreshAfter();
      return true;
    },
  };

  const base = `/admin/events/${encodeURIComponent(eventId)}/integrations`;
  const tabs: readonly { readonly section: IntegrationSection; readonly label: string; readonly href: string }[] = [
    { section: "overview", label: "Overview", href: base },
    { section: "accelevents", label: "Accelevents", href: `${base}/accelevents` },
    { section: "api-keys", label: "API keys", href: `${base}/api-keys` },
    { section: "webhooks", label: "Webhooks", href: `${base}/webhooks` },
    { section: "delivery", label: "Email & calendar", href: `${base}/delivery` },
  ];
  const copy = sectionCopy[section];

  return (
    <div className={styles.integrationPage}>
      <a className={styles.skipLink} href="#integration-content">
        Skip to integration settings
      </a>
      <div className={styles.breadcrumbs} aria-label="Breadcrumb">
        <a href="/admin">Events</a>
        <span aria-hidden="true">/</span>
        <a href={`/admin/events/${encodeURIComponent(eventId)}`}>{snapshot?.event.name ?? "Event"}</a>
        <span aria-hidden="true">/</span>
        <span>Integrations</span>
      </div>
      <PageHeader
        eyebrow={<span className={styles.eyebrow}>Organizer workspace</span>}
        title={copy.title}
        description={copy.description}
      />
      <nav className={styles.tabs} aria-label="Integration settings">
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

      <div id="integration-content" className={styles.integrationContent} tabIndex={-1}>
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
            <Button type="button" variant="ghost" size="small" onClick={() => setMutationError(null)}>
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
            <OverviewSection snapshot={snapshot} />
          ) : section === "accelevents" ? (
            <AcceleventsSection
              snapshot={snapshot}
              preview={preview}
              publishResult={publishResult}
              actions={actions}
            />
          ) : section === "api-keys" ? (
            <ApiKeysSection keys={snapshot.apiKeys} actions={actions} />
          ) : section === "webhooks" ? (
            <WebhooksSection webhooks={snapshot.webhooks} actions={actions} />
          ) : (
            <DeliverySection snapshot={snapshot} actions={actions} />
          )
        ) : null}
      </div>
    </div>
  );
}
