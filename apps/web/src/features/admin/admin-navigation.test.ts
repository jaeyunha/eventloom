import { describe, expect, it } from "vitest";
import {
  eventNavigationFor,
  eventWorkspaceDestinationsFor,
  organizationNavigationFor,
  organizerNavigationGroupsFor,
  workspaceNavigationItems,
} from "./admin-navigation";

describe("organizer navigation model", () => {
  it("keeps every organization destination typed and scoped", () => {
    expect(organizationNavigationFor("org/live").map((item) => item.href)).toEqual([
      "/admin/organizations/org%2Flive",
      "/admin/organizations/org%2Flive/crm",
      "/admin/organizations/org%2Flive/integrations",
      "/admin/organizations/org%2Flive/members",
      "/admin/organizations/org%2Flive/settings",
    ]);
  });

  it("keeps every event destination in the established organizer hierarchy", () => {
    const context = { organizationId: "org/live", eventId: "event/live" };
    const groups = organizerNavigationGroupsFor(context, "org/live");

    expect(groups.map((group) => group.label)).toEqual([
      "Program",
      "People",
      "Content operations",
      "Publish",
    ]);
    expect(groups.flatMap((group) => group.items).map((item) => item.href)).toEqual(
      eventNavigationFor(context).map((item) => item.href),
    );
    expect(groups.flatMap((group) => group.items)).toHaveLength(14);
    expect(
      groups.flatMap((group) => group.items).filter((item) => item.label === "Content collection"),
    ).toHaveLength(1);
  });

  it("adapts route matches to the shared navigation contract", () => {
    const pathname = "/admin/organizations/org/events/event/agenda/day-one";
    const items = workspaceNavigationItems(
      organizerNavigationGroupsFor({ organizationId: "org", eventId: "event" }, "org"),
      pathname,
    );

    expect(items.find((item) => item.label === "Agenda")?.current).toBe(true);
    expect(items.find((item) => item.label === "Program overview")?.current).toBe(false);
    expect(items.every((item) => item.icon !== undefined)).toBe(true);
  });

  it("keeps content collection active for the files view", () => {
    const items = workspaceNavigationItems(
      organizerNavigationGroupsFor({ organizationId: "org", eventId: "event" }, "org"),
      "/admin/organizations/org/events/event/files",
    );

    expect(items.find((item) => item.label === "Content collection")?.current).toBe(true);
    expect(items.some((item) => item.label === "Files")).toBe(false);
  });

  it("preserves organization workspace destinations from event routes", () => {
    expect(
      eventWorkspaceDestinationsFor({ organizationId: "org/live", eventId: "event/live" }),
    ).toEqual([
      {
        href: "/admin/organizations/org%2Flive",
        icon: "overview",
        label: "Organization overview",
      },
      {
        href: "/admin/organizations/org%2Flive/events",
        icon: "events",
        label: "All events",
      },
      { href: "/admin/organizations/org%2Flive/crm", icon: "crm", label: "CRM" },
      {
        href: "/admin/organizations/org%2Flive/integrations",
        icon: "integrations",
        label: "Integrations",
      },
      { href: "/admin/organizations/org%2Flive/members", icon: "members", label: "Members" },
      { href: "/admin/organizations/org%2Flive/settings", icon: "settings", label: "Settings" },
    ]);
  });
});
