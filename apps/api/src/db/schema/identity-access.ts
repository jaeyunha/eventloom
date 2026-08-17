import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const authUsers = sqliteTable("auth_users", {
  id: text("id").primaryKey(),
});

export const organizations = sqliteTable(
  "organizations",
  {
    organizationId: text("organization_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId] }),
    index("idx_organizations_slug").on(table.slug),
    index("idx_organizations_status").on(table.status),
  ],
);

export const organizationEntitlements = sqliteTable(
  "organization_entitlements",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.organizationId, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").notNull(),
    revision: integer("revision").notNull(),
    state: text("state", { enum: ["active", "restricted"] }).notNull(),
    capabilitiesJson: text("capabilities_json").notNull(),
    activeEventLimit: integer("active_event_limit"),
    notBefore: text("not_before").notNull(),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_organization_entitlements_state").on(table.state, table.expiresAt)],
);
