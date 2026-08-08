import { apiErrorSchema } from "@open-sessionboard/contracts";
import { type ApiDependencies, createApp } from "../app";
import {
  createCloudflareDependencies,
  inspectProductionRuntime,
  type RuntimeBindings,
} from "./cloudflare";
import { createLocalDependencies } from "./local";

export class RuntimeConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The API runtime is not configured.");
    this.name = "RuntimeConfigurationError";
  }
}

function requestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(incoming)
    ? incoming
    : crypto.randomUUID();
}

function configurationErrorResponse(request: Request, bindings: RuntimeBindings): Response {
  const traceId = requestId(request);
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "content-type": "application/json; charset=UTF-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": traceId,
  });
  const origin = request.headers.get("origin");
  if (origin !== null && origin === bindings.WEB_ORIGIN) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.append("vary", "Origin");
  }
  return Response.json(
    apiErrorSchema.parse({
      error: {
        code: "CONFIGURATION_ERROR",
        message: "The API runtime is not configured.",
        traceId,
      },
    }),
    { status: 503, headers },
  );
}

export function createRuntimeDependencies(bindings: RuntimeBindings): ApiDependencies {
  if (bindings.APP_ENV === "local") return createLocalDependencies();
  if (bindings.APP_ENV !== "staging" && bindings.APP_ENV !== "production") {
    throw new RuntimeConfigurationError(["APP_ENV must be local, staging, or production"]);
  }
  const inspection = inspectProductionRuntime(bindings);
  if (!inspection.success) throw new RuntimeConfigurationError(inspection.issues);
  return createCloudflareDependencies(bindings);
}

export function createRuntimeApp(bindings: RuntimeBindings) {
  return createApp(createRuntimeDependencies(bindings));
}

export function createRuntimeWorker(): ExportedHandler<RuntimeBindings> {
  const applications = new WeakMap<object, ReturnType<typeof createApp>>();
  let localApplication: ReturnType<typeof createApp> | undefined;
  return {
    async fetch(request, bindings, executionContext) {
      let application =
        bindings.APP_ENV === "local" ? localApplication : applications.get(bindings);
      if (application === undefined) {
        try {
          application = createRuntimeApp(bindings);
          if (bindings.APP_ENV === "local") {
            localApplication = application;
          } else {
            applications.set(bindings, application);
          }
        } catch (error) {
          if (error instanceof RuntimeConfigurationError) {
            return configurationErrorResponse(request, bindings);
          }
          throw error;
        }
      }
      return application.fetch(request, bindings, executionContext);
    },
  };
}
