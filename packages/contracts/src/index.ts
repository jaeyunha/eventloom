import { z } from "zod";

export const deploymentEnvironments = ["local", "staging", "production"] as const;

export const deploymentEnvironmentSchema = z.enum(deploymentEnvironments);

export type DeploymentEnvironment = z.infer<typeof deploymentEnvironmentSchema>;

export const serviceNames = ["web", "api"] as const;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.enum(serviceNames),
  version: z.string().min(1),
  environment: deploymentEnvironmentSchema,
  timestamp: z.iso.datetime(),
  traceId: z.uuid(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    traceId: z.uuid(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
