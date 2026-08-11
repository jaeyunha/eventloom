import type { Context } from "hono";
import { Hono } from "hono";
import { ZodError, z } from "zod";
import type { SendTransactionalCommunicationInput } from "./service";
import { CommunicationError, type CommunicationService } from "./service";
import type {
  CommunicationActor,
  CommunicationAudience,
  CommunicationTemplatePurpose,
} from "./types";
import { COMMUNICATION_AUDIENCES, COMMUNICATION_TEMPLATE_PURPOSES } from "./types";

export interface CommunicationRouteEnvironment {
  Variables: {
    communicationActor: CommunicationActor;
  };
}

const purposeSchema = z.enum(COMMUNICATION_TEMPLATE_PURPOSES);
const audienceSchema = z.enum(COMMUNICATION_AUDIENCES);
const senderSchema = z.enum([
  "auth@sessionboard.namuh.co",
  "speakers@sessionboard.namuh.co",
  "calendar@sessionboard.namuh.co",
]);
const dataSchema = z.record(z.string(), z.unknown()).optional();

const createTemplateSchema = z.object({
  eventId: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  purpose: purposeSchema,
  sender: senderSchema.optional(),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().min(1),
  variables: z.array(z.string()).optional(),
});

const createTemplateVersionSchema = z.object({
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().min(1),
  variables: z.array(z.string()).optional(),
});

const approveTemplateSchema = z.object({ version: z.number().int().positive() });
const previewSchema = z.object({
  eventId: z.string().min(1).optional(),
  purpose: purposeSchema,
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive().optional(),
  audience: audienceSchema,
  data: dataSchema,
});
const sendSchema = z.object({
  eventId: z.string().min(1).optional(),
  previewId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1),
  purpose: purposeSchema.optional(),
  templateId: z.string().min(1).optional(),
  templateVersion: z.number().int().positive().optional(),
  recipientIds: z.array(z.string().min(1)).optional(),
  data: dataSchema,
  action: z.enum(["accept", "waitlist", "reject", "task", "withdrawal"]).optional(),
});
const deliverySchema = z.object({
  eventId: z.string().min(1).optional(),
  status: z.enum(["queued", "delivered", "failed", "bounced", "complained"]),
  providerMessageId: z.string().optional(),
  reason: z.string().optional(),
  occurredAt: z.string().optional(),
});

interface ScopedBody {
  eventId?: string | undefined;
}

function actor(context: {
  get(name: "communicationActor"): CommunicationActor;
}): CommunicationActor {
  const current = context.get("communicationActor");
  if (current === undefined) {
    throw new CommunicationError(
      "COMMUNICATION_FORBIDDEN",
      403,
      "Communication authentication is required.",
    );
  }
  return current;
}

function eventIdFor(
  context: { req: { param(name: string): string | undefined } },
  body: ScopedBody,
): string {
  const routeEventId = context.req.param("eventId");
  const eventId = routeEventId ?? body.eventId;
  if (eventId === undefined || eventId.length === 0) {
    throw new CommunicationError(
      "COMMUNICATION_INVALID_INPUT",
      400,
      "An event id is required for communication operations.",
    );
  }
  return eventId;
}

function assertOrganizationScope(
  context: { req: { param(name: string): string | undefined } },
  current: CommunicationActor,
): void {
  const organizationId = context.req.param("organizationId");
  if (organizationId !== undefined && organizationId !== current.tenantId) {
    throw new CommunicationError(
      "COMMUNICATION_NOT_FOUND",
      404,
      "The communication resource was not found.",
    );
  }
}
function requiredParam(context: Context<CommunicationRouteEnvironment>, name: string): string {
  const value = context.req.param(name);
  if (value === undefined || value.length === 0) {
    throw new CommunicationError("COMMUNICATION_INVALID_INPUT", 400, `${name} is required.`);
  }
  return value;
}

export function createCommunicationRoutes(
  service: CommunicationService,
): Hono<CommunicationRouteEnvironment> {
  const routes = new Hono<CommunicationRouteEnvironment>();

  routes.use("*", async (context, next) => {
    assertOrganizationScope(context, actor(context));
    await next();
  });

  routes.get("/templates", async (context) => {
    const current = actor(context);
    const eventId = eventIdFor(context, {});
    const purposeValue = context.req.query("purpose");
    const purpose = purposeValue === undefined ? undefined : purposeSchema.parse(purposeValue);
    return context.json({ templates: await service.listTemplates(current, eventId, purpose) });
  });

  routes.get("/templates/:templateId", async (context) => {
    const current = actor(context);
    const eventId = eventIdFor(context, {});
    const versionValue = context.req.query("version");
    const version = versionValue === undefined ? undefined : Number(versionValue);
    return context.json(
      await service.getTemplate(current, eventId, context.req.param("templateId"), version),
    );
  });

  routes.post("/templates", async (context) => {
    const current = actor(context);
    const body = createTemplateSchema.parse(await context.req.json());
    const eventId = eventIdFor(context, body);
    return context.json(
      await service.createTemplate(current, {
        eventId,
        name: body.name,
        purpose: body.purpose,
        subject: body.subject,
        html: body.html,
        text: body.text,
        ...(body.id === undefined ? {} : { id: body.id }),
        ...(body.sender === undefined ? {} : { sender: body.sender }),
        ...(body.variables === undefined ? {} : { variables: body.variables }),
      }),
      201,
    );
  });

  routes.post("/templates/:templateId/versions", async (context) => {
    const current = actor(context);
    const body = createTemplateVersionSchema.parse(await context.req.json());
    const eventId = eventIdFor(context, {});
    return context.json(
      await service.createTemplateVersion(current, {
        eventId,
        templateId: context.req.param("templateId"),
        subject: body.subject,
        html: body.html,
        text: body.text,
        ...(body.variables === undefined ? {} : { variables: body.variables }),
      }),
      201,
    );
  });

  const approveTemplate = async (context: Context<CommunicationRouteEnvironment>) => {
    const current = actor(context);
    const body = approveTemplateSchema.parse(await context.req.json());
    const eventId = eventIdFor(context, {});
    return context.json(
      await service.approveTemplate(
        current,
        eventId,
        requiredParam(context, "templateId"),
        body.version,
      ),
    );
  };

  routes.post("/templates/:templateId/approve", approveTemplate);
  routes.post("/templates/:templateId/versions/:version/approve", async (context) => {
    const current = actor(context);
    const eventId = eventIdFor(context, {});
    const version = Number(context.req.param("version"));
    return context.json(
      await service.approveTemplate(current, eventId, context.req.param("templateId"), version),
    );
  });

  routes.post("/previews", async (context) => {
    const current = actor(context);
    const body = previewSchema.parse(await context.req.json());
    const eventId = eventIdFor(context, body);
    return context.json(
      await service.previewGroupSend(current, {
        eventId,
        purpose: body.purpose,
        templateId: body.templateId,
        audience: body.audience,
        ...(body.templateVersion === undefined ? {} : { templateVersion: body.templateVersion }),
        ...(body.data === undefined ? {} : { data: body.data }),
      }),
    );
  });

  routes.get("/previews/:previewId", async (context) => {
    const current = actor(context);
    const eventId = eventIdFor(context, {});
    return context.json(await service.getPreview(current, eventId, context.req.param("previewId")));
  });

  routes.post("/sends", async (context) => {
    const current = actor(context);
    const body = sendSchema.parse(await context.req.json());
    const eventId = eventIdFor(context, body);
    if (body.previewId !== undefined) {
      return context.json(
        await service.sendGroup(current, {
          eventId,
          previewId: body.previewId,
          idempotencyKey: body.idempotencyKey,
        }),
        201,
      );
    }
    if (body.recipientIds === undefined) {
      throw new CommunicationError(
        "COMMUNICATION_INVALID_INPUT",
        400,
        "Recipient ids are required for a transactional send.",
      );
    }
    if (body.purpose === undefined) {
      throw new CommunicationError(
        "COMMUNICATION_INVALID_INPUT",
        400,
        "A template purpose is required for a transactional send.",
      );
    }
    const transactional: SendTransactionalCommunicationInput = {
      eventId,
      purpose: body.purpose as Exclude<CommunicationTemplatePurpose, "organizer_group_email">,
      idempotencyKey: body.idempotencyKey,
      recipientIds: body.recipientIds,
      ...(body.templateId === undefined ? {} : { templateId: body.templateId }),
      ...(body.templateVersion === undefined ? {} : { templateVersion: body.templateVersion }),
      ...(body.data === undefined ? {} : { data: body.data }),
      ...(body.action === undefined ? {} : { action: body.action }),
    };
    return context.json(await service.sendTransactional(current, transactional), 201);
  });

  routes.get("/sends/:sendId", async (context) => {
    const current = actor(context);
    const eventId = eventIdFor(context, {});
    return context.json(await service.getSend(current, eventId, context.req.param("sendId")));
  });

  routes.get("/sends/:sendId/history", async (context) => {
    const current = actor(context);
    const eventId = eventIdFor(context, {});
    return context.json({
      history: await service.listDeliveryHistory(current, eventId, context.req.param("sendId")),
    });
  });

  routes.post("/sends/:sendId/retry", async (context) => {
    const current = actor(context);
    const eventId = eventIdFor(context, {});
    return context.json(await service.retryFailed(current, eventId, context.req.param("sendId")));
  });
  routes.post("/sends/:sendId/deliveries/:recipientId/status", async (context) => {
    const current = actor(context);
    const body = deliverySchema.parse(await context.req.json());
    const eventId = eventIdFor(context, body);
    return context.json(
      await service.recordDeliveryStatus(current, {
        eventId,
        sendId: context.req.param("sendId"),
        recipientId: context.req.param("recipientId"),
        status: body.status,
        ...(body.providerMessageId === undefined
          ? {}
          : { providerMessageId: body.providerMessageId }),
        ...(body.reason === undefined ? {} : { reason: body.reason }),
        ...(body.occurredAt === undefined ? {} : { occurredAt: body.occurredAt }),
      }),
    );
  });

  routes.onError((error, context) => {
    if (error instanceof ZodError) {
      return context.json(
        {
          error: {
            code: "COMMUNICATION_INVALID_INPUT",
            message: "The communication request is invalid.",
          },
        },
        400,
      );
    }
    if (error instanceof CommunicationError) {
      return context.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    throw error;
  });

  return routes;
}

export type CommunicationRoutePurpose = CommunicationTemplatePurpose;
export type CommunicationRouteAudience = CommunicationAudience;
