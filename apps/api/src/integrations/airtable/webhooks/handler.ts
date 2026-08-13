import { D1AirtableWebhookNotificationStore } from "../d1/webhook-notifications";
import { handleAirtableWebhook } from "../inbound/webhook";
import { D1AirtableWebhookRegistrationRepository } from "./repository";
import type { AirtableWebhookD1Database, AirtableWebhookMacSecretCipher } from "./types";

export interface AirtableWebhookRouteHandlerOptions {
  database: AirtableWebhookD1Database;
  cipher: AirtableWebhookMacSecretCipher;
  maxBodyBytes?: number;
  now?: () => Date;
  createId?: () => string;
  wakeCursor?: (input: {
    organizationId: string;
    connectionId: string;
    registrationId: string;
  }) => Promise<void>;
}

export type AirtableWebhookRouteHandler = (
  request: Request,
  registrationId: string,
) => Promise<Response>;

/** Route-ready handler for an opaque application-owned registration identifier. */
export function createAirtableWebhookRouteHandler(
  options: AirtableWebhookRouteHandlerOptions,
): AirtableWebhookRouteHandler {
  const registrations = new D1AirtableWebhookRegistrationRepository(
    options.database,
    options.cipher,
  );
  const notifications = new D1AirtableWebhookNotificationStore(options.database);
  const wakeCursor = options.wakeCursor;

  return async (request, registrationId) => {
    if (!isOpaqueRegistrationId(registrationId)) return emptyResponse(404);
    const registration = await registrations.resolveActive(registrationId);
    if (registration === null) return emptyResponse(404);

    return handleAirtableWebhook(request, {
      registration,
      notifications,
      ...(options.maxBodyBytes === undefined ? {} : { maxBodyBytes: options.maxBodyBytes }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.createId === undefined ? {} : { createId: options.createId }),
      ...(wakeCursor === undefined
        ? {}
        : {
            wakeCursor: (active) =>
              wakeCursor({
                organizationId: active.organizationId,
                connectionId: active.connectionId,
                registrationId: active.id,
              }),
          }),
    });
  };
}

function isOpaqueRegistrationId(value: string): boolean {
  return value.length >= 16 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}
