import { z } from "zod";
import { timestampSchema } from "./common";

export const deploymentModes = ["managed", "self-hosted"] as const;
export const deploymentModeSchema = z.enum(deploymentModes);
export type DeploymentMode = z.infer<typeof deploymentModeSchema>;

export function resolveDeploymentMode(
  environment: "local" | "staging" | "production",
  configuredMode?: DeploymentMode,
): DeploymentMode {
  return configuredMode ?? (environment === "local" ? "self-hosted" : "managed");
}

export const organizationEntitlementStates = ["active", "restricted"] as const;
export const organizationEntitlementStateSchema = z.enum(organizationEntitlementStates);
export type OrganizationEntitlementState = z.infer<typeof organizationEntitlementStateSchema>;

export const organizationCapabilitySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9_.:-]*$/u);
export type OrganizationCapability = z.infer<typeof organizationCapabilitySchema>;

export const organizationEntitlementLimitsSchema = z
  .object({
    activeEvents: z.int().nonnegative().nullable(),
  })
  .strict();
export type OrganizationEntitlementLimits = z.infer<typeof organizationEntitlementLimitsSchema>;

const entitlementSchema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: z.string().trim().min(1).max(200),
    revision: z.int().positive(),
    state: organizationEntitlementStateSchema,
    capabilities: z.array(organizationCapabilitySchema).max(256),
    limits: organizationEntitlementLimitsSchema,
    notBefore: timestampSchema,
    expiresAt: timestampSchema.nullable(),
  })
  .strict();

export const organizationEntitlementSchema = entitlementSchema.superRefine(
  (entitlement, context) => {
    if (
      entitlement.expiresAt !== null &&
      Date.parse(entitlement.expiresAt) <= Date.parse(entitlement.notBefore)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Entitlement expiration must be after its activation time.",
      });
    }
  },
);
export type OrganizationEntitlement = z.infer<typeof organizationEntitlementSchema>;
