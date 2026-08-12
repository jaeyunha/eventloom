import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpeakerApi, SpeakerAsset } from "./api";
import { SpeakerHeadshot, SpeakerWorkspace } from "./speaker-workspace";

describe("speaker workspace presentation", () => {
  it("defaults to the roster tab and composes Nova primitives for the workspace shell", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeakerWorkspace, {
        organizationId: "org-1",
        eventId: "event-1",
        api: {} as SpeakerApi,
      }),
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('id="roster-tab"');
    expect(markup).toContain('id="tasks-tab"');
    expect(markup).toContain('id="email-tab"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('data-slot="tabs-list"');
    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("Speaker workspace");
    expect(markup).toContain('data-slot="input"');
    expect(markup).toContain('aria-label="Search speakers"');
    expect(markup).toContain("Import CSV");
    expect(markup).toContain("Add speaker");
    expect(markup).toContain("Refreshing…");
  });

  it("does not put reminder diagnostics in the default roster flow", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeakerWorkspace, {
        organizationId: "org-1",
        eventId: "event-1",
        api: {} as SpeakerApi,
      }),
    );

    expect(markup).not.toContain("Automated reminder eligibility");
    expect(markup).not.toContain("no_reminder_offset");
    expect(markup).not.toContain("outside_window");
    expect(markup).not.toContain("no_due_date");
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
