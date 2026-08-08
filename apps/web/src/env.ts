import { deploymentEnvironmentSchema } from "@open-sessionboard/contracts";
import { z } from "zod";

const webEnvironmentSchema = z.object({
  APP_ENV: deploymentEnvironmentSchema,
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_API_URL: z.url(),
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;

export function readWebEnvironment(source: NodeJS.ProcessEnv = process.env) {
  return webEnvironmentSchema.safeParse(source);
}

export function getInvalidEnvironmentFields(source: NodeJS.ProcessEnv = process.env) {
  const result = readWebEnvironment(source);

  if (result.success) {
    return [];
  }

  return [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].sort();
}
