import { type Context, Hono } from "hono";
import { ZodError, z } from "zod";
import { AuthAccessError, type AuthPrincipal } from "../auth/types";
import { type CrmService, CrmServiceError, type CrmServiceErrorCode } from "./service";
import type {
  AddContactToEventInput,
  AddCrmNoteInput,
  CreateCrmContactInput,
  CreateCrmSegmentInput,
  CrmActor,
  CrmContactInput,
  CrmContactSearch,
  CrmPipelineStage,
  ImportCrmContactsInput,
  MergeCrmContactsInput,
  SendCrmOutreachInput,
  UpdateCrmContactInput,
  UpdateCrmPipelineInput,
  UpdateCrmSegmentInput,
} from "./types";

export interface CrmRouteEnvironment {
  Variables: {
    traceId?: string;
    authPrincipal: AuthPrincipal | null;
  };
}

export type CrmRouteService = Pick<
  CrmService,
  | "listContacts"
  | "searchContacts"
  | "getContact"
  | "createContact"
  | "updateContact"
  | "importContacts"
  | "previewImport"
  | "previewImportContacts"
  | "listSegments"
  | "getSegment"
  | "createSegment"
  | "updateSegment"
  | "deleteSegment"
  | "listSegmentContacts"
  | "findDuplicates"
  | "previewMergeContacts"
  | "previewMerge"
  | "mergeContacts"
  | "getContactHistory"
  | "listEventHistory"
  | "listPipelineHistory"
  | "setPipelineStage"
  | "addNote"
  | "listNotes"
  | "addContactToEvent"
  | "sendPersonalizedOutreach"
  | "recordOutreachDeliveryStatus"
  | "analytics"
>;

export interface CrmRouteDependencies {
  /** A composed service backed by a D1-authoritative CrmRepository. */
  readonly service: CrmRouteService;
}

type CrmContext = Context<CrmRouteEnvironment>;
type RouteErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "INTEGRATION_UNAVAILABLE";

type ContactBody = CrmContactInput & { readonly idempotencyKey?: string };

const idSchema = z.string().trim().min(1).max(200);
const optionalTextSchema = z.string().trim().max(20_000).nullable().optional();
const contactSchema = z
  .object({
    firstName: optionalTextSchema,
    lastName: optionalTextSchema,
    displayName: z.string().trim().max(300).nullable().optional(),
    email: z.string().trim().max(320).email().nullable().optional(),
    phone: optionalTextSchema,
    company: optionalTextSchema,
    title: optionalTextSchema,
    website: optionalTextSchema,
    linkedinUrl: optionalTextSchema,
    notes: optionalTextSchema,
    tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    customFields: z.record(z.string().trim().min(1).max(100), z.unknown()).optional(),
    source: z.enum(["manual", "csv", "speaker", "import"]).optional(),
    pipelineStage: z
      .enum([
        "new",
        "contacted",
        "qualified",
        "invited",
        "registered",
        "accepted",
        "declined",
        "won",
        "lost",
      ])
      .optional(),
    idempotencyKey: z.string().trim().min(1).max(512).optional(),
  })
  .strict();
const importSchema = z
  .object({
    csv: z.string().max(2_000_000).optional(),
    rows: z.array(z.record(z.string(), z.unknown())).max(10_000).optional(),
    idempotencyKey: z.string().trim().min(1).max(512).optional(),
    mode: z.enum(["upsert", "create"]).optional(),
  })
  .strict();
const segmentRuleSchema = z
  .object({
    field: z.string().trim().min(1).max(200),
    operator: z.enum(["eq", "neq", "contains", "startsWith", "endsWith", "in", "notIn", "exists"]),
    value: z.unknown().optional(),
  })
  .strict();
const segmentSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).nullable().optional(),
    rules: z.array(segmentRuleSchema).min(1).max(50),
  })
  .strict();
const segmentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    rules: z.array(segmentRuleSchema).min(1).max(50).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const mergeSchema = z
  .object({
    duplicateContactIds: z.array(idSchema).min(1).max(100),
    fieldWinners: z.record(z.string().trim().min(1).max(50), idSchema).optional(),
    customFieldWinners: z.record(z.string().trim().min(1).max(100), idSchema).optional(),
    idempotencyKey: z.string().trim().min(1).max(512).optional(),
  })
  .strict();
const pipelineSchema = z
  .object({
    stage: z.enum([
      "new",
      "contacted",
      "qualified",
      "invited",
      "registered",
      "accepted",
      "declined",
      "won",
      "lost",
    ]),
    expectedVersion: z.number().int().positive().optional(),
    score: z.number().finite().min(0).max(100).nullable().optional(),
    rationale: z.string().trim().max(2_000).nullable().optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();
const noteSchema = z.object({ body: z.string().trim().min(1).max(10_000) }).strict();
const eventSchema = z
  .object({
    eventId: idSchema,
    participantId: idSchema.optional(),
    crmContactId: idSchema.optional(),
    sessionId: idSchema.nullable().optional(),
    role: z.enum(["speaker", "prospect", "attendee", "sponsor"]).optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(512).optional(),
  })
  .strict();
const outreachSchema = z
  .object({
    contactId: idSchema,
    eventId: idSchema.nullable().optional(),
    segmentId: idSchema.nullable().optional(),
    subject: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(20_000),
    variables: z.record(z.string().trim().min(1).max(100), z.string().max(2_000)).optional(),
    idempotencyKey: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

function traceId(context: CrmContext): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function errorResponse(
  context: CrmContext,
  status: 400 | 401 | 403 | 404 | 409 | 503,
  code: RouteErrorCode,
  message: string,
  details?: unknown,
): Response {
  return context.json(
    {
      error: {
        code,
        message,
        traceId: traceId(context),
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}

function routeParam(context: CrmContext, name: string): string {
  return idSchema.parse(context.req.param(name));
}

async function body<T>(context: CrmContext, schema: z.ZodType): Promise<T> {
  return schema.parse(await context.req.json().catch(() => undefined)) as T;
}

function idempotencyKey(context: CrmContext, candidate: string | undefined): string {
  const header = context.req.header("idempotency-key")?.trim();
  const bodyKey = candidate?.trim();
  if (header !== undefined && header.length > 0 && bodyKey !== undefined && bodyKey !== header) {
    throw new CrmServiceError(
      "CRM_INVALID_INPUT",
      "The Idempotency-Key header and body key must match.",
      400,
    );
  }
  const key = header || bodyKey;
  if (key === undefined || key.length === 0)
    throw new CrmServiceError("CRM_INVALID_INPUT", "An Idempotency-Key header is required.", 400);
  if (key.length > 512)
    throw new CrmServiceError("CRM_INVALID_INPUT", "The idempotency key is too long.", 400);
  return key;
}
function optionalIdempotencyKey(
  context: CrmContext,
  candidate: string | undefined,
): string | undefined {
  const header = context.req.header("idempotency-key")?.trim();
  const bodyKey = candidate?.trim();
  if (header !== undefined && header.length > 0 && bodyKey !== undefined && bodyKey !== header) {
    throw new CrmServiceError(
      "CRM_INVALID_INPUT",
      "The Idempotency-Key header and body key must match.",
      400,
    );
  }
  const key = header || bodyKey;
  if (key !== undefined && key.length > 512)
    throw new CrmServiceError("CRM_INVALID_INPUT", "The idempotency key is too long.", 400);
  return key === undefined || key.length === 0 ? undefined : key;
}

function organizer(context: CrmContext, organizationId: string): CrmActor {
  const principal = context.get("authPrincipal");
  if (principal === null || principal === undefined)
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  if (principal.kind !== "user")
    throw new AuthAccessError("FORBIDDEN", "Organizer session authentication is required.");
  const membership = principal.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  if (membership === undefined || (membership.role !== "owner" && membership.role !== "admin"))
    throw new AuthAccessError("FORBIDDEN", "An owner or administrator is required.");
  return {
    kind: "user",
    organizationId,
    userId: principal.userId,
    actorName: principal.email,
    role: membership.role,
  };
}

function mapServiceCode(code: CrmServiceErrorCode): RouteErrorCode {
  switch (code) {
    case "CRM_FORBIDDEN":
      return "ACCESS_DENIED";
    case "CRM_NOT_FOUND":
      return "NOT_FOUND";
    case "CRM_CONFLICT":
      return "CONFLICT";
    case "CRM_DEPENDENCY_UNAVAILABLE":
      return "INTEGRATION_UNAVAILABLE";
    case "CRM_INVALID_INPUT":
      return "VALIDATION_FAILED";
  }
}

function crmServiceErrorCode(value: unknown): value is CrmServiceErrorCode {
  switch (value) {
    case "CRM_CONFLICT":
    case "CRM_DEPENDENCY_UNAVAILABLE":
    case "CRM_FORBIDDEN":
    case "CRM_INVALID_INPUT":
    case "CRM_NOT_FOUND":
      return true;
    default:
      return false;
  }
}

function crmServiceError(error: unknown): error is CrmServiceError {
  return (
    error instanceof CrmServiceError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "CrmServiceError" &&
      "status" in error &&
      typeof error.status === "number" &&
      "code" in error &&
      crmServiceErrorCode(error.code) &&
      "message" in error &&
      typeof error.message === "string")
  );
}

function handleError(context: CrmContext, error: unknown): Response {
  if (error instanceof ZodError)
    return errorResponse(
      context,
      400,
      "VALIDATION_FAILED",
      "The CRM request is invalid.",
      error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
      })),
    );
  if (error instanceof AuthAccessError)
    return errorResponse(
      context,
      error.status,
      error.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
      error.message,
    );
  if (crmServiceError(error)) {
    return errorResponse(
      context,
      error.status,
      mapServiceCode(error.code),
      error.message,
      error.details,
    );
  }
  throw error;
}

function searchInput(context: CrmContext): CrmContactSearch {
  const query = context.req.query("query") ?? context.req.query("q");
  const email = context.req.query("email");
  const eventId = context.req.query("eventId");
  const company = context.req.query("company");
  const tags = context.req.query("tags");
  const pipelineStage = context.req.query("pipelineStage") as CrmPipelineStage | undefined;
  const status = context.req.query("status") as "active" | "merged" | undefined;
  const limitRaw = context.req.query("limit");
  const cursor = context.req.query("cursor");
  return {
    ...(query === undefined ? {} : { query }),
    ...(email === undefined ? {} : { email }),
    ...(eventId === undefined ? {} : { eventId }),
    ...(company === undefined ? {} : { company }),
    ...(tags === undefined ? {} : { tags: tags.split(",") }),
    ...(pipelineStage === undefined ? {} : { pipelineStage }),
    ...(status === undefined ? {} : { status }),
    ...(limitRaw === undefined ? {} : { limit: Number(limitRaw) }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

/** Relative routes mounted beneath /api/admin/organizations/:organizationId/crm. */
export function createCrmRoutes(dependencies: CrmRouteDependencies): Hono<CrmRouteEnvironment> {
  if (dependencies === undefined || dependencies.service === undefined)
    throw new TypeError("A composed CRM service is required.");
  const routes = new Hono<CrmRouteEnvironment>();
  routes.use("*", async (context, next) => {
    context.header("cache-control", "private, no-store");
    await next();
  });

  const list = async (context: CrmContext): Promise<Response> => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.listContacts(
          organizer(context, organizationId),
          organizationId,
          searchInput(context),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  };
  routes.get("/", list);
  routes.get("/contacts", list);
  routes.get("/search", list);

  routes.post("/contacts", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<ContactBody>(context, contactSchema);
      const actor = organizer(context, organizationId);
      const key =
        input.idempotencyKey === undefined && context.req.header("idempotency-key") === undefined
          ? undefined
          : idempotencyKey(context, input.idempotencyKey);
      const { idempotencyKey: _bodyKey, ...contactFields } = input;
      const data: CreateCrmContactInput = {
        organizationId,
        ...contactFields,
        ...(key === undefined ? {} : { idempotencyKey: key }),
      };
      return context.json({ data: await dependencies.service.createContact(actor, data) }, 201);
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.get("/contacts/:contactId", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.getContact(
          organizer(context, organizationId),
          organizationId,
          routeParam(context, "contactId"),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.patch("/contacts/:contactId", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<ContactBody & { expectedVersion?: number }>(
        context,
        contactSchema.extend({ expectedVersion: z.number().int().positive().optional() }),
      );
      const data: UpdateCrmContactInput = {
        organizationId,
        contactId: routeParam(context, "contactId"),
        ...input,
      };
      return context.json({
        data: await dependencies.service.updateContact(organizer(context, organizationId), data),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });

  const makeImportInput = (
    organizationId: string,
    input: z.infer<typeof importSchema>,
    key: string | undefined,
  ): ImportCrmContactsInput => ({
    organizationId,
    ...(input.csv === undefined ? {} : { csv: input.csv }),
    ...(input.rows === undefined ? {} : { rows: input.rows as ImportCrmContactsInput["rows"] }),
    ...(input.mode === undefined ? {} : { mode: input.mode }),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  });

  const importHandler = async (context: CrmContext): Promise<Response> => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof importSchema>>(context, importSchema);
      const key = idempotencyKey(context, input.idempotencyKey);
      return context.json(
        {
          data: await dependencies.service.importContacts(
            organizer(context, organizationId),
            makeImportInput(organizationId, input, key),
          ),
        },
        201,
      );
    } catch (error) {
      return handleError(context, error);
    }
  };

  const importPreviewHandler = async (context: CrmContext): Promise<Response> => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof importSchema>>(context, importSchema);
      const key = optionalIdempotencyKey(context, input.idempotencyKey);
      return context.json({
        data: await dependencies.service.previewImport(
          organizer(context, organizationId),
          makeImportInput(organizationId, input, key),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  };
  routes.post("/contacts/import/preview", importPreviewHandler);
  routes.post("/import/preview", importPreviewHandler);
  routes.post("/contacts/import", importHandler);
  routes.post("/import", importHandler);

  routes.get("/segments", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.listSegments(
          organizer(context, organizationId),
          organizationId,
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.post("/segments", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof segmentSchema>>(context, segmentSchema);
      const data: CreateCrmSegmentInput = {
        organizationId,
        ...input,
      } as unknown as CreateCrmSegmentInput;
      return context.json(
        {
          data: await dependencies.service.createSegment(organizer(context, organizationId), data),
        },
        201,
      );
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.get("/segments/:segmentId", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.getSegment(
          organizer(context, organizationId),
          organizationId,
          routeParam(context, "segmentId"),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.get("/segments/:segmentId/contacts", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.listSegmentContacts(
          organizer(context, organizationId),
          organizationId,
          routeParam(context, "segmentId"),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.patch("/segments/:segmentId", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof segmentUpdateSchema>>(context, segmentUpdateSchema);
      const data: UpdateCrmSegmentInput = {
        organizationId,
        segmentId: routeParam(context, "segmentId"),
        ...input,
      } as unknown as UpdateCrmSegmentInput;
      return context.json({
        data: await dependencies.service.updateSegment(organizer(context, organizationId), data),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.delete("/segments/:segmentId", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const expectedVersion = context.req.query("expectedVersion");
      await dependencies.service.deleteSegment(
        organizer(context, organizationId),
        organizationId,
        routeParam(context, "segmentId"),
        expectedVersion === undefined ? undefined : Number(expectedVersion),
      );
      return context.body(null, 204);
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.get("/contacts/:contactId/duplicates", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.findDuplicates(
          organizer(context, organizationId),
          organizationId,
          routeParam(context, "contactId"),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  const mergeInput = (
    organizationId: string,
    primaryContactId: string,
    input: z.infer<typeof mergeSchema>,
    key: string | undefined,
  ): MergeCrmContactsInput => ({
    organizationId,
    primaryContactId,
    duplicateContactIds: input.duplicateContactIds,
    ...(input.fieldWinners === undefined ? {} : { fieldWinners: input.fieldWinners }),
    ...(input.customFieldWinners === undefined
      ? {}
      : { customFieldWinners: input.customFieldWinners }),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  });

  routes.post("/contacts/:contactId/merge/preview", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof mergeSchema>>(context, mergeSchema);
      return context.json({
        data: await dependencies.service.previewMergeContacts(
          organizer(context, organizationId),
          mergeInput(
            organizationId,
            routeParam(context, "contactId"),
            input,
            optionalIdempotencyKey(context, input.idempotencyKey),
          ),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.post("/contacts/:contactId/merge", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof mergeSchema>>(context, mergeSchema);
      const key = idempotencyKey(context, input.idempotencyKey);
      return context.json({
        data: await dependencies.service.mergeContacts(
          organizer(context, organizationId),
          mergeInput(organizationId, routeParam(context, "contactId"), input, key),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.get("/contacts/:contactId/history", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.getContactHistory(
          organizer(context, organizationId),
          organizationId,
          routeParam(context, "contactId"),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.get("/events/:eventId/history", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const contactId = context.req.query("contactId");
      return context.json({
        data: await dependencies.service.listEventHistory(
          organizer(context, organizationId),
          organizationId,
          routeParam(context, "eventId"),
          contactId === undefined ? undefined : idSchema.parse(contactId),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.get("/contacts/:contactId/pipeline/history", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.listPipelineHistory(
          organizer(context, organizationId),
          organizationId,
          routeParam(context, "contactId"),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.post("/contacts/:contactId/pipeline", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof pipelineSchema>>(context, pipelineSchema);
      const data: UpdateCrmPipelineInput = {
        organizationId,
        contactId: routeParam(context, "contactId"),
        ...input,
      };
      return context.json({
        data: await dependencies.service.setPipelineStage(organizer(context, organizationId), data),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.get("/contacts/:contactId/notes", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.listNotes(
          organizer(context, organizationId),
          organizationId,
          routeParam(context, "contactId"),
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.post("/contacts/:contactId/notes", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof noteSchema>>(context, noteSchema);
      const data: AddCrmNoteInput = {
        organizationId,
        contactId: routeParam(context, "contactId"),
        ...input,
      };
      return context.json(
        { data: await dependencies.service.addNote(organizer(context, organizationId), data) },
        201,
      );
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.post("/contacts/:contactId/events", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof eventSchema>>(context, eventSchema);
      const key = idempotencyKey(context, input.idempotencyKey);
      const data: AddContactToEventInput = {
        organizationId,
        contactId: routeParam(context, "contactId"),
        ...(input.crmContactId === undefined ? {} : { crmContactId: input.crmContactId }),
        ...(input.participantId === undefined ? {} : { participantId: input.participantId }),
        eventId: input.eventId,
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.note === undefined ? {} : { note: input.note }),
        idempotencyKey: key,
      };
      return context.json({
        data: await dependencies.service.addContactToEvent(
          organizer(context, organizationId),
          data,
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.post("/outreach", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<z.infer<typeof outreachSchema>>(context, outreachSchema);
      const key = idempotencyKey(context, input.idempotencyKey);
      const data: SendCrmOutreachInput = {
        organizationId,
        contactId: input.contactId,
        ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
        ...(input.segmentId === undefined ? {} : { segmentId: input.segmentId }),
        subject: input.subject,
        body: input.body,
        ...(input.variables === undefined ? {} : { variables: input.variables }),
        idempotencyKey: key,
      };
      return context.json(
        {
          data: await dependencies.service.sendPersonalizedOutreach(
            organizer(context, organizationId),
            data,
          ),
        },
        202,
      );
    } catch (error) {
      return handleError(context, error);
    }
  });
  routes.post("/contacts/:contactId/outreach", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      const input = await body<Omit<z.infer<typeof outreachSchema>, "contactId">>(
        context,
        outreachSchema.omit({ contactId: true }),
      );
      const key = idempotencyKey(context, input.idempotencyKey);
      const data: SendCrmOutreachInput = {
        organizationId,
        contactId: routeParam(context, "contactId"),
        ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
        ...(input.segmentId === undefined ? {} : { segmentId: input.segmentId }),
        subject: input.subject,
        body: input.body,
        ...(input.variables === undefined ? {} : { variables: input.variables }),
        idempotencyKey: key,
      };
      return context.json(
        {
          data: await dependencies.service.sendPersonalizedOutreach(
            organizer(context, organizationId),
            data,
          ),
        },
        202,
      );
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.get("/analytics", async (context) => {
    try {
      const organizationId = routeParam(context, "organizationId");
      return context.json({
        data: await dependencies.service.analytics(
          organizer(context, organizationId),
          organizationId,
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.onError((error, context) => handleError(context, error));
  return routes;
}

export const createCrmAdminRoutes = createCrmRoutes;
export const CRM_ADMIN_ROUTE_PREFIX = "/api/admin/organizations/:organizationId/crm";
