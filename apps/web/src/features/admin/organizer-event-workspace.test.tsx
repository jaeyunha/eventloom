import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  OrganizerEventWorkspaceProvider,
  useOrganizerEventId,
  useOrganizerEventSlug,
} from "./organizer-event-workspace";

function EventIdentityProbe({ fallbackEventId }: Readonly<{ fallbackEventId: string }>) {
  const eventId = useOrganizerEventId(fallbackEventId);
  const eventSlug = useOrganizerEventSlug(fallbackEventId);
  return createElement("span", null, `${eventId}|${eventSlug}`);
}

describe("organizer event workspace context", () => {
  it("rebinds slug route props to the internal event identifier", () => {
    const output = renderToStaticMarkup(
      createElement(
        OrganizerEventWorkspaceProvider,
        {
          event: {
            id: "e66dc153-ec67-4f29-8b0f-8fc6733da05d",
            name: "Summit 2026",
            slug: "summit-2026",
          },
          organizationId: "ai-engineer",
        },
        createElement(EventIdentityProbe, {
          fallbackEventId: "summit-2026",
        }),
      ),
    );

    expect(output).toContain("e66dc153-ec67-4f29-8b0f-8fc6733da05d|summit-2026");
  });

  it("preserves explicit IDs outside the organizer shell", () => {
    expect(
      renderToStaticMarkup(createElement(EventIdentityProbe, { fallbackEventId: "event-a" })),
    ).toContain("event-a|event-a");
  });
});
