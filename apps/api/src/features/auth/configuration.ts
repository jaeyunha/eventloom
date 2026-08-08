export type OAuthProviderName = "google" | "microsoft";

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
  microsoft?: OAuthProviderEnvironment;
}

export interface BetterAuthRuntimeConfiguration {
  secret: string;
  baseUrl: string;
  trustedOrigins: readonly string[];
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

function optionalProvider(
  name: OAuthProviderName,
  environment: OAuthProviderEnvironment | undefined,
): OAuthProviderCredentials | undefined {
  const clientId = environment?.clientId?.trim();
  const clientSecret = environment?.clientSecret?.trim();

  if (!clientId && !clientSecret) {
    return undefined;
  }
  if (!clientId || !clientSecret) {
    throw new AuthConfigurationError(
      `${name} OAuth requires both a client ID and a client secret when enabled.`,
    );
  }
  return { clientId, clientSecret };
}

export function createBetterAuthRuntimeConfiguration(
  input: AuthProviderConfigurationInput,
): BetterAuthRuntimeConfiguration {
  const oauthProviders: BetterAuthRuntimeConfiguration["oauthProviders"] = {};
  const google = optionalProvider("google", input.google);
  const microsoft = optionalProvider("microsoft", input.microsoft);

  if (google) {
    oauthProviders.google = google;
  }
  if (microsoft) {
    oauthProviders.microsoft = microsoft;
  }

  return {
    secret: requiredNonEmpty(input.secret, "Better Auth secret"),
    baseUrl: validatedUrl(input.baseUrl, "Better Auth base URL"),
    trustedOrigins: input.trustedOrigins.map((origin) =>
      validatedUrl(origin, "Better Auth trusted origin"),
    ),
    emailVerification: { required: true },
    magicLink: { enabled: true, expiresInSeconds: 15 * 60 },
    oauthProviders,
  };
}
