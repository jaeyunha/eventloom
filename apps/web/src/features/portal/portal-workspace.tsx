"use client";

import { type FormEvent, Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import styles from "./portal.module.css";
import {
  assetPointerLabels,
  portalFileStatus,
  portalReviewStatus,
  resolvePortalAssetFamily,
} from "./portal-assets";
import { portalContextLabel, usePortal } from "./portal-provider";
import type {
  PortalAsset,
  PortalAssetHistoryEntry,
  PortalFormAnswer,
  PortalFormField,
  PortalResource,
  PortalRosterMember,
  PortalTask,
  PortalWikiPage,
} from "./types";

export type PortalWorkspaceSection = "co-speakers" | "files" | "tasks" | "resources" | "wiki";

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unknown size";
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 * 1_024) return `${Math.round(value / 1_024)} KB`;
  return `${(value / (1_024 * 1_024)).toFixed(1)} MB`;
}
type PortalUploadTask = PortalTask & {
  readonly allowedMimeTypes?: readonly string[];
  readonly maxBytes?: number;
  readonly maxSizeBytes?: number;
};

function uploadTaskPolicy(task: PortalTask): PortalUploadTask {
  return task as PortalUploadTask;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown time";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function mimeMatches(file: File, allowed: readonly string[]): boolean {
  const contentType = file.type.trim().toLowerCase();
  return allowed.some((value) => {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === contentType ||
      (normalized.endsWith("/*") && contentType.startsWith(normalized.slice(0, -1)))
    );
  });
}

function formatDate(value: string | undefined): string {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function safeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://portal.invalid");
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

type SafeMarkupNode = {
  readonly id: string;
  readonly tag: string | null;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: SafeMarkupNode[];
  readonly text?: string;
  readonly blocked?: boolean;
};

const blockedMarkupTags = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "template",
]);

const voidMarkupTags = new Set(["br", "hr"]);

function decodeMarkupEntities(value: string): string {
  const entities: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#(?:x[\da-f]+|\d+)|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, reference: string) => {
      if (reference.startsWith("#")) {
        const hexadecimal = reference[1]?.toLowerCase() === "x";
        const digits = reference.slice(hexadecimal ? 2 : 1);
        const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
        return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return entities[reference.toLowerCase()] ?? entity;
    },
  );
}

function markupAttributes(source: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    if (name !== "href") continue;
    const value = match[2] ?? match[3] ?? match[4];
    if (value !== undefined) attributes.href = decodeMarkupEntities(value);
  }
  return attributes;
}

function parseSafeMarkup(value: string | undefined): readonly SafeMarkupNode[] {
  if (!value) return [];
  const root: SafeMarkupNode = {
    id: "safe-root",
    tag: null,
    attributes: {},
    children: [],
  };
  const stack: SafeMarkupNode[] = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+/gi;
  for (const match of value.matchAll(tokenPattern)) {
    const token = match[0];
    const parent = stack[stack.length - 1];
    if (!parent || token.startsWith("<!--")) continue;
    if (token.startsWith("</")) {
      const closingTag = token.match(/^<\/\s*([a-z][a-z0-9-]*)/i)?.[1]?.toLowerCase();
      if (!closingTag) continue;
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index]?.tag === closingTag) {
          stack.splice(index);
          break;
        }
      }
      continue;
    }
    const openingTag = token.match(/^<\s*([a-z][a-z0-9-]*)\b([^>]*)>/i);
    if (!openingTag) {
      parent.children.push({
        id: `safe-text-${match.index}`,
        tag: null,
        attributes: {},
        children: [],
        text: decodeMarkupEntities(token),
      });
      continue;
    }
    const tag = openingTag[1]?.toLowerCase();
    if (!tag) continue;
    const node: SafeMarkupNode = {
      id: `safe-${match.index}`,
      tag,
      attributes: markupAttributes(openingTag[2] ?? ""),
      children: [],
      blocked: blockedMarkupTags.has(tag),
    };
    parent.children.push(node);
    if (!voidMarkupTags.has(tag)) stack.push(node);
  }
  return root.children;
}

function renderSafeMarkup(nodes: readonly SafeMarkupNode[]): ReactNode {
  return nodes.map((node) => {
    if (node.text !== undefined) {
      return <Fragment key={node.id}>{node.text}</Fragment>;
    }
    const children = renderSafeMarkup(node.children);
    if (node.blocked || node.tag === null) {
      return <Fragment key={node.id}>{children}</Fragment>;
    }
    switch (node.tag) {
      case "a": {
        const href = safeUrl(node.attributes.href);
        return href ? (
          <a key={node.id} href={href}>
            {children}
          </a>
        ) : (
          <Fragment key={node.id}>{children}</Fragment>
        );
      }
      case "b":
      case "strong":
        return <strong key={node.id}>{children}</strong>;
      case "blockquote":
        return <blockquote key={node.id}>{children}</blockquote>;
      case "br":
        return <br key={node.id} />;
      case "code":
        return <code key={node.id}>{children}</code>;
      case "del":
      case "s":
        return <del key={node.id}>{children}</del>;
      case "div":
        return <div key={node.id}>{children}</div>;
      case "em":
      case "i":
        return <em key={node.id}>{children}</em>;
      case "h1":
        return <h1 key={node.id}>{children}</h1>;
      case "h2":
        return <h2 key={node.id}>{children}</h2>;
      case "h3":
        return <h3 key={node.id}>{children}</h3>;
      case "h4":
        return <h4 key={node.id}>{children}</h4>;
      case "h5":
        return <h5 key={node.id}>{children}</h5>;
      case "h6":
        return <h6 key={node.id}>{children}</h6>;
      case "hr":
        return <hr key={node.id} />;
      case "li":
        return <li key={node.id}>{children}</li>;
      case "mark":
        return <mark key={node.id}>{children}</mark>;
      case "ol":
        return <ol key={node.id}>{children}</ol>;
      case "p":
        return <p key={node.id}>{children}</p>;
      case "pre":
        return <pre key={node.id}>{children}</pre>;
      case "small":
        return <small key={node.id}>{children}</small>;
      case "span":
        return <span key={node.id}>{children}</span>;
      case "table":
        return <table key={node.id}>{children}</table>;
      case "tbody":
        return <tbody key={node.id}>{children}</tbody>;
      case "td":
        return <td key={node.id}>{children}</td>;
      case "tfoot":
        return <tfoot key={node.id}>{children}</tfoot>;
      case "th":
        return <th key={node.id}>{children}</th>;
      case "thead":
        return <thead key={node.id}>{children}</thead>;
      case "tr":
        return <tr key={node.id}>{children}</tr>;
      case "ul":
        return <ul key={node.id}>{children}</ul>;
      case "u":
        return <u key={node.id}>{children}</u>;
      default:
        return <Fragment key={node.id}>{children}</Fragment>;
    }
  });
}

function safeHtml(value: string | undefined): ReactNode {
  if (!value?.trim()) return null;
  return renderSafeMarkup(parseSafeMarkup(value));
}

function WorkspaceState({
  title,
  description,
  action,
}: Readonly<{ title: string; description: string; action?: ReactNode }>) {
  return (
    <section className={styles.statePanel} role="status" aria-live="polite">
      <span className={styles.stateIcon} aria-hidden="true">
        ◇
      </span>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </section>
  );
}

function WorkspaceError() {
  const { workspaceError, clearWorkspaceError, loadWorkspace } = usePortal();
  if (!workspaceError) return null;
  const expired = /expired|replay|single-use/i.test(workspaceError);
  return (
    <div className={styles.inlineError} role="alert">
      <p>
        {expired
          ? "This secure workspace link has expired. Request a fresh link and try again."
          : workspaceError}
      </p>
      <span>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void loadWorkspace()}
        >
          Retry
        </button>{" "}
        <button type="button" className={styles.tertiaryButton} onClick={clearWorkspaceError}>
          Dismiss
        </button>
      </span>
    </div>
  );
}

function WorkspaceMutationError() {
  const { mutationError, clearMutationError } = usePortal();
  if (!mutationError) return null;
  return (
    <div className={styles.inlineError} role="alert" aria-label="Portal workspace error">
      <p>{mutationError}</p>
      <button type="button" onClick={clearMutationError} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}

export function PortalWorkspace({ section }: Readonly<{ section: PortalWorkspaceSection }>) {
  const { context, view, loading, error, workspaceLoading, loadWorkspace, reload } = usePortal();
  useEffect(() => {
    if (context && view) void loadWorkspace();
  }, [context, loadWorkspace, view]);
  if (loading && !view) {
    return (
      <WorkspaceState
        title="Loading your participant workspace"
        description="Retrieving your authorized sessions, files, forms, and published resources."
      />
    );
  }
  if (error && !view) {
    return (
      <WorkspaceState
        title="We could not load your workspace"
        description={error}
        action={
          <button className={styles.primaryButton} type="button" onClick={() => void reload()}>
            Try again
          </button>
        }
      />
    );
  }
  if (!context || !view) {
    return (
      <WorkspaceState
        title="Your speaker workspace is not open yet"
        description="Track your proposal in My submissions. Profile, tasks, and files unlock after an organizer accepts it."
        action={
          <a className={styles.primaryButton} href="/portal/submissions">
            View my submissions
          </a>
        }
      />
    );
  }
  return (
    <>
      <header className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Participant workspace</p>
          <h1>{portalContextLabel(context)}</h1>
          <p>
            Manage accepted sessions, private files, upload tasks, forms, and event-published
            guidance.
          </p>
        </div>
      </header>
      <WorkspaceError />
      <WorkspaceMutationError />
      {workspaceLoading ? (
        <div role="status" aria-live="polite" className={styles.toolbarDescription}>
          <span className={styles.spinner} aria-hidden="true" />
          Refreshing workspace…
        </div>
      ) : null}
      <section aria-label={`${section} workspace`}>
        {section === "co-speakers" ? <CoSpeakersWorkspace /> : null}
        {section === "files" ? <FilesWorkspace /> : null}
        {section === "resources" ? <PublishedResources /> : null}
        {section === "tasks" ? <TasksWorkspace /> : null}
        {section === "wiki" ? <PublishedWiki /> : null}
      </section>
    </>
  );
}

function CoSpeakersWorkspace() {
  const {
    context,
    view,
    workspace,
    can,
    busyRoster,
    addRosterEntry,
    updateRosterEntry,
    removeRosterEntry,
  } = usePortal();
  const submissions = useMemo(
    () => (view?.submissions ?? []).filter((submission) => submission.status === "accepted"),
    [view?.submissions],
  );
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!context) return;
    setSelectedSubmissionId(submissions[0]?.id ?? "");
    setEditingParticipantId(null);
  }, [context, submissions]);

  const roster = workspace.rosters[selectedSubmissionId];
  const entries = roster?.members ?? [];
  const selectedSubmission = submissions.find(
    (submission) => submission.id === selectedSubmissionId,
  );
  const canManageRoster = can("roster-manage") && (roster?.capabilities.manage ?? false);
  const canInvite = canManageRoster && (roster?.capabilities.invite ?? false);

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = displayName.trim();
    const cleanEmail = email.trim();
    if (!selectedSubmissionId || cleanName.length === 0 || cleanEmail.length === 0) {
      setFormError("Name, email, and an accepted session are required.");
      return;
    }
    setFormError(null);
    const saved = await addRosterEntry({
      submissionId: selectedSubmissionId,
      displayName: cleanName,
      email: cleanEmail,
      role: "co_speaker",
    });
    if (saved) {
      setDisplayName("");
      setEmail("");
    }
  }

  async function saveEdit(entry: PortalRosterMember) {
    const cleanName = editingName.trim();
    if (!cleanName) {
      setFormError("A co-speaker name is required.");
      return;
    }
    setFormError(null);
    if (
      await updateRosterEntry({
        submissionId: selectedSubmissionId,
        participantId: entry.participantId,
        displayName: cleanName,
      })
    ) {
      setEditingParticipantId(null);
    }
  }

  async function revoke(entry: PortalRosterMember) {
    if (!window.confirm(`Remove ${entry.displayName} from this session?`)) return;
    await removeRosterEntry({
      submissionId: selectedSubmissionId,
      participantId: entry.participantId,
    });
  }

  if (submissions.length === 0) {
    return (
      <WorkspaceState
        title="No accepted sessions yet"
        description="Co-speaker management becomes available when a session is accepted."
      />
    );
  }

  return (
    <div className={styles.taskWorkspace}>
      <section className={styles.panel} aria-labelledby="co-speaker-heading">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>Accepted session</p>
            <h2 id="co-speaker-heading">Co-speakers</h2>
          </div>
          <label className={styles.readOnlyField}>
            <span>Session</span>
            <select
              value={selectedSubmissionId}
              onChange={(event) => setSelectedSubmissionId(event.currentTarget.value)}
              aria-label="Select accepted session"
            >
              {submissions.map((submission) => (
                <option key={submission.id} value={submission.id}>
                  {submission.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.toolbarDescription}>
          Only participants authorized for this accepted session are shown.
        </p>
        {entries.length === 0 ? (
          <WorkspaceState
            title="No co-speakers added"
            description="Add collaborators who should appear on this accepted session."
          />
        ) : (
          <ul className={styles.taskSummaryList} aria-label="Co-speaker roster">
            {entries.map((entry) => (
              <li key={entry.participantId}>
                <span className={styles.taskCheck} aria-hidden="true">
                  {entry.status === "active" ? "✓" : "○"}
                </span>
                <div>
                  {editingParticipantId === entry.participantId ? (
                    <label className={styles.taskNoteField}>
                      <span>Name</span>
                      <input
                        value={editingName}
                        onChange={(event) => setEditingName(event.currentTarget.value)}
                        aria-label={`Edit ${entry.displayName}`}
                      />
                    </label>
                  ) : (
                    <>
                      <h3>{entry.displayName}</h3>
                      <p>
                        {entry.role.replaceAll("_", " ")} · {entry.status}
                      </p>
                    </>
                  )}
                </div>
                {canManageRoster &&
                (editingParticipantId === entry.participantId
                  ? true
                  : entry.capabilities.edit || entry.capabilities.remove) ? (
                  <span>
                    {editingParticipantId === entry.participantId ? (
                      <>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          disabled={busyRoster}
                          onClick={() => void saveEdit(entry)}
                        >
                          Save
                        </button>{" "}
                        <button
                          className={styles.tertiaryButton}
                          type="button"
                          onClick={() => setEditingParticipantId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {entry.capabilities.edit ? (
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={busyRoster}
                            onClick={() => {
                              setEditingParticipantId(entry.participantId);
                              setEditingName(entry.displayName);
                            }}
                          >
                            Edit
                          </button>
                        ) : null}
                        {entry.capabilities.remove ? (
                          <button
                            className={styles.tertiaryButton}
                            type="button"
                            disabled={busyRoster || entry.status === "revoked"}
                            onClick={() => void revoke(entry)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </>
                    )}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canInvite ? (
          <form className={styles.profileForm} onSubmit={(event) => void submitEntry(event)}>
            <h3>Add a co-speaker</h3>
            <label className={styles.readOnlyField}>
              <span>Name</span>
              <input
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
              />
            </label>
            <label className={styles.readOnlyField}>
              <span>Email</span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </label>
            {formError ? <p className={styles.fieldError}>{formError}</p> : null}
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={busyRoster || !selectedSubmission}
            >
              {busyRoster ? "Saving…" : "Add co-speaker"}
            </button>
          </form>
        ) : (
          <p className={styles.toolbarDescription}>Roster changes are disabled for this context.</p>
        )}
      </section>
    </div>
  );
}

export interface PortalAssetVersionFamily {
  id: string;
  kind: PortalAsset["kind"];
  versions: readonly PortalAsset[];
  current: PortalAsset;
}

function compareAssetVersions(left: PortalAsset, right: PortalAsset): number {
  const versionDifference = (left.version ?? 0) - (right.version ?? 0);
  if (versionDifference !== 0) return versionDifference;
  const createdDifference = left.createdAt.localeCompare(right.createdAt);
  return createdDifference !== 0 ? createdDifference : left.id.localeCompare(right.id);
}

export function groupPortalAssetVersions(
  assets: readonly PortalAsset[],
): PortalAssetVersionFamily[] {
  const grouped = new Map<string, PortalAsset[]>();
  for (const asset of assets) {
    const familyId = asset.versionFamilyId ?? asset.id;
    const family = grouped.get(familyId);
    if (family) family.push(asset);
    else grouped.set(familyId, [asset]);
  }

  return [...grouped.entries()]
    .map(([id, entries]) => {
      const versions = [...entries].sort(compareAssetVersions);
      const current = versions.at(-1);
      if (!current) {
        throw new Error("Asset version families cannot be empty.");
      }
      return { id, kind: current.kind, versions, current };
    })
    .sort((left, right) => compareAssetVersions(right.current, left.current));
}

function mergedAssetVersions(
  family: PortalAssetVersionFamily,
  loaded: readonly PortalAssetHistoryEntry[],
): PortalAsset[] {
  const byId = new Map<string, PortalAsset>();
  for (const asset of [...loaded, ...family.versions]) byId.set(asset.id, asset);
  return [...byId.values()].sort(compareAssetVersions);
}

function FilesWorkspace() {
  const {
    context,
    view,
    workspace,
    can,
    busyAssetIds,
    uploadWorkspaceFile,
    retryAssetUpload,
    completeAssetUpload,
    loadAssetHistory,
    loadAssetComments,
    downloadAsset,
    addAssetComment,
  } = usePortal();
  const [kind, setKind] = useState<PortalAsset["kind"]>("supporting_file");
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const families = useMemo(() => groupPortalAssetVersions(workspace.assets), [workspace.assets]);
  const selectedFamily = families.find((family) => family.id === selectedFamilyId);
  useEffect(() => {
    if (!context) return;
    setSelectedFile(null);
    setSelectedFamilyId("");
    setExpandedFamily(null);
    setCommentDraft("");
  }, [context]);
  useEffect(() => {
    if (selectedFamily && selectedFamily.kind !== kind) setKind(selectedFamily.kind);
  }, [kind, selectedFamily]);
  useEffect(() => {
    if (selectedFamilyId && !selectedFamily) setSelectedFamilyId("");
  }, [selectedFamily, selectedFamilyId]);
  const participantId = context?.primaryParticipantId ?? view?.profiles[0]?.participantId;
  const defaultSubmissionId = view?.submissions.find(
    (submission) => submission.status === "accepted",
  )?.id;
  const submissionId = selectedFamily?.current.submissionId ?? defaultSubmissionId;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || !participantId) return;
    const didUpload = await uploadWorkspaceFile({
      participantId,
      ...(submissionId === undefined ? {} : { submissionId }),
      kind,
      file: selectedFile,
      ...(selectedFamily === undefined ? {} : { supersedesAssetId: selectedFamily.current.id }),
    });
    if (didUpload) setSelectedFile(null);
  }

  async function toggleDetails(family: PortalAssetVersionFamily, open: boolean) {
    setExpandedFamily(open ? family.id : null);
    if (open) {
      await Promise.all([
        loadAssetHistory(family.current.id),
        loadAssetComments(family.current.id),
      ]);
    }
  }

  async function download(asset: PortalAsset) {
    if (asset.state !== "ready") return;
    const grant = await downloadAsset(asset.id);
    if (grant && typeof window !== "undefined") window.location.assign(grant.url);
  }

  async function comment(event: FormEvent<HTMLFormElement>, asset: PortalAsset) {
    event.preventDefault();
    const body = commentDraft.trim();
    if (!body) return;
    if (await addAssetComment({ assetId: asset.id, body })) setCommentDraft("");
  }

  if (!can("asset-read")) {
    return (
      <WorkspaceState
        title="Files are unavailable"
        description="This event context did not grant file access."
      />
    );
  }

  return (
    <div className={styles.taskWorkspace}>
      {can("asset-write") ? (
        <form
          className={styles.panel}
          onSubmit={(event) => void upload(event)}
          aria-labelledby="upload-heading"
        >
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Standalone private upload</p>
              <h2 id="upload-heading">Upload another private file</h2>
            </div>
            <span className={styles.toolbarDescription}>
              Files stay private to authorized participants.
            </span>
          </div>
          <p className={styles.blockedNotice}>
            This uploads a private file but does not complete a content request. Open Requests &amp;
            tasks to respond to an event-team request.
          </p>
          <label className={styles.readOnlyField}>
            <span>Version family</span>
            <select
              value={selectedFamilyId}
              onChange={(event) => setSelectedFamilyId(event.currentTarget.value)}
            >
              <option value="">New file</option>
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.current.fileName} · {family.kind.replaceAll("_", " ")} · latest upload v
                  {family.current.version ?? "?"}
                </option>
              ))}
            </select>
            <small>Choose an existing family to supersede its current version.</small>
          </label>
          <label className={styles.readOnlyField}>
            <span>File type</span>
            <select
              value={kind}
              onChange={(event) => {
                const nextKind = event.currentTarget.value as PortalAsset["kind"];
                setKind(nextKind);
                if (selectedFamily && selectedFamily.kind !== nextKind) setSelectedFamilyId("");
              }}
            >
              <option value="headshot">Headshot</option>
              <option value="slides">Slides</option>
              <option value="supporting_file">Supporting file</option>
            </select>
          </label>
          <label className={styles.fileField}>
            <span>Choose file</span>
            <input
              required
              type="file"
              onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
            />
            <small>{selectedFile?.name ?? "No file selected"}</small>
          </label>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={!selectedFile || !participantId || busyAssetIds.size > 0}
          >
            {selectedFamily ? "Upload new version" : "Upload privately"}
          </button>
        </form>
      ) : null}

      <section className={styles.panel} aria-labelledby="files-heading">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>File history</p>
            <h2 id="files-heading">Uploaded files</h2>
          </div>
          <span>{families.length} version families</span>
        </div>
        {families.length === 0 ? (
          <WorkspaceState
            title="No files yet"
            description="Uploaded headshots, slides, and supporting files appear here."
          />
        ) : (
          <div className={styles.taskWorkspace}>
            {families.map((family) => {
              const asset = family.current;
              const versions = mergedAssetVersions(
                family,
                workspace.assetHistories[asset.id] ?? [],
              );
              const resolution = resolvePortalAssetFamily(versions, asset);
              const latestAsset = resolution.latest ?? asset;
              const currentAsset = resolution.current;
              const displayAsset = currentAsset ?? latestAsset;
              return (
                <article
                  key={family.id}
                  className={styles.taskCard}
                  aria-labelledby={`asset-${family.id}`}
                >
                  <div className={styles.taskCardHeader}>
                    <div className={styles.documentIcon} aria-hidden="true">
                      ▧
                    </div>
                    <div className={styles.taskTitle}>
                      <p>{displayAsset.kind.replaceAll("_", " ")}</p>
                      <h3 id={`asset-${family.id}`}>{displayAsset.fileName}</h3>
                    </div>
                    <span className={styles.badge}>
                      {currentAsset === undefined
                        ? "Version status unavailable"
                        : `Current v${currentAsset.version ?? "?"}`}
                    </span>
                  </div>
                  <div className={styles.taskMetadata}>
                    <span>
                      <strong>File status</strong> {portalFileStatus(latestAsset)}
                    </span>
                    <span>
                      <strong>Review status</strong> {portalReviewStatus(currentAsset)}
                    </span>
                    <span>
                      <strong>Size</strong> {formatBytes(displayAsset.sizeBytes)}
                    </span>
                    <span>
                      <strong>Uploaded</strong> {formatDate(latestAsset.createdAt)}
                    </span>
                    <span>
                      <strong>Versions</strong> {versions.length}
                    </span>
                  </div>
                  {resolution.status === "pending" && currentAsset !== undefined ? (
                    <p className={styles.blockedNotice}>
                      Version {latestAsset.version ?? "?"} is still processing. Version{" "}
                      {currentAsset.version ?? "?"} remains current.
                    </p>
                  ) : null}
                  {resolution.pointers.status !== "ready" ? (
                    <p className={styles.blockedNotice} role="status">
                      Version status unavailable. Current-version actions stay disabled until
                      authoritative pointers are available.
                    </p>
                  ) : null}
                  <footer className={styles.taskCardFooter}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={
                        currentAsset === undefined ||
                        currentAsset.state !== "ready" ||
                        busyAssetIds.has(currentAsset.id)
                      }
                      onClick={() => currentAsset && void download(currentAsset)}
                    >
                      Download current version
                    </button>
                    <details
                      open={expandedFamily === family.id}
                      onToggle={(event) => void toggleDetails(family, event.currentTarget.open)}
                    >
                      <summary>Version history and comments</summary>
                      <AssetDetails
                        asset={latestAsset}
                        versions={versions}
                        comments={workspace.assetComments[latestAsset.id] ?? []}
                        canComment={can("asset-comment")}
                        canCompleteUpload={can("asset-write")}
                        busy={busyAssetIds.has(latestAsset.id)}
                        onRetryUpload={(file) =>
                          void retryAssetUpload({ assetId: latestAsset.id, file })
                        }
                        onCompleteUpload={() =>
                          void completeAssetUpload({ assetId: latestAsset.id })
                        }
                        onDownload={(version) => void download(version)}
                        commentDraft={commentDraft}
                        onCommentDraftChange={setCommentDraft}
                        onComment={(event) => void comment(event, latestAsset)}
                      />
                    </details>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function AssetDetails({
  asset,
  versions,
  comments,
  canComment,
  canCompleteUpload,
  busy,
  onRetryUpload,
  onCompleteUpload,
  onDownload,
  commentDraft,
  onCommentDraftChange,
  onComment,
}: Readonly<{
  asset: PortalAsset;
  versions: readonly PortalAsset[];
  comments: readonly {
    id: string;
    body: string;
    authorLabel: string;
    createdAt: string;
    assetId?: string;
    version?: number;
  }[];
  canComment: boolean;
  canCompleteUpload: boolean;
  busy: boolean;
  onRetryUpload: (file: File) => void;
  onCompleteUpload: () => void;
  onDownload: (asset: PortalAsset) => void;
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  onComment: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  const resolution = resolvePortalAssetFamily(versions, asset);
  return (
    <div className={styles.profileForm}>
      <h4>Immutable version history</h4>
      {versions.length === 0 ? (
        <p className={styles.toolbarDescription}>No prior versions.</p>
      ) : null}
      <ol>
        {versions.map((version) => {
          const pointerLabels = assetPointerLabels(version, resolution.pointers);
          return (
            <li key={version.id}>
              <span>
                {`Version ${version.version ?? "?"} · ${version.fileName} · ${portalFileStatus(version)} · ${formatDate(version.createdAt)}`}
              </span>{" "}
              {pointerLabels.length > 0 ? (
                pointerLabels.map((label) => <strong key={label}> {label}</strong>)
              ) : (
                <span> Previous version</span>
              )}{" "}
              <span>Review: {portalReviewStatus(version)}</span>{" "}
              <button
                className={styles.tertiaryButton}
                type="button"
                disabled={version.state !== "ready" || busy}
                onClick={() => onDownload(version)}
              >
                Download version {version.version ?? "?"}
              </button>
            </li>
          );
        })}
      </ol>
      {canCompleteUpload && asset.state === "pending_upload" ? (
        <div className={styles.formActions}>
          <div>
            <p className={styles.toolbarDescription}>
              Choose the same file to retry a failed or expired transfer. A successful retry is
              finalized automatically; event-team approval happens separately.
            </p>
            <label className={styles.fileField}>
              <span>Retry file upload</span>
              <input
                type="file"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onRetryUpload(file);
                  event.currentTarget.value = "";
                }}
              />
              <small>The file name, type, and size must match the pending authorization.</small>
            </label>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy}
              onClick={onCompleteUpload}
            >
              Mark upload complete
            </button>
          </div>
        </div>
      ) : null}
      <h4>Comments</h4>
      {comments.length === 0 ? <p className={styles.toolbarDescription}>No comments yet.</p> : null}
      <ul>
        {comments.map((comment) => (
          <li key={comment.id}>
            <strong>{comment.authorLabel}</strong> ·{" "}
            <time dateTime={comment.createdAt}>{formatTimestamp(comment.createdAt)}</time>
            {comment.assetId && comment.assetId !== asset.id
              ? ` · Version ${comment.version ?? "?"}`
              : ""}
            <p>{comment.body}</p>
          </li>
        ))}
      </ul>
      {canComment ? (
        <form className={styles.taskNoteField} onSubmit={onComment}>
          <label htmlFor={`comment-${asset.id}`}>Add a comment</label>
          <textarea
            id={`comment-${asset.id}`}
            rows={3}
            maxLength={2_000}
            required
            value={commentDraft}
            onChange={(event) => onCommentDraftChange(event.currentTarget.value)}
          />
          <button className={styles.secondaryButton} type="submit" disabled={busy}>
            Post comment
          </button>
        </form>
      ) : null}
    </div>
  );
}

function UploadTaskCard({ task }: Readonly<{ task: PortalTask }>) {
  const { context, workspace, can, busyTaskIds, uploadTask } = usePortal();
  const policyTask = uploadTaskPolicy(task);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const assets = workspace.assets
    .filter((asset) => asset.taskId === task.id)
    .sort(
      (left, right) =>
        (right.version ?? 0) - (left.version ?? 0) || right.createdAt.localeCompare(left.createdAt),
    );
  const currentAsset = assets[0];
  const acceptedKinds = policyTask.acceptedAssetKinds ?? [];
  const kind = acceptedKinds[0];
  const allowedMimeTypes = policyTask.allowedMimeTypes ?? [];
  const maxBytes = policyTask.maxBytes ?? policyTask.maxSizeBytes;
  const busy = busyTaskIds.has(task.id);
  const canUpload =
    can("task-response") &&
    can("asset-write") &&
    kind !== undefined &&
    !["completed", "waived"].includes(task.status);

  useEffect(() => {
    if (!context) return;
    setSelectedFile(null);
    setFormError(null);
    setUploaded(false);
  }, [context]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || kind === undefined) {
      setFormError("Choose a file type accepted by this task.");
      return;
    }
    if (allowedMimeTypes.length > 0 && !mimeMatches(selectedFile, allowedMimeTypes)) {
      setFormError(`This task accepts ${allowedMimeTypes.join(", ")} only.`);
      return;
    }
    if (maxBytes !== undefined && selectedFile.size > maxBytes) {
      setFormError(`This file exceeds the ${formatBytes(maxBytes)} task limit.`);
      return;
    }
    setFormError(null);
    setUploading(true);
    try {
      const didUpload = await uploadTask(task, selectedFile);
      if (!didUpload) return;
      setSelectedFile(null);
      setUploaded(true);
    } finally {
      setUploading(false);
    }
  }

  if (!can("task-response") || !can("asset-write")) {
    return (
      <article className={styles.taskCard}>
        <h2>{task.title}</h2>
        <p>File uploads are not available in this context.</p>
      </article>
    );
  }

  return (
    <article className={styles.taskCard} aria-labelledby={`upload-task-${task.id}`}>
      <div className={styles.taskCardHeader}>
        <div className={styles.documentIcon} aria-hidden="true">
          ▧
        </div>
        <div className={styles.taskTitle}>
          <p>{task.status.replaceAll("_", " ")}</p>
          <h2 id={`upload-task-${task.id}`}>{task.title}</h2>
        </div>
        <span className={styles.badge}>
          {currentAsset === undefined
            ? "No upload"
            : `${currentAsset.state.replaceAll("_", " ")} · v${currentAsset.version ?? "?"}`}
        </span>
      </div>
      {task.description ? <p className={styles.taskDescription}>{task.description}</p> : null}
      <p className={styles.toolbarDescription}>
        Accepted file type{allowedMimeTypes.length === 1 ? "" : "s"}:{" "}
        {allowedMimeTypes.length > 0 ? allowedMimeTypes.join(", ") : "Configured by the server"}.
        {maxBytes === undefined ? "" : ` Maximum size: ${formatBytes(maxBytes)}.`}
        {acceptedKinds.length > 0 ? ` File kind: ${acceptedKinds.join(", ")}.` : ""}
      </p>
      {currentAsset !== undefined ? (
        <p className={styles.toolbarDescription}>
          Latest version {currentAsset.version ?? "?"} uploaded{" "}
          {formatTimestamp(currentAsset.createdAt)}. Older versions remain available in Files.
        </p>
      ) : null}
      {canUpload && kind !== undefined ? (
        <form className={styles.profileForm} onSubmit={(event) => void submit(event)}>
          <label className={styles.fileField}>
            <span>{currentAsset === undefined ? "Upload slides" : "Upload a new version"}</span>
            <input
              required
              type="file"
              accept={allowedMimeTypes.length > 0 ? allowedMimeTypes.join(",") : undefined}
              onChange={(event) => {
                setSelectedFile(event.currentTarget.files?.[0] ?? null);
                setFormError(null);
                setUploaded(false);
              }}
            />
            <small>{selectedFile?.name ?? "No file selected"}</small>
          </label>
          {formError ? (
            <p className={styles.fieldError} role="alert">
              {formError}
            </p>
          ) : null}
          {uploaded ? (
            <p className={styles.saveConfirmation} role="status">
              Upload complete and task status saved.
            </p>
          ) : null}
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={busy || uploading || !selectedFile}
          >
            {busy || uploading
              ? "Uploading…"
              : currentAsset === undefined
                ? "Upload and submit task"
                : "Upload new version"}
          </button>
        </form>
      ) : (
        <p className={styles.blockedNotice}>
          {["completed", "waived"].includes(task.status)
            ? "This task is complete; uploads are locked."
            : "The task has no accepted file kind, so upload controls are unavailable."}
        </p>
      )}
    </article>
  );
}

function TasksWorkspace() {
  const { view } = usePortal();
  const uploadTasks = (view?.tasks ?? []).filter((task) => task.type === "upload");
  const formTasks = (view?.tasks ?? []).filter((task) => task.type === "form");
  if (uploadTasks.length === 0 && formTasks.length === 0) {
    return (
      <WorkspaceState
        title="No speaker tasks"
        description="File and form tasks appear here when an organizer assigns them to an accepted session."
      />
    );
  }
  return (
    <div className={styles.taskWorkspace}>
      {uploadTasks.map((task) => (
        <UploadTaskCard key={task.id} task={task} />
      ))}
      {formTasks.map((task) => (
        <FormTaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}

function answerIsEmpty(value: PortalFormAnswer | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function FormTaskCard({ task }: Readonly<{ task: PortalTask }>) {
  const { context, workspace, workspaceLoading, can, busyTaskIds, loadTaskForm, saveTaskResponse } =
    usePortal();
  const form = workspace.taskForms[task.id];
  const responseEnvelope = workspace.taskResponses[task.id] ?? null;
  const latestResponse = responseEnvelope?.latestResponse ?? form?.latestResponse ?? null;
  const [answers, setAnswers] = useState<Record<string, PortalFormAnswer>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!context) return;
    setAnswers({});
    setValidationError(null);
    setSaved(false);
  }, [context]);

  useEffect(() => {
    if (!form && can("task-response")) void loadTaskForm(task.id);
  }, [can, form, loadTaskForm, task.id]);

  useEffect(() => {
    if (latestResponse) setAnswers({ ...latestResponse.answers });
  }, [latestResponse]);

  if (!can("task-response")) {
    return (
      <article className={styles.taskCard}>
        <h2>{task.title}</h2>
        <p>Form responses are not available in this context.</p>
      </article>
    );
  }
  if (!form) {
    return (
      <article className={styles.taskCard} aria-live="polite">
        <h2>{task.title}</h2>
        <p>
          {workspaceLoading
            ? "Loading the latest form definition…"
            : "This form definition is unavailable."}
        </p>
      </article>
    );
  }
  const currentForm = form;

  function setAnswer(field: PortalFormField, value: PortalFormAnswer) {
    setAnswers((current) => ({ ...current, [field.id]: value }));
    setValidationError(null);
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = currentForm.fields.find(
      (field) => field.required && answerIsEmpty(answers[field.id]),
    );
    if (missing) {
      setValidationError(`${missing.label} is required.`);
      return;
    }
    setValidationError(null);
    const didSave = await saveTaskResponse({
      taskId: task.id,
      definitionVersion: currentForm.definitionVersion,
      expectedVersion: responseEnvelope?.history.length ?? 0,
      answers,
    });
    setSaved(didSave);
  }

  const responseHistory = responseEnvelope?.history ?? [];

  return (
    <article className={styles.taskCard} aria-labelledby={`form-task-${task.id}`}>
      <div className={styles.taskCardHeader}>
        <div className={styles.taskTypeIcon} aria-hidden="true">
          ▤
        </div>
        <div className={styles.taskTitle}>
          <p>{currentForm.status.replaceAll("_", " ")}</p>
          <h2 id={`form-task-${task.id}`}>{currentForm.title}</h2>
        </div>
      </div>
      {currentForm.description ? (
        <p className={styles.taskDescription}>{currentForm.description}</p>
      ) : null}
      <form className={styles.profileForm} onSubmit={(event) => void submit(event)} noValidate>
        {currentForm.fields.map((field) => (
          <FormField
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(value) => setAnswer(field, value)}
          />
        ))}
        {validationError ? (
          <p className={styles.fieldError} role="alert">
            {validationError}
          </p>
        ) : null}
        {latestResponse?.organizerFeedback ? (
          <p className={styles.blockedNotice}>
            <strong>Organizer feedback</strong>
            <br />
            {latestResponse.organizerFeedback}
          </p>
        ) : null}
        {saved ? (
          <p className={styles.saveConfirmation} role="status">
            Your response was saved.
          </p>
        ) : null}
        <div className={styles.formActions}>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={busyTaskIds.has(task.id)}
          >
            {busyTaskIds.has(task.id) ? "Saving…" : "Save response"}
          </button>
        </div>
      </form>
      <details>
        <summary>Response history</summary>
        {responseHistory.length ? (
          <ol>
            {responseHistory.map((entry) => (
              <li key={entry.responseId}>
                {formatDate(entry.submittedAt ?? undefined)} · {entry.status.replaceAll("_", " ")}
                {entry.organizerFeedback ? ` · ${entry.organizerFeedback}` : ""}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.toolbarDescription}>No previous responses.</p>
        )}
      </details>
    </article>
  );
}

function FormField({
  field,
  value,
  onChange,
}: Readonly<{
  field: PortalFormField;
  value: PortalFormAnswer | undefined;
  onChange: (value: PortalFormAnswer) => void;
}>) {
  const id = `form-field-${field.id}`;
  const label = (
    <span>
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );
  if (field.type === "textarea" || field.type === "rich_text") {
    return (
      <label className={styles.textareaField} htmlFor={id}>
        {label}
        <textarea
          id={id}
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className={styles.readOnlyField} htmlFor={id}>
        {label}
        <select
          id={id}
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="">Select an option</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className={styles.readOnlyField}>
        <legend>
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        {field.options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.currentTarget.checked
                    ? [...selected, option.value]
                    : selected.filter((candidate) => candidate !== option.value),
                )
              }
            />{" "}
            {option.label}
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.type === "checkbox" || field.type === "boolean") {
    return (
      <label className={styles.readOnlyField} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          required={field.required}
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />{" "}
        {label}
      </label>
    );
  }
  const inputType =
    field.type === "email" ||
    field.type === "url" ||
    field.type === "number" ||
    field.type === "date"
      ? field.type
      : "text";
  return (
    <label className={styles.readOnlyField} htmlFor={id}>
      {label}
      <input
        id={id}
        required={field.required}
        type={inputType}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(event) =>
          onChange(
            inputType === "number"
              ? event.currentTarget.value === ""
                ? null
                : Number(event.currentTarget.value)
              : event.currentTarget.value,
          )
        }
      />
    </label>
  );
}

function PublishedResources() {
  const { workspace, can } = usePortal();
  if (!can("resource-read"))
    return (
      <WorkspaceState
        title="Resources are unavailable"
        description="This event context did not grant access to published resources."
      />
    );
  if (workspace.resources.length === 0)
    return (
      <WorkspaceState
        title="No resources published"
        description="The event team has not published participant resources yet."
      />
    );
  return <PublishedContentList items={workspace.resources} heading="Resources" />;
}

function PublishedWiki() {
  const { context, workspace, can } = usePortal();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!context) return;
    setSelectedId(null);
  }, [context]);
  useEffect(() => {
    if (!selectedId || !workspace.wiki.some((page) => page.id === selectedId))
      setSelectedId(workspace.wiki[0]?.id ?? null);
  }, [selectedId, workspace.wiki]);
  if (!can("resource-read"))
    return (
      <WorkspaceState
        title="Wiki is unavailable"
        description="This event context did not grant access to the published wiki."
      />
    );
  if (workspace.wiki.length === 0)
    return (
      <WorkspaceState
        title="No wiki pages published"
        description="The event team has not published wiki guidance yet."
      />
    );
  const selected = workspace.wiki.find((page) => page.id === selectedId) ?? workspace.wiki[0];
  if (!selected) {
    return (
      <WorkspaceState
        title="No wiki pages published"
        description="The event team has not published wiki guidance yet."
      />
    );
  }
  return (
    <div className={styles.dashboardGrid}>
      <nav className={styles.panel} aria-label="Wiki pages">
        <h2>Wiki</h2>
        <ul className={styles.taskSummaryList}>
          {workspace.wiki.map((page) => (
            <li key={page.id}>
              <button
                className={styles.tertiaryButton}
                type="button"
                aria-current={page.id === selected.id ? "page" : undefined}
                onClick={() => setSelectedId(page.id)}
              >
                {page.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <PublishedContent item={selected} />
    </div>
  );
}

function PublishedContentList({
  items,
  heading,
}: Readonly<{ items: readonly PortalResource[]; heading: string }>) {
  return (
    <section className={styles.taskWorkspace} aria-labelledby="published-content-heading">
      <div className={styles.panelHeading}>
        <h2 id="published-content-heading">{heading}</h2>
      </div>
      {[...items]
        .sort((left, right) => left.order - right.order)
        .map((item) => (
          <PublishedContent key={item.id} item={item} />
        ))}
    </section>
  );
}

function PublishedContent({ item }: Readonly<{ item: PortalResource | PortalWikiPage }>) {
  const url = safeUrl(item.url);
  const markup = safeHtml(item.html);
  return (
    <article className={styles.panel}>
      <h2>{item.title}</h2>
      {item.summary ? <p>{item.summary}</p> : null}
      {markup ? <div>{markup}</div> : null}
      {url ? (
        <p>
          <a href={url} target="_blank" rel="noreferrer">
            Open published resource
          </a>
        </p>
      ) : null}
      <small>Updated {formatDate(item.updatedAt)}</small>
    </article>
  );
}
