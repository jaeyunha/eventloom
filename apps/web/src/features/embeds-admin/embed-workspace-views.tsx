"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import styles from "@/features/admin/admin-shell.module.css";
import workspaceStyles from "./embed-workspace.module.css";
import type {
  EmbedPublicationMetadata,
  EmbedSnippetSettings,
  EmbedWidgetDefinition,
  EmbedWidgetId,
} from "./embed-workspace-model";
import {
  embedCodePreview,
  iframeSandbox,
  iframeSnippet,
  outputFormatLabel,
  publicAgendaCalendarUrl,
  publicAgendaJsonUrl,
  publicEmbedUrl,
  scriptSnippet,
} from "./embed-workspace-model";
import { WidgetChooser } from "./embed-workspace-sections";

export function CopyButton({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function copy() {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      setError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(false);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(true);
      setCopied(false);
    }
  }

  return (
    <div className={workspaceStyles.copyRow}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => void copy()}
        disabled={!value}
      >
        {copied ? "Copied" : `Copy ${label}`}
      </Button>
      <span role="status" aria-live="polite" className={workspaceStyles.muted}>
        {copied
          ? `${label} copied to clipboard.`
          : error
            ? "Clipboard access is unavailable. Select the code to copy it."
            : ""}
      </span>
    </div>
  );
}

export function PublicationStatus({
  eventVersion,
  publication,
}: Readonly<{
  eventVersion: number | null | undefined;
  publication: EmbedPublicationMetadata;
}>) {
  const statusLabel =
    publication.status === "served"
      ? `Live · revision ${publication.servedRevision ?? "unknown"}`
      : publication.status === "pending"
        ? "Publishing update"
        : publication.status === "failed"
          ? "Update failed"
          : publication.status === "loading"
            ? "Checking publication"
            : publication.status === "unavailable"
              ? "Status unavailable"
              : "Not published";
  const servedRevision = publication.servedRevision;
  const headline =
    publication.status === "served"
      ? "Published preview ready"
      : publication.status === "pending"
        ? "Your previous version remains live"
        : publication.status === "failed" && servedRevision !== null
          ? "Your previous version remains live"
          : publication.status === "failed"
            ? "Publishing failed"
            : publication.status === "loading"
              ? "Checking publishing status"
              : publication.status === "unavailable"
                ? "Publishing status unavailable"
                : "Publish your agenda to preview";
  const summary =
    publication.status === "served"
      ? "This preview matches the program visitors can currently see."
      : publication.status === "pending"
        ? `Revision ${servedRevision ?? "none"} stays live while revision ${publication.pendingRevision ?? "the next revision"} is prepared.`
        : publication.status === "failed" && servedRevision !== null
          ? `Visitors still see revision ${servedRevision}. Review the agenda before publishing again.`
          : publication.status === "failed"
            ? "The latest program update could not be published."
            : publication.status === "loading"
              ? "Eventloom is confirming which program revision is live."
              : publication.status === "unavailable"
                ? "Preview and sharing are paused until the live revision can be confirmed."
                : "Publish the agenda to create a live preview and sharing links.";
  return (
    <Collapsible className={workspaceStyles.publicationSummary}>
      <div className={workspaceStyles.publicationSummaryRow}>
        <div
          className={workspaceStyles.publicationSummaryCopy}
          role="status"
          aria-label="Publication status"
        >
          <Badge variant={publication.status === "served" ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
          <div>
            <strong>{headline}</strong>
            <p className={workspaceStyles.muted}>{summary}</p>
          </div>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" type="button">
            Publication details
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent forceMount className={workspaceStyles.publicationDetailsContent}>
        <div className={workspaceStyles.statusGrid}>
          <div className={workspaceStyles.statusItem}>
            <span className={workspaceStyles.statusLabel}>Event record</span>
            <strong>
              {eventVersion === null || eventVersion === undefined
                ? "Version not loaded"
                : `Event version ${eventVersion}`}
            </strong>
            <span className={workspaceStyles.muted}>Private organizer record.</span>
          </div>
          <div className={workspaceStyles.statusItem}>
            <span className={workspaceStyles.statusLabel}>Served program revision</span>
            <strong>
              {servedRevision === null ? "No served revision" : `Revision ${servedRevision}`}
            </strong>
            <span className={workspaceStyles.muted}>
              {publication.status === "pending"
                ? `Rebuild ${publication.pendingRevision ?? "pending"} is in progress; revision ${servedRevision ?? "none"} remains served.`
                : publication.status === "failed"
                  ? `${publication.failedReason ?? "The latest rebuild failed."} Previously served revision remains active.`
                  : (publication.message ?? "Public outputs use this served program release.")}
            </span>
          </div>
          <div className={workspaceStyles.statusItem}>
            <span className={workspaceStyles.statusLabel}>Publication state</span>
            <strong>{statusLabel}</strong>
            <span className={workspaceStyles.muted}>
              {publication.pendingRevision === null
                ? "No pending rebuild."
                : `Pending rebuild revision ${publication.pendingRevision}.`}
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CodePanel({
  settings,
  publication,
}: Readonly<{
  settings: EmbedSnippetSettings;
  publication: EmbedPublicationMetadata;
}>) {
  const iframe = iframeSnippet(settings);
  const script = scriptSnippet(settings);
  const preview = embedCodePreview(settings);
  const format = outputFormatLabel(settings.outputFormat ?? "styled-html");
  const revision = publication.servedRevision;
  const publicUrl = publicEmbedUrl(settings);
  const jsonUrl = publicAgendaJsonUrl(settings);
  const calendarUrl = publicAgendaCalendarUrl(settings);

  return (
    <Card aria-labelledby="embed-code-heading">
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <p className={styles.panelEyebrow}>Sharing and exports</p>
            <CardTitle id="embed-code-heading">Share or embed</CardTitle>
            <CardDescription>
              Copy the public link, calendar feeds, or website embed code for this widget.
            </CardDescription>
          </div>
          {revision !== null ? <Badge variant="outline">Program revision {revision}</Badge> : null}
          {revision !== null ? (
            <p className={workspaceStyles.muted}>
              Served program revision {revision} is used by every output.
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={workspaceStyles.sectionStack}>
        <div className={workspaceStyles.shareBlock}>
          <div className={workspaceStyles.cardHeadingRow}>
            <div>
              <h3 className={workspaceStyles.subheading}>Live public URL</h3>
              <p className={workspaceStyles.muted}>
                Anyone with this link can open the confirmed public revision.
              </p>
            </div>
            <Badge variant="secondary">Revision {revision}</Badge>
          </div>
          <Input aria-label="Live public embed URL" readOnly value={publicUrl} />
          <div className={workspaceStyles.actionRow}>
            <CopyButton label="public URL" value={publicUrl} />
            <Button asChild variant="outline">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                Open public view ↗
              </a>
            </Button>
          </div>
        </div>

        <div className={workspaceStyles.codeBlock}>
          <div>
            <h3 className={workspaceStyles.subheading}>JSON feed</h3>
            <p className={workspaceStyles.muted}>
              Machine-readable published agenda using this configuration and program revision.
            </p>
          </div>
          <Input aria-label="JSON feed URL" readOnly value={jsonUrl} />
          <CopyButton label="JSON feed URL" value={jsonUrl} />
        </div>

        <div className={workspaceStyles.codeBlock}>
          <div>
            <h3 className={workspaceStyles.subheading}>iCal feed</h3>
            <p className={workspaceStyles.muted}>
              Calendar output using this configuration and program revision.
            </p>
          </div>
          <Input aria-label="iCal feed URL" readOnly value={calendarUrl} />
          <CopyButton label="iCal feed URL" value={calendarUrl} />
        </div>

        <Collapsible>
          <div className={workspaceStyles.developerDisclosure}>
            <div>
              <h3 className={workspaceStyles.subheading}>Developer embed code</h3>
              <p className={workspaceStyles.muted}>
                Iframe, script, and {format} output for websites that accept embed markup.
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline">Show code</Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent forceMount className={workspaceStyles.developerContent}>
            <div className={workspaceStyles.codeBlock}>
              <div>
                <h3 className={workspaceStyles.subheading}>Code preview · {format}</h3>
                <p className={workspaceStyles.muted}>
                  Safe options are encoded in the public URL; no private fields or executable custom
                  CSS are copied.
                </p>
              </div>
              <ScrollArea className={workspaceStyles.codeScroll}>
                <textarea
                  aria-label="Embed code preview"
                  readOnly
                  value={preview}
                  rows={8}
                  className={workspaceStyles.codeArea}
                />
              </ScrollArea>
              <CopyButton label="code preview" value={preview} />
            </div>

            <div className={workspaceStyles.codeBlock}>
              <div>
                <h3 className={workspaceStyles.subheading}>Iframe snippet</h3>
                <p className={workspaceStyles.muted}>
                  Paste this sandboxed, responsive iframe into a page that accepts HTML.
                </p>
              </div>
              <textarea
                aria-label="Iframe embed snippet"
                readOnly
                value={iframe}
                rows={6}
                className={workspaceStyles.codeArea}
              />
              <CopyButton label="iframe code" value={iframe} />
            </div>

            {settings.widget.scriptView ? (
              <div className={workspaceStyles.codeBlock}>
                <div>
                  <h3 className={workspaceStyles.subheading}>Script snippet</h3>
                  <p className={workspaceStyles.muted}>
                    Use the fixed loader for supported Agenda and Speaker Gallery views.
                  </p>
                </div>
                <textarea
                  aria-label="Script embed snippet"
                  readOnly
                  value={script}
                  rows={6}
                  className={workspaceStyles.codeArea}
                />
                <CopyButton label="script code" value={script} />
              </div>
            ) : (
              <Alert>
                <AlertTitle>Iframe mode is the supported option for this widget.</AlertTitle>
                <AlertDescription>
                  The script loader supports Agenda and Speaker Gallery. Use the generated iframe
                  for this view.
                </AlertDescription>
              </Alert>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export function MissingPublicProjection({
  organizationId,
  eventId,
  publication,
  settingsAvailable = true,
}: Readonly<{
  organizationId: string;
  eventId: string;
  publication: EmbedPublicationMetadata;
  settingsAvailable?: boolean;
}>) {
  const checking = publication.status === "loading";
  const needsConfiguration =
    (publication.status === "served" ||
      publication.status === "pending" ||
      publication.status === "failed") &&
    !settingsAvailable;
  const title = checking
    ? "Checking publishing status"
    : needsConfiguration
      ? "Save and enable this widget to preview it"
      : publication.status === "failed"
        ? "The latest update could not be published"
        : publication.status === "pending"
          ? "Your previous version is still live"
          : publication.status === "unavailable"
            ? "Couldn’t check publishing status"
            : publication.status === "none"
              ? "Publish your agenda to preview this widget"
              : "Preview is not ready yet";
  const description = needsConfiguration
    ? "The public program is ready. Save this configuration and keep it enabled to generate its verified preview and embed code."
    : publication.status === "none"
      ? "Embeds use your published program, not the organizer draft. Review the agenda and publish it to create the public preview."
      : checking
        ? "Eventloom is confirming which program revision is live."
        : (publication.message ??
          publication.failedReason ??
          "Preview and sharing remain unavailable until the live program revision is confirmed.");
  const exceptional =
    !needsConfiguration &&
    (publication.status === "failed" || publication.status === "unavailable");

  const agendaHref = `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`;

  if (exceptional) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Empty className={workspaceStyles.previewEmpty}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {!checking && !needsConfiguration ? (
          <Button asChild size="sm">
            <Link href={agendaHref}>Review and publish agenda</Link>
          </Button>
        ) : null}
        <p className={workspaceStyles.muted}>
          Sharing links and embed code will appear here when the widget is ready.
        </p>
      </EmptyContent>
    </Empty>
  );
}
export function EmbedPreview({
  organizationId,
  eventId,
  eventVersion,
  publication,
  widget,
  settings,
  previewUrl,
  previewNonce,
  canDistribute,
  onWidgetChange,
}: Readonly<{
  organizationId: string;
  eventId: string;
  eventVersion: number | null;
  publication: EmbedPublicationMetadata;
  widget: EmbedWidgetDefinition;
  settings: EmbedSnippetSettings | null;
  previewUrl: string;
  previewNonce: number;
  canDistribute: boolean;
  onWidgetChange: (value: EmbedWidgetId) => void;
}>) {
  return (
    <section className={workspaceStyles.widgetStudio} aria-label="Widget preview studio">
      <Card aria-labelledby="embed-preview-heading">
        <CardHeader className={workspaceStyles.previewHeader}>
          <div className={workspaceStyles.cardHeadingRow}>
            <div>
              <p className={styles.panelEyebrow}>Public widget preview</p>
              <CardTitle id="embed-preview-heading">{widget.label}</CardTitle>
              <CardDescription>
                Select a widget below to use the full page width for its verified public preview.
              </CardDescription>
            </div>
            <fieldset className={workspaceStyles.previewActions} aria-label="Preview actions">
              <CopyButton label="public URL" value={previewUrl} />
              {canDistribute && previewUrl ? (
                <>
                  <Button asChild variant="outline">
                    <a href={previewUrl} target="_blank" rel="noreferrer">
                      Open public view ↗
                    </a>
                  </Button>
                  <Button asChild variant="secondary">
                    <a href="#embed-code-heading">Get embed code</a>
                  </Button>
                </>
              ) : (
                <Button variant="secondary" type="button" disabled>
                  Get embed code
                </Button>
              )}
            </fieldset>
          </div>

          <PublicationStatus eventVersion={eventVersion} publication={publication} />
          <WidgetChooser selected={widget.id} onChange={onWidgetChange} />
        </CardHeader>
        <CardContent>
          {canDistribute ? (
            <iframe
              key={`${previewUrl}-${previewNonce}`}
              src={previewUrl}
              title={`Live preview: ${widget.label}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox={iframeSandbox(widget)}
              className={workspaceStyles.previewFrame}
            />
          ) : (
            <MissingPublicProjection
              organizationId={organizationId}
              eventId={eventId}
              publication={publication}
              settingsAvailable={canDistribute}
            />
          )}
        </CardContent>
      </Card>
      {canDistribute && settings ? (
        <CodePanel settings={settings} publication={publication} />
      ) : null}
    </section>
  );
}
export function EmbedWorkspaceNotices({
  eventName,
  loading,
  errorMessage,
  normalizedSlug,
  origin,
  onRetry,
}: Readonly<{
  eventName: string | undefined;
  loading: boolean;
  errorMessage: string | null;
  normalizedSlug: string | null;
  origin: string;
  onRetry: (() => void) | undefined;
}>) {
  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Public distribution</p>
          <h1 className={styles.pageTitle}>Embed widgets</h1>
          <p className={styles.pageDescription}>
            Create and preview public widgets from {eventName ? `${eventName}’s` : "this event’s"}{" "}
            latest published program.
          </p>
        </div>
      </header>

      <Alert className={workspaceStyles.boundaryAlert}>
        <AlertTitle>Published data only</AlertTitle>
        <AlertDescription>
          Embeds include the published agenda and speaker information you choose. Draft sessions,
          reviews, contact details, and private files stay private.
        </AlertDescription>
      </Alert>

      {loading ? (
        <Alert>
          <AlertTitle>Loading event context</AlertTitle>
          <AlertDescription>
            Embed configuration and publication metadata are loaded from the organizer event record
            and public projection.
          </AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Embed workspace unavailable</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
          {onRetry !== undefined ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              Retry loading event
            </Button>
          ) : null}
        </Alert>
      ) : null}
      {!loading && !errorMessage && !normalizedSlug ? (
        <Alert variant="destructive">
          <AlertTitle>No public event slug</AlertTitle>
          <AlertDescription>
            Configure a public event slug before generating a public URL. The event ID is never used
            as a guessed public path.
          </AlertDescription>
        </Alert>
      ) : null}
      {!loading && !errorMessage && normalizedSlug && !origin ? (
        <Alert variant="destructive">
          <AlertTitle>Public app URL is not configured</AlertTitle>
          <AlertDescription>
            Set NEXT_PUBLIC_APP_URL to the approved web origin before copying embed code.
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
