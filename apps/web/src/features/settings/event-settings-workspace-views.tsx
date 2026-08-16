"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SettingGroup, SettingsShell } from "@/components/workspace/settings-ui";
import {
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
} from "@/components/workspace/workspace-ui";
import type { EventIdentity, EventSettingsAuditEntry } from "./api";
import {
  type EventSettingsAuditPresentation,
  eventSettingsAuditDiff,
  eventSettingsAuditPresentation,
  settingsOnlyAuditEntries,
} from "./event-settings-audit";
import { eventSettingsSectionDefinition } from "./event-settings-sections";
import type {
  EventSettingsWorkspaceState,
  EventSettingsWorkspaceViewProps,
} from "./event-settings-workspace";
import styles from "./event-settings-workspace.module.css";
import { eventSettingsWorkspaceScopeKey } from "./event-settings-workspace-model";
import {
  RoomsSection,
  SettingsSectionNavigation,
  StatusSettingsForm,
  TaxonomySection,
} from "./event-settings-workspace-sections";

function contextLabel(organizationId: string, eventIdentity?: EventIdentity): string {
  return eventIdentity === undefined
    ? `Organization ${organizationId} · Loading public identity…`
    : `Organization ${organizationId} · Public slug ${eventIdentity.slug}`;
}

function actorLabel(actorId: string): string {
  return actorId
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

const AUDIT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function subscribeToAuditTimestamp(): () => void {
  return () => undefined;
}

function browserAuditTimestamp(value: string): string {
  return AUDIT_TIMESTAMP_FORMATTER.format(new Date(value));
}

function AuditTimestamp({ value }: Readonly<{ value: string }>) {
  return useSyncExternalStore(
    subscribeToAuditTimestamp,
    () => browserAuditTimestamp(value),
    () => value,
  );
}

function auditChangeLabel(
  changeKind: EventSettingsAuditPresentation["changeKind"],
): "Created" | "Updated" | "Deleted" {
  if (changeKind === "created") return "Created";
  if (changeKind === "deleted") return "Deleted";
  return "Updated";
}

function auditChangeSymbol(
  changeKind: EventSettingsAuditPresentation["changeKind"],
): "+" | "−" | "•" {
  if (changeKind === "created") return "+";
  if (changeKind === "deleted") return "−";
  return "•";
}

function AuditSection({ audit }: Readonly<{ audit: readonly EventSettingsAuditEntry[] }>) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries = settingsOnlyAuditEntries(audit);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = entries.filter((entry) => {
    if (scope !== "all" && entry.entityType !== scope) return false;
    if (!normalizedQuery) return true;
    const presentation = eventSettingsAuditPresentation(entry);
    return [
      presentation.domain,
      presentation.entityLabel,
      presentation.summary,
      actorLabel(entry.actorId),
      entry.entityId,
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const selectedEntry = entries.find(({ id }) => id === selectedId) ?? null;
  const selectedPresentation = selectedEntry ? eventSettingsAuditPresentation(selectedEntry) : null;
  const selectedDiff = selectedEntry ? eventSettingsAuditDiff(selectedEntry) : [];

  return (
    <SettingGroup
      id="history"
      aria-labelledby="history-heading"
      title="Change history"
      description="Review audited configuration changes without mixing in ordinary session activity."
      metadata={
        entries.length === filteredEntries.length
          ? `${entries.length} changes`
          : `${filteredEntries.length} of ${entries.length} changes`
      }
    >
      <div className={styles.historyToolbar}>
        <Label className={styles.historySearch} htmlFor="settings-history-search">
          <Search aria-hidden />
          <span className="sr-only">Search change history</span>
          <Input
            id="settings-history-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search changes or entities"
          />
        </Label>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger aria-label="Filter change history by configuration type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All configuration</SelectItem>
            <SelectItem value="settings">Session workflow</SelectItem>
            <SelectItem value="room">Rooms and venues</SelectItem>
            <SelectItem value="track">Tracks</SelectItem>
            <SelectItem value="format">Formats</SelectItem>
            <SelectItem value="level">Levels</SelectItem>
            <SelectItem value="tag">Tags</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {entries.length === 0 ? (
        <p className={styles.mutedText}>
          No configuration changes have been audited for this event yet.
        </p>
      ) : filteredEntries.length === 0 ? (
        <p className={styles.mutedText}>No changes match the current search and scope.</p>
      ) : (
        <ol className={styles.auditList} aria-label="Configuration change history">
          {filteredEntries.map((entry) => {
            const presentation = eventSettingsAuditPresentation(entry);
            return (
              <li
                key={entry.id}
                className={styles.auditEntry}
                data-change-kind={presentation.changeKind}
              >
                <button
                  type="button"
                  aria-label={`View ${presentation.entityLabel} ${auditChangeLabel(
                    presentation.changeKind,
                  ).toLowerCase()} revision`}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <span className={styles.auditEntryMain}>
                    <span className={styles.auditChangeMarker} aria-hidden>
                      {auditChangeSymbol(presentation.changeKind)}
                    </span>
                    <span className={styles.auditEntryCopy}>
                      <span className={styles.auditEntryHeading}>
                        <strong>{presentation.entityLabel}</strong>
                        <span className={styles.auditDomain}>{presentation.domain}</span>
                      </span>
                      <span className={styles.auditEntrySummary}>{presentation.summary}</span>
                    </span>
                  </span>
                  <span className={styles.auditEntryMeta}>
                    <span className={styles.auditEntryActor}>{actorLabel(entry.actorId)}</span>
                    <time className={styles.auditEntryTime} dateTime={entry.occurredAt}>
                      <AuditTimestamp value={entry.occurredAt} />
                    </time>
                    <span className={styles.auditEntryVersion}>{presentation.versionLabel}</span>
                    <ChevronRight aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <Sheet
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent className={styles.revisionSheet}>
          {selectedEntry && selectedPresentation ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selectedPresentation.entityLabel}{" "}
                  {auditChangeLabel(selectedPresentation.changeKind).toLowerCase()}
                </SheetTitle>
                <SheetDescription>
                  {selectedPresentation.domain} · {actorLabel(selectedEntry.actorId)} ·{" "}
                  <AuditTimestamp value={selectedEntry.occurredAt} />
                </SheetDescription>
              </SheetHeader>
              <div
                className={styles.revisionSummary}
                data-change-kind={selectedPresentation.changeKind}
              >
                <span className={styles.revisionSummaryStatus}>
                  <span className={styles.auditChangeMarker} aria-hidden>
                    {auditChangeSymbol(selectedPresentation.changeKind)}
                  </span>
                  <span>{selectedPresentation.summary}</span>
                </span>
                <strong>{selectedPresentation.versionLabel}</strong>
              </div>
              <div className={styles.revisionDiff}>
                <h3>Changes</h3>
                {selectedDiff.length === 0 ? (
                  <p>No field-level difference is available for this revision.</p>
                ) : (
                  <dl>
                    {selectedDiff.map((change) => (
                      <div key={change.field}>
                        <dt>{change.field}</dt>
                        <dd>
                          <span className={styles.revisionBefore}>
                            <span className={styles.revisionValueLabel}>
                              <span aria-hidden>−</span>
                              Before
                            </span>
                            <span className={styles.revisionValueText}>{change.before}</span>
                          </span>
                          <span className={styles.revisionAfter}>
                            <span className={styles.revisionValueLabel}>
                              <span aria-hidden>+</span>
                              After
                            </span>
                            <span className={styles.revisionValueText}>{change.after}</span>
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <details className={styles.revisionTechnical}>
                <summary>Technical details</summary>
                <dl>
                  <div>
                    <dt>Audit ID</dt>
                    <dd>{selectedEntry.id}</dd>
                  </div>
                  <div>
                    <dt>Entity ID</dt>
                    <dd>{selectedEntry.entityId}</dd>
                  </div>
                  <div>
                    <dt>Actor ID</dt>
                    <dd>{selectedEntry.actorId}</dd>
                  </div>
                </dl>
              </details>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </SettingGroup>
  );
}

function contextStateMessage(state: EventSettingsWorkspaceState): string | null {
  return state.status === "loaded"
    ? (state.detailsMessage ?? "The event library and audit history could not be loaded.")
    : null;
}

export function EventSettingsWorkspaceView({
  organizationId,
  eventId,
  eventIdentity,
  section = "workflow",
  state,
  busy = false,
  notice = null,
  actions = {},
  onRetry,
}: EventSettingsWorkspaceViewProps) {
  const data = state.status === "loaded" ? state.data : null;
  const detailsStatus = state.status === "loaded" ? (state.detailsStatus ?? "loaded") : "loaded";
  const detailsMessage = contextStateMessage(state);
  const sectionDefinition = eventSettingsSectionDefinition(section);
  const header = (
    <WorkspaceHeader
      className={data ? (styles.destinationHeader ?? "") : (styles.stateHeader ?? "")}
      breadcrumb={
        <WorkspaceBreadcrumb>
          <Link href="/admin/events">Events</Link>
          <span aria-hidden="true">/</span>
          <span>{eventIdentity?.name ?? "Event settings"}</span>
          <span aria-hidden="true">/</span>
          <span>Settings</span>
        </WorkspaceBreadcrumb>
      }
      title={sectionDefinition.label}
      description={sectionDefinition.description}
      metadata={
        <WorkspaceMetaItem>{contextLabel(organizationId, eventIdentity)}</WorkspaceMetaItem>
      }
    />
  );

  return (
    <main id="event-settings-content" className={styles.workspace} tabIndex={-1}>
      {state.status === "error" || state.status === "config-error" ? (
        <>
          {header}
          <Card className={styles.fullWidthState} role="alert">
            <CardHeader>
              <CardTitle>Event settings unavailable</CardTitle>
              <CardDescription>{state.message}</CardDescription>
            </CardHeader>
            <CardContent className={styles.stateActions}>
              <p className={styles.mutedText}>
                Core event settings were not loaded, so section navigation is unavailable.
              </p>
              {onRetry ? (
                <Button type="button" variant="outline" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : state.status === "loading" && !data ? (
        <>
          {header}
          <Card className={styles.fullWidthState} aria-live="polite" aria-busy="true">
            <CardHeader>
              <CardTitle>Loading event settings</CardTitle>
              <CardDescription>Retrieving event-scoped statuses and rooms.</CardDescription>
            </CardHeader>
          </Card>
        </>
      ) : data ? (
        <SettingsShell
          className={styles.contentCenteredShell}
          navigation={
            <SettingsSectionNavigation
              organizationId={organizationId}
              eventId={eventId}
              section={section}
            />
          }
        >
          {header}
          <div className="sr-only" role="status" aria-live="polite">
            {notice}
          </div>
          {notice ? (
            <div className={styles.notice} role="status" aria-live="polite">
              {notice}
            </div>
          ) : null}
          {section === "workflow" ? (
            <SettingGroup
              id="workflow"
              aria-labelledby="workflow-heading"
              title="Session statuses"
              description="Define the statuses organizers use and which ones can appear on the private agenda."
              metadata={`Version ${data.settings.version}`}
            >
              <StatusSettingsForm
                settings={data.settings}
                busy={busy}
                {...(actions.updateSettings === undefined
                  ? {}
                  : { onSave: actions.updateSettings })}
                readOnly={!actions.updateSettings}
              />
            </SettingGroup>
          ) : null}
          {section === "rooms" ? (
            <RoomsSection
              key={eventSettingsWorkspaceScopeKey(organizationId, eventId)}
              rooms={data.rooms}
              busy={busy}
              {...(actions.createRoom === undefined ? {} : { onCreateRoom: actions.createRoom })}
              {...(actions.updateRoom === undefined ? {} : { onUpdateRoom: actions.updateRoom })}
              {...(actions.deleteRoom === undefined ? {} : { onDeleteRoom: actions.deleteRoom })}
            />
          ) : null}
          {section === "classification" ? (
            <SettingGroup
              id="classification"
              className={styles.librarySection}
              aria-labelledby="classification-heading"
              title="Classification library"
              description="Define how sessions are organized and discovered. These options appear in submissions, session editing, agenda filters, and the public program."
              contentClassName={styles.classificationContent}
            >
              <p className={styles.sectionNote}>
                Tracks, formats, and levels are recommended. Tags are optional and can be added
                later.
              </p>
              {detailsStatus === "loading" ? (
                <Card className={styles.detailsState} role="status" aria-live="polite">
                  <CardContent>
                    <p>Loading session classification and audit history…</p>
                  </CardContent>
                </Card>
              ) : detailsStatus === "error" ? (
                <Card className={styles.detailsState} role="alert">
                  <CardContent>
                    <p>Session classification unavailable. {detailsMessage}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className={styles.taxonomyGrid}>
                  <TaxonomySection
                    kind="track"
                    resources={data.tracks}
                    busy={busy}
                    {...(actions.createResource === undefined
                      ? {}
                      : { onCreateResource: actions.createResource })}
                    {...(actions.updateResource === undefined
                      ? {}
                      : { onUpdateResource: actions.updateResource })}
                    {...(actions.deleteResource === undefined
                      ? {}
                      : { onDeleteResource: actions.deleteResource })}
                  />
                  <TaxonomySection
                    kind="format"
                    resources={data.formats}
                    busy={busy}
                    {...(actions.createResource === undefined
                      ? {}
                      : { onCreateResource: actions.createResource })}
                    {...(actions.updateResource === undefined
                      ? {}
                      : { onUpdateResource: actions.updateResource })}
                    {...(actions.deleteResource === undefined
                      ? {}
                      : { onDeleteResource: actions.deleteResource })}
                  />
                  <TaxonomySection
                    kind="level"
                    resources={data.levels}
                    busy={busy}
                    {...(actions.createResource === undefined
                      ? {}
                      : { onCreateResource: actions.createResource })}
                    {...(actions.updateResource === undefined
                      ? {}
                      : { onUpdateResource: actions.updateResource })}
                    {...(actions.deleteResource === undefined
                      ? {}
                      : { onDeleteResource: actions.deleteResource })}
                  />
                  <TaxonomySection
                    kind="tag"
                    resources={data.tags}
                    busy={busy}
                    {...(actions.createResource === undefined
                      ? {}
                      : { onCreateResource: actions.createResource })}
                    {...(actions.updateResource === undefined
                      ? {}
                      : { onUpdateResource: actions.updateResource })}
                    {...(actions.deleteResource === undefined
                      ? {}
                      : { onDeleteResource: actions.deleteResource })}
                  />
                </div>
              )}
            </SettingGroup>
          ) : null}
          {section === "history" && detailsStatus === "loaded" ? (
            <AuditSection audit={data.audit} />
          ) : section === "history" ? (
            <SettingGroup id="history" aria-labelledby="history-heading" title="Change history">
              <p
                className={styles.mutedText}
                role={detailsStatus === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {detailsStatus === "loading"
                  ? "Loading change history…"
                  : `Change history unavailable. ${detailsMessage}`}
              </p>
            </SettingGroup>
          ) : null}
        </SettingsShell>
      ) : null}
    </main>
  );
}
