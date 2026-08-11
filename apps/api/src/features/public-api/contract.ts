import type { ApiKeyScope } from "../auth/types";

export type PublicApiOperation = "list" | "get" | "create" | "update";

export interface PublicApiSchema {
  readonly [key: string]: unknown;
}

export interface PublicApiPaginationContract {
  readonly cursor: boolean;
  readonly limit: {
    readonly minimum: number;
    readonly maximum: number;
    readonly default: number;
  };
  readonly direction: readonly ["asc", "desc"];
}

export interface PublicApiFilterContract {
  readonly parameter: "filter";
  readonly encodings: readonly ["json", "dotted", "bracketed"];
  readonly fields: readonly string[];
}

export interface PublicApiMutationContract {
  readonly idempotencyKey: boolean;
  readonly ifMatch?: boolean;
}

export interface PublicApiSecurityContract {
  readonly scheme: "apiKey";
  readonly readScope: ApiKeyScope;
  readonly writeScope?: ApiKeyScope;
}

export interface PublicApiResourceSchemas {
  readonly record: PublicApiSchema;
  readonly create?: PublicApiSchema;
  readonly update?: PublicApiSchema;
}

export interface PublicApiResourceContract {
  readonly path: string;
  readonly name: string;
  readonly operations: readonly PublicApiOperation[];
  readonly security: PublicApiSecurityContract;
  readonly allowedSorts: readonly string[];
  readonly defaultSort: string;
  readonly pagination: PublicApiPaginationContract;
  readonly filters: PublicApiFilterContract;
  readonly mutations?: {
    readonly create?: PublicApiMutationContract;
    readonly update?: PublicApiMutationContract;
  };
  readonly schemas: PublicApiResourceSchemas;
}

export interface PublicApiV1Contract {
  readonly basePath: "/api/v1";
  readonly securityScheme: {
    readonly name: "apiKey";
    readonly type: "http";
    readonly scheme: "bearer";
    readonly bearerFormat: string;
  };
  readonly schemas: {
    readonly page: PublicApiSchema;
    readonly error: PublicApiSchema;
    readonly rateLimited: PublicApiSchema;
  };
  readonly resources: readonly PublicApiResourceContract[];
}

const publicRecordSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string" },
    organizationId: { type: "string" },
    version: { type: "integer", minimum: 1 },
    updatedAt: { type: "string", format: "date-time" },
  },
  additionalProperties: true,
} as const;

const mutationSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const publicApiErrorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message", "traceId"],
      properties: {
        code: {
          type: "string",
          enum: [
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
          ],
        },
        message: { type: "string" },
        traceId: { type: "string", format: "uuid" },
        details: { type: "array", items: { type: "object" } },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

export const publicApiV1Contract = {
  basePath: "/api/v1",
  securityScheme: {
    name: "apiKey",
    type: "http",
    scheme: "bearer",
    bearerFormat: "Open Sessionboard scoped API key",
  },
  schemas: {
    page: {
      type: "object",
      required: ["data", "page"],
      properties: {
        data: { type: "array", items: { type: "object", additionalProperties: true } },
        page: {
          type: "object",
          required: ["nextCursor", "hasMore"],
          properties: {
            nextCursor: { type: ["string", "null"] },
            hasMore: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    error: publicApiErrorSchema,
    rateLimited: publicApiErrorSchema,
  },
  resources: [
    {
      path: "events",
      name: "Events",
      operations: ["list", "get", "create", "update"],
      security: {
        scheme: "apiKey",
        readScope: "events:read",
        writeScope: "events:write",
      },
      allowedSorts: ["id", "name", "updatedAt"],
      defaultSort: "id",
      pagination: {
        cursor: true,
        limit: { minimum: 1, maximum: 100, default: 25 },
        direction: ["asc", "desc"],
      },
      filters: {
        parameter: "filter",
        encodings: ["json", "dotted", "bracketed"],
        fields: ["status", "slug"],
      },
      mutations: {
        create: { idempotencyKey: true },
        update: { idempotencyKey: true, ifMatch: true },
      },
      schemas: { record: publicRecordSchema, create: mutationSchema, update: mutationSchema },
    },
    {
      path: "speakers",
      name: "Speakers",
      operations: ["list", "get"],
      security: { scheme: "apiKey", readScope: "submissions:read" },
      allowedSorts: ["id", "displayName", "updatedAt"],
      defaultSort: "id",
      pagination: {
        cursor: true,
        limit: { minimum: 1, maximum: 100, default: 25 },
        direction: ["asc", "desc"],
      },
      filters: {
        parameter: "filter",
        encodings: ["json", "dotted", "bracketed"],
        fields: ["eventId", "displayName"],
      },
      schemas: { record: publicRecordSchema },
    },
    {
      path: "agenda",
      name: "Agenda",
      operations: ["list", "get"],
      security: { scheme: "apiKey", readScope: "agenda:read" },
      allowedSorts: ["id", "updatedAt"],
      defaultSort: "id",
      pagination: {
        cursor: true,
        limit: { minimum: 1, maximum: 100, default: 25 },
        direction: ["asc", "desc"],
      },
      filters: {
        parameter: "filter",
        encodings: ["json", "dotted", "bracketed"],
        fields: ["revision"],
      },
      schemas: { record: publicRecordSchema },
    },
    {
      path: "sessions",
      name: "Sessions",
      operations: ["list", "get", "create", "update"],
      security: {
        scheme: "apiKey",
        readScope: "agenda:read",
        writeScope: "agenda:write",
      },
      allowedSorts: ["id", "title", "updatedAt"],
      defaultSort: "id",
      pagination: {
        cursor: true,
        limit: { minimum: 1, maximum: 100, default: 25 },
        direction: ["asc", "desc"],
      },
      filters: {
        parameter: "filter",
        encodings: ["json", "dotted", "bracketed"],
        fields: ["eventId", "status"],
      },
      mutations: {
        create: { idempotencyKey: true },
        update: { idempotencyKey: true, ifMatch: true },
      },
      schemas: { record: publicRecordSchema, create: mutationSchema, update: mutationSchema },
    },
  ],
} as const satisfies PublicApiV1Contract;

export function publicApiResourceContract(
  contract: PublicApiV1Contract,
  path: string,
): PublicApiResourceContract | undefined {
  return contract.resources.find((resource) => resource.path === path);
}
