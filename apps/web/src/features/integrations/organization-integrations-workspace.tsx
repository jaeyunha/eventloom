"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SettingGroup, SettingRow, SettingsShell } from "@/components/workspace/settings-ui";
import {
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
} from "@/components/workspace/workspace-ui";
import { workspaceClassNames } from "@/components/workspace/workspace-ui-model";
import { AirtableIntegration } from "./airtable/airtable-integration";
import { OrganizationApiKeys } from "./organization-api-keys";
import styles from "./organization-integrations-workspace.module.css";

export type OrganizationIntegrationSection =
  | "connections"
  | "airtable"
  | "api-keys"
  | "event-bindings";

interface OrganizationIntegrationsWorkspaceProps {
  readonly organizationId: string;
  readonly section?: OrganizationIntegrationSection;
}

export function OrganizationIntegrationsWorkspace({
  organizationId,
  section,
}: OrganizationIntegrationsWorkspaceProps) {
  const organizationBase = `/admin/organizations/${encodeURIComponent(organizationId)}`;
  const integrationsBase = `${organizationBase}/integrations`;
  const showAll = section === undefined;
  const showConnections = showAll || section === "connections";
  const showAirtable = showAll || section === "airtable";
  const showApiKeys = showAll || section === "api-keys";
  const showEventBindings = showAll || section === "event-bindings";
  const destinations: readonly {
    readonly section: OrganizationIntegrationSection;
    readonly label: string;
    readonly href: string;
  }[] = [
    {
      section: "connections",
      label: "Connections",
      href: showAll ? "#connections" : integrationsBase,
    },
    {
      section: "airtable",
      label: "Airtable",
      href: showAll ? "#airtable" : `${integrationsBase}/airtable`,
    },
    {
      section: "api-keys",
      label: "API keys",
      href: showAll ? "#api-keys" : `${integrationsBase}/api-keys`,
    },
    {
      section: "event-bindings",
      label: "Event bindings",
      href: showAll ? "#event-bindings" : `${integrationsBase}/event-bindings`,
    },
  ];

  return (
    <div className={`${workspaceClassNames.page} ${styles.workspace}`}>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <span>Organization</span>
            <span aria-hidden="true">/</span>
            <span>Integrations</span>
          </WorkspaceBreadcrumb>
        }
        description="Manage organization-owned connections and credentials, then configure event-specific delivery and webhooks inside each event."
        metadata={
          <>
            <WorkspaceMetaItem>
              Organization <span className={styles.organizationId}>{organizationId}</span>
            </WorkspaceMetaItem>
            <WorkspaceMetaItem>D1 remains authoritative</WorkspaceMetaItem>
          </>
        }
        title="Integrations"
      />

      <SettingsShell
        className={styles.settingsShell}
        wide
        navigation={
          <nav className={styles.navigation} aria-label="Integration settings">
            <p className={styles.navigationTitle}>Organization</p>
            {destinations.map((destination) => (
              <a
                key={destination.section}
                href={destination.href}
                aria-current={destination.section === section ? "page" : undefined}
              >
                {destination.label}
              </a>
            ))}
          </nav>
        }
      >
        <div className={styles.stack}>
          {showConnections ? (
            <SettingGroup
              id="connections"
              title="Connection ownership"
              description="Organization credentials and provider connections are shared infrastructure. Events own only the bindings and operations that truly vary by event."
            >
              <ul className={styles.settingRows}>
                <SettingRow
                  label="Airtable projection"
                  description="Optional organization-scoped projection and validated inbound adapter. Airtable availability never blocks ordinary product work."
                  controls={
                    <a href={showAll ? "#airtable" : `${integrationsBase}/airtable`}>Configure</a>
                  }
                />
                <SettingRow
                  label="Developer API"
                  description="Organization-scoped keys with one-time secret display and explicit scopes."
                  controls={
                    <a href={showAll ? "#api-keys" : `${integrationsBase}/api-keys`}>Manage keys</a>
                  }
                />
              </ul>
            </SettingGroup>
          ) : null}

          {showAirtable ? (
            <section id="airtable" aria-label="Airtable connection">
              <AirtableIntegration organizationId={organizationId} />
            </section>
          ) : null}

          {showApiKeys ? (
            <section id="api-keys" aria-label="Organization API keys">
              <OrganizationApiKeys organizationId={organizationId} />
            </section>
          ) : null}

          {showEventBindings ? (
            <SettingGroup
              id="event-bindings"
              title="Event bindings"
              description="Event webhooks, calendar publication, and delivery operations stay event-scoped. Choose an event before changing them."
            >
              <ul className={styles.settingRows}>
                <SettingRow
                  label="Open an event"
                  description="Select the event whose webhook subscriptions or delivery operations you want to inspect."
                  controls={
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${organizationBase}/events`}>View events</Link>
                    </Button>
                  }
                />
              </ul>
            </SettingGroup>
          ) : null}
        </div>
      </SettingsShell>
    </div>
  );
}
