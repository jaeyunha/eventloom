import { defineConfig } from "drizzle-kit";

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for remote D1 inspection.`);
  }
  return value;
}

export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    accountId: requiredEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID"),
    databaseId: requiredEnvironmentVariable("CLOUDFLARE_D1_DATABASE_ID"),
    token: requiredEnvironmentVariable("CLOUDFLARE_API_TOKEN"),
  },
  strict: true,
  verbose: true,
});
