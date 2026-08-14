import type { PortalAsset } from "./types";

type RuntimeRecord = Record<string, unknown>;

function asRecord(value: unknown): RuntimeRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RuntimeRecord)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hasOwn(record: RuntimeRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

const assetPointerFields = [
  "latestVersionId",
  "currentVersionId",
  "approvedVersionId",
  "releasedVersionId",
] as const;
type AssetPointerField = (typeof assetPointerFields)[number];

export type AssetPointerSnapshot = {
  status: "ready" | "missing-metadata" | "conflict";
  latestVersionId: string | null;
  currentVersionId: string | null;
  approvedVersionId: string | null;
  releasedVersionId: string | null;
  error: string | null;
};

export type PortalAssetFamilyResolution = {
  status: "empty" | "ready" | "pending" | "rejected" | "missing-metadata" | "conflict";
  assets: readonly PortalAsset[];
  pointers: AssetPointerSnapshot;
  latest: PortalAsset | undefined;
  current: PortalAsset | undefined;
  approved: PortalAsset | undefined;
  released: PortalAsset | undefined;
  error: string | null;
};

function authoritativePointerAssets(assets: readonly PortalAsset[]): readonly PortalAsset[] {
  if (assets.length <= 1) return assets;
  const supersededIds = new Set(
    assets.flatMap((asset) => {
      const supersededId = nonEmptyString(asset.supersedesAssetId);
      return supersededId === null ? [] : [supersededId];
    }),
  );
  const terminalAssets = assets.filter((asset) => !supersededIds.has(asset.id));
  return terminalAssets.length === 1 ? terminalAssets : assets;
}

/** Reads only server-provided family pointers and never derives authority from list order. */
export function resolveAssetPointers(
  assets: readonly PortalAsset[],
  pointerSource?: unknown,
): AssetPointerSnapshot {
  const sourceRecords: RuntimeRecord[] = [];
  const sourceRecord = asRecord(pointerSource);
  if (sourceRecord !== null) {
    sourceRecords.push(sourceRecord);
    const nestedPointers = asRecord(sourceRecord.assetPointers);
    if (nestedPointers !== null) sourceRecords.push(nestedPointers);
  }
  for (const asset of authoritativePointerAssets(assets)) {
    sourceRecords.push(asset as unknown as RuntimeRecord);
  }

  const values: Record<AssetPointerField, string | null> = {
    latestVersionId: null,
    currentVersionId: null,
    approvedVersionId: null,
    releasedVersionId: null,
  };
  let conflict = false;
  let hasPointerMetadata = false;
  for (const field of assetPointerFields) {
    const candidates = new Set<string>();
    let invalid = false;
    for (const record of sourceRecords) {
      if (!hasOwn(record, field)) continue;
      hasPointerMetadata = true;
      const value = record[field];
      if (value === null || value === undefined) continue;
      const normalized = nonEmptyString(value);
      if (normalized === null) invalid = true;
      else candidates.add(normalized);
    }
    if (invalid || candidates.size > 1) conflict = true;
    else if (candidates.size === 1) values[field] = [...candidates][0] ?? null;
  }

  if (conflict) {
    return {
      status: "conflict",
      ...values,
      error: "The server returned conflicting asset pointer metadata.",
    };
  }
  if (!hasPointerMetadata || values.latestVersionId === null) {
    return {
      status: "missing-metadata",
      ...values,
      error: "Authoritative asset pointer metadata is missing.",
    };
  }
  return { status: "ready", ...values, error: null };
}

export function assetVersionId(asset: PortalAsset): string {
  return nonEmptyString(asset.versionId) ?? asset.id;
}

function assetMatchesPointer(asset: PortalAsset, pointerId: string): boolean {
  return asset.id === pointerId || assetVersionId(asset) === pointerId;
}

/** Resolves latest/current/approved/released versions exclusively from authoritative IDs. */
export function resolvePortalAssetFamily(
  assets: readonly PortalAsset[],
  pointerSource?: unknown,
): PortalAssetFamilyResolution {
  const pointers = resolveAssetPointers(assets, pointerSource);
  if (assets.length === 0) {
    return {
      status: "empty",
      assets,
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
      assets,
      pointers,
      latest: assets.length === 1 ? assets[0] : undefined,
      current: undefined,
      approved: undefined,
      released: undefined,
      error: pointers.error,
    };
  }

  const find = (pointerId: string | null): PortalAsset | undefined => {
    if (pointerId === null) return undefined;
    const matches = assets.filter((asset) => assetMatchesPointer(asset, pointerId));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const latest = find(pointers.latestVersionId);
  const current = find(pointers.currentVersionId);
  const approved = find(pointers.approvedVersionId);
  const released = find(pointers.releasedVersionId);
  if (
    latest === undefined ||
    (pointers.currentVersionId !== null && current === undefined) ||
    (pointers.approvedVersionId !== null && approved === undefined) ||
    (pointers.releasedVersionId !== null && released === undefined)
  ) {
    return {
      status: "conflict",
      assets,
      pointers,
      latest,
      current,
      approved,
      released,
      error: "The server asset pointers reference a version that is not available.",
    };
  }
  return {
    status:
      latest.state === "pending_upload"
        ? "pending"
        : latest.state === "rejected"
          ? "rejected"
          : "ready",
    assets,
    pointers,
    latest,
    current,
    approved,
    released,
    error: null,
  };
}

export function assetPointerLabels(
  asset: PortalAsset,
  pointers: AssetPointerSnapshot,
): readonly string[] {
  if (pointers.status !== "ready") return [];
  const labels: string[] = [];
  const matches = (pointerId: string | null) =>
    pointerId !== null && assetMatchesPointer(asset, pointerId);
  if (matches(pointers.latestVersionId)) labels.push("Latest upload");
  if (matches(pointers.currentVersionId)) labels.push("Current");
  if (matches(pointers.approvedVersionId)) labels.push("Approved");
  if (matches(pointers.releasedVersionId)) labels.push("Released");
  return labels;
}

export function portalFileStatus(asset: PortalAsset | undefined): string {
  if (asset === undefined) return "Upload needed";
  return {
    pending_upload: "Processing upload",
    ready: "Uploaded",
    rejected: "Upload failed",
  }[asset.state];
}

export function portalReviewStatus(asset: PortalAsset | undefined): string {
  if (asset === undefined || asset.state !== "ready") return "Not submitted";
  if (asset.reviewState === "needs_changes") return "Needs changes";
  if (asset.reviewState === "approved") return "Approved";
  return "Awaiting event-team review";
}
