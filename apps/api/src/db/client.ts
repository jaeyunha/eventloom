import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export type OpenSessionboardDatabase = DrizzleD1Database<typeof schema>;

export function createDatabase(binding: D1Database): OpenSessionboardDatabase {
  return drizzle(binding, { schema });
}
