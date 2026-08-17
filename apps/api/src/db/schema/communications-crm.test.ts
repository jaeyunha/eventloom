import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  communicationSends,
  communicationTemplates,
  crmPipelineHistory,
} from "./communications-crm";

const dialect = new SQLiteSyncDialect();

function checkSql(table: Parameters<typeof getTableConfig>[0], name: string): string {
  const item = getTableConfig(table).checks.find((check) => check.name === name);
  if (item === undefined) throw new Error(`Missing schema check: ${name}`);
  return dialect.sqlToQuery(item.value).sql;
}

describe("communication sender schema", () => {
  it("applies the same strict sender shape to templates and immutable send snapshots", () => {
    const templateSql = checkSql(
      communicationTemplates,
      "communication_templates_sender_check",
    ).replaceAll('"communication_templates"."sender"', "sender");
    const sendSql = checkSql(
      communicationSends,
      "communication_sends_template_sender_check",
    ).replaceAll('"communication_sends"."template_sender"', "sender");

    expect(sendSql).toBe(templateSql);
    expect(templateSql).toContain("sender NOT LIKE '%..%'");
    expect(templateSql).toContain("NOT GLOB '*[^A-Za-z0-9.-]*'");
    expect(templateSql).toContain("NOT LIKE '%.-%'");
    expect(templateSql).toContain("NOT LIKE '%-.%'");
    expect(templateSql).toContain(
      "rtrim(substr(sender, instr(sender, '@') + 1), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')",
    );
  });
});

describe("CRM pipeline schema", () => {
  it("requires a persisted human-readable actor name", () => {
    const actorName = getTableConfig(crmPipelineHistory).columns.find(
      (column) => column.name === "actor_name",
    );
    expect(actorName).toMatchObject({ notNull: true });
  });
});
