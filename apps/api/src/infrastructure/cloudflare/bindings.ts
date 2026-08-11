import {
  type DeploymentEnvironment,
  deploymentEnvironmentSchema,
} from "@open-sessionboard/contracts";
import type { OpenSendMessage } from "../../integrations/opensend/types";

export const cloudflareBindingNames = {
  database: "DB",
  agendaCoordinator: "AGENDA_COORDINATOR",
  privateFiles: "PRIVATE_FILES",
  outboxQueue: "OUTBOX_QUEUE",
} as const;

export const cloudflareOutboxTopics = [
  "communications",
  "webhooks",
  "calendar",
  "cache-invalidation",
] as const;

export type CloudflareOutboxTopic = (typeof cloudflareOutboxTopics)[number];
export interface CloudflareOutboxInvitationTransient {
  readonly kind: "member_invitation";
  readonly invitationId: string;
  readonly recipient: string;
  readonly message: OpenSendMessage;
}
export interface CloudflareOutboxMessage {
  readonly version: 1;
  readonly jobId: string;
  readonly tenantId: string;
  readonly topic: CloudflareOutboxTopic;
  readonly transient?: CloudflareOutboxInvitationTransient;
  readonly enqueuedAt: string;
}

export interface CloudflareBindings {
  readonly APP_ENV: string;
  readonly WEB_ORIGIN: string;
  readonly DB: D1Database;
  readonly AGENDA_COORDINATOR: DurableObjectNamespace;
  readonly PRIVATE_FILES: R2Bucket;
  readonly OUTBOX_QUEUE: Queue<CloudflareOutboxMessage>;
}

export interface ValidatedCloudflareBindings extends CloudflareBindings {
  readonly APP_ENV: DeploymentEnvironment;
}

export interface CloudflareBindingInspectionFailure {
  readonly success: false;
  readonly issues: readonly string[];
}

export interface CloudflareBindingInspectionSuccess {
  readonly success: true;
  readonly bindings: ValidatedCloudflareBindings;
}

export type CloudflareBindingInspection =
  | CloudflareBindingInspectionFailure
  | CloudflareBindingInspectionSuccess;

export class CloudflareBindingError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Cloudflare bindings are invalid: ${issues.join(", ")}`);
    this.name = "CloudflareBindingError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasFunction(value: unknown, property: string): boolean {
  return isRecord(value) && typeof value[property] === "function";
}

function inspectWebOrigin(
  value: unknown,
  environment: DeploymentEnvironment | undefined,
): string | null {
  if (typeof value !== "string") {
    return "WEB_ORIGIN must be a URL";
  }

  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    return "WEB_ORIGIN must be a URL";
  }

  if (origin.origin !== value || (origin.pathname !== "/" && origin.pathname !== "")) {
    return "WEB_ORIGIN must contain only an origin";
  }

  if (environment === "local") {
    const localHost = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
    if (!localHost || (origin.protocol !== "http:" && origin.protocol !== "https:")) {
      return "local WEB_ORIGIN must use localhost or 127.0.0.1";
    }
    return null;
  }

  if (origin.protocol !== "https:") {
    return "non-local WEB_ORIGIN must use HTTPS";
  }

  return null;
}

export function inspectCloudflareBindings(source: unknown): CloudflareBindingInspection {
  if (!isRecord(source)) {
    return { success: false, issues: ["bindings must be an object"] };
  }

  const issues: string[] = [];
  const environmentResult = deploymentEnvironmentSchema.safeParse(source.APP_ENV);
  const environment = environmentResult.success ? environmentResult.data : undefined;

  if (!environmentResult.success) {
    issues.push("APP_ENV must be local, staging, or production");
  }

  const webOriginIssue = inspectWebOrigin(source.WEB_ORIGIN, environment);
  if (webOriginIssue) {
    issues.push(webOriginIssue);
  }

  if (!hasFunction(source.DB, "prepare") || !hasFunction(source.DB, "batch")) {
    issues.push("DB must be a D1 binding");
  }
  if (
    !hasFunction(source.AGENDA_COORDINATOR, "idFromName") ||
    !hasFunction(source.AGENDA_COORDINATOR, "get")
  ) {
    issues.push("AGENDA_COORDINATOR must be a Durable Object namespace");
  }
  if (!hasFunction(source.PRIVATE_FILES, "get") || !hasFunction(source.PRIVATE_FILES, "put")) {
    issues.push("PRIVATE_FILES must be an R2 binding");
  }
  if (!hasFunction(source.OUTBOX_QUEUE, "send")) {
    issues.push("OUTBOX_QUEUE must be a Queue binding");
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  return {
    success: true,
    bindings: source as unknown as ValidatedCloudflareBindings,
  };
}

export function requireCloudflareBindings(source: unknown): ValidatedCloudflareBindings {
  const inspection = inspectCloudflareBindings(source);
  if (!inspection.success) {
    throw new CloudflareBindingError(inspection.issues);
  }
  return inspection.bindings;
}
