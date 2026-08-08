import {
  type ApiError,
  apiErrorSchema,
  type HealthResponse,
  healthResponseSchema,
} from "@open-sessionboard/contracts";
import { type EnvironmentSource, readWebEnvironment } from "../../env";

export function createWebHealthResponse(source: EnvironmentSource) {
  const traceId = crypto.randomUUID();
  const environment = readWebEnvironment(source);
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": traceId,
  };

  if (!environment.success) {
    const body: ApiError = {
      error: {
        code: "CONFIGURATION_ERROR",
        message: "The web environment is not configured.",
        traceId,
      },
    };

    return Response.json(apiErrorSchema.parse(body), { status: 503, headers });
  }

  const body: HealthResponse = {
    status: "ok",
    service: "web",
    version: "0.1.0",
    environment: environment.data.APP_ENV,
    timestamp: new Date().toISOString(),
    traceId,
  };

  return Response.json(healthResponseSchema.parse(body), { headers });
}

export function GET() {
  return createWebHealthResponse(process.env);
}
