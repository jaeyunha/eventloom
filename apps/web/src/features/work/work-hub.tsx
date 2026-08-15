"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ORGANIZER_ORGANIZATION_STORAGE_KEY } from "@/lib/organizer-workspace-preference";
import { parseAccountSession } from "../account/account-access";
import { signOutAccount } from "../account/account-actions";
import type { PortalContext } from "../portal/types";
import styles from "./work-hub.module.css";
import { WorkHubCards } from "./work-hub-cards";
import {
  buildWorkHubModel,
  type WorkHubModel,
  type WorkOrganizationSummary,
} from "./work-hub-model";

const ORGANIZER_ORGANIZATION_STORAGE_KEY = "eventloom.organizer-organization";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function jsonOrNull(response: Response): Promise<unknown> {
  return response.headers.get("content-type")?.includes("application/json")
    ? response.json()
    : null;
}

function apiData(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return "data" in value ? value.data : value;
}

function organizationsFrom(value: unknown): readonly WorkOrganizationSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const candidate = item as Record<string, unknown>;
    return typeof candidate.organizationId === "string" && typeof candidate.name === "string"
      ? [
          {
            organizationId: candidate.organizationId,
            name: candidate.name,
          },
        ]
      : [];
  });
}

export async function loadWorkHubModel(
  fetcher: Fetcher = globalThis.fetch,
  signal?: AbortSignal,
  preferredOrganizationId: string | null = null,
): Promise<WorkHubModel | null> {
  const init: RequestInit = {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  };
  const sessionResponse = await fetcher("/api/auth/get-session", init);
  if (!sessionResponse.ok) return null;
  const session = parseAccountSession(await jsonOrNull(sessionResponse));
  if (session === null) return null;
  const firstOrganizationId = session.memberships[0]?.organizationId;
  const [organizationResponse, reviewerResponse, portalResponse] = await Promise.all([
    firstOrganizationId === undefined
      ? Promise.resolve(null)
      : fetcher(
          `/api/admin/organizations/${encodeURIComponent(firstOrganizationId)}/members/organizations`,
          init,
        ).catch(() => null),
    fetcher("/api/admin/evaluations/reviewer/workspace", init).catch(() => null),
    fetcher("/api/speaker/portal/contexts", init).catch(() => null),
  ]);
  const organizationPayload = apiData(
    organizationResponse?.ok ? await jsonOrNull(organizationResponse) : [],
  );
  const reviewerPayload = apiData(reviewerResponse?.ok ? await jsonOrNull(reviewerResponse) : null);
  const reviewerRecord =
    typeof reviewerPayload === "object" && reviewerPayload !== null
      ? (reviewerPayload as Record<string, unknown>)
      : null;
  const portalPayload = apiData(portalResponse?.ok ? await jsonOrNull(portalResponse) : []);

  return buildWorkHubModel({
    session,
    organizations: organizationsFrom(organizationPayload),
    reviewerAssignments: Array.isArray(reviewerRecord?.assignments)
      ? reviewerRecord.assignments
      : [],
    portalContexts: Array.isArray(portalPayload) ? (portalPayload as readonly PortalContext[]) : [],
    preferredOrganizationId,
  });
}

export function WorkHubView({ model }: Readonly<{ model: WorkHubModel }>) {
  const availableCount = [model.organizer, model.reviewer, model.participant].filter(
    Boolean,
  ).length;
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#workspaces">
        Skip to workspaces
      </a>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link className={styles.brand} href="/work" aria-label="Eventloom work hub">
            <span className={styles.brandMark} aria-hidden="true">
              EL
            </span>
            <span>
              <strong>Eventloom</strong>
              <small>Work hub</small>
            </span>
          </Link>
          <div className={styles.accountActions}>
            <span className={styles.identity}>
              <strong>{model.identity.name ?? "Account"}</strong>
              <small>{model.identity.email}</small>
            </span>
            <ThemeToggle />
            <Button type="button" variant="ghost" onClick={() => void signOutAccount()}>
              <LogOut data-icon="inline-start" aria-hidden="true" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.heading} aria-labelledby="work-heading">
          <p className={styles.eyebrow}>
            One account · {availableCount} workspace{availableCount === 1 ? "" : "s"}
          </p>
          <h1 id="work-heading">Where do you want to work?</h1>
          <p>
            Your access follows your assignments and memberships. Move between contexts without
            signing in again.
          </p>
        </section>
        <WorkHubCards model={model} />
      </main>
    </div>
  );
}

export function WorkHub() {
  const [model, setModel] = useState<WorkHubModel | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const preferred = window.localStorage.getItem(ORGANIZER_ORGANIZATION_STORAGE_KEY);
    void loadWorkHubModel(globalThis.fetch, controller.signal, preferred)
      .then((next) => {
        if (next === null) window.location.replace("/login?next=%2Fwork");
        else setModel(next);
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);
  if (error) {
    return (
      <main className={styles.state}>
        <Alert variant="destructive">
          <AlertTitle>Workspaces are unavailable</AlertTitle>
          <AlertDescription>Reload the page to try again.</AlertDescription>
        </Alert>
      </main>
    );
  }
  if (model === null)
    return (
      <main className={styles.state} aria-busy="true">
        <p className={styles.eyebrow}>Loading your workspaces</p>
      </main>
    );
  return <WorkHubView model={model} />;
}
