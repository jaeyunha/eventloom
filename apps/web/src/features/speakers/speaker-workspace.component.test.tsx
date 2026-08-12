import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpeakerApi, SpeakerAsset } from "./api";
import { SpeakerHeadshot, SpeakerWorkspace } from "./speaker-workspace";

describe("speaker workspace filters", () => {
  it("renders list-level status, session, progress, and clear-result controls", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeakerWorkspace, {
        organizationId: "org-1",
        eventId: "event-1",
        api: {} as SpeakerApi,
      }),
    );

    expect(markup).toContain('aria-label="Search speakers"');
    expect(markup).toContain('aria-label="Filter by status"');
    expect(markup).toContain('aria-label="Filter by session"');
    expect(markup).toContain('aria-label="Filter by task progress"');
    expect(markup).toContain('aria-label="Clear speaker filters"');
    expect(markup).toContain("Onboarding progress");
    expect(markup).toContain("0 of 3 onboarding task");
    expect(markup).toContain("Custom speaker fields are not available");
  });
  it("keeps missing or unavailable headshots as an accessible fallback", () => {
    const asset: SpeakerAsset = {
      assetId: "asset-headshot",
      fileName: "speaker.png",
      contentType: "image/png",
      byteSize: 4_096,
      status: "ready",
      uploadedAt: "2026-08-09T00:00:00.000Z",
      downloadUrl: null,
    };
    const markup = renderToStaticMarkup(
      createElement(SpeakerHeadshot, {
        speakerName: "Priya Raman",
        asset,
        imageUrl: null,
        loading: false,
        error: "The private headshot preview did not return a same-origin API path.",
        revision: 1,
      }),
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain("Headshot unavailable");
    expect(markup).toContain("The private headshot preview did not return a same-origin API path.");
    expect(markup).not.toContain("<img");
  });
});
