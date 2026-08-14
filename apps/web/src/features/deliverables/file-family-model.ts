import type { DeliverableAsset, DeliverableMatrixItem } from "./api";

export interface FileFamilyProjection {
  readonly familyId: string;
  readonly participantId: string;
  readonly taskId?: string;
  readonly versions: readonly DeliverableAsset[];
  readonly latestVersion: DeliverableAsset;
  readonly currentVersion?: DeliverableAsset;
  readonly displayVersion: DeliverableAsset;
  readonly authoritative: boolean;
  readonly exportAssetId?: string;
}

export function fileFamilyId(asset: DeliverableAsset): string {
  return `${asset.participantId}\u0000${asset.taskId ?? ""}\u0000${asset.versionFamilyId ?? asset.id}`;
}

export function compareFileVersions(left: DeliverableAsset, right: DeliverableAsset): number {
  return (
    (right.version ?? 0) - (left.version ?? 0) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function uniquePointerId(
  versions: readonly DeliverableAsset[],
  field: "latestVersionId" | "currentVersionId",
): string | undefined {
  const ids = new Set(
    versions.flatMap((version) => {
      const value = version[field]?.trim();
      return value === undefined || value.length === 0 ? [] : [value];
    }),
  );
  return ids.size === 1 ? ids.values().next().value : undefined;
}

export function projectFileFamilies(
  assets: readonly DeliverableAsset[],
  matrixItems: readonly DeliverableMatrixItem[] = [],
): readonly FileFamilyProjection[] {
  const assetsById = new Map<string, DeliverableAsset>();
  for (const asset of assets) assetsById.set(asset.id, asset);
  for (const item of matrixItems) {
    for (const asset of item.assets) assetsById.set(asset.id, asset);
    if (item.currentAsset !== undefined) assetsById.set(item.currentAsset.id, item.currentAsset);
  }

  const grouped = new Map<string, DeliverableAsset[]>();
  for (const asset of assetsById.values()) {
    const familyId = fileFamilyId(asset);
    grouped.set(familyId, [...(grouped.get(familyId) ?? []), asset]);
  }

  const matrixCurrentByFamily = new Map<string, string>();
  for (const item of matrixItems) {
    if (item.currentAsset !== undefined) {
      matrixCurrentByFamily.set(fileFamilyId(item.currentAsset), item.currentAsset.id);
    }
  }

  return [...grouped.entries()]
    .map(([familyId, unsortedVersions]): FileFamilyProjection => {
      const versions = [...unsortedVersions].sort(compareFileVersions);
      const sortedLatest = versions[0];
      if (sortedLatest === undefined) throw new Error("A file family must contain a version.");

      const latestPointerId = uniquePointerId(versions, "latestVersionId");
      const currentPointerId = uniquePointerId(versions, "currentVersionId");
      const latestVersion =
        versions.find((version) => version.id === latestPointerId) ?? sortedLatest;
      const authoritativeCurrentId = matrixCurrentByFamily.get(familyId) ?? currentPointerId;
      const currentVersion = versions.find((version) => version.id === authoritativeCurrentId);
      const displayVersion = currentVersion ?? latestVersion;
      const exportAssetId = currentVersion?.state === "ready" ? currentVersion.id : undefined;

      return {
        familyId,
        participantId: displayVersion.participantId,
        ...(displayVersion.taskId === undefined ? {} : { taskId: displayVersion.taskId }),
        versions,
        latestVersion,
        ...(currentVersion === undefined ? {} : { currentVersion }),
        displayVersion,
        authoritative: currentVersion !== undefined,
        ...(exportAssetId === undefined ? {} : { exportAssetId }),
      };
    })
    .sort((left, right) => compareFileVersions(left.displayVersion, right.displayVersion));
}

export function exportAssetIdsForFamilies(
  families: readonly FileFamilyProjection[],
  selectedFamilyIds: readonly string[],
): readonly string[] {
  const selected = new Set(selectedFamilyIds);
  return families.flatMap((family) =>
    selected.has(family.familyId) && family.exportAssetId !== undefined
      ? [family.exportAssetId]
      : [],
  );
}
