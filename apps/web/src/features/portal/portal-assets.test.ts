import { describe, expect, it } from "vitest";
import {
  assetPointerLabels,
  portalFileStatus,
  portalReviewStatus,
  resolvePortalAssetFamily,
} from "./portal-assets";
import type { PortalAsset } from "./types";

function asset(id: string, overrides: Partial<PortalAsset> = {}): PortalAsset {
  return {
    id,
    eventId: "event-1",
    submissionId: "submission-1",
    participantId: "participant-1",
    kind: "slides",
    fileName: "slides.pdf",
    contentType: "application/pdf",
    sizeBytes: 100,
    state: "ready",
    createdAt: "2026-08-14T00:00:00.000Z",
    version: 1,
    versionFamilyId: "family-1",
    ...overrides,
  };
}

describe("portal asset presentation", () => {
  it("keeps a processing latest upload separate from the authoritative current version", () => {
    const current = asset("asset-v1", {
      latestVersionId: "asset-v2",
      currentVersionId: "asset-v1",
      approvedVersionId: "asset-v1",
      releasedVersionId: "asset-v1",
      reviewState: "approved",
    });
    const latest = asset("asset-v2", {
      version: 2,
      state: "pending_upload",
      supersedesAssetId: "asset-v1",
      latestVersionId: "asset-v2",
      currentVersionId: "asset-v1",
      approvedVersionId: "asset-v1",
      releasedVersionId: "asset-v1",
    });

    const resolution = resolvePortalAssetFamily([latest, current]);
    expect(resolution.status).toBe("pending");
    expect(resolution.latest?.id).toBe("asset-v2");
    expect(resolution.current?.id).toBe("asset-v1");
    expect(assetPointerLabels(latest, resolution.pointers)).toEqual(["Latest upload"]);
    expect(assetPointerLabels(current, resolution.pointers)).toEqual([
      "Current",
      "Approved",
      "Released",
    ]);
    expect(portalFileStatus(latest)).toBe("Processing upload");
    expect(portalReviewStatus(current)).toBe("Approved");
  });

  it("does not infer current or review state when authoritative pointers are missing", () => {
    const ready = asset("asset-v1");
    const resolution = resolvePortalAssetFamily([ready]);
    expect(resolution.status).toBe("missing-metadata");
    expect(resolution.current).toBeUndefined();
    expect(portalReviewStatus(resolution.current)).toBe("Not submitted");
  });

  it("distinguishes transfer failures from organizer review feedback", () => {
    expect(portalFileStatus(asset("failed", { state: "rejected" }))).toBe("Upload failed");
    expect(portalReviewStatus(asset("changes", { reviewState: "needs_changes" }))).toBe(
      "Needs changes",
    );
    expect(portalReviewStatus(asset("waiting"))).toBe("Awaiting event-team review");
  });
});
