import { z } from "zod";
import { apiErrorResponseSchema } from "./domain/common";

export const deploymentEnvironments = ["local", "staging", "production"] as const;

export const deploymentEnvironmentSchema = z.enum(deploymentEnvironments);

export type DeploymentEnvironment = z.infer<typeof deploymentEnvironmentSchema>;

export const serviceNames = ["web", "api"] as const;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.enum(serviceNames),
  version: z.string().min(1),
  environment: deploymentEnvironmentSchema,
  runtimeProfile: z.enum(["integrated", "fixture"]).optional(),
  timestamp: z.iso.datetime(),
  traceId: z.uuid(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = apiErrorResponseSchema;

export type ApiError = z.infer<typeof apiErrorSchema>;
export * from "./domain/index";
