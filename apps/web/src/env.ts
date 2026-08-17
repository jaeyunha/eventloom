import {
  deploymentEnvironmentSchema,
  deploymentModeSchema,
  resolveDeploymentMode,
} from "@eventloom/contracts";
import { z } from "zod";

const webEnvironmentSchema = z.object({
  APP_ENV: deploymentEnvironmentSchema,
  DEPLOYMENT_MODE: deploymentModeSchema.optional(),
  NEXT_PUBLIC_APP_URL: z.url(),
  ORGANIZATION_REQUEST_URL: z.string().url().optional(),
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export function readWebEnvironment(source: EnvironmentSource = process.env) {
  return webEnvironmentSchema.safeParse(source);
}

export function getInvalidEnvironmentFields(source: EnvironmentSource = process.env) {
  const result = readWebEnvironment(source);

  if (result.success) {
    return [];
  }

  return [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].sort();
}

export function resolveWebDeploymentMode(source: EnvironmentSource = process.env) {
  const result = readWebEnvironment(source);
  if (!result.success) {
    return "self-hosted" as const;
  }
  return resolveDeploymentMode(result.data.APP_ENV, result.data.DEPLOYMENT_MODE);
}

export function isManagedWebDeployment(source: EnvironmentSource = process.env) {
  return resolveWebDeploymentMode(source) === "managed";
}

/** Hosted-only contact target for requesting organization provisioning. */
export function organizationRequestUrl(source: EnvironmentSource = process.env): string | null {
  const result = readWebEnvironment(source);
  if (!result.success) {
    return null;
  }
  return result.data.ORGANIZATION_REQUEST_URL ?? null;
}
