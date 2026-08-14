import { describe, expect, it } from "vitest";
import {
  eventSettingsSectionHref,
  eventSettingsSections,
  resolveEventSettingsSection,
} from "./event-settings-sections";

describe("event settings routed navigation", () => {
  it("exposes one stable destination for each focused settings domain", () => {
    expect(eventSettingsSections.map(({ id }) => id)).toEqual([
      "workflow",
      "rooms",
      "classification",
      "history",
    ]);
    expect(eventSettingsSections.map(({ group }) => group)).toEqual([
      "Event setup",
      "Event setup",
      "Event setup",
      "Governance",
    ]);
  });

  it("builds organization and event qualified settings links", () => {
    expect(eventSettingsSectionHref("org-a", "event-b", "classification")).toBe(
      "/admin/organizations/org-a/events/event-b/settings/classification",
    );
  });

  it("rejects unknown destinations instead of rendering a mixed settings document", () => {
    expect(resolveEventSettingsSection("history")).toBe("history");
    expect(resolveEventSettingsSection("audit")).toBeNull();
    expect(resolveEventSettingsSection(undefined)).toBeNull();
  });
});
