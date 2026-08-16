import { deploymentEnvironmentSchema } from "@eventloom/contracts";
import { z } from "zod";

const calendarUidDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u);

export const communicationIdentityEnvironmentSchema = z.object({
  AUTH_FROM_EMAIL: z.string().trim().pipe(z.email()),
  SPEAKERS_FROM_EMAIL: z.string().trim().pipe(z.email()),
  CALENDAR_FROM_EMAIL: z.string().trim().pipe(z.email()),
  CALENDAR_UID_DOMAIN: calendarUidDomainSchema,
});

const apiEnvironmentSchema = z.object({
  APP_ENV: deploymentEnvironmentSchema,
  WEB_ORIGIN: z.url(),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type CommunicationIdentityEnvironment = z.infer<
  typeof communicationIdentityEnvironmentSchema
>;

export function parseApiEnvironment(source: unknown) {
  return apiEnvironmentSchema.safeParse(source);
}

export function parseCommunicationIdentityEnvironment(source: unknown) {
  return communicationIdentityEnvironmentSchema.safeParse(source);
}
