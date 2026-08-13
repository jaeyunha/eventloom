import { deploymentEnvironmentSchema } from "@eventloom/contracts";
import { z } from "zod";

const webEnvironmentSchema = z.object({
  APP_ENV: deploymentEnvironmentSchema,
  NEXT_PUBLIC_APP_URL: z.url(),
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
