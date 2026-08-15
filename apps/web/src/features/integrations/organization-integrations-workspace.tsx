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

interface OrganizationIntegrationsWorkspaceProps {
  readonly organizationId: string;
}

export function OrganizationIntegrationsWorkspace({
  organizationId,
}: OrganizationIntegrationsWorkspaceProps) {
  const organizationBase = `/admin/organizations/${encodeURIComponent(organizationId)}`;

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
            <a href="#connections">Connections</a>
            <a href="#airtable">Airtable</a>
            <a href="#api-keys">API keys</a>
            <a href="#event-bindings">Event bindings</a>
          </nav>
        }
      >
        <div className={styles.stack}>
          <SettingGroup
            id="connections"
            title="Connection ownership"
            description="Organization credentials and provider connections are shared infrastructure. Events own only the bindings and operations that truly vary by event."
          >
            <ul className={styles.settingRows}>
              <SettingRow
                label="Airtable projection"
                description="Optional organization-scoped projection and validated inbound adapter. Airtable availability never blocks ordinary product work."
                controls={<a href="#airtable">Configure</a>}
              />
              <SettingRow
                label="Developer API"
                description="Organization-scoped keys with one-time secret display and explicit scopes."
                controls={<a href="#api-keys">Manage keys</a>}
              />
            </ul>
          </SettingGroup>

          <section id="airtable" aria-label="Airtable connection">
            <AirtableIntegration organizationId={organizationId} />
          </section>

          <section id="api-keys" aria-label="Organization API keys">
            <OrganizationApiKeys organizationId={organizationId} />
          </section>

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
        </div>
      </SettingsShell>
    </div>
  );
}
