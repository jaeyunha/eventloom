import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const defaultWranglerPath = join(repositoryRoot, "apps/api/wrangler.toml");
const migrationsDirectory = join(repositoryRoot, "apps/api/migrations");
const environments = ["local", "staging", "production"];
const placeholderIdPattern = /^00000000-0000-0000-0000-00000000000\d$/;

function parseArguments(argv) {
  let environment = "local";
  let deployment = false;
  let configPath = defaultWranglerPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--environment") {
      environment = argv[index + 1];
      index += 1;
    } else if (argument === "--deployment") {
      deployment = true;
    } else if (argument === "--config") {
      configPath = resolve(repositoryRoot, argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!environments.includes(environment)) {
    throw new Error(`Environment must be one of: ${environments.join(", ")}`);
  }

  return { configPath, deployment, environment };
}

function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function collectValues(source, key) {
  const pattern = new RegExp(`^${key}\\s*=\\s*"([^"]+)"$`, "gm");
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must be unique across environments`);
  }
}

function validateMigrations() {
  const migrations = readdirSync(migrationsDirectory)
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort();

  if (migrations.length === 0) {
    throw new Error("At least one ordered D1 migration is required");
  }

  for (const migration of migrations) {
    const sql = readFileSync(join(migrationsDirectory, migration), "utf8");
    if (/\b(?:DROP\s+(?:TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)) {
      throw new Error(`${migration} contains a destructive migration operation`);
    }
    requirePattern(sql, /PRAGMA foreign_keys = ON;/, `${migration} must enable foreign keys`);
  }

  return migrations;
}

function validateWrangler(source, options) {
  if (/^account_id\s*=/m.test(source)) {
    throw new Error("Wrangler must take the Cloudflare account from CLOUDFLARE_ACCOUNT_ID");
  }
  requirePattern(
    source,
    /^workers_dev = false$/m,
    "The top-level local Worker must disable workers.dev",
  );
  requirePattern(
    source,
    /^main = "src\/infrastructure\/cloudflare\/worker\.ts"$/m,
    "Wrangler must use the Cloudflare infrastructure entrypoint",
  );
  requirePattern(
    source,
    /^new_sqlite_classes = \["AgendaCoordinator"\]$/m,
    "AgendaCoordinator requires a Durable Object migration",
  );

  if (/^(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)[A-Z0-9_]*)\s*=/m.test(source)) {
    throw new Error("Secrets must be provider-managed and cannot appear in wrangler.toml vars");
  }

  const appEnvironments = collectValues(source, "APP_ENV");
  if (appEnvironments.join(",") !== environments.join(",")) {
    throw new Error("APP_ENV must define local, staging, and production exactly once");
  }

  const origins = collectValues(source, "WEB_ORIGIN");
  if (
    origins.length !== 3 ||
    !origins[0].startsWith("http://127.0.0.1:") ||
    origins.slice(1).some((origin) => !origin.startsWith("https://"))
  ) {
    throw new Error("Only local may use HTTP; staging and production origins must use HTTPS");
  }

  for (const binding of ["DB", "AGENDA_COORDINATOR", "PRIVATE_FILES", "OUTBOX_QUEUE"]) {
    const count = collectValues(
      source,
      binding === "AGENDA_COORDINATOR" ? "name" : "binding",
    ).filter((value) => value === binding).length;
    if (count !== 3) {
      throw new Error(`${binding} must be bound once in every environment`);
    }
  }

  const databaseNames = collectValues(source, "database_name");
  const bucketNames = collectValues(source, "bucket_name");
  const queueNames = [...new Set(collectValues(source, "queue"))];
  const databaseIds = collectValues(source, "database_id");
  const migrationDirectories = collectValues(source, "migrations_dir");

  for (const [label, values] of [
    ["D1 database names", databaseNames],
    ["R2 bucket names", bucketNames],
    ["Queue names", queueNames],
    ["D1 database IDs", databaseIds],
  ]) {
    if (values.length !== 3) {
      throw new Error(`${label} must have one value per environment`);
    }
    assertUnique(values, label);
  }
  if (
    migrationDirectories.length !== environments.length ||
    migrationDirectories.some((value) => value !== "migrations")
  ) {
    throw new Error("Every D1 binding must use the reviewed apps/api/migrations directory");
  }

  for (const [index, environment] of environments.entries()) {
    for (const [label, values] of [
      ["D1 database", databaseNames],
      ["R2 bucket", bucketNames],
      ["Queue", queueNames],
    ]) {
      if (!values[index].endsWith(`-${environment}`)) {
        throw new Error(`${label} name must end with -${environment}`);
      }
    }
  }

  if (options.deployment) {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID?.trim()) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID must be supplied before deployment");
    }
    const selectedId = databaseIds[environments.indexOf(options.environment)];
    if (placeholderIdPattern.test(selectedId)) {
      throw new Error(
        `${options.environment} D1 database_id is unprovisioned; replace it before deployment`,
      );
    }
    const expectedId = process.env.D1_DATABASE_ID?.trim();
    if (!expectedId) {
      throw new Error("D1_DATABASE_ID must be supplied before deployment");
    }
    if (selectedId !== expectedId) {
      throw new Error(
        `${options.environment} generated D1 database_id does not match D1_DATABASE_ID`,
      );
    }
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  const wrangler = readFileSync(options.configPath, "utf8");
  validateWrangler(wrangler, options);
  const migrations = validateMigrations();
  process.stdout.write(
    `${JSON.stringify({
      valid: true,
      environment: options.environment,
      deploymentReady: options.deployment,
      migrations,
    })}\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown validation failure";
  process.stderr.write(`${JSON.stringify({ valid: false, error: message })}\n`);
  process.exitCode = 1;
}
