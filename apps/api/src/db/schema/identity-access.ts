import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
