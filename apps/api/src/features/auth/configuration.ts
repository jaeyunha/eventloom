export type OAuthProviderName = "google";

export interface OAuthProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthProviderEnvironment {
  clientId?: string;
  clientSecret?: string;
}

export interface AuthProviderConfigurationInput {
  secret: string;
  baseUrl: string;
  trustedOrigins: readonly string[];
  google?: OAuthProviderEnvironment;
  /**
   * Microsoft OAuth is intentionally not supported. The field remains accepted
   * so deployment configuration can be ignored safely without activating it.
   */
  microsoft?: OAuthProviderEnvironment;
}

export const BETTER_AUTH_GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

export interface BetterAuthRuntimeConfiguration {
  secret: string;
  baseUrl: string;
  trustedOrigins: readonly string[];
  googleCallbackUrl: string;
  emailVerification: {
    required: true;
  };
  magicLink: {
    enabled: true;
    expiresInSeconds: number;
  };
  oauthProviders: Partial<Record<OAuthProviderName, OAuthProviderCredentials>>;
}

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function requiredNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AuthConfigurationError(`${name} is required.`);
  }
  return normalized;
}

function validatedUrl(value: string, name: string): string {
  const normalized = requiredNonEmpty(value, name);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new AuthConfigurationError(`${name} must be an absolute HTTP(S) URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AuthConfigurationError(`${name} must be an absolute HTTP(S) URL.`);
  }
  return parsed.origin;
}

function optionalGoogle(
  environment: OAuthProviderEnvironment | undefined,
): OAuthProviderCredentials | undefined {
  const clientId = environment?.clientId?.trim();
  const clientSecret = environment?.clientSecret?.trim();

  if (!clientId && !clientSecret) {
    return undefined;
  }
  if (!clientId || !clientSecret) {
    throw new AuthConfigurationError(
      "google OAuth requires both a client ID and a client secret when enabled.",
    );
  }
  return { clientId, clientSecret };
}

function trustedOrigins(
  apiOrigin: string,
  configuredOrigins: readonly string[],
): readonly string[] {
  const origins = [
    ...configuredOrigins.map((origin) => validatedUrl(origin, "Better Auth trusted origin")),
    apiOrigin,
  ];
  return [...new Set(origins)];
}

export function createBetterAuthRuntimeConfiguration(
  input: AuthProviderConfigurationInput,
): BetterAuthRuntimeConfiguration {
  const secret = requiredNonEmpty(input.secret, "Better Auth secret");
  const baseUrl = validatedUrl(input.baseUrl, "Better Auth base URL");
  const oauthProviders: BetterAuthRuntimeConfiguration["oauthProviders"] = {};
  const google = optionalGoogle(input.google);

  if (google) {
    oauthProviders.google = google;
  }

  return {
    secret,
    baseUrl,
    trustedOrigins: trustedOrigins(baseUrl, input.trustedOrigins),
    googleCallbackUrl: `${baseUrl}${BETTER_AUTH_GOOGLE_CALLBACK_PATH}`,
    emailVerification: { required: true },
    magicLink: { enabled: true, expiresInSeconds: 15 * 60 },
    oauthProviders,
  };
}
