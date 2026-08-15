import { describe, expect, it } from "vitest";
import { eventWorkspaceDestinationsFor, organizerNavigationGroupsFor } from "./admin-navigation";
import { adminCommandPages, currentOrganizerPageLabel } from "./admin-shell-command";

describe("admin shell command adapter", () => {
  const pathname = "/admin/organizations/org/events/event/agenda/day-one";
  const context = { organizationId: "org", eventId: "event" };
  const groups = organizerNavigationGroupsFor(context, "org");
  const destinations = eventWorkspaceDestinationsFor(context);

  it("preserves organization and event destinations with route state", () => {
    const pages = adminCommandPages(pathname, destinations, groups);

    expect(pages).toHaveLength(21);
    expect(pages.find((page) => page.label === "Agenda")).toMatchObject({
      current: true,
      group: "Program",
      icon: "agenda",
    });
    expect(pages.find((page) => page.label === "All events")).toMatchObject({
      current: false,
      group: "Organization",
      icon: "events",
    });
  });

  it("derives the context label without coupling the shell view to route matching", () => {
    expect(currentOrganizerPageLabel(pathname, groups, true)).toBe("Agenda");
    expect(currentOrganizerPageLabel("/admin", [], false)).toBe("Overview");
  });
});
