import { describe, expect, it } from "vitest";
import type { DeliverableAsset } from "./api";
import type { FileFamilyProjection } from "./file-family-model";
import { buildFileReviewContext } from "./file-review-model";

describe("buildFileReviewContext", () => {
  it("keeps the authenticated uploader distinct from the asset speaker", () => {
    const asset = {
      id: "asset-1",
      eventId: "event-1",
      participantId: "participant-1",
      participantName: "Alex Rivera",
      uploaderLabel: "Local Organizer",
      kind: "headshot",
      fileName: "headshot.jpg",
      contentType: "image/jpeg",
      sizeBytes: 3,
      state: "ready",
      createdAt: "2026-08-16T00:00:00.000Z",
      version: 1,
      versionFamilyId: "family-1",
      latestVersionId: "asset-1",
      currentVersionId: "asset-1",
    } as DeliverableAsset & { readonly uploaderLabel: string };
    const family: FileFamilyProjection = {
      familyId: "family-1",
      participantId: "participant-1",
      versions: [asset],
      latestVersion: asset,
      currentVersion: asset,
      displayVersion: asset,
      exportAssetId: "asset-1",
      authoritative: true,
    };

    const context = buildFileReviewContext(family, asset, [], [], [], []);

    expect(context.speakerLabel).toBe("Alex Rivera");
    expect((context as unknown as { readonly uploaderLabel: string }).uploaderLabel).toBe(
      "Local Organizer",
    );
  });
});
