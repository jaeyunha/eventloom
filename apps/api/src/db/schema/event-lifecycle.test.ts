import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { portalContexts } from "./cfp-speakers";
import { events } from "./program-core";

function columnNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("event persistence", () => {
  it("keeps rollout columns internal while tracking legacy retirement separately", () => {
    expect(columnNames(events)).toContain("status");
    expect(columnNames(events)).toContain("legacy_retired_at");
    expect(columnNames(portalContexts)).toContain("status");
  });
});
