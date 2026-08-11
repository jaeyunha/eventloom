export interface AuthProviderConfigurationInput {
  secret: string;
  baseUrl: string;
  trustedOrigins: readonly string[];
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

  return {
    secret,
    baseUrl,
    trustedOrigins: trustedOrigins(baseUrl, input.trustedOrigins),
    emailVerification: { required: true },
    magicLink: { enabled: true, expiresInSeconds: 15 * 60 },
  };
}
