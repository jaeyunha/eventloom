import { describe, expect, it } from "vitest";
import {
  LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY,
  ORGANIZER_ORGANIZATION_STORAGE_KEY,
} from "./organizer-workspace-preference";

describe("organizer workspace preference", () => {
  it("keeps organization selection keys stable across consuming workspaces", () => {
    expect(ORGANIZER_ORGANIZATION_STORAGE_KEY).toBe("eventloom.organizer-organization");
    expect(LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY).toBe(
      "open-sessionboard.organizer-organization",
    );
  });
});
