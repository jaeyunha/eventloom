import type { RequestAuthenticator } from "../../features/auth/authenticator";
import type { AirtableIntegrationRouteDependencies } from "../../routes/airtable-integration/routes";
import type { D1RuntimeDependencies } from "../../runtime/d1";
import { createAirtableConflictRuntime } from "./conflicts/runtime";
import { createAirtableControlService } from "./control/service";
import {
  type AirtableSecretCipher,
  D1AirtableConfigurationStore,
  D1AirtableConnectionStore,
  EncryptedReferenceAirtableSecretStore,
} from "./d1/adapters";
import { D1AirtableWebhookCursorStore } from "./d1/cursor-store";
import { runAirtableCursorWorkerOnce } from "./inbound/cursor-worker";
import { createAirtableSessionInboundBindings } from "./inbound/domain-bindings";
import { createAirtableOAuthRuntime } from "./oauth/runtime";
import { AirtableHttpProvider } from "./provider/http";
import { createAirtableWebhookRouteHandler } from "./webhooks";

export function createAirtableIntegrationDependencies(input: {
  database: D1Database;
  authenticator: RequestAuthenticator;
  clientId: string;
  clientSecret?: string;
  defaultBaseId: string;
  cipher: AirtableSecretCipher;
  apiOrigin?: string;
  redirectUri: string;
  sessions: D1RuntimeDependencies["sessions"];
}): AirtableIntegrationRouteDependencies {
  const connections = new D1AirtableConnectionStore(input.database);
  const provider = new AirtableHttpProvider({
    clientId: input.clientId,
    ...(input.clientSecret === undefined ? {} : { clientSecret: input.clientSecret }),
    ...(input.apiOrigin === undefined ? {} : { apiOrigin: input.apiOrigin }),
  });
  const scopes = ["data.records:read", "data.records:write", "schema.bases:read", "webhook:manage"];
  const control = createAirtableControlService({
    connections,
    secrets: new EncryptedReferenceAirtableSecretStore(input.cipher),
    provider,
    configurations: new D1AirtableConfigurationStore(input.database, {
      requiredScopes: scopes,
      schema: [],
    }),
    now: () => new Date(),
    createId: () => `airtable_connection_${crypto.randomUUID()}`,
  });
  const oauth = createAirtableOAuthRuntime({
    database: input.database,
    authenticator: input.authenticator,
    clientId: input.clientId,
    ...(input.clientSecret === undefined ? {} : { clientSecret: input.clientSecret }),
    cipher: input.cipher,
    redirectUri: input.redirectUri,
    scopes,
    ...(input.apiOrigin === undefined ? {} : { apiOrigin: input.apiOrigin }),
  });
  const inboundBindings = createAirtableSessionInboundBindings({
    repository: input.sessions,
    resolveEventId: async ({ organizationId, sessionId }) => {
      const row = await input.database
        .prepare(
          `SELECT event_id FROM sessions
           WHERE tenant_id = ?1 AND id = ?2 AND deleted_at IS NULL LIMIT 1`,
        )
        .bind(organizationId, sessionId)
        .first<{ event_id: string }>();
      return row?.event_id ?? null;
    },
  });
  const cursorStore = new D1AirtableWebhookCursorStore(input.database);
  const handleWebhook = createAirtableWebhookRouteHandler({
    database: input.database,
    cipher: input.cipher,
    wakeCursor: async () => {
      await runAirtableCursorWorkerOnce(
        {
          cursors: cursorStore,
          provider: {
            fetchPage: async (pageInput) => {
              if (pageInput.credentialReference === undefined || pageInput.authMode === undefined)
                throw new Error("Webhook cursor claim lacks credential context.");
              const credential = await oauth.resolveCredential({
                authMode: pageInput.authMode,
                credentialReference: pageInput.credentialReference,
              });
              return provider.fetchPage({
                ...pageInput,
                credentialReference: credential.credential,
              });
            },
          },
          reconciliation: {
            request: async () => {},
          },
          createClaimToken: () => crypto.randomUUID(),
          now: () => new Date(),
        },
        {
          workerId: crypto.randomUUID(),
          leaseDurationMs: 300_000,
          maxPages: 100,
        },
      );
    },
  });
  const conflictRuntime = createAirtableConflictRuntime({
    database: input.database,
    connectionForOrganization: (organizationId) =>
      connections.findActiveByOrganization(organizationId),
    domainBindings: inboundBindings.conflictBindings,
    secrets: new EncryptedReferenceAirtableSecretStore(input.cipher),
    ...(input.apiOrigin === undefined ? {} : { apiOrigin: input.apiOrigin }),
  });
  const connectionFor = (organizationId: string) =>
    connections.findActiveByOrganization(organizationId);
  const status = async (organizationId: string) => {
    const connection = await connectionFor(organizationId);
    if (connection === null) {
      return { state: "disconnected", baseId: null };
    }
    return JSON.parse(JSON.stringify(await control.getStatus(organizationId, connection.id)));
  };

  return {
    requireOrganizationAccess: async (context, organizationId) => {
      const principal = await input.authenticator.authenticate(context.req.raw);
      if (
        principal === null ||
        principal.kind !== "user" ||
        !principal.memberships.some(
          (membership) =>
            membership.organizationId === organizationId &&
            (membership.role === "owner" || membership.role === "admin"),
        )
      ) {
        throw new Error("Organization owner or admin access is required.");
      }
    },
    getStatus: status,
    startOAuth: async (organizationId, user) => {
      const authorization = await oauth.startForUserId({
        userId: user.userId,
        organizationId,
        returnPath: "/admin/integrations/airtable",
      });
      return { authorizationUrl: authorization.authorizationUrl };
    },
    completeOAuth: async (_organizationId, request) => {
      const callback = await oauth.handlePublicCallback({
        state: request.state,
        code: request.code,
      });
      return Response.redirect(new URL(callback.redirectTo, input.redirectUri).toString(), 302);
    },
    connectPat: async (organizationId, request) => {
      await control.connectPat({
        organizationId,
        token: request.token,
        baseId: input.defaultBaseId,
      });
      return status(organizationId);
    },
    selectBase: async (organizationId, request) => {
      const connection = await requireConnection(connectionFor, organizationId);
      await oauth.selectBase({
        organizationId,
        connectionId: connection.id,
        baseId: request.baseId,
      });
      return status(organizationId);
    },
    updateMapping: async (organizationId, request) => {
      const connection = await requireConnection(connectionFor, organizationId);
      if (connection.baseId === null) throw new Error("Select an Airtable base first.");
      for (const [entityType, tableId] of Object.entries(request.mapping)) {
        await control.saveMapping({
          organizationId,
          connectionId: connection.id,
          entityType,
          tableId,
          fieldMapping: {},
        });
      }
      return status(organizationId);
    },
    pause: async (organizationId) => {
      const connection = await requireConnection(connectionFor, organizationId);
      await control.pause(organizationId, connection.id);
      return status(organizationId);
    },
    resume: async (organizationId) => {
      const connection = await requireConnection(connectionFor, organizationId);
      await control.resume(organizationId, connection.id);
      return status(organizationId);
    },
    disconnect: async (organizationId) => {
      const connection = await connectionFor(organizationId);
      if (connection !== null) {
        await control.disconnect(organizationId, connection.id);
      }
      return status(organizationId);
    },
    retry: status,
    listConflicts: (organizationId) => conflictRuntime.listConflicts(organizationId),
    resolveConflict: (organizationId, conflictId, request) =>
      conflictRuntime.resolveConflict(organizationId, conflictId, {
        resolution: request.resolution,
        resolverId: request.resolverId,
        commandId: request.commandId,
        ...("manualValue" in request ? { manualValue: request.manualValue } : {}),
      }),
    handleWebhookNotification: async (organizationId, registrationId, request) => {
      const registration = await input.database
        .prepare(
          `SELECT id FROM airtable_webhook_registrations
           WHERE id = ?1 AND organization_id = ?2
           LIMIT 1`,
        )
        .bind(registrationId, organizationId)
        .first<{ id: string }>();
      if (registration === null) return new Response(null, { status: 404 });
      return handleWebhook(request, registrationId);
    },
  };
}

async function requireConnection(
  find: (
    organizationId: string,
  ) => Promise<Awaited<ReturnType<D1AirtableConnectionStore["findActiveByOrganization"]>>>,
  organizationId: string,
) {
  const connection = await find(organizationId);
  if (connection === null) throw new Error("Airtable connection was not found.");
  return connection;
}
