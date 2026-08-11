import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SpeakerApi } from "./api";
import { SpeakerWorkspace } from "./speaker-workspace";

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
  });
});
