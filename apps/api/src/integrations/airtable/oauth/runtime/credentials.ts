import type { AirtableAuthMode, AirtableSecretStore } from "../../control/service";
import type { AirtableOAuthSecretStore } from "../service";
import { AirtableOAuthRuntimeError } from "./errors";

const PAT_REFERENCE_PREFIX = "airtable-secret:v1:";
const OAUTH_REFERENCE_PREFIX = "airtable-oauth:v1:";

export interface ResolveAirtableCredentialInput {
  readonly authMode: AirtableAuthMode;
  readonly credentialReference: string | null;
}

export interface ResolvedAirtableCredential {
  readonly authMode: AirtableAuthMode;
  readonly credential: string;
}

export interface AirtableCredentialResolverDependencies {
  readonly patSecrets: Pick<AirtableSecretStore, "get">;
  readonly oauthSecrets: Pick<AirtableOAuthSecretStore, "get">;
}

export interface AirtableCredentialResolver {
  resolve(input: ResolveAirtableCredentialInput): Promise<ResolvedAirtableCredential>;
}

export class AuthModeAwareAirtableCredentialResolver implements AirtableCredentialResolver {
  constructor(private readonly dependencies: AirtableCredentialResolverDependencies) {}

  async resolve(input: ResolveAirtableCredentialInput): Promise<ResolvedAirtableCredential> {
    const reference = input.credentialReference;
    if (reference === null || reference.length === 0) {
      throw new AirtableOAuthRuntimeError(
        "missing_credential",
        "The Airtable connection has no credential reference.",
      );
    }

    this.assertReferenceMode(input.authMode, reference);

    try {
      const credential =
        input.authMode === "pat"
          ? await this.dependencies.patSecrets.get(reference)
          : (await this.dependencies.oauthSecrets.get(reference)).accessToken;
      if (credential.length === 0) {
        throw new Error("The resolved Airtable credential is empty.");
      }
      return { authMode: input.authMode, credential };
    } catch (cause) {
      throw new AirtableOAuthRuntimeError(
        "invalid_credential_reference",
        "The Airtable credential reference could not be resolved.",
        { cause },
      );
    }
  }

  private assertReferenceMode(authMode: AirtableAuthMode, reference: string): void {
    const expectedPrefix = authMode === "pat" ? PAT_REFERENCE_PREFIX : OAUTH_REFERENCE_PREFIX;
    if (reference.startsWith(expectedPrefix) && reference.length > expectedPrefix.length) {
      return;
    }

    const otherPrefix = authMode === "pat" ? OAUTH_REFERENCE_PREFIX : PAT_REFERENCE_PREFIX;
    if (reference.startsWith(otherPrefix)) {
      throw new AirtableOAuthRuntimeError(
        "credential_mode_mismatch",
        "The Airtable credential reference does not match the connection authentication mode.",
      );
    }

    throw new AirtableOAuthRuntimeError(
      "invalid_credential_reference",
      "The Airtable credential reference has an unsupported format.",
    );
  }
}
