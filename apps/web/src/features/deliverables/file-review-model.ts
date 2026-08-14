import type {
  DeliverableAsset,
  DeliverableAssetHistoryEntry,
  DeliverableSession,
  DeliverableSpeakerProfile,
  DeliverableTask,
} from "./api";
import { compareFileVersions, fileFamilyId, type FileFamilyProjection } from "./file-family-model";
import type { FileReviewContext } from "./file-review-types";

export function mergeFileReviewVersions(
  family: FileFamilyProjection,
  history: readonly DeliverableAssetHistoryEntry[],
): readonly DeliverableAsset[] {
  const versions = new Map<string, DeliverableAsset>();

  for (const asset of family.versions) versions.set(asset.id, asset);
  for (const asset of history) {
    if (fileFamilyId(asset) === family.familyId) versions.set(asset.id, asset);
  }

  return [...versions.values()].sort(compareFileVersions);
}

export function buildFileReviewContext(
  family: FileFamilyProjection,
  selectedAsset: DeliverableAsset | undefined,
  history: readonly DeliverableAssetHistoryEntry[],
  sessions: readonly DeliverableSession[],
  tasks: readonly DeliverableTask[],
  profiles: readonly DeliverableSpeakerProfile[],
): FileReviewContext {
  const versions = mergeFileReviewVersions(family, history);
  const asset = selectedAsset ?? family.currentVersion ?? family.latestVersion;
  const task = tasks.find((candidate) => candidate.id === asset.taskId);
  const sessionId = asset.submissionId ?? task?.submissionId ?? "";
  const session = sessions.find((candidate) => candidate.id === sessionId);
  const profile = profiles.find((candidate) => candidate.participantId === asset.participantId);

  return {
    asset,
    family,
    versions,
    speakerLabel: asset.participantName ?? profile?.displayName ?? asset.participantId,
    sessionLabel:
      session?.title ??
      asset.sessionTitle ??
      task?.sessionTitle ??
      (asset.kind === "headshot" ? "Speaker profile" : "Session unavailable"),
    taskLabel: task?.title ?? "No linked request",
  };
}
