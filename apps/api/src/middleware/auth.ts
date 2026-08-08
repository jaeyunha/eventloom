import type { Context, MiddlewareHandler } from "hono";
import { type RequestAuthenticator, requireAuthenticated } from "../features/auth/authenticator";
import { requireApiKeyScope, requireOrganizationRole } from "../features/auth/authorization";
import {
  type ApiKeyScope,
  AuthAccessError,
  type AuthPrincipal,
  type OrganizationRole,
} from "../features/auth/types";

export interface AuthVariables {
  authPrincipal: AuthPrincipal | null;
  traceId?: string;
}

export type AuthMiddlewareEnvironment = {
  Variables: AuthVariables;
};

interface AuthenticationMiddlewareOptions {
  required?: boolean;
}

export interface TenantAuthorizationMiddlewareOptions {
  organizationId(context: Context<AuthMiddlewareEnvironment>): string | Promise<string>;
  userRoles?: readonly OrganizationRole[];
  apiKeyScope?: ApiKeyScope;
}

function authErrorResponse(context: Context<AuthMiddlewareEnvironment>, error: AuthAccessError) {
  return context.json(
    {
      error: {
        code: error.code,
        message: error.message,
        traceId: context.get("traceId") ?? crypto.randomUUID(),
      },
    },
    error.status,
  );
}

export function createAuthenticationMiddleware(
  authenticator: RequestAuthenticator,
  options: AuthenticationMiddlewareOptions = {},
): MiddlewareHandler<AuthMiddlewareEnvironment> {
  return async (context, next) => {
    try {
      const principal = await authenticator.authenticate(context.req.raw);
      if (options.required) {
        requireAuthenticated(principal);
      }
      context.set("authPrincipal", principal);
      await next();
    } catch (error) {
      if (error instanceof AuthAccessError) {
        return authErrorResponse(context, error);
      }
      throw error;
    }
  };
}

/**
 * Route middleware for organization-owned records. Every accepted identity is
 * checked against the requested organization, and each credential kind must
 * have an explicit policy so a new route cannot accidentally accept all keys.
 */
export function createTenantAuthorizationMiddleware(
  options: TenantAuthorizationMiddlewareOptions,
): MiddlewareHandler<AuthMiddlewareEnvironment> {
  return async (context, next) => {
    try {
      const principal = requireAuthenticated(context.get("authPrincipal"));
      const organizationId = await options.organizationId(context);

      if (principal.kind === "apiKey") {
        if (!options.apiKeyScope) {
          throw new AuthAccessError("FORBIDDEN", "API keys are not allowed on this route.");
        }
        requireApiKeyScope(principal, organizationId, options.apiKeyScope);
      } else {
        if (!options.userRoles || options.userRoles.length === 0) {
          throw new AuthAccessError("FORBIDDEN", "User access is not allowed on this route.");
        }
        requireOrganizationRole(principal, organizationId, options.userRoles);
      }

      await next();
    } catch (error) {
      if (error instanceof AuthAccessError) {
        return authErrorResponse(context, error);
      }
      throw error;
    }
  };
}
