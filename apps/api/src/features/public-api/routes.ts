import { type Context, Hono } from "hono";
import { ZodError, type ZodType } from "zod";
import { type ApiKeyScope, AuthAccessError, type AuthPrincipal } from "../auth/types";
import {
  type PublicApiOperation,
  type PublicApiResourceContract,
  type PublicApiV1Contract,
  publicApiResourceContract,
  publicApiV1Contract,
} from "./contract";
import {
  type CursorDirection,
  CursorError,
  type CursorPayload,
  cursorPage,
  decodeCursor,
  encodeCursor,
} from "./cursor";
import {
  internalError,
  PublicApiError,
  type PublicApiErrorCode,
  publicApiErrorResponse,
  traceIdFor,
  validationError,
} from "./errors";
import {
  createIdempotencyCoordinator,
  IdempotencyConflictError,
  type IdempotencyCoordinator,
  type IdempotencyStore,
  requestFingerprint,
  runIdempotent,
  stableStringify,
} from "./idempotency";

export interface PublicApiRouteVariables {
  authPrincipal: AuthPrincipal | null;
  traceId?: string;
}

export interface PublicApiRouteEnvironment {
  Variables: PublicApiRouteVariables;
}

export type PublicApiAction = "read" | "write";

export interface PublicApiAuthorizationInput {
  readonly principal: AuthPrincipal;
  readonly organizationId: string;
  readonly action: PublicApiAction;
  readonly resource: string;
  readonly scope?: ApiKeyScope;
}

export type PublicApiAuthorizationHook = (
  input: PublicApiAuthorizationInput,
) => void | Promise<void>;

export interface PublicApiListInput {
  readonly organizationId: string;
  readonly resource: string;
  readonly limit: number;
  readonly pageSize?: number;
  readonly cursor?: string;
  readonly cursorData?: CursorPayload;
  readonly sort: string;
  readonly direction: CursorDirection;
  readonly filters: Readonly<Record<string, string>>;
  readonly principal: AuthPrincipal;
}

export interface PublicApiGetInput {
  readonly organizationId: string;
  readonly resource: string;
  readonly id: string;
  readonly principal: AuthPrincipal;
}

export interface PublicApiCreateInput<TCreate> {
  readonly organizationId: string;
  readonly resource: string;
  readonly data: TCreate;
  readonly idempotencyKey: string;
  readonly principal: AuthPrincipal;
}

export interface PublicApiUpdateInput<TUpdate> {
  readonly organizationId: string;
  readonly resource: string;
  readonly id: string;
  readonly data: TUpdate;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly principal: AuthPrincipal;
}

export interface PublicApiListResult<TRecord> {
  readonly items: readonly TRecord[];
  readonly nextCursor?: string | CursorPayload | null;
  readonly hasMore?: boolean;
  readonly page?: {
    readonly nextCursor?: string | CursorPayload | null;
    readonly hasMore?: boolean;
  };
}

export interface PublicApiRepository<
  TRecord = Record<string, unknown>,
  TCreate = Record<string, unknown>,
  TUpdate = Record<string, unknown>,
> {
  list(input: PublicApiListInput): Promise<PublicApiListResult<TRecord>>;
  get(input: PublicApiGetInput): Promise<TRecord | null | undefined>;
  create(input: PublicApiCreateInput<TCreate>): Promise<TRecord>;
  update(input: PublicApiUpdateInput<TUpdate>): Promise<TRecord | null | undefined>;
}

export interface PublicApiResourceDefinition<
  TRecord = Record<string, unknown>,
  TCreate = Record<string, unknown>,
  TUpdate = Record<string, unknown>,
> {
  /** The URL segment and OpenAPI display name. `path` is an optional alias. */
  readonly name?: string;
  readonly path?: string;
  readonly repository: PublicApiRepository<TRecord, TCreate, TUpdate>;
  /**
   * Optional per-resource override for callers that do not provide a public-v1 contract.
   * Production adapters use the shared contract descriptor on route options.
   */
  readonly operations?: readonly PublicApiOperation[];
  readonly readScope?: ApiKeyScope;
  readonly writeScope?: ApiKeyScope;
  readonly scope?: ApiKeyScope;
  readonly sortFields?: readonly string[];
  readonly defaultSort?: string;
  readonly idField?: string;
  readonly versionField?: string;
  readonly createSchema?: ZodType<TCreate>;
  readonly updateSchema?: ZodType<TUpdate>;
  readonly schemas?: {
    readonly create?: ZodType<TCreate>;
    readonly update?: ZodType<TUpdate>;
  };
  readonly openApi?: Readonly<Record<string, unknown>>;
}

export type PublicApiResourceModule<
  TRecord = Record<string, unknown>,
  TCreate = Record<string, unknown>,
  TUpdate = Record<string, unknown>,
> = PublicApiResourceDefinition<TRecord, TCreate, TUpdate>;

export interface PublicApiOpenApiOptions {
  readonly title?: string;
  readonly version?: string;
  readonly description?: string;
}

export interface PublicApiRoutesOptions<
  TRecord = Record<string, unknown>,
  TCreate = Record<string, unknown>,
  TUpdate = Record<string, unknown>,
> {
  readonly resources: readonly PublicApiResourceDefinition<TRecord, TCreate, TUpdate>[];
  readonly contract?: PublicApiV1Contract;
  readonly idempotency?: IdempotencyCoordinator;
  readonly idempotencyStore?: IdempotencyStore;
  readonly authorize?: PublicApiAuthorizationHook;
  readonly openApi?: PublicApiOpenApiOptions;
}

const apiKeyScopes = new Set<ApiKeyScope>([
  "events:read",
  "events:write",
  "submissions:read",
  "submissions:write",
  "agenda:read",
  "agenda:write",
  "webhooks:read",
  "webhooks:write",
]);

const knownQueryKeys = new Set(["cursor", "limit", "sort", "direction", "filter"]);

interface ListQuery {
  readonly cursor?: string;
  readonly limit: number;
  readonly sort: string;
  readonly direction: CursorDirection;
  readonly filters: Readonly<Record<string, string>>;
  readonly filterHash: string;
}

interface MutationResult {
  readonly status: 200 | 201;
  readonly body: unknown;
}

function resourceSegment<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
): string {
  const segment = (resource.path ?? resource.name ?? "").replace(/^\/+|\/+$/gu, "");
  if (segment.length === 0 || segment.includes("/")) {
    throw new TypeError("A public API resource needs a single non-empty path segment.");
  }
  return segment;
}

function resourceDisplayName<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
): string {
  return resource.name ?? resource.path ?? resourceSegment(resource);
}
function resourceContract<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  contract: PublicApiV1Contract,
): PublicApiResourceContract | undefined {
  return publicApiResourceContract(contract, resourceSegment(resource));
}

function operationEnabled<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  operation: PublicApiOperation,
  contract: PublicApiV1Contract,
): boolean {
  if (resource.operations !== undefined) {
    return resource.operations.includes(operation);
  }
  return resourceContract(resource, contract)?.operations.includes(operation) ?? true;
}

function allowedSorts<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  contractResource: PublicApiResourceContract | undefined,
): readonly string[] | undefined {
  return resource.sortFields ?? contractResource?.allowedSorts;
}

function defaultSortFor<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  contractResource: PublicApiResourceContract | undefined,
): string {
  return resource.defaultSort ?? contractResource?.defaultSort ?? resource.idField ?? "id";
}

function scopeFor<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  action: PublicApiAction,
  contractResource?: PublicApiResourceContract,
): ApiKeyScope | undefined {
  const explicit = action === "read" ? resource.readScope : resource.writeScope;
  if (explicit !== undefined) {
    return explicit;
  }
  if (resource.scope !== undefined) {
    return resource.scope;
  }
  if (contractResource !== undefined) {
    return action === "read"
      ? contractResource.security.readScope
      : contractResource.security.writeScope;
  }
  const candidate = `${resourceSegment(resource)}:${action}`;
  return apiKeyScopes.has(candidate as ApiKeyScope) ? (candidate as ApiKeyScope) : undefined;
}

export function authorizePublicApiPrincipal(
  principal: AuthPrincipal | null | undefined,
  organizationId: string,
  action: PublicApiAction,
  resource: string,
  scope?: ApiKeyScope,
): AuthPrincipal {
  if (principal === null || principal === undefined) {
    throw new PublicApiError(
      "AUTHENTICATION_REQUIRED",
      "Authentication is required to access the public API.",
    );
  }

  if (principal.kind !== "apiKey") {
    throw new PublicApiError(
      "ACCESS_DENIED",
      "A scoped API key is required to access the public API.",
    );
  }
  if (principal.organizationId !== organizationId) {
    throw new PublicApiError(
      "TENANT_SCOPE_VIOLATION",
      "The credential cannot access this organization.",
    );
  }
  if (scope === undefined || !principal.scopes.includes(scope)) {
    throw new PublicApiError(
      "ACCESS_DENIED",
      `The credential is missing the ${action} scope for ${resource}.`,
    );
  }
  return principal;
}

export function requirePublicApiRead(
  principal: AuthPrincipal | null | undefined,
  organizationId: string,
  resource: string,
  scope?: ApiKeyScope,
): AuthPrincipal {
  return authorizePublicApiPrincipal(principal, organizationId, "read", resource, scope);
}

export function requirePublicApiWrite(
  principal: AuthPrincipal | null | undefined,
  organizationId: string,
  resource: string,
  scope?: ApiKeyScope,
): AuthPrincipal {
  return authorizePublicApiPrincipal(principal, organizationId, "write", resource, scope);
}

function principalIdentity(principal: AuthPrincipal): string {
  return principal.kind === "apiKey" ? `api-key:${principal.apiKeyId}` : `user:${principal.userId}`;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  if (!/^\d+$/u.test(value)) {
    throw validationError("The pagination limit is invalid.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw validationError("The pagination limit is invalid.");
  }
  return parsed;
}

function filterValues(
  query: Record<string, string | undefined>,
  contractResource?: PublicApiResourceContract,
): Record<string, string> {
  const filters: Record<string, string> = {};
  const allowedFields = new Set(contractResource?.filters.fields ?? []);
  const addFilter = (key: string, value: string): void => {
    if (!allowedFields.has(key)) {
      throw validationError("The filter field is not supported.");
    }
    filters[key] = value;
  };

  const encoded = query.filter;
  if (encoded !== undefined && encoded.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(encoded);
    } catch {
      throw validationError("The filter query parameter is invalid.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw validationError("The filter query parameter is invalid.");
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw validationError("The filter query parameter is invalid.");
      }
      addFilter(key, String(value));
    }
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || knownQueryKeys.has(key)) {
      continue;
    }
    const dotted = key.startsWith("filter.") ? key.slice("filter.".length) : undefined;
    const bracketed = /^filter\[([^\]]+)\]$/u.exec(key)?.[1];
    const filterKey = dotted ?? bracketed;
    if (filterKey === undefined || filterKey.length === 0) {
      throw validationError("The query parameter is not supported.");
    }
    addFilter(filterKey, value);
  }
  return filters;
}

function parseListQuery<TRecord, TCreate, TUpdate>(
  context: Context<PublicApiRouteEnvironment>,
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  contractResource?: PublicApiResourceContract,
): ListQuery {
  const query = context.req.query();
  const cursor = query.cursor;
  if (cursor !== undefined && (cursor.trim().length === 0 || cursor.length > 2_048)) {
    throw validationError("The cursor is invalid.");
  }

  const direction = query.direction ?? "asc";
  if (direction !== "asc" && direction !== "desc") {
    throw validationError("The sort direction is invalid.");
  }

  const sort = query.sort ?? defaultSortFor(resource, contractResource);
  if (sort.trim().length === 0 || sort.length > 100) {
    throw validationError("The sort field is invalid.");
  }
  const sortFields = allowedSorts(resource, contractResource);
  if (sortFields !== undefined && !sortFields.includes(sort)) {
    throw validationError("The sort field is not supported.");
  }

  const filters = filterValues(query, contractResource);
  const filterHash = stableStringify(filters);
  const pagination = contractResource?.pagination;
  return {
    ...(cursor === undefined ? {} : { cursor }),
    limit: parsePositiveInteger(
      query.limit,
      pagination?.limit.default ?? 25,
      pagination?.limit.maximum ?? 100,
    ),
    sort,
    direction,
    filters,
    filterHash,
  };
}

function requiredRouteParam(context: Context<PublicApiRouteEnvironment>, name: string): string {
  const value = context.req.param(name);
  if (value === undefined || value.trim().length === 0 || value.length > 200) {
    throw validationError(`The ${name} path parameter is required.`);
  }
  return value;
}

function scalarValue(value: unknown): string | number | boolean | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value === undefined ? null : stableStringify(value);
}

function compareValues(left: unknown, right: unknown): number {
  const a = scalarValue(left);
  const b = scalarValue(right);
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : 1;
  }
  const leftText = String(a);
  const rightText = String(b);
  return leftText < rightText ? -1 : 1;
}

function recordValue(record: unknown, key: string): unknown {
  if (typeof record !== "object" || record === null) {
    return undefined;
  }
  return (record as Record<string, unknown>)[key];
}

function sortItems<TRecord>(
  items: readonly TRecord[],
  sort: string,
  direction: CursorDirection,
  idField: string,
): TRecord[] {
  const copy = [...items];
  copy.sort((left, right) => {
    const primary = compareValues(recordValue(left, sort), recordValue(right, sort));
    const tie =
      primary === 0 ? compareValues(recordValue(left, idField), recordValue(right, idField)) : 0;
    const result = primary === 0 ? tie : primary;
    return direction === "asc" ? result : -result;
  });
  return copy;
}

function cursorForItem(
  item: unknown,
  input: {
    readonly organizationId: string;
    readonly resource: string;
    readonly sort: string;
    readonly direction: CursorDirection;
    readonly idField: string;
    readonly filterHash: string;
  },
): string {
  const idValue = recordValue(item, input.idField);
  const id = idValue === undefined || idValue === null ? stableStringify(item) : String(idValue);
  const values = [scalarValue(recordValue(item, input.sort)), id] as [
    string | number | boolean | null,
    string,
  ];
  return encodeCursor({
    version: 1,
    organizationId: input.organizationId,
    resource: input.resource,
    sort: input.sort,
    direction: input.direction,
    values,
    id,
    filterHash: input.filterHash,
  });
}

function validateCursor(
  cursor: CursorPayload,
  input: {
    readonly organizationId: string;
    readonly resource: string;
    readonly sort: string;
    readonly direction: CursorDirection;
    readonly filterHash: string;
  },
): void {
  if (
    cursor.organizationId !== input.organizationId ||
    cursor.resource !== input.resource ||
    cursor.sort !== input.sort ||
    cursor.direction !== input.direction ||
    (cursor.filterHash ?? "") !== input.filterHash
  ) {
    throw validationError("The cursor is invalid for this request.");
  }
}

function normalizeListResult<TRecord>(value: unknown): PublicApiListResult<TRecord> {
  if (Array.isArray(value)) {
    return { items: value as TRecord[] };
  }
  if (typeof value !== "object" || value === null) {
    throw new PublicApiError("INTERNAL_ERROR", "The resource repository returned an invalid page.");
  }
  const result = value as {
    items?: unknown;
    data?: unknown;
    nextCursor?: string | CursorPayload | null;
    hasMore?: boolean;
    page?: {
      nextCursor?: string | CursorPayload | null;
      hasMore?: boolean;
    };
  };
  const rawItems = result.items ?? result.data;
  if (!Array.isArray(rawItems)) {
    throw new PublicApiError("INTERNAL_ERROR", "The resource repository returned an invalid page.");
  }
  const nextCursor = result.nextCursor ?? result.page?.nextCursor;
  const hasMore = result.hasMore ?? result.page?.hasMore;
  return {
    items: rawItems as TRecord[],
    ...(nextCursor === undefined ? {} : { nextCursor }),
    ...(hasMore === undefined ? {} : { hasMore }),
  };
}

function nextCursorFromResult<TRecord>(
  nextCursor: string | CursorPayload | null | undefined,
  last: TRecord | undefined,
  input: {
    readonly organizationId: string;
    readonly resource: string;
    readonly sort: string;
    readonly direction: CursorDirection;
    readonly idField: string;
    readonly filterHash: string;
  },
): string | null {
  if (nextCursor !== null && typeof nextCursor === "object") {
    const candidate = nextCursor as Partial<CursorPayload>;
    const id =
      candidate.id ?? (last === undefined ? undefined : String(recordValue(last, input.idField)));
    if (id === undefined) {
      return null;
    }
    return encodeCursor({
      version: 1,
      organizationId: candidate.organizationId ?? input.organizationId,
      resource: candidate.resource ?? input.resource,
      sort: candidate.sort ?? input.sort,
      direction: candidate.direction ?? input.direction,
      values: candidate.values ?? [id],
      id,
      filterHash: candidate.filterHash ?? input.filterHash,
    });
  }
  if (typeof nextCursor === "string") {
    try {
      const parsed = decodeCursor(nextCursor);
      validateCursor(parsed, input);
      return nextCursor;
    } catch {
      if (last === undefined) {
        return null;
      }
      return encodeCursor({
        version: 1,
        organizationId: input.organizationId,
        resource: input.resource,
        sort: input.sort,
        direction: input.direction,
        values: [nextCursor],
        id: String(recordValue(last, input.idField) ?? nextCursor),
        filterHash: input.filterHash,
      });
    }
  }
  if (last === undefined) {
    return null;
  }
  return cursorForItem(last, input);
}

function parseExpectedVersion(
  context: Context<PublicApiRouteEnvironment>,
  body: unknown,
): { readonly expectedVersion: number; readonly data: unknown } {
  const header = context.req.header("if-match");
  const raw = header?.trim().replace(/^W\//u, "").replace(/^"|"$/gu, "");
  if (raw === undefined || !/^\d+$/u.test(raw)) {
    throw new PublicApiError("PRECONDITION_FAILED", "An If-Match version is required for updates.");
  }
  const expectedVersion = Number(raw);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new PublicApiError("PRECONDITION_FAILED", "The If-Match version is invalid.");
  }

  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const copy = { ...(body as Record<string, unknown>) };
    delete copy.expectedVersion;
    if ("data" in copy && Object.keys(copy).length === 1) {
      return { expectedVersion, data: copy.data };
    }
    return { expectedVersion, data: copy };
  }
  return { expectedVersion, data: body };
}

async function requestBody(context: Context<PublicApiRouteEnvironment>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    throw validationError("The request body must be valid JSON.");
  }
}

function parseMutationBody<T>(body: unknown, schema: ZodType<T> | undefined): T {
  let candidate = body;
  if (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    "data" in body &&
    Object.keys(body as Record<string, unknown>).length === 1
  ) {
    candidate = (body as { data: unknown }).data;
  }
  if (schema === undefined) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw validationError("The request body must be an object.");
    }
    return candidate as T;
  }
  try {
    return schema.parse(candidate);
  } catch (error) {
    if (error instanceof ZodError) {
      throw validationError("The request body is invalid.");
    }
    throw error;
  }
}

function idempotencyKey(context: Context<PublicApiRouteEnvironment>): string {
  const key = context.req.header("idempotency-key")?.trim();
  if (key === undefined || key.length < 8 || key.length > 128) {
    throw validationError("A valid Idempotency-Key header is required for writes.");
  }
  return key;
}

function mutationResponse(value: unknown): MutationResult {
  if (typeof value === "object" && value !== null && "status" in value && "body" in value) {
    const status = (value as { status?: unknown }).status;
    if (status === 200 || status === 201) {
      const result = value as { status: 200 | 201; body: unknown };
      return { status: result.status, body: result.body };
    }
  }
  return { status: 200, body: value };
}

function resourceSchema<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  action: "create",
): ZodType<TCreate> | undefined;
function resourceSchema<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  action: "update",
): ZodType<TUpdate> | undefined;
function resourceSchema<TRecord, TCreate, TUpdate>(
  resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
  action: "create" | "update",
): ZodType<TCreate> | ZodType<TUpdate> | undefined {
  return action === "create"
    ? (resource.createSchema ?? resource.schemas?.create)
    : (resource.updateSchema ?? resource.schemas?.update);
}

function toSchemaName(value: string, suffix: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .split(/[^A-Za-z0-9]+/u)
    .filter((word) => word.length > 0)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join("");
  return `PublicApi${words || "Resource"}${suffix}`;
}

function schemaRef(name: string): Record<string, unknown> {
  return { $ref: `#/components/schemas/${name}` };
}

function openApiErrorResponse(
  schemaName: string,
  description: string,
  retryAfter = false,
): Record<string, unknown> {
  return {
    description,
    ...(retryAfter
      ? {
          headers: {
            "Retry-After": {
              description: "Seconds until the client should retry.",
              schema: { type: "integer", minimum: 1 },
            },
          },
        }
      : {}),
    content: { "application/json": { schema: schemaRef(schemaName) } },
  };
}

function openApiDocument<TRecord, TCreate, TUpdate>(
  resources: readonly PublicApiResourceDefinition<TRecord, TCreate, TUpdate>[],
  options: PublicApiOpenApiOptions | undefined,
  contract: PublicApiV1Contract,
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const resourceSchemas: Record<string, unknown> = {};
  const errorSchemaName = "PublicApiError";
  const rateLimitSchemaName = "PublicApiRateLimit";
  for (const resource of resources) {
    const segment = resourceSegment(resource);
    const descriptor = resourceContract(resource, contract);
    const displayName = resourceDisplayName(resource);
    const collection = `${contract.basePath}/organizations/{organizationId}/${segment}`;
    const item = `${collection}/{id}`;
    const recordSchemaName = toSchemaName(displayName, "Record");
    const createSchemaName = toSchemaName(displayName, "Create");
    const updateSchemaName = toSchemaName(displayName, "Update");
    const pageSchemaName = toSchemaName(displayName, "Page");
    const recordSchema = descriptor?.schemas.record ?? {
      type: "object",
      additionalProperties: true,
    };
    const createSchema = descriptor?.schemas.create ?? {
      type: "object",
      additionalProperties: true,
    };
    const updateSchema = descriptor?.schemas.update ?? {
      type: "object",
      additionalProperties: true,
    };
    resourceSchemas[recordSchemaName] = recordSchema;
    if (operationEnabled(resource, "create", contract)) {
      resourceSchemas[createSchemaName] = createSchema;
    }
    if (operationEnabled(resource, "update", contract)) {
      resourceSchemas[updateSchemaName] = updateSchema;
    }
    resourceSchemas[pageSchemaName] = {
      ...contract.schemas.page,
      properties: {
        ...(contract.schemas.page.properties as Record<string, unknown> | undefined),
        data: { type: "array", items: schemaRef(recordSchemaName) },
      },
    };

    const readScope = scopeFor(resource, "read", descriptor);
    const writeScope = scopeFor(resource, "write", descriptor);
    const securitySchemeName = descriptor?.security.scheme ?? contract.securityScheme.name;
    const readSecurity = { [securitySchemeName]: readScope === undefined ? [] : [readScope] };
    const writeSecurity = { [securitySchemeName]: writeScope === undefined ? [] : [writeScope] };
    const pathParameters = [
      {
        name: "organizationId",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 200 },
      },
    ];
    const pagination = descriptor?.pagination;
    const filter = descriptor?.filters;
    const listParameters = [
      ...pathParameters,
      {
        name: "cursor",
        in: "query",
        required: false,
        description: "Opaque cursor returned by the previous page.",
        schema: { type: "string", minLength: 1, maxLength: 2_048 },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: pagination?.limit.minimum ?? 1,
          maximum: pagination?.limit.maximum ?? 100,
          default: pagination?.limit.default ?? 25,
        },
      },
      {
        name: "sort",
        in: "query",
        required: false,
        schema: {
          type: "string",
          default: defaultSortFor(resource, descriptor),
          ...(descriptor === undefined
            ? {}
            : { enum: [...(descriptor.allowedSorts as readonly string[])] }),
        },
      },
      {
        name: "direction",
        in: "query",
        required: false,
        schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
      {
        name: "filter",
        in: "query",
        required: false,
        description:
          filter === undefined
            ? "Filtering is not supported for this resource."
            : `JSON object filter; dotted (filter.field) and bracketed (filter[field]) forms are accepted for ${filter.fields.join(", ")}; unsupported fields and unrelated query parameters are rejected.`,
        schema: { type: "string" },
      },
    ];
    const commonResponses = {
      "400": openApiErrorResponse(errorSchemaName, "The request is invalid."),
      "401": openApiErrorResponse(errorSchemaName, "Authentication is required."),
      "403": openApiErrorResponse(errorSchemaName, "The API key lacks the required scope."),
      "429": openApiErrorResponse(rateLimitSchemaName, "Rate limit exceeded.", true),
      "500": openApiErrorResponse(errorSchemaName, "The request could not be completed."),
      "503": openApiErrorResponse(errorSchemaName, "The public API configuration is unavailable."),
    };
    const mutationResponses = {
      ...commonResponses,
      "409": openApiErrorResponse(
        errorSchemaName,
        "The mutation conflicts with existing state or idempotency.",
      ),
    };
    const collectionOperations: Record<string, unknown> = {};
    if (operationEnabled(resource, "list", contract)) {
      collectionOperations.get = {
        tags: [displayName],
        operationId: `list${toSchemaName(displayName, "").replace(/^PublicApi/u, "")}`,
        summary: `List ${displayName.toLowerCase()}`,
        security: [readSecurity],
        parameters: listParameters,
        responses: {
          ...commonResponses,
          "200": {
            description: "A stable tenant-scoped cursor page.",
            content: { "application/json": { schema: schemaRef(pageSchemaName) } },
          },
        },
      };
    }
    if (operationEnabled(resource, "create", contract)) {
      const mutation = descriptor?.mutations?.create;
      collectionOperations.post = {
        tags: [displayName],
        operationId: `create${toSchemaName(displayName, "").replace(/^PublicApi/u, "")}`,
        summary: `Create ${displayName.toLowerCase()}`,
        security: [writeSecurity],
        parameters: [
          ...pathParameters,
          ...(mutation?.idempotencyKey === false
            ? []
            : [
                {
                  name: "Idempotency-Key",
                  in: "header",
                  required: true,
                  schema: { type: "string", minLength: 8, maxLength: 128 },
                },
              ]),
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: schemaRef(createSchemaName) } },
        },
        responses: {
          ...mutationResponses,
          "201": {
            description: "Created.",
            content: { "application/json": { schema: schemaRef(recordSchemaName) } },
          },
        },
      };
    }
    if (Object.keys(collectionOperations).length > 0) {
      paths[collection] = collectionOperations;
    }

    const itemOperations: Record<string, unknown> = {};
    if (operationEnabled(resource, "get", contract)) {
      itemOperations.get = {
        tags: [displayName],
        operationId: `get${toSchemaName(displayName, "").replace(/^PublicApi/u, "")}`,
        summary: `Get a ${displayName.toLowerCase().replace(/s$/u, "")}`,
        security: [readSecurity],
        parameters: [
          ...pathParameters,
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 200 },
          },
        ],
        responses: {
          ...commonResponses,
          "200": {
            description: "The tenant-scoped resource.",
            content: { "application/json": { schema: schemaRef(recordSchemaName) } },
          },
          "404": openApiErrorResponse(errorSchemaName, "The resource was not found."),
        },
      };
    }
    if (operationEnabled(resource, "update", contract)) {
      const mutation = descriptor?.mutations?.update;
      const mutationParameters = [
        ...pathParameters,
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", minLength: 1, maxLength: 200 },
        },
        ...(mutation?.idempotencyKey === false
          ? []
          : [
              {
                name: "Idempotency-Key",
                in: "header",
                required: true,
                schema: { type: "string", minLength: 8, maxLength: 128 },
              },
            ]),
        ...(mutation?.ifMatch === false
          ? []
          : [
              {
                name: "If-Match",
                in: "header",
                required: true,
                description:
                  "Required header-only resource version; a body expectedVersion value is not a substitute.",
                schema: { type: "string", pattern: '^(W/)?"?[1-9][0-9]*"?$' },
              },
            ]),
      ];
      const updateOperation = (operationId: string) => ({
        tags: [displayName],
        operationId,
        summary: `Update a ${displayName.toLowerCase().replace(/s$/u, "")}`,
        security: [writeSecurity],
        parameters: mutationParameters,
        requestBody: {
          required: true,
          content: { "application/json": { schema: schemaRef(updateSchemaName) } },
        },
        responses: {
          ...mutationResponses,
          "200": {
            description: "Updated.",
            content: { "application/json": { schema: schemaRef(recordSchemaName) } },
          },
          "404": openApiErrorResponse(errorSchemaName, "The resource was not found."),
          "412": openApiErrorResponse(errorSchemaName, "The resource version is stale or missing."),
        },
      });
      itemOperations.patch = updateOperation(
        `update${toSchemaName(displayName, "").replace(/^PublicApi/u, "")}`,
      );
    }
    if (Object.keys(itemOperations).length > 0) {
      paths[item] = itemOperations;
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: options?.title ?? "Open Sessionboard Public API",
      version: options?.version ?? "1.0.0",
      description:
        options?.description ??
        "Tenant-scoped public-v1 resources. See the checked-in OpenAPI contract for stable client generation.",
    },
    servers: [{ url: "/", description: "API origin" }],
    components: {
      securitySchemes: {
        [contract.securityScheme.name]: contract.securityScheme,
      },
      schemas: {
        PublicApiPage: contract.schemas.page,
        PublicApiError: contract.schemas.error,
        PublicApiRateLimit: contract.schemas.rateLimited,
        ...resourceSchemas,
      },
    },
    security: [{ [contract.securityScheme.name]: [] }],
    paths,
  };
}

function publicApiErrorResult(
  context: Context<PublicApiRouteEnvironment>,
  error: PublicApiError,
): Response {
  const response = publicApiErrorResponse(context, error);
  if (error.status === 429) {
    response.headers.set("Retry-After", "60");
  }
  return response;
}

function routeError(context: Context<PublicApiRouteEnvironment>, error: unknown): Response {
  if (error instanceof PublicApiError) {
    return publicApiErrorResult(context, error);
  }
  if (error instanceof AuthAccessError) {
    return publicApiErrorResult(
      context,
      new PublicApiError(
        error.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
        error.message,
      ),
    );
  }
  if (error instanceof CursorError || error instanceof ZodError) {
    return publicApiErrorResult(context, validationError());
  }
  return publicApiErrorResult(context, internalError());
}

export function createPublicApiV1Routes<
  TRecord = Record<string, unknown>,
  TCreate = Record<string, unknown>,
  TUpdate = Record<string, unknown>,
>(options: PublicApiRoutesOptions<TRecord, TCreate, TUpdate>): Hono<PublicApiRouteEnvironment> {
  const resources = options.resources;
  const contract = options.contract ?? publicApiV1Contract;
  const idempotency =
    options.idempotency ??
    (options.idempotencyStore === undefined
      ? undefined
      : createIdempotencyCoordinator(options.idempotencyStore));
  const routes = new Hono<PublicApiRouteEnvironment>();
  const authorize = async (
    context: Context<PublicApiRouteEnvironment>,
    resource: PublicApiResourceDefinition<TRecord, TCreate, TUpdate>,
    organizationId: string,
    action: PublicApiAction,
  ): Promise<AuthPrincipal> => {
    const scope = scopeFor(resource, action, resourceContract(resource, contract));
    const principal =
      action === "read"
        ? requirePublicApiRead(
            context.get("authPrincipal"),
            organizationId,
            resourceDisplayName(resource),
            scope,
          )
        : requirePublicApiWrite(
            context.get("authPrincipal"),
            organizationId,
            resourceDisplayName(resource),
            scope,
          );
    if (options.authorize !== undefined) {
      await options.authorize({
        principal,
        organizationId,
        action,
        resource: resourceSegment(resource),
        ...(scope === undefined ? {} : { scope }),
      });
    }
    return principal;
  };

  routes.get("/openapi.json", (context) =>
    context.json(openApiDocument(resources, options.openApi, contract)),
  );

  for (const resource of resources) {
    const segment = resourceSegment(resource);
    const descriptor = resourceContract(resource, contract);
    const collectionPath = `/organizations/:organizationId/${segment}`;
    const itemPath = `${collectionPath}/:id`;
    const idField = resource.idField ?? "id";
    const versionField = resource.versionField ?? "version";

    if (operationEnabled(resource, "list", contract)) {
      routes.get(collectionPath, async (context) => {
        const organizationId = requiredRouteParam(context, "organizationId");
        const principal = await authorize(context, resource, organizationId, "read");
        const query = parseListQuery(context, resource, descriptor);
        let cursorData: CursorPayload | undefined;
        if (query.cursor !== undefined) {
          try {
            cursorData = decodeCursor(query.cursor);
          } catch {
            throw validationError("The cursor is invalid.");
          }
          validateCursor(cursorData, {
            organizationId,
            resource: segment,
            sort: query.sort,
            direction: query.direction,
            filterHash: query.filterHash,
          });
        }
        const listInput: PublicApiListInput = {
          organizationId,
          resource: segment,
          limit: query.limit,
          pageSize: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(cursorData === undefined ? {} : { cursorData }),
          sort: query.sort,
          direction: query.direction,
          filters: query.filters,
          principal,
        };
        const listed = normalizeListResult<TRecord>(await resource.repository.list(listInput));
        const sorted = sortItems(listed.items, query.sort, query.direction, idField);
        const hasOverflow = sorted.length > query.limit;
        const data = hasOverflow ? sorted.slice(0, query.limit) : sorted;
        const hasMore =
          listed.hasMore === true ||
          (listed.nextCursor !== undefined && listed.nextCursor !== null) ||
          hasOverflow;
        const nextCursor = hasMore
          ? nextCursorFromResult(listed.nextCursor, data[data.length - 1], {
              organizationId,
              resource: segment,
              sort: query.sort,
              direction: query.direction,
              idField,
              filterHash: query.filterHash,
            })
          : null;
        return context.json(cursorPage(data, nextCursor, hasMore && nextCursor !== null));
      });
    }

    if (operationEnabled(resource, "get", contract)) {
      routes.get(itemPath, async (context) => {
        const organizationId = requiredRouteParam(context, "organizationId");
        const principal = await authorize(context, resource, organizationId, "read");
        const id = requiredRouteParam(context, "id");
        const record = await resource.repository.get({
          organizationId,
          resource: segment,
          id,
          principal,
        });
        if (record === null || record === undefined) {
          throw new PublicApiError("NOT_FOUND", "The requested resource was not found.");
        }
        return context.json(record);
      });
    }

    if (operationEnabled(resource, "create", contract)) {
      routes.post(collectionPath, async (context) => {
        const organizationId = requiredRouteParam(context, "organizationId");
        const principal = await authorize(context, resource, organizationId, "write");
        const key = idempotencyKey(context);
        const rawBody = await requestBody(context);
        const data = parseMutationBody(rawBody, resourceSchema(resource, "create"));
        if (idempotency === undefined) {
          throw new PublicApiError(
            "CONFIGURATION_ERROR",
            "An atomic idempotency store is required for public API writes.",
          );
        }
        const operation = async (): Promise<MutationResult> => ({
          status: 201,
          body: await resource.repository.create({
            organizationId,
            resource: segment,
            data,
            idempotencyKey: key,
            principal,
          }),
        });
        const outcome = await runIdempotent(idempotency, {
          scope: `${organizationId}:${segment}:create:${principalIdentity(principal)}:${key}`,
          key,
          fingerprint: requestFingerprint({
            method: "POST",
            path: context.req.path,
            body: data,
          }),
          operation,
        });
        const response = mutationResponse(outcome.value);
        return context.json(response.body, response.status);
      });
    }

    const updateHandler = async (context: Context<PublicApiRouteEnvironment>) => {
      const organizationId = requiredRouteParam(context, "organizationId");
      const principal = await authorize(context, resource, organizationId, "write");
      const key = idempotencyKey(context);
      const rawBody = await requestBody(context);
      const parsedVersion = parseExpectedVersion(context, rawBody);
      const data = parseMutationBody(parsedVersion.data, resourceSchema(resource, "update"));
      if (idempotency === undefined) {
        throw new PublicApiError(
          "CONFIGURATION_ERROR",
          "An atomic idempotency store is required for public API writes.",
        );
      }
      const id = requiredRouteParam(context, "id");
      const operation = async (): Promise<MutationResult> => {
        const current = await resource.repository.get({
          organizationId,
          resource: segment,
          id,
          principal,
        });
        if (current === null || current === undefined) {
          throw new PublicApiError("NOT_FOUND", "The requested resource was not found.");
        }
        const currentVersion = recordValue(current, versionField);
        if (
          typeof currentVersion === "number" &&
          currentVersion !== parsedVersion.expectedVersion
        ) {
          throw new PublicApiError(
            "PRECONDITION_FAILED",
            "The resource has changed since it was read.",
          );
        }
        const updated = await resource.repository.update({
          organizationId,
          resource: segment,
          id,
          data,
          idempotencyKey: key,
          expectedVersion: parsedVersion.expectedVersion,
          principal,
        });
        if (updated === null || updated === undefined) {
          throw new PublicApiError(
            "PRECONDITION_FAILED",
            "The resource has changed since it was read.",
          );
        }
        return { status: 200, body: updated };
      };
      const outcome = await runIdempotent(idempotency, {
        scope: `${organizationId}:${segment}:update:${id}:${principalIdentity(principal)}:${key}`,
        key,
        fingerprint: requestFingerprint({
          method: context.req.method,
          path: context.req.path,
          body: { data, expectedVersion: parsedVersion.expectedVersion },
        }),
        operation,
      });
      const response = mutationResponse(outcome.value);
      return context.json(response.body, response.status);
    };

    if (operationEnabled(resource, "update", contract)) {
      routes.patch(itemPath, updateHandler);
    }
  }

  routes.notFound((context) =>
    publicApiErrorResponse(
      context,
      new PublicApiError("NOT_FOUND", "The requested resource was not found."),
    ),
  );
  routes.onError((error, context) => routeError(context, error));
  return routes;
}

export function publicApiTraceId(context: Context<PublicApiRouteEnvironment>): string {
  return traceIdFor(context);
}

export const publicApiErrorCodes: readonly PublicApiErrorCode[] = [
  "AUTHENTICATION_REQUIRED",
  "ACCESS_DENIED",
  "TENANT_SCOPE_VIOLATION",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "INTEGRATION_UNAVAILABLE",
  "CONFIGURATION_ERROR",
  "INTERNAL_ERROR",
];

export { IdempotencyConflictError };
