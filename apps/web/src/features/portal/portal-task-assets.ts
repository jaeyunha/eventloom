import { portalSubmissionIdsMatch } from "./model";
import { type AssetPointerSnapshot, resolveAssetPointers } from "./portal-assets";
import { asTaskRecord, resolveTaskSubject, taskString } from "./portal-task-model";
import type { PortalAsset, PortalAssetComment, PortalTask } from "./types";

function assetVersionId(asset: PortalAsset): string {
  return taskString(asTaskRecord(asset)?.versionId) ?? asset.id;
}

function assetMatchesPointer(asset: PortalAsset, pointerId: string): boolean {
  return asset.id === pointerId || assetVersionId(asset) === pointerId;
}

function assetsForTask(task: PortalTask, assets: readonly PortalAsset[]): PortalAsset[] {
  const subject = resolveTaskSubject(task).subject;
  return assets.filter((asset) => {
    if (
      asset.eventId !== task.eventId ||
      asset.taskId !== task.id ||
      asset.participantId !== task.participantId ||
      subject === null
    ) {
      return false;
    }
    if (subject.type === "participant") return asset.submissionId == null;
    return (
      asset.submissionId != null &&
      portalSubmissionIdsMatch(asset.submissionId, subject.submissionId)
    );
  });
}

export type TaskAssetResolution = {
  status: "empty" | "ready" | "pending" | "rejected" | "missing-metadata" | "conflict";
  assets: readonly PortalAsset[];
  pointers: AssetPointerSnapshot;
  latest: PortalAsset | undefined;
  current: PortalAsset | undefined;
  approved: PortalAsset | undefined;
  released: PortalAsset | undefined;
  error: string | null;
};

export function resolveTaskAsset(
  task: PortalTask,
  assets: readonly PortalAsset[],
): TaskAssetResolution {
  const matching = assetsForTask(task, assets);
  const pointers = resolveAssetPointers(matching, task);
  if (matching.length === 0) {
    return {
      status: "empty",
      assets: matching,
      pointers,
      latest: undefined,
      current: undefined,
      approved: undefined,
      released: undefined,
      error: null,
    };
  }
  if (pointers.status !== "ready") {
    return {
      status: pointers.status,
      assets: matching,
      pointers,
      latest: matching.length === 1 ? matching[0] : undefined,
      current: undefined,
      approved: undefined,
      released: undefined,
      error: pointers.error,
    };
  }
  const find = (pointerId: string | null): PortalAsset | undefined => {
    if (pointerId === null) return undefined;
    const matches = matching.filter((asset) => assetMatchesPointer(asset, pointerId));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const latest = find(pointers.latestVersionId);
  const current = find(pointers.currentVersionId);
  const approved = find(pointers.approvedVersionId);
  const released = find(pointers.releasedVersionId);
  if (
    !latest ||
    (pointers.currentVersionId !== null && !current) ||
    (pointers.approvedVersionId !== null && !approved) ||
    (pointers.releasedVersionId !== null && !released)
  ) {
    return {
      status: "conflict",
      assets: matching,
      pointers,
      latest,
      current,
      approved,
      released,
      error: "The server asset pointers reference a version that is not available.",
    };
  }
  const status =
    latest.state === "pending_upload"
      ? "pending"
      : latest.state === "rejected"
        ? "rejected"
        : "ready";
  return { status, assets: matching, pointers, latest, current, approved, released, error: null };
}

export function commentsForAsset(
  asset: PortalAsset,
  comments: readonly PortalAssetComment[],
): PortalAssetComment[] {
  const versionId = assetVersionId(asset);
  return comments.filter((comment) => {
    if (comment.assetId !== asset.id) return false;
    const commentVersionId = taskString(asTaskRecord(comment)?.versionId);
    return (
      commentVersionId === null || commentVersionId === asset.id || commentVersionId === versionId
    );
  });
}

export function mergePortalAssets(
  viewAssets: readonly PortalAsset[],
  workspaceAssets: readonly PortalAsset[],
): PortalAsset[] {
  const byId = new Map(viewAssets.map((asset) => [asset.id, asset]));
  for (const asset of workspaceAssets) if (!byId.has(asset.id)) byId.set(asset.id, asset);
  return [...byId.values()];
}

export { assetVersionId };
