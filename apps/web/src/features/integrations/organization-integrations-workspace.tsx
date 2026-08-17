"use client";

import { Button } from "@/components/ui/button";
import { SettingGroup, SettingRow, SettingsShell } from "@/components/workspace/settings-ui";
import {
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
  workspaceClassNames,
} from "@/components/workspace/workspace-ui";
import { AirtableIntegration } from "./airtable";
import { OrganizationApiKeys } from "./organization-api-keys";
import styles from "./organization-integrations-workspace.module.css";

export type OrganizationIntegrationSection =
  | "connections"
  | "airtable"
  | "api-keys"
  | "event-bindings";

interface OrganizationIntegrationsWorkspaceProps {
  readonly organizationId: string;
  readonly section: OrganizationIntegrationSection;
}

export function OrganizationIntegrationsWorkspace({
  organizationId,
  section,
}: OrganizationIntegrationsWorkspaceProps) {
  const organizationBase = `/admin/organizations/${encodeURIComponent(organizationId)}`;
  const integrationsBase = `${organizationBase}/integrations`;
  const destinations: readonly {
    readonly section: OrganizationIntegrationSection;
    readonly label: string;
    readonly href: string;
  }[] = [
    { section: "connections", label: "Connections", href: integrationsBase },
    { section: "airtable", label: "Airtable", href: `${integrationsBase}/airtable` },
    { section: "api-keys", label: "API keys", href: `${integrationsBase}/api-keys` },
    {
      section: "event-bindings",
      label: "Event bindings",
      href: `${integrationsBase}/event-bindings`,
    },
  ];

  return (
    <main className={`${workspaceClassNames.page} ${styles.workspace}`}>
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
            <WorkspaceMetaItem>Organization {organizationId}</WorkspaceMetaItem>
            <WorkspaceMetaItem>D1 remains authoritative</WorkspaceMetaItem>
          </>
        }
        title="Integrations"
      />

      <SettingsShell
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
          {section === "connections" ? (
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
                    <Button asChild size="sm" variant="ghost">
                      <a href={`${integrationsBase}/airtable`}>Configure</a>
                    </Button>
                  }
                />
                <SettingRow
                  label="Developer API"
                  description="Organization-scoped keys with one-time secret display and explicit scopes."
                  controls={
                    <Button asChild size="sm" variant="ghost">
                      <a href={`${integrationsBase}/api-keys`}>Manage keys</a>
                    </Button>
                  }
                />
              </ul>
            </SettingGroup>
          ) : null}

          {section === "airtable" ? (
            <section
              className={styles.sectionDestination}
              id="airtable"
              aria-labelledby="airtable-heading"
            >
              <header className={styles.destinationHeader}>
                <p className={styles.destinationEyebrow}>Connection</p>
                <h2 id="airtable-heading">Airtable</h2>
                <p>
                  Link a base, monitor projection health, and resolve record conflicts without
                  making Airtable part of the critical path.
                </p>
              </header>
              <AirtableIntegration organizationId={organizationId} embedded />
            </section>
          ) : null}

          {section === "api-keys" ? (
            <section
              className={styles.sectionDestination}
              id="api-keys"
              aria-labelledby="api-keys-heading"
            >
              <header className={styles.destinationHeader}>
                <p className={styles.destinationEyebrow}>Credentials</p>
                <h2 id="api-keys-heading">Developer API</h2>
                <p>
                  Create scoped organization keys and review active access without exposing stored
                  secrets.
                </p>
              </header>
              <OrganizationApiKeys organizationId={organizationId} />
            </section>
          ) : null}

          {section === "event-bindings" ? (
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
                      <a href={`${organizationBase}/events`}>View events</a>
                    </Button>
                  }
                />
              </ul>
            </SettingGroup>
          ) : null}
        </div>
      </SettingsShell>
    </main>
  );
}
