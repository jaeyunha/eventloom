import { deploymentEnvironmentSchema } from "@open-sessionboard/contracts";
import { z } from "zod";

const apiEnvironmentSchema = z.object({
  APP_ENV: deploymentEnvironmentSchema,
  WEB_ORIGIN: z.url(),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export function parseApiEnvironment(source: unknown) {
  return apiEnvironmentSchema.safeParse(source);
}
