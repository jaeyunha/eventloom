import { APIError, type BetterAuthOptions, betterAuth, type DBAdapter } from "better-auth";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { magicLink } from "better-auth/plugins/magic-link";
import type { OpenSendSenderAddress } from "../../integrations/opensend/client";
import type { OpenSendMessage } from "../../integrations/opensend/types";
import type { BetterAuthRuntimeConfiguration } from "./configuration";
import { authDisplayName } from "./display-name";
import type { AuthSession, BetterAuthGateway } from "./types";

export interface BetterAuthRuntimeOptions {
  readonly database: D1Database;
  readonly configuration: BetterAuthRuntimeConfiguration;
  readonly environment: "local" | "staging" | "production";
  readonly sendMagicLink: (input: { email: string; url: string; token: string }) => Promise<void>;
}

export interface BetterAuthRuntime
  extends Pick<BetterAuthGateway, "requestMagicLink" | "consumeMagicLink"> {
  readonly handler: (request: Request) => Promise<Response>;
}

type ModelName = "user" | "session" | "account" | "verification";
type Where = {
  readonly field: string;
  readonly value: string | number | boolean | Date | null | readonly (string | number)[];
  readonly operator?:
    | "eq"
    | "ne"
    | "lt"
    | "lte"
    | "gt"
    | "gte"
    | "in"
    | "not_in"
    | "contains"
    | "starts_with"
    | "ends_with";
};

type DatabaseRow = Record<string, unknown>;
type DatabaseData = Record<string, unknown>;

const columns: Record<ModelName, Record<string, string>> = {
  user: {
    id: "id",
    name: "name",
    email: "email",
    emailVerified: "email_verified",
    image: "image_url",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  session: {
    id: "id",
    userId: "user_id",
    token: "token_digest",
    expiresAt: "expires_at",
    ipAddress: "ip_address",
    userAgent: "user_agent",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  account: {
    id: "id",
    userId: "user_id",
    accountId: "provider_account_id",
    providerId: "provider_id",
    accessToken: "access_token_ciphertext",
    refreshToken: "refresh_token_ciphertext",
    accessTokenExpiresAt: "access_token_expires_at",
    refreshTokenExpiresAt: "refresh_token_expires_at",
    scope: "scope",
    password: "password_hash",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  verification: {
    id: "id",
    identifier: "token_digest",
    value: "identifier",
    expiresAt: "expires_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
};

const tableNames: Record<ModelName, string> = {
  user: "auth_users",
  session: "auth_sessions",
  account: "auth_accounts",
  verification: "auth_verifications",
};

const dateFields = new Set([
  "createdAt",
  "updatedAt",
  "expiresAt",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
]);
const booleanFields = new Set(["emailVerified"]);

function isModelName(value: string): value is ModelName {
  return value in tableNames;
}

function modelName(value: string): ModelName {
  if (!isModelName(value)) throw new Error("Unsupported authentication model.");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueForDatabase(field: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (dateFields.has(field)) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return new Date(value).toISOString();
  }
  if (booleanFields.has(field)) return value === true || value === 1 ? 1 : 0;
  return value;
}

function valueFromDatabase(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (dateFields.has(field)) {
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (booleanFields.has(field)) return value === 1 || value === true;
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function assertPasswordPolicy(password: string): void {
  const valid =
    password.length >= 8 &&
    password.length <= 128 &&
    /[^A-Za-z0-9]/u.test(password) &&
    /[0-9]/u.test(password) &&
    /[A-Z]/u.test(password);
  if (!valid) {
    throw APIError.from("BAD_REQUEST", {
      code: "INVALID_PASSWORD",
      message: "Password must meet every security requirement.",
    });
  }
}

async function databaseValue(model: ModelName, field: string, value: unknown): Promise<unknown> {
  if (model === "session" && field === "token" && typeof value === "string") {
    return sha256(value);
  }
  if (
    model === "session" &&
    field === "token" &&
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  ) {
    return Promise.all(value.map((item) => sha256(item)));
  }
  if (model === "verification" && field === "identifier" && typeof value === "string") {
    return sha256(value);
  }
  if (
    model === "verification" &&
    field === "identifier" &&
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  ) {
    return Promise.all(value.map((item) => sha256(item)));
  }
  return valueForDatabase(field, value);
}

function rawSessionToken(where: readonly Where[]): string | undefined {
  const condition = where.find(
    (candidate) => candidate.field === "token" && typeof candidate.value === "string",
  );
  return condition === undefined ? undefined : String(condition.value);
}

function resultRow<T>(value: T | undefined | null): T | null {
  return value === undefined || value === null ? null : value;
}

async function first<T>(
  database: D1Database,
  statement: string,
  values: readonly unknown[] = [],
): Promise<T | null> {
  return resultRow(
    await database
      .prepare(statement)
      .bind(...values)
      .first<T>(),
  );
}

async function all<T>(
  database: D1Database,
  statement: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await database
    .prepare(statement)
    .bind(...values)
    .all<T>();
  return result.results ?? [];
}

function toModel(model: ModelName, row: DatabaseRow): DatabaseData {
  const output: DatabaseData = {};
  for (const [field, column] of Object.entries(columns[model])) {
    if (column in row) output[field] = valueFromDatabase(field, row[column]);
  }
  return output;
}

async function toDatabaseData(
  _database: D1Database,
  model: ModelName,
  input: DatabaseData,
): Promise<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(input)) {
    const column = columns[model][field];
    if (column === undefined || value === undefined) continue;
    output[column] = await databaseValue(model, field, value);
  }
  return output;
}

function whereColumn(model: ModelName, field: string): string | null {
  return columns[model][field] ?? null;
}

async function whereClause(
  _database: D1Database,
  model: ModelName,
  where: readonly Where[] | undefined,
): Promise<{ sql: string; values: unknown[] } | null> {
  if (!where || where.length === 0) return { sql: "1 = 1", values: [] };
  const clauses: string[] = [];
  const values: unknown[] = [];
  for (const condition of where) {
    const column = whereColumn(model, condition.field);
    if (column === null) return null;
    const operator = condition.operator ?? "eq";
    const value = await databaseValue(model, condition.field, condition.value);
    if (operator === "in" || operator === "not_in") {
      if (!Array.isArray(value) || value.length === 0) {
        clauses.push(operator === "in" ? "1 = 0" : "1 = 1");
        continue;
      }
      clauses.push(
        `${column} ${operator === "in" ? "IN" : "NOT IN"} (${value.map(() => "?").join(", ")})`,
      );
      values.push(...value);
      continue;
    }
    if (value === null) {
      clauses.push(`${column} IS ${operator === "ne" ? "NOT " : ""}NULL`);
      continue;
    }
    const sqlOperator =
      operator === "eq"
        ? "="
        : operator === "ne"
          ? "<>"
          : operator === "lt"
            ? "<"
            : operator === "lte"
              ? "<="
              : operator === "gt"
                ? ">"
                : operator === "gte"
                  ? ">="
                  : operator === "contains"
                    ? "LIKE"
                    : operator === "starts_with"
                      ? "LIKE"
                      : operator === "ends_with"
                        ? "LIKE"
                        : null;
    if (sqlOperator === null) return null;
    clauses.push(`${column} ${sqlOperator} ?`);
    values.push(
      operator === "contains"
        ? `%${String(value)}%`
        : operator === "starts_with"
          ? `${String(value)}%`
          : operator === "ends_with"
            ? `%${String(value)}`
            : value,
    );
  }
  return { sql: clauses.join(" AND "), values };
}

async function joinedRows(
  database: D1Database,
  model: ModelName,
  rows: DatabaseData[],
  join: unknown,
): Promise<DatabaseData[]> {
  if (!isRecord(join)) return rows;
  const joined = new Set(Object.keys(join));
  if (model === "session" && joined.has("user")) {
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        user:
          typeof row.userId === "string"
            ? await findOne(database, "user", [{ field: "id", value: row.userId }])
            : null,
      })),
    );
  }
  if (model === "account" && joined.has("user")) {
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        user:
          typeof row.userId === "string"
            ? await findOne(database, "user", [{ field: "id", value: row.userId }])
            : null,
      })),
    );
  }
  if (model === "user" && joined.has("account")) {
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        account:
          typeof row.id === "string"
            ? await findMany(database, "account", [{ field: "userId", value: row.id }])
            : [],
      })),
    );
  }
  return rows;
}

async function findOne(
  database: D1Database,
  modelValue: string,
  where: readonly Where[],
  join?: unknown,
): Promise<DatabaseData | null> {
  const model = modelName(modelValue);
  const clause = await whereClause(database, model, where);
  if (clause === null) return null;
  const row = await first<DatabaseRow>(
    database,
    `SELECT * FROM ${tableNames[model]} WHERE ${clause.sql} LIMIT 1`,
    clause.values,
  );
  if (row === null) return null;
  const rows = await joinedRows(database, model, [toModel(model, row)], join);
  const result = rows[0] ?? null;
  if (result !== null && model === "session") {
    const token = rawSessionToken(where);
    if (token !== undefined) result.token = token;
  }
  return result;
}

async function findMany(
  database: D1Database,
  modelValue: string,
  where: readonly Where[] | undefined,
  limit = 100,
  sortBy?: { field: string; direction: "asc" | "desc" },
  offset?: number,
  join?: unknown,
): Promise<DatabaseData[]> {
  const model = modelName(modelValue);
  const clause = await whereClause(database, model, where);
  if (clause === null) return [];
  const orderColumn = sortBy === undefined ? null : whereColumn(model, sortBy.field);
  if (sortBy !== undefined && orderColumn === null) return [];
  const orderDirection = sortBy?.direction === "desc" ? "DESC" : "ASC";
  const order = orderColumn === null ? "" : ` ORDER BY ${orderColumn} ${orderDirection}`;
  const query = `SELECT * FROM ${tableNames[model]} WHERE ${clause.sql}${order} LIMIT ? OFFSET ?`;
  const rows = await all<DatabaseRow>(database, query, [
    ...clause.values,
    Math.max(0, limit),
    Math.max(0, offset ?? 0),
  ]);
  return joinedRows(
    database,
    model,
    rows.map((row) => toModel(model, row)),
    join,
  );
}

function queryData(data: Record<string, unknown>): { columns: string[]; values: unknown[] } {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  return { columns: entries.map(([column]) => column), values: entries.map(([, value]) => value) };
}

function safeError(): Error {
  return new Error("The authentication request could not be completed.");
}

export function createD1AuthAdapter(database: D1Database): DBAdapter {
  const adapter = {
    id: "open-sessionboard-d1",
    async create({ model: modelValue, data }: { model: string; data: Record<string, unknown> }) {
      const model = modelName(modelValue);
      const hasId =
        typeof data.id === "string"
          ? data.id.trim().length > 0
          : data.id !== undefined && data.id !== null;
      const dataWithId = hasId ? data : { ...data, id: crypto.randomUUID() };
      const databaseData = await toDatabaseData(database, model, dataWithId as DatabaseData);
      const { columns: names, values } = queryData(databaseData);
      if (names.length === 0) throw safeError();
      const row = await first<DatabaseRow>(
        database,
        `INSERT INTO ${tableNames[model]} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")}) RETURNING *`,
        values,
      );
      if (row === null) throw safeError();
      const output = toModel(model, row);
      if (model === "session" && typeof data.token === "string") output.token = data.token;
      return output;
    },
    async findOne({ model, where, join }: { model: string; where: Where[]; join?: unknown }) {
      return (await findOne(database, model, where as Where[], join)) as never;
    },
    async findMany({
      model,
      where,
      limit,
      offset,
      sortBy,
      join,
    }: {
      model: string;
      where?: Where[];
      limit: number;
      offset?: number;
      sortBy?: { field: string; direction: "asc" | "desc" };
      join?: unknown;
    }) {
      return (await findMany(
        database,
        model,
        where as Where[] | undefined,
        limit,
        sortBy,
        offset,
        join,
      )) as never;
    },
    async count({ model, where }: { model: string; where?: Where[] }) {
      const typedModel = modelName(model);
      const clause = await whereClause(database, typedModel, where as Where[] | undefined);
      if (clause === null) return 0;
      const row = await first<{ count: number | string }>(
        database,
        `SELECT COUNT(*) AS count FROM ${tableNames[typedModel]} WHERE ${clause.sql}`,
        clause.values,
      );
      return row === null ? 0 : Number(row.count);
    },
    async update({
      model: modelValue,
      where,
      update,
    }: {
      model: string;
      where: Where[];
      update: Record<string, unknown>;
    }) {
      const model = modelName(modelValue);
      const clause = await whereClause(database, model, where as Where[]);
      if (clause === null) return null;
      const databaseData = await toDatabaseData(database, model, update as DatabaseData);
      const { columns: names, values } = queryData(databaseData);
      if (names.length === 0) return findOne(database, model, where as Where[]);
      const row = await first<DatabaseRow>(
        database,
        `UPDATE ${tableNames[model]} SET ${names.map((name) => `${name} = ?`).join(", ")} WHERE ${clause.sql} RETURNING *`,
        [...values, ...clause.values],
      );
      if (row === null) return null;
      const output = toModel(model, row);
      if (model === "session") {
        const token = rawSessionToken(where as Where[]);
        if (token !== undefined) output.token = token;
      }
      return output;
    },
    async updateMany({
      model: modelValue,
      where,
      update,
    }: {
      model: string;
      where: Where[];
      update: Record<string, unknown>;
    }) {
      const model = modelName(modelValue);
      const clause = await whereClause(database, model, where as Where[]);
      if (clause === null) return 0;
      const databaseData = await toDatabaseData(database, model, update as DatabaseData);
      const { columns: names, values } = queryData(databaseData);
      if (names.length === 0) return 0;
      const result = await database
        .prepare(
          `UPDATE ${tableNames[model]} SET ${names.map((name) => `${name} = ?`).join(", ")} WHERE ${clause.sql}`,
        )
        .bind(...values, ...clause.values)
        .run();
      return Number(result.meta?.changes ?? 0);
    },
    async delete({ model: modelValue, where }: { model: string; where: Where[] }) {
      const model = modelName(modelValue);
      const clause = await whereClause(database, model, where as Where[]);
      if (clause === null) return;
      await database
        .prepare(`DELETE FROM ${tableNames[model]} WHERE ${clause.sql}`)
        .bind(...clause.values)
        .run();
    },
    async deleteMany({ model, where }: { model: string; where?: Where[] }) {
      const typedModel = modelName(model);
      const clause = await whereClause(database, typedModel, where as Where[] | undefined);
      if (clause === null) return 0;
      const result = await database
        .prepare(`DELETE FROM ${tableNames[typedModel]} WHERE ${clause.sql}`)
        .bind(...clause.values)
        .run();
      return Number(result.meta?.changes ?? 0);
    },
    async consumeOne({ model: modelValue, where }: { model: string; where: Where[] }) {
      const model = modelName(modelValue);
      const clause = await whereClause(database, model, where as Where[]);
      if (clause === null) return null;
      const row = await first<DatabaseRow>(
        database,
        `DELETE FROM ${tableNames[model]} WHERE id = (SELECT id FROM ${tableNames[model]} WHERE ${clause.sql} LIMIT 1) RETURNING *`,
        clause.values,
      );
      return row === null ? null : toModel(model, row);
    },
    async incrementOne() {
      return null;
    },
    async transaction(callback: (transactionAdapter: DBAdapter) => Promise<unknown>) {
      return callback(adapter as unknown as DBAdapter);
    },
  };
  return adapter as unknown as DBAdapter;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function sessionFromPayload(payload: unknown): AuthSession | null {
  if (!isRecord(payload) || !isRecord(payload.session) || !isRecord(payload.user)) return null;
  const session = payload.session;
  const user = payload.user;
  if (
    typeof session.id !== "string" ||
    typeof session.userId !== "string" ||
    typeof session.expiresAt !== "string" ||
    typeof user.email !== "string" ||
    typeof user.id !== "string"
  ) {
    return null;
  }
  const expiresAt = new Date(session.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || session.userId !== user.id) return null;
  const displayName = authDisplayName(user.name);
  return {
    sessionId: session.id,
    userId: session.userId,
    ...(displayName === undefined ? {} : { displayName }),
    email: user.email,
    emailVerified: user.emailVerified === true,
    expiresAt,
    memberships: [],
    speakerGrants: [],
    reviewerGrants: [],
  };
}

function genericResponseError(): Error {
  return new Error("The authentication request could not be completed.");
}

export function createBetterAuthRuntime(options: BetterAuthRuntimeOptions): BetterAuthRuntime {
  const { configuration } = options;
  const secureCookies = new URL(configuration.baseUrl).protocol === "https:";
  const authOptions: BetterAuthOptions = {
    appName: "Eventloom",
    baseURL: configuration.baseUrl,
    basePath: "/api/auth",
    secret: configuration.secret,
    database: () => createD1AuthAdapter(options.database),
    trustedOrigins: [...configuration.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      password: {
        hash: async (password) => {
          assertPasswordPolicy(password);
          return hashPassword(password);
        },
        verify: verifyPassword,
      },
    },
    emailVerification: {
      expiresIn: 15 * 60,
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        try {
          await options.sendMagicLink({ email: user.email, url, token });
        } catch {
          throw new Error("The verification email could not be delivered.");
        }
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    logger: { disabled: true },
    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
      },
      database: {
        generateId: "uuid",
      },
    },
    plugins: [
      magicLink({
        expiresIn: configuration.magicLink.expiresInSeconds,
        storeToken: "plain",
        sendMagicLink: async ({ email, url, token }) => {
          try {
            await options.sendMagicLink({ email, url, token });
          } catch {
            throw new Error("The sign-in link could not be delivered.");
          }
        },
      }),
    ],
    onAPIError: {
      throw: false,
      onError: () => undefined,
    },
  };

  const auth = betterAuth(authOptions);
  const handler = auth.handler;
  const apiOrigin = configuration.baseUrl;
  const trustedOrigin = configuration.trustedOrigins[0] ?? apiOrigin;

  return {
    handler,
    async requestMagicLink(input) {
      const response = await handler(
        new Request(`${apiOrigin}/api/auth/sign-in/magic-link`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: trustedOrigin,
          },
          body: JSON.stringify({ email: input.email, callbackURL: input.callbackUrl }),
        }),
      );
      if (!response.ok) throw genericResponseError();
    },
    async consumeMagicLink(token) {
      const response = await handler(
        new Request(`${apiOrigin}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`, {
          headers: { origin: trustedOrigin },
        }),
      );
      if (!response.ok) return null;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return null;
      }
      return sessionFromPayload(payload);
    },
  };
}

export function createOpenSendMagicLinkMessage(input: {
  readonly email: string;
  readonly url: string;
  readonly sender: OpenSendSenderAddress;
}): OpenSendMessage {
  const verification = input.url.includes("/verify-email");
  const url = escapeHtml(input.url);
  const subject = verification ? "Verify your Eventloom email" : "Your Eventloom sign-in link";
  const action = verification ? "Verify your email" : "Sign in";
  const verb = verification ? "verify your email" : "sign in";
  return {
    from: input.sender,
    to: [input.email],
    subject,
    html: `<p>Use this link to ${verb} to Eventloom:</p><p><a href="${url}">${action}</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
    text: `Use this link to ${verb} to Eventloom: ${input.url}\n\nThis link expires in 15 minutes and can only be used once.`,
    idempotencyKey: `auth-${crypto.randomUUID()}`,
  };
}
