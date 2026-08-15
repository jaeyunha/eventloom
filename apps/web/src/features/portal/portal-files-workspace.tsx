"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  MetadataList,
  MetadataRow,
  StatusBadge,
  WorkspaceHeader,
  WorkspaceListDetail,
  WorkspaceState,
  WorkspaceSurface,
} from "@/components/workspace";
import { AssetDetails } from "./portal-asset-details";
import {
  groupPortalAssetVersions,
  portalFileStatus,
  portalReviewStatus,
  resolvePortalAssetFamily,
} from "./portal-assets";
import styles from "./portal-workspace.module.css";
import type { PortalAsset, PortalSubmission } from "./types";

export interface FilesWorkspaceUpload {
  readonly participantId: string;
  readonly submissionId: string;
  readonly kind: PortalAsset["kind"];
  readonly file: File;
  readonly supersedesAssetId?: string;
}

export interface FilesWorkspaceViewProps {
  readonly eventName: string;
  readonly sessions: readonly PortalSubmission[];
  readonly selectedSessionId: string | null;
  readonly assets: readonly PortalAsset[];
  readonly participantId: string | null;
  readonly canWrite: boolean;
  readonly busyAssetIds: ReadonlySet<string>;
  readonly onSelectSession: (sessionId: string) => void;
  readonly onUpload: (input: FilesWorkspaceUpload) => Promise<boolean> | boolean;
  readonly onRetryUpload: (assetId: string, file: File) => void;
  readonly onCompleteUpload: (assetId: string) => void;
  readonly onDownload: (asset: PortalAsset) => void;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unknown size";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

export function FilesWorkspaceView({
  eventName,
  sessions,
  selectedSessionId,
  assets,
  participantId,
  canWrite,
  busyAssetIds,
  onSelectSession,
  onUpload,
  onRetryUpload,
  onCompleteUpload,
  onDownload,
}: FilesWorkspaceViewProps) {
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [uploadFamilyId, setUploadFamilyId] = useState("");
  const [kind, setKind] = useState<PortalAsset["kind"]>("supporting_file");
  const [file, setFile] = useState<File | null>(null);
  const previousSessionId = useRef(selectedSessionId);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const uploadInputId = selectedSession
    ? `portal-file-upload-${selectedSession.id}`
    : "portal-file-upload";
  const scopedAssets = useMemo(
    () => assets.filter((asset) => asset.submissionId === selectedSession?.id),
    [assets, selectedSession?.id],
  );
  const families = useMemo(() => groupPortalAssetVersions(scopedAssets), [scopedAssets]);
  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? families[0];
  const uploadFamily = families.find((family) => family.id === uploadFamilyId);
  const uploadResolution = uploadFamily
    ? resolvePortalAssetFamily(uploadFamily.versions, uploadFamily.current)
    : null;

  useEffect(() => {
    if (previousSessionId.current === selectedSessionId) return;
    previousSessionId.current = selectedSessionId;
    setSelectedFamilyId(null);
    setUploadFamilyId("");
    setFile(null);
  }, [selectedSessionId]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !participantId || !selectedSession) return;
    const supersedesAssetId = uploadResolution?.current?.id;
    if (uploadFamily && !supersedesAssetId) return;
    const saved = await onUpload({
      participantId,
      submissionId: selectedSession.id,
      kind: uploadFamily?.kind ?? kind,
      file,
      ...(supersedesAssetId ? { supersedesAssetId } : {}),
    });
    if (saved) setFile(null);
  }

  return (
    <div className={styles.page}>
      <WorkspaceHeader
        eyebrow="Accepted speaker workspace"
        title="Files"
        description="List, upload, finalize, and download private files with explicit accepted-session attribution."
        metadata={
          <>
            <span>{eventName}</span>
            <span>{families.length} file families</span>
          </>
        }
      />

      {sessions.length === 0 ? (
        <WorkspaceState
          variant="empty"
          title="No accepted sessions yet"
          description="Files unlock after an organizer accepts a proposal."
        />
      ) : (
        <label className={styles.field}>
          <span>Session attribution</span>
          <select
            value={selectedSession?.id ?? ""}
            onChange={(event) => onSelectSession(event.currentTarget.value)}
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedSession && canWrite ? (
        <WorkspaceSurface
          title={`Upload for ${selectedSession.title}`}
          description="A new version supersedes only the authoritative current version; earlier versions remain immutable."
        >
          <form className={styles.surfaceBody} onSubmit={(event) => void upload(event)}>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Version family</span>
                <select
                  value={uploadFamilyId}
                  onChange={(event) => {
                    setUploadFamilyId(event.currentTarget.value);
                    const family = families.find(
                      (candidate) => candidate.id === event.currentTarget.value,
                    );
                    if (family) setKind(family.kind);
                  }}
                >
                  <option value="">New file</option>
                  {families.map((family) => (
                    <option key={family.id} value={family.id}>
                      {family.current.fileName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>File type</span>
                <select
                  disabled={Boolean(uploadFamily)}
                  value={uploadFamily?.kind ?? kind}
                  onChange={(event) => setKind(event.currentTarget.value as PortalAsset["kind"])}
                >
                  <option value="headshot">Headshot</option>
                  <option value="slides">Slides</option>
                  <option value="supporting_file">Supporting file</option>
                </select>
              </label>
            </div>
            <label className={styles.field} htmlFor={uploadInputId}>
              <span>Choose file</span>
              <Input
                id={uploadInputId}
                required
                type="file"
                onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
              />
            </label>
            {uploadFamily && !uploadResolution?.current ? (
              <p className={styles.notice}>
                Authoritative current-version metadata is unavailable. Uploading a replacement is
                disabled.
              </p>
            ) : null}
            <div>
              <Button
                type="submit"
                disabled={
                  !file ||
                  !participantId ||
                  busyAssetIds.size > 0 ||
                  Boolean(uploadFamily && !uploadResolution?.current)
                }
              >
                {uploadFamily ? "Upload new version" : "Upload private file"}
              </Button>
            </div>
          </form>
        </WorkspaceSurface>
      ) : null}

      {selectedSession ? (
        <WorkspaceSurface
          title={`Files for ${selectedSession.title}`}
          description="Every item below is explicitly attributed to this accepted session."
        >
          {families.length === 0 ? (
            <WorkspaceState
              variant="empty"
              title="No files yet"
              description="Private uploads for this session will appear here."
            />
          ) : (
            <WorkspaceListDetail
              listLabel="Session files"
              detailLabel={selectedFamily?.current.fileName ?? "File detail"}
              list={
                <ul className={styles.list}>
                  {families.map((family) => (
                    <li key={family.id}>
                      <button
                        className={styles.listButton}
                        type="button"
                        aria-current={family.id === selectedFamily?.id ? "true" : undefined}
                        onClick={() => setSelectedFamilyId(family.id)}
                      >
                        <strong>{family.current.fileName}</strong>
                        <span>
                          {family.kind.replaceAll("_", " ")} · {family.versions.length} versions
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              }
              detail={
                selectedFamily ? (
                  <FileFamilyDetail
                    family={selectedFamily}
                    busyAssetIds={busyAssetIds}
                    canWrite={canWrite}
                    onRetryUpload={onRetryUpload}
                    onCompleteUpload={onCompleteUpload}
                    onDownload={onDownload}
                  />
                ) : (
                  <WorkspaceState
                    variant="empty"
                    title="Select a file"
                    description="Choose a file family to inspect its review and versions."
                  />
                )
              }
            />
          )}
        </WorkspaceSurface>
      ) : null}
    </div>
  );
}

function FileFamilyDetail({
  family,
  busyAssetIds,
  canWrite,
  onRetryUpload,
  onCompleteUpload,
  onDownload,
}: Readonly<{
  family: ReturnType<typeof groupPortalAssetVersions>[number];
  busyAssetIds: ReadonlySet<string>;
  canWrite: boolean;
  onRetryUpload: (assetId: string, file: File) => void;
  onCompleteUpload: (assetId: string) => void;
  onDownload: (asset: PortalAsset) => void;
}>) {
  const resolution = resolvePortalAssetFamily(family.versions, family.current);
  const latest = resolution.latest ?? family.current;
  const current = resolution.current;
  const display = current ?? latest;
  return (
    <div className={styles.detail}>
      <div className={styles.row}>
        <h2>{display.fileName}</h2>
        <StatusBadge
          tone={
            latest.state === "ready"
              ? "success"
              : latest.state === "rejected"
                ? "danger"
                : "warning"
          }
        >
          {portalFileStatus(latest)}
        </StatusBadge>
      </div>
      <MetadataList>
        <MetadataRow label="Session ID" value={display.submissionId ?? "Unavailable"} />
        <MetadataRow label="Size" value={formatBytes(display.sizeBytes)} />
        <MetadataRow label="Review state" value={portalReviewStatus(current)} />
      </MetadataList>
      {current?.reviewNote ? (
        <p className={styles.reviewNote}>
          <strong>Review note</strong>
          <br />
          {current.reviewNote}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={!current || current.state !== "ready" || busyAssetIds.has(current.id)}
        onClick={() => current && onDownload(current)}
      >
        Download current version
      </Button>
      <AssetDetails
        asset={latest}
        versions={family.versions}
        canCompleteUpload={canWrite}
        busy={busyAssetIds.has(latest.id)}
        onRetryUpload={(file) => onRetryUpload(latest.id, file)}
        onCompleteUpload={() => onCompleteUpload(latest.id)}
        onDownload={onDownload}
      />
    </div>
  );
}
