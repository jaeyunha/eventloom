import type { Context } from "hono";
import { Hono } from "hono";
import { ZodError, z } from "zod";
import { ReportError, type ReportService, type RunReportInput } from "./service";
import type {
  CreateReportDefinitionInput,
  ReportActor,
  ReportFieldSelector,
  ReportFilter,
  ReportSort,
  UpdateReportDefinitionInput,
} from "./types";

export interface ReportRouteEnvironment {
  Variables: {
    reportActor: ReportActor;
  };
}

const fieldSelectorSchema = z.union([
  z.string().min(1).max(200),
  z.object({
    relationship: z.string().min(1).max(100),
    field: z.string().min(1).max(100),
    alias: z.string().min(1).max(200).optional(),
  }),
]);

const filterSchema = z.object({
  field: fieldSelectorSchema,
  operator: z.enum([
    "eq",
    "neq",
    "contains",
    "startsWith",
    "endsWith",
    "in",
    "gt",
    "gte",
    "lt",
    "lte",
    "isNull",
    "isNotNull",
  ]),
  value: z.unknown().optional(),
});

const sortSchema = z.object({
  field: fieldSelectorSchema,
  direction: z.enum(["asc", "desc"]),
});

const createDefinitionSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  eventId: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
  relationships: z.array(z.string().min(1).max(100)).min(1),
  fields: z.array(fieldSelectorSchema).min(1),
  order: z.array(fieldSelectorSchema).optional(),
  filters: z.array(filterSchema).optional(),
  sort: z.array(sortSchema).optional(),
});

const updateDefinitionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  eventId: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2_000).optional(),
  relationships: z.array(z.string().min(1).max(100)).min(1).optional(),
  fields: z.array(fieldSelectorSchema).min(1).optional(),
  order: z.array(fieldSelectorSchema).optional(),
  filters: z.array(filterSchema).optional(),
  sort: z.array(sortSchema).optional(),
});

const runSchema = z.object({
  format: z.enum(["csv", "xlsx"]).optional(),
  expectedVersion: z.number().int().positive().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  evaluationPlanId: z.string().min(1).max(200).optional(),
  evaluationPlanVersion: z.number().int().positive().optional(),
});

const versionSchema = z.object({ expectedVersion: z.number().int().positive() });

function currentActor(context: { get(name: "reportActor"): ReportActor | undefined }): ReportActor {
  const value = context.get("reportActor");
  if (value === undefined)
    throw new ReportError("REPORT_FORBIDDEN", "Report authentication is required.", 403);
  return value;
}

function inputWithEvent(
  body: Record<string, unknown>,
  eventId: string,
): CreateReportDefinitionInput {
  return { ...body, eventId } as unknown as CreateReportDefinitionInput;
}

function errorResponse(
  context: { json(body: unknown, status?: number): Response },
  error: unknown,
): Response {
  if (error instanceof ReportError) {
    return context.json({ error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof ZodError) {
    return context.json(
      { error: { code: "REPORT_INVALID_INPUT", message: "The report request is invalid." } },
      400,
    );
  }
  throw error;
}

type ReportContext = Context<ReportRouteEnvironment>;
function requiredParam(context: ReportContext, name: string): string {
  const value = context.req.param(name);
  if (value === undefined || value.trim().length === 0) {
    throw new ReportError("REPORT_INVALID_INPUT", `${name} is required.`, 400);
  }
  return value;
}
export function createReportRoutes(service: ReportService): Hono<ReportRouteEnvironment> {
  const routes = new Hono<ReportRouteEnvironment>();
  routes.onError((error, context) => errorResponse(context, error));

  const list = async (context: ReportContext) => {
    try {
      const eventId = context.req.param("eventId") || context.req.query("eventId") || undefined;
      return context.json({
        definitions: await service.listDefinitions(currentActor(context), eventId),
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  const create = async (context: ReportContext) => {
    try {
      const body = createDefinitionSchema.parse(await context.req.json()) as unknown as Record<
        string,
        unknown
      >;
      const eventId = context.req.param("eventId") || (body.eventId as string | undefined);
      if (eventId === undefined) {
        throw new ReportError("REPORT_INVALID_INPUT", "eventId is required.", 400);
      }
      return context.json(
        await service.createDefinition(currentActor(context), inputWithEvent(body, eventId)),
        201,
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  const get = async (context: ReportContext) => {
    try {
      const actor = currentActor(context);
      const eventId = context.req.param("eventId");
      const definitionId = requiredParam(context, "definitionId");
      return context.json(
        eventId === undefined
          ? await service.getDefinition(actor, definitionId)
          : await service.getDefinition(actor, eventId, definitionId),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  const update = async (context: ReportContext) => {
    try {
      const body = updateDefinitionSchema.parse(
        await context.req.json(),
      ) as unknown as UpdateReportDefinitionInput;
      const eventId = context.req.param("eventId");
      const scopedBody = eventId === undefined ? body : { ...body, eventId };
      const definitionId = requiredParam(context, "definitionId");
      return context.json(
        await service.updateDefinition(currentActor(context), definitionId, scopedBody),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  const remove = async (context: ReportContext) => {
    try {
      let expectedVersion = Number(context.req.query("expectedVersion"));
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
        try {
          const body = versionSchema.parse(await context.req.json());
          expectedVersion = body.expectedVersion;
        } catch {
          throw new ReportError("REPORT_INVALID_INPUT", "expectedVersion is required.", 400);
        }
      }
      const eventId = context.req.param("eventId");
      const definitionId = requiredParam(context, "definitionId");
      if (eventId !== undefined) {
        await service.getDefinition(currentActor(context), eventId, definitionId);
      }
      await service.deleteDefinition(currentActor(context), definitionId, expectedVersion);
      return context.body(null, 204);
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  const run = async (context: ReportContext) => {
    try {
      const body = runSchema.parse(await context.req.json()) as unknown as RunReportInput;
      const actor = currentActor(context);
      const eventId = context.req.param("eventId");
      const definitionId = requiredParam(context, "definitionId");
      if (eventId !== undefined) {
        await service.getDefinition(actor, eventId, definitionId);
      }
      return context.json(await service.runDefinition(actor, definitionId, body), 201);
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  const getRun = async (context: ReportContext) => {
    try {
      const runId = requiredParam(context, "runId");
      return context.json(
        await service.getRun(
          currentActor(context),
          runId,
          context.req.param("eventId") || undefined,
        ),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  const listRuns = async (context: ReportContext) => {
    try {
      const definitionId = context.req.query("definitionId") || undefined;
      const eventId = requiredParam(context, "eventId");
      return context.json({
        runs: await service.listRuns(currentActor(context), eventId, definitionId),
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  const download = async (context: ReportContext) => {
    try {
      const runId = requiredParam(context, "runId");
      const run = await service.getRun(
        currentActor(context),
        runId,
        context.req.param("eventId") || undefined,
      );
      return new Response(run.export.body, {
        status: 200,
        headers: {
          "content-type": run.export.contentType,
          "content-disposition": `attachment; filename="${run.export.fileName.replaceAll('"', "")}"`,
          "x-report-run-id": run.id,
        },
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  };

  // Event-nested paths are the preferred public contract.
  routes.get("/events/:eventId/definitions", list);
  routes.post("/events/:eventId/definitions", create);
  routes.get("/events/:eventId/definitions/:definitionId", get);
  routes.put("/events/:eventId/definitions/:definitionId", update);
  routes.patch("/events/:eventId/definitions/:definitionId", update);
  routes.delete("/events/:eventId/definitions/:definitionId", remove);
  routes.post("/events/:eventId/definitions/:definitionId/runs", run);
  routes.get("/events/:eventId/runs", listRuns);
  routes.get("/events/:eventId/runs/:runId", getRun);
  routes.get("/events/:eventId/runs/:runId/download", download);

  // Flat aliases are useful when the event is already carried by the authenticated scope.
  routes.get("/definitions", list);
  routes.post("/definitions", create);
  routes.get("/definitions/:definitionId", get);
  routes.put("/definitions/:definitionId", update);
  routes.patch("/definitions/:definitionId", update);
  routes.delete("/definitions/:definitionId", remove);
  routes.post("/definitions/:definitionId/runs", run);
  routes.get("/runs", async (context) => {
    try {
      const eventId = context.req.query("eventId");
      if (eventId === undefined)
        throw new ReportError("REPORT_INVALID_INPUT", "eventId is required.", 400);
      return context.json({
        runs: await service.listRuns(
          currentActor(context),
          eventId,
          context.req.query("definitionId"),
        ),
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });
  routes.get("/runs/:runId", getRun);
  routes.get("/runs/:runId/download", download);

  // Root aliases keep the feature usable when mounted at /events/:eventId/reports.
  routes.get("/", list);
  routes.post("/", create);
  routes.get("/:definitionId", get);
  routes.put("/:definitionId", update);
  routes.patch("/:definitionId", update);
  routes.delete("/:definitionId", remove);
  routes.post("/:definitionId/run", run);
  routes.post("/:definitionId/runs", run);
  return routes;
}

export type { ReportFieldSelector, ReportFilter, ReportSort };
