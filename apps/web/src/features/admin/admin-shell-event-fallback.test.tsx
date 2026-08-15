import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminShellController } from "./admin-shell-controller";
import type { EventWorkspaceResolution } from "./admin-shell-event-controller";
import { AdminShellView, EventWorkspaceResolutionState } from "./admin-shell-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function unresolvedEventController(
  currentEventResolution: EventWorkspaceResolution | null,
): AdminShellController {
  return {
    authentication: "authenticated",
    availableOrganizationIds: ["local-jaeyunha-events"],
    commandOpen: false,
    commandPages: [],
    currentEvent: null,
    currentEventName: null,
    currentEventResolution,
    currentOrganizationId: "local-jaeyunha-events",
    currentPageLabel: "Agenda",
    eventContext: {
      eventId: "unresolved-event",
      organizationId: "local-jaeyunha-events",
    },
    eventWorkspaceDestinations: [],
    navigationGroups: [],
    pathname: "/admin/organizations/local-jaeyunha-events/events/unresolved-event/agenda",
    publicMemberSetup: false,
    selectOrganization: () => undefined,
    setCommandOpen: () => undefined,
    signOut: () => Promise.resolve(true),
  };
}

describe("event workspace resolution state", () => {
  it("presents an intentional recovery state when the event workspace is unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(EventWorkspaceResolutionState, {
        organizationId: "local-jaeyunha-events",
        status: "unavailable",
      }),
    );

    expect(markup).toContain("Event workspace unavailable");
    expect(markup).toContain("Back to events");
    expect(markup).toContain('href="/admin/organizations/local-jaeyunha-events/events"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain('role="heading"');
    expect(markup).toContain('aria-level="1"');
  });

  it("presents event resolution as a composed loading state", () => {
    const markup = renderToStaticMarkup(
      createElement(EventWorkspaceResolutionState, {
        organizationId: "local-jaeyunha-events",
        status: "loading",
      }),
    );

    expect(markup).toContain("Loading event workspace");
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toContain("Back to events");
    expect(markup).not.toContain('href="/admin/organizations/local-jaeyunha-events/events"');
  });

  it.each([
    [null, "Loading event workspace", "Loading event"],
    [
      { eventReference: "unresolved-event", status: "loading" } as const,
      "Loading event workspace",
      "Loading event",
    ],
    [
      { eventReference: "unresolved-event", status: "unavailable" } as const,
      "Event workspace unavailable",
      "Event unavailable",
    ],
  ])(
    "hides event children and maps an unresolved shell branch",
    (resolution, stateTitle, contextLabel) => {
      const markup = renderToStaticMarkup(
        <AdminShellView controller={unresolvedEventController(resolution)}>
          <p>Protected event content</p>
        </AdminShellView>,
      );

      expect(markup).toContain(stateTitle);
      expect(markup).toContain(contextLabel);
      expect(markup).not.toContain("Protected event content");
    },
  );
});
