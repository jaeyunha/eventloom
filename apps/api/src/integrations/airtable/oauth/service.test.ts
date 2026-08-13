import { describe, expect, test } from "vitest";

import {
  type AirtableOAuthAttempt,
  type AirtableOAuthAttemptStore,
  type AirtableOAuthConnection,
  type AirtableOAuthConnectionStore,
  type AirtableOAuthCredentials,
  type AirtableOAuthCrypto,
  AirtableOAuthError,
  type AirtableOAuthProvider,
  AirtableOAuthProviderError,
  type AirtableOAuthSecretStore,
  AirtableOAuthService,
  type AirtableOAuthTokenResponse,
} from "./service";

const START = "2026-05-01T12:00:00.000Z";
const ORGANIZATION_ID = "organization-1";
const USER_ID = "user-1";
const REDIRECT_URI = "https://sessionboard.test/api/airtable/callback";
const SCOPES = ["data.records:read", "schema.bases:read"] as const;

class FixedClock {
  private timestamp: string;

  constructor(timestamp = START) {
    this.timestamp = timestamp;
  }

  readonly now = (): Date => new Date(this.timestamp);

  set(timestamp: string): void {
    this.timestamp = timestamp;
  }
}

class DeterministicCrypto implements AirtableOAuthCrypto {
  readonly randomValues: Array<{ byteLength: number; value: string }> = [];
  private readonly digests = new Map<string, string>();
  private readonly plaintextByCiphertext = new Map<string, string>();
  private idSequence = 0;
  private randomSequence = 0;
  private digestSequence = 0;
  private ciphertextSequence = 0;

  randomId(prefix: string): string {
    this.idSequence += 1;
    return `${prefix}-${this.idSequence}`;
  }

  randomUrlSafe(byteLength: number): string {
    this.randomSequence += 1;
    const value = `random-${this.randomSequence}`;
    this.randomValues.push({ byteLength, value });
    return value;
  }

  sha256Base64Url(value: string): string {
    const existing = this.digests.get(value);
    if (existing !== undefined) {
      return existing;
    }

    this.digestSequence += 1;
    const digest = `digest-${this.digestSequence}`;
    this.digests.set(value, digest);
    return digest;
  }

  encrypt(value: string): string {
    this.ciphertextSequence += 1;
    const ciphertext = `ciphertext-${this.ciphertextSequence}`;
    this.plaintextByCiphertext.set(ciphertext, value);
    return ciphertext;
  }

  decrypt(ciphertext: string): string {
    const plaintext = this.plaintextByCiphertext.get(ciphertext);
    if (plaintext === undefined) {
      throw new Error(`Unknown ciphertext: ${ciphertext}`);
    }
    return plaintext;
  }

  digestFor(value: string): string | undefined {
    return this.digests.get(value);
  }
}

class InMemoryConnectionStore implements AirtableOAuthConnectionStore {
  readonly refreshClaims: Array<{
    previousToken: string | null;
    nextToken: string;
  }> = [];
  readonly statusHistory = new Map<string, string[]>();
  private readonly rows = new Map<string, AirtableOAuthConnection>();

  async beginAuthorization(input: {
    proposedConnectionId: string;
    organizationId: string;
    startedAt: string;
  }): Promise<AirtableOAuthConnection> {
    const existing = [...this.rows.values()].find(
      (connection) =>
        connection.organizationId === input.organizationId && connection.status !== "disconnected",
    );

    if (existing !== undefined) {
      const updated: AirtableOAuthConnection = {
        ...existing,
        status: "authorizing",
        authMode: "oauth",
        connectionVersion: existing.connectionVersion + 1,
        refreshOwner: null,
        refreshToken: null,
        refreshLeaseExpiresAt: null,
        lastErrorCode: null,
        lastError: null,
        updatedAt: input.startedAt,
      };
      this.rows.set(updated.id, updated);
      this.recordStatus(updated.id, updated.status);
      return cloneConnection(updated);
    }

    const connection: AirtableOAuthConnection = {
      id: input.proposedConnectionId,
      organizationId: input.organizationId,
      status: "authorizing",
      authMode: "oauth",
      credentialReference: null,
      airtableUserId: null,
      airtableAccountId: null,
      grantedScopes: [],
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      connectionVersion: 1,
      refreshOwner: null,
      refreshToken: null,
      refreshLeaseExpiresAt: null,
      lastErrorCode: null,
      lastError: null,
      createdAt: input.startedAt,
      updatedAt: input.startedAt,
    };
    this.rows.set(connection.id, connection);
    this.recordStatus(connection.id, connection.status);
    return cloneConnection(connection);
  }

  async findById(connectionId: string): Promise<AirtableOAuthConnection | null> {
    const connection = this.rows.get(connectionId);
    return connection === undefined ? null : cloneConnection(connection);
  }

  async claimRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshOwner: string;
    refreshToken: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }): Promise<AirtableOAuthConnection | null> {
    const connection = this.rows.get(input.connectionId);
    if (
      connection === undefined ||
      connection.organizationId !== input.organizationId ||
      connection.connectionVersion !== input.expectedConnectionVersion
    ) {
      return null;
    }

    const eligibleConnected =
      connection.status === "connected" &&
      (connection.refreshLeaseExpiresAt === null ||
        isAtOrBefore(connection.refreshLeaseExpiresAt, input.claimedAt));
    const eligibleRecovery =
      connection.status === "refreshing" &&
      connection.refreshLeaseExpiresAt !== null &&
      isAtOrBefore(connection.refreshLeaseExpiresAt, input.claimedAt);
    if (!eligibleConnected && !eligibleRecovery) {
      return null;
    }

    this.refreshClaims.push({
      previousToken: connection.refreshToken,
      nextToken: input.refreshToken,
    });
    const claimed: AirtableOAuthConnection = {
      ...connection,
      status: "refreshing",
      connectionVersion: connection.connectionVersion + 1,
      refreshOwner: input.refreshOwner,
      refreshToken: input.refreshToken,
      refreshLeaseExpiresAt: input.leaseExpiresAt,
      updatedAt: input.claimedAt,
    };
    this.rows.set(claimed.id, claimed);
    this.recordStatus(claimed.id, claimed.status);
    return cloneConnection(claimed);
  }

  async finalizeRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshToken: string;
    finalizedAt: string;
    credentialReference: string;
    grantedScopes: readonly string[];
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string | null;
  }): Promise<AirtableOAuthConnection | null> {
    const connection = this.rows.get(input.connectionId);
    if (
      connection === undefined ||
      connection.organizationId !== input.organizationId ||
      connection.status !== "refreshing" ||
      connection.connectionVersion !== input.expectedConnectionVersion ||
      connection.refreshToken !== input.refreshToken ||
      connection.refreshLeaseExpiresAt === null ||
      isAtOrBefore(connection.refreshLeaseExpiresAt, input.finalizedAt)
    ) {
      return null;
    }

    const finalized: AirtableOAuthConnection = {
      ...connection,
      status: "connected",
      credentialReference: input.credentialReference,
      grantedScopes: [...input.grantedScopes],
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      connectionVersion: connection.connectionVersion + 1,
      refreshOwner: null,
      refreshToken: null,
      refreshLeaseExpiresAt: null,
      lastErrorCode: null,
      lastError: null,
      updatedAt: input.finalizedAt,
    };
    this.rows.set(finalized.id, finalized);
    this.recordStatus(finalized.id, finalized.status);
    return cloneConnection(finalized);
  }

  async failRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshToken: string;
    failedAt: string;
    errorCode: string;
    errorMessage: string;
    reauthorizationRequired: boolean;
  }): Promise<boolean> {
    const connection = this.rows.get(input.connectionId);
    if (
      connection === undefined ||
      connection.organizationId !== input.organizationId ||
      connection.status !== "refreshing" ||
      connection.connectionVersion !== input.expectedConnectionVersion ||
      connection.refreshToken !== input.refreshToken ||
      connection.refreshLeaseExpiresAt === null ||
      isAtOrBefore(connection.refreshLeaseExpiresAt, input.failedAt)
    ) {
      return false;
    }

    const failed: AirtableOAuthConnection = {
      ...connection,
      status: input.reauthorizationRequired ? "reauthorization_required" : "connected",
      connectionVersion: connection.connectionVersion + 1,
      refreshOwner: null,
      refreshToken: null,
      refreshLeaseExpiresAt: null,
      lastErrorCode: input.errorCode,
      lastError: input.errorMessage,
      updatedAt: input.failedAt,
    };
    this.rows.set(failed.id, failed);
    this.recordStatus(failed.id, failed.status);
    return true;
  }

  seed(connection: AirtableOAuthConnection): void {
    this.rows.set(connection.id, cloneConnection(connection));
    this.statusHistory.set(connection.id, [connection.status]);
  }

  get(connectionId: string): AirtableOAuthConnection {
    const connection = this.rows.get(connectionId);
    if (connection === undefined) {
      throw new Error(`Unknown connection: ${connectionId}`);
    }
    return cloneConnection(connection);
  }

  finalizeAuthorization(input: {
    connectionId: string;
    organizationId: string;
    credentialReference: string;
    airtableUserId: string | null;
    airtableAccountId: string | null;
    grantedScopes: readonly string[];
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string | null;
    finalizedAt: string;
  }): AirtableOAuthConnection | null {
    const connection = this.rows.get(input.connectionId);
    if (
      connection === undefined ||
      connection.organizationId !== input.organizationId ||
      connection.status !== "authorizing"
    ) {
      return null;
    }

    const finalized: AirtableOAuthConnection = {
      ...connection,
      status: "connected",
      credentialReference: input.credentialReference,
      airtableUserId: input.airtableUserId,
      airtableAccountId: input.airtableAccountId,
      grantedScopes: [...input.grantedScopes],
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      connectionVersion: connection.connectionVersion + 1,
      refreshOwner: null,
      refreshToken: null,
      refreshLeaseExpiresAt: null,
      lastErrorCode: null,
      lastError: null,
      updatedAt: input.finalizedAt,
    };
    this.rows.set(finalized.id, finalized);
    this.recordStatus(finalized.id, finalized.status);
    return cloneConnection(finalized);
  }

  private recordStatus(connectionId: string, status: string): void {
    const history = this.statusHistory.get(connectionId) ?? [];
    history.push(status);
    this.statusHistory.set(connectionId, history);
  }
}

class InMemoryAttemptStore implements AirtableOAuthAttemptStore {
  readonly exchangeClaims: Array<{
    previousToken: string | null;
    nextToken: string;
  }> = [];
  readonly statusHistory = new Map<string, string[]>();
  private readonly rows = new Map<string, AirtableOAuthAttempt>();

  constructor(private readonly connections: InMemoryConnectionStore) {}

  async create(attempt: AirtableOAuthAttempt): Promise<void> {
    if (
      this.rows.has(attempt.id) ||
      [...this.rows.values()].some((candidate) => candidate.stateHash === attempt.stateHash)
    ) {
      throw new Error("Duplicate OAuth attempt");
    }
    this.rows.set(attempt.id, cloneAttempt(attempt));
    this.statusHistory.set(attempt.id, [attempt.status]);
  }

  async findByStateHash(stateHash: string): Promise<AirtableOAuthAttempt | null> {
    const attempt = [...this.rows.values()].find((candidate) => candidate.stateHash === stateHash);
    return attempt === undefined ? null : cloneAttempt(attempt);
  }

  async claimExchange(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    callbackCodeHash: string;
    exchangeOwner: string;
    exchangeToken: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }): Promise<AirtableOAuthAttempt | null> {
    const attempt = this.rows.get(input.attemptId);
    if (
      attempt === undefined ||
      attempt.attemptVersion !== input.expectedAttemptVersion ||
      isAtOrBefore(attempt.expiresAt, input.claimedAt)
    ) {
      return null;
    }

    const eligiblePending = attempt.status === "pending" && attempt.callbackCodeHash === null;
    const eligibleRecovery =
      attempt.status === "exchanging" &&
      attempt.callbackCodeHash === input.callbackCodeHash &&
      attempt.exchangeLeaseExpiresAt !== null &&
      isAtOrBefore(attempt.exchangeLeaseExpiresAt, input.claimedAt);
    if (!eligiblePending && !eligibleRecovery) {
      return null;
    }

    this.exchangeClaims.push({
      previousToken: attempt.exchangeToken,
      nextToken: input.exchangeToken,
    });
    const claimed: AirtableOAuthAttempt = {
      ...attempt,
      callbackCodeHash: input.callbackCodeHash,
      status: "exchanging",
      exchangeOwner: input.exchangeOwner,
      exchangeToken: input.exchangeToken,
      exchangeLeaseExpiresAt: input.leaseExpiresAt,
      attemptVersion: attempt.attemptVersion + 1,
      errorCode: null,
      updatedAt: input.claimedAt,
    };
    this.rows.set(claimed.id, claimed);
    this.recordStatus(claimed.id, claimed.status);
    return cloneAttempt(claimed);
  }

  async expire(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    expiredAt: string;
  }): Promise<boolean> {
    const attempt = this.rows.get(input.attemptId);
    if (
      attempt === undefined ||
      attempt.attemptVersion !== input.expectedAttemptVersion ||
      (attempt.status !== "pending" && attempt.status !== "exchanging")
    ) {
      return false;
    }

    const expired: AirtableOAuthAttempt = {
      ...attempt,
      status: "expired",
      exchangeOwner: null,
      exchangeToken: null,
      exchangeLeaseExpiresAt: null,
      attemptVersion: attempt.attemptVersion + 1,
      errorCode: "attempt_expired",
      updatedAt: input.expiredAt,
    };
    this.rows.set(expired.id, expired);
    this.recordStatus(expired.id, expired.status);
    return true;
  }

  async finalizeExchange(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    exchangeToken: string;
    finalizedAt: string;
    resultRedirect: string;
    connection: {
      id: string;
      organizationId: string;
      credentialReference: string;
      airtableUserId: string | null;
      airtableAccountId: string | null;
      grantedScopes: readonly string[];
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string | null;
    };
  }): Promise<{
    attempt: AirtableOAuthAttempt;
    connection: AirtableOAuthConnection;
  } | null> {
    const attempt = this.rows.get(input.attemptId);
    if (
      attempt === undefined ||
      attempt.status !== "exchanging" ||
      attempt.attemptVersion !== input.expectedAttemptVersion ||
      attempt.exchangeToken !== input.exchangeToken ||
      attempt.exchangeLeaseExpiresAt === null ||
      isAtOrBefore(attempt.exchangeLeaseExpiresAt, input.finalizedAt) ||
      attempt.connectionId !== input.connection.id ||
      attempt.organizationId !== input.connection.organizationId
    ) {
      return null;
    }

    const connection = this.connections.finalizeAuthorization({
      connectionId: input.connection.id,
      organizationId: input.connection.organizationId,
      credentialReference: input.connection.credentialReference,
      airtableUserId: input.connection.airtableUserId,
      airtableAccountId: input.connection.airtableAccountId,
      grantedScopes: input.connection.grantedScopes,
      accessTokenExpiresAt: input.connection.accessTokenExpiresAt,
      refreshTokenExpiresAt: input.connection.refreshTokenExpiresAt,
      finalizedAt: input.finalizedAt,
    });
    if (connection === null) {
      return null;
    }

    const consumed: AirtableOAuthAttempt = {
      ...attempt,
      status: "consumed",
      exchangeOwner: null,
      exchangeToken: null,
      exchangeLeaseExpiresAt: null,
      attemptVersion: attempt.attemptVersion + 1,
      consumedAt: input.finalizedAt,
      resultRedirect: input.resultRedirect,
      errorCode: null,
      updatedAt: input.finalizedAt,
    };
    this.rows.set(consumed.id, consumed);
    this.recordStatus(consumed.id, consumed.status);
    return {
      attempt: cloneAttempt(consumed),
      connection,
    };
  }

  async failExchange(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    exchangeToken: string;
    failedAt: string;
    errorCode: string;
  }): Promise<boolean> {
    const attempt = this.rows.get(input.attemptId);
    if (
      attempt === undefined ||
      attempt.status !== "exchanging" ||
      attempt.attemptVersion !== input.expectedAttemptVersion ||
      attempt.exchangeToken !== input.exchangeToken ||
      attempt.exchangeLeaseExpiresAt === null ||
      isAtOrBefore(attempt.exchangeLeaseExpiresAt, input.failedAt)
    ) {
      return false;
    }

    const failed: AirtableOAuthAttempt = {
      ...attempt,
      status: "failed",
      exchangeOwner: null,
      exchangeToken: null,
      exchangeLeaseExpiresAt: null,
      attemptVersion: attempt.attemptVersion + 1,
      errorCode: input.errorCode,
      updatedAt: input.failedAt,
    };
    this.rows.set(failed.id, failed);
    this.recordStatus(failed.id, failed.status);
    return true;
  }

  get(attemptId: string): AirtableOAuthAttempt {
    const attempt = this.rows.get(attemptId);
    if (attempt === undefined) {
      throw new Error(`Unknown attempt: ${attemptId}`);
    }
    return cloneAttempt(attempt);
  }

  private recordStatus(attemptId: string, status: string): void {
    const history = this.statusHistory.get(attemptId) ?? [];
    history.push(status);
    this.statusHistory.set(attemptId, history);
  }
}

class InMemorySecretStore implements AirtableOAuthSecretStore {
  readonly writes: Array<{
    reference: string;
    source: "authorization" | "refresh";
    claimToken: string;
  }> = [];
  readonly discarded: string[] = [];
  private readonly credentials = new Map<string, AirtableOAuthCredentials>();
  private sequence = 0;

  async put(input: {
    connectionId: string;
    source: "authorization" | "refresh";
    claimToken: string;
    credentials: AirtableOAuthCredentials;
  }): Promise<string> {
    this.sequence += 1;
    const reference = `${input.connectionId}/credential-${this.sequence}`;
    this.credentials.set(reference, { ...input.credentials });
    this.writes.push({
      reference,
      source: input.source,
      claimToken: input.claimToken,
    });
    return reference;
  }

  async get(credentialReference: string): Promise<AirtableOAuthCredentials> {
    const credentials = this.credentials.get(credentialReference);
    if (credentials === undefined) {
      throw new Error(`Unknown credential: ${credentialReference}`);
    }
    return { ...credentials };
  }

  async discard(credentialReference: string): Promise<void> {
    this.credentials.delete(credentialReference);
    this.discarded.push(credentialReference);
  }

  seed(reference: string, credentials: AirtableOAuthCredentials): void {
    this.credentials.set(reference, { ...credentials });
  }
}

class FakeProvider implements AirtableOAuthProvider {
  readonly authorizationRequests: Array<{
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    scopes: readonly string[];
  }> = [];
  readonly exchangeRequests: Array<{
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }> = [];
  readonly refreshRequests: Array<{ refreshToken: string }> = [];
  exchangeResult: AirtableOAuthTokenResponse = {
    accessToken: "access-token-1",
    refreshToken: "refresh-token-1",
    accessTokenExpiresInSeconds: 3_600,
    refreshTokenExpiresInSeconds: 86_400,
    grantedScopes: SCOPES,
    airtableUserId: "airtable-user-1",
    airtableAccountId: "airtable-account-1",
  };
  exchangeError: Error | null = null;
  refreshResults: AirtableOAuthTokenResponse[] = [];
  refreshError: Error | null = null;

  authorizationUrl(input: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    scopes: readonly string[];
  }): string {
    this.authorizationRequests.push({ ...input, scopes: [...input.scopes] });
    return `https://airtable.test/oauth2/v1/authorize?state=${input.state}&code_challenge=${input.codeChallenge}`;
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<AirtableOAuthTokenResponse> {
    this.exchangeRequests.push({ ...input });
    if (this.exchangeError !== null) {
      throw this.exchangeError;
    }
    return cloneTokenResponse(this.exchangeResult);
  }

  async refreshAccessToken(input: { refreshToken: string }): Promise<AirtableOAuthTokenResponse> {
    this.refreshRequests.push({ ...input });
    if (this.refreshError !== null) {
      throw this.refreshError;
    }
    const result = this.refreshResults.shift();
    if (result === undefined) {
      throw new Error("No refresh result configured");
    }
    return cloneTokenResponse(result);
  }
}

function createHarness() {
  const clock = new FixedClock();
  const crypto = new DeterministicCrypto();
  const connections = new InMemoryConnectionStore();
  const attempts = new InMemoryAttemptStore(connections);
  const secrets = new InMemorySecretStore();
  const provider = new FakeProvider();
  const service = new AirtableOAuthService({
    attempts,
    connections,
    secrets,
    provider,
    crypto,
    redirectUri: REDIRECT_URI,
    scopes: SCOPES,
    workerId: "worker-1",
    now: clock.now,
    attemptTtlMs: 10 * 60 * 1_000,
    exchangeLeaseMs: 30 * 1_000,
    refreshLeaseMs: 30 * 1_000,
  });

  return {
    attempts,
    clock,
    connections,
    crypto,
    provider,
    secrets,
    service,
  };
}

async function beginAuthorization(harness: ReturnType<typeof createHarness>): Promise<{
  attemptId: string;
  connectionId: string;
  state: string;
  verifier: string;
}> {
  const result = await harness.service.beginAuthorization({
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    returnPath: "/settings/integrations?connected=airtable",
  });

  return {
    attemptId: result.attemptId,
    connectionId: result.connectionId,
    state: harness.crypto.randomValues[0]?.value ?? "",
    verifier: harness.crypto.randomValues[1]?.value ?? "",
  };
}

function connectedConnection(
  overrides: Partial<AirtableOAuthConnection> = {},
): AirtableOAuthConnection {
  return {
    id: "airtable-connection-1",
    organizationId: ORGANIZATION_ID,
    status: "connected",
    authMode: "oauth",
    credentialReference: "credential-current",
    airtableUserId: "airtable-user-1",
    airtableAccountId: "airtable-account-1",
    grantedScopes: [...SCOPES],
    accessTokenExpiresAt: "2026-05-01T12:05:00.000Z",
    refreshTokenExpiresAt: "2026-06-01T12:00:00.000Z",
    connectionVersion: 4,
    refreshOwner: null,
    refreshToken: null,
    refreshLeaseExpiresAt: null,
    lastErrorCode: null,
    lastError: null,
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-05-01T11:00:00.000Z",
    ...overrides,
  };
}

async function expectOAuthError(
  operation: Promise<unknown>,
  code: string,
): Promise<AirtableOAuthError> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(AirtableOAuthError);
  expect((caught as AirtableOAuthError).code).toBe(code);
  return caught as AirtableOAuthError;
}

function cloneAttempt(attempt: AirtableOAuthAttempt): AirtableOAuthAttempt {
  return { ...attempt };
}

function cloneConnection(connection: AirtableOAuthConnection): AirtableOAuthConnection {
  return { ...connection, grantedScopes: [...connection.grantedScopes] };
}

function cloneTokenResponse(response: AirtableOAuthTokenResponse): AirtableOAuthTokenResponse {
  if (response.grantedScopes === undefined) {
    return { ...response };
  }

  return {
    ...response,
    grantedScopes: [...response.grantedScopes],
  };
}

function isAtOrBefore(timestamp: string, observedAt: string): boolean {
  return Date.parse(timestamp) <= Date.parse(observedAt);
}

describe("AirtableOAuthService", () => {
  test("creates a hashed-state PKCE authorization attempt", async () => {
    const harness = createHarness();

    const result = await harness.service.beginAuthorization({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      returnPath: "/settings/integrations",
    });

    const state = harness.crypto.randomValues[0]?.value;
    const verifier = harness.crypto.randomValues[1]?.value;
    const attempt = harness.attempts.get(result.attemptId);
    const connection = harness.connections.get(result.connectionId);
    const authorizationRequest = harness.provider.authorizationRequests[0];
    if (authorizationRequest === undefined) {
      throw new Error("Expected at least one authorization request to be recorded.");
    }

    expect(harness.crypto.randomValues).toEqual([
      { byteLength: 32, value: state },
      { byteLength: 64, value: verifier },
    ]);
    expect(authorizationRequest).toEqual({
      redirectUri: REDIRECT_URI,
      state,
      codeChallenge: harness.crypto.digestFor(verifier ?? ""),
      codeChallengeMethod: "S256",
      scopes: SCOPES,
    });
    expect(result.authorizationUrl).toContain(`state=${state}`);
    expect(attempt).toMatchObject({
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      connectionId: result.connectionId,
      stateHash: harness.crypto.digestFor(state ?? ""),
      status: "pending",
      attemptVersion: 1,
      expiresAt: "2026-05-01T12:10:00.000Z",
    });
    expect(attempt.stateHash).not.toBe(state);
    expect(attempt.pkceVerifierCiphertext).not.toBe(verifier);
    expect(harness.crypto.decrypt(attempt.pkceVerifierCiphertext)).toBe(verifier);
    expect(connection).toMatchObject({
      organizationId: ORGANIZATION_ID,
      status: "authorizing",
      authMode: "oauth",
      connectionVersion: 1,
    });
  });

  test("claims pending callback, exchanges externally, and atomically finalizes tokens", async () => {
    const harness = createHarness();
    const authorization = await beginAuthorization(harness);

    const result = await harness.service.handleCallback({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      state: authorization.state,
      code: "authorization-code-1",
    });

    const attempt = harness.attempts.get(authorization.attemptId);
    const connection = harness.connections.get(authorization.connectionId);
    if (connection.credentialReference === null) {
      throw new Error("Expected the exchanged connection to have a credential reference.");
    }
    const credential = await harness.secrets.get(connection.credentialReference);

    expect(harness.attempts.statusHistory.get(authorization.attemptId)).toEqual([
      "pending",
      "exchanging",
      "consumed",
    ]);
    expect(harness.provider.exchangeRequests).toEqual([
      {
        code: "authorization-code-1",
        codeVerifier: authorization.verifier,
        redirectUri: REDIRECT_URI,
      },
    ]);
    expect(attempt).toMatchObject({
      callbackCodeHash: harness.crypto.digestFor("authorization-code-1"),
      status: "consumed",
      exchangeOwner: null,
      exchangeToken: null,
      exchangeLeaseExpiresAt: null,
      attemptVersion: 3,
      consumedAt: START,
      resultRedirect: "/settings/integrations?connected=airtable",
    });
    expect(connection).toMatchObject({
      status: "connected",
      credentialReference: harness.secrets.writes[0]?.reference,
      airtableUserId: "airtable-user-1",
      airtableAccountId: "airtable-account-1",
      grantedScopes: SCOPES,
      accessTokenExpiresAt: "2026-05-01T13:00:00.000Z",
      refreshTokenExpiresAt: "2026-05-02T12:00:00.000Z",
      connectionVersion: 2,
    });
    expect(credential).toEqual({
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
    });
    expect(result).toEqual({
      connectionId: authorization.connectionId,
      connectionVersion: 2,
      redirectTo: "/settings/integrations?connected=airtable",
    });
  });

  test("rejects callbacks from a different user before exchange", async () => {
    const harness = createHarness();
    const authorization = await beginAuthorization(harness);

    await expectOAuthError(
      harness.service.handleCallback({
        organizationId: ORGANIZATION_ID,
        userId: "different-user",
        state: authorization.state,
        code: "authorization-code-1",
      }),
      "wrong_user",
    );

    expect(harness.provider.exchangeRequests).toHaveLength(0);
    expect(harness.attempts.get(authorization.attemptId).status).toBe("pending");
  });

  test("expires an attempt at its deadline without calling Airtable", async () => {
    const harness = createHarness();
    const authorization = await beginAuthorization(harness);
    harness.clock.set("2026-05-01T12:10:00.000Z");

    await expectOAuthError(
      harness.service.handleCallback({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        state: authorization.state,
        code: "authorization-code-1",
      }),
      "attempt_expired",
    );

    expect(harness.provider.exchangeRequests).toHaveLength(0);
    expect(harness.attempts.get(authorization.attemptId)).toMatchObject({
      status: "expired",
      attemptVersion: 2,
      errorCode: "attempt_expired",
    });
  });

  test("rejects replay after a callback has been consumed", async () => {
    const harness = createHarness();
    const authorization = await beginAuthorization(harness);
    const callback = {
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      state: authorization.state,
      code: "authorization-code-1",
    };

    await harness.service.handleCallback(callback);
    await expectOAuthError(harness.service.handleCallback(callback), "callback_replayed");

    expect(harness.provider.exchangeRequests).toHaveLength(1);
    expect(harness.secrets.writes).toHaveLength(1);
  });

  test("records an external exchange failure and rejects a second callback", async () => {
    const harness = createHarness();
    const authorization = await beginAuthorization(harness);
    harness.provider.exchangeError = new AirtableOAuthProviderError(
      "invalid_grant",
      "Authorization code rejected",
    );

    await expectOAuthError(
      harness.service.handleCallback({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        state: authorization.state,
        code: "authorization-code-1",
      }),
      "exchange_failed",
    );

    expect(harness.attempts.get(authorization.attemptId)).toMatchObject({
      status: "failed",
      attemptVersion: 3,
      errorCode: "invalid_grant",
      exchangeOwner: null,
      exchangeToken: null,
      exchangeLeaseExpiresAt: null,
    });
    expect(harness.provider.exchangeRequests).toHaveLength(1);
    expect(harness.secrets.writes).toHaveLength(0);

    await expectOAuthError(
      harness.service.handleCallback({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        state: authorization.state,
        code: "authorization-code-1",
      }),
      "attempt_failed",
    );
    expect(harness.provider.exchangeRequests).toHaveLength(1);
  });

  test("recovers an expired callback claim with the same code and a rotated lease", async () => {
    const harness = createHarness();
    const authorization = await beginAuthorization(harness);
    const attempt = harness.attempts.get(authorization.attemptId);
    const callbackCodeHash = harness.crypto.sha256Base64Url("authorization-code-1");

    const originalClaim = await harness.attempts.claimExchange({
      attemptId: attempt.id,
      expectedAttemptVersion: attempt.attemptVersion,
      callbackCodeHash,
      exchangeOwner: "worker-that-stopped",
      exchangeToken: "stale-exchange-lease",
      claimedAt: START,
      leaseExpiresAt: "2026-05-01T12:00:30.000Z",
    });
    expect(originalClaim).not.toBeNull();

    harness.clock.set("2026-05-01T12:00:10.000Z");
    await expectOAuthError(
      harness.service.handleCallback({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        state: authorization.state,
        code: "authorization-code-1",
      }),
      "callback_in_progress",
    );
    expect(harness.provider.exchangeRequests).toHaveLength(0);

    harness.clock.set("2026-05-01T12:00:30.000Z");
    await harness.service.handleCallback({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      state: authorization.state,
      code: "authorization-code-1",
    });

    expect(harness.attempts.exchangeClaims).toHaveLength(2);
    expect(harness.attempts.exchangeClaims[1]).toEqual({
      previousToken: "stale-exchange-lease",
      nextToken: "random-3",
    });
    expect(harness.attempts.statusHistory.get(authorization.attemptId)).toEqual([
      "pending",
      "exchanging",
      "exchanging",
      "consumed",
    ]);
    expect(harness.provider.exchangeRequests).toHaveLength(1);
  });

  test("rejects a refresh race while another worker owns a live lease", async () => {
    const harness = createHarness();
    harness.connections.seed(
      connectedConnection({
        status: "refreshing",
        connectionVersion: 5,
        refreshOwner: "other-worker",
        refreshToken: "live-refresh-lease",
        refreshLeaseExpiresAt: "2026-05-01T12:00:30.000Z",
      }),
    );

    const error = await expectOAuthError(
      harness.service.refreshConnection({
        organizationId: ORGANIZATION_ID,
        connectionId: "airtable-connection-1",
      }),
      "refresh_in_progress",
    );

    expect(error.retryable).toBe(true);
    expect(harness.connections.refreshClaims).toHaveLength(0);
    expect(harness.provider.refreshRequests).toHaveLength(0);
    expect(harness.connections.get("airtable-connection-1")).toMatchObject({
      status: "refreshing",
      connectionVersion: 5,
      refreshOwner: "other-worker",
      refreshToken: "live-refresh-lease",
    });
  });

  test("recovers an expired refresh claim and rotates both lease and provider token", async () => {
    const harness = createHarness();
    harness.connections.seed(
      connectedConnection({
        status: "refreshing",
        connectionVersion: 5,
        refreshOwner: "worker-that-stopped",
        refreshToken: "stale-refresh-lease",
        refreshLeaseExpiresAt: "2026-05-01T11:59:59.000Z",
      }),
    );
    harness.secrets.seed("credential-current", {
      accessToken: "access-token-current",
      refreshToken: "provider-refresh-token-1",
    });
    harness.provider.refreshResults.push(
      {
        accessToken: "access-token-2",
        refreshToken: "provider-refresh-token-2",
        accessTokenExpiresInSeconds: 3_600,
        refreshTokenExpiresInSeconds: 7_200,
        grantedScopes: ["data.records:read"],
      },
      {
        accessToken: "access-token-3",
        refreshToken: "provider-refresh-token-3",
        accessTokenExpiresInSeconds: 1_800,
        refreshTokenExpiresInSeconds: 10_800,
      },
    );

    const first = await harness.service.refreshConnection({
      organizationId: ORGANIZATION_ID,
      connectionId: "airtable-connection-1",
    });
    harness.clock.set("2026-05-01T12:30:00.000Z");
    const second = await harness.service.refreshConnection({
      organizationId: ORGANIZATION_ID,
      connectionId: "airtable-connection-1",
    });

    expect(harness.connections.refreshClaims).toEqual([
      {
        previousToken: "stale-refresh-lease",
        nextToken: "random-1",
      },
      {
        previousToken: null,
        nextToken: "random-2",
      },
    ]);
    expect(harness.secrets.writes.map((write) => write.claimToken)).toEqual([
      "random-1",
      "random-2",
    ]);
    expect(harness.provider.refreshRequests).toEqual([
      { refreshToken: "provider-refresh-token-1" },
      { refreshToken: "provider-refresh-token-2" },
    ]);
    expect(first).toEqual({
      connectionId: "airtable-connection-1",
      connectionVersion: 7,
      accessTokenExpiresAt: "2026-05-01T13:00:00.000Z",
      refreshTokenExpiresAt: "2026-05-01T14:00:00.000Z",
    });
    expect(second).toEqual({
      connectionId: "airtable-connection-1",
      connectionVersion: 9,
      accessTokenExpiresAt: "2026-05-01T13:00:00.000Z",
      refreshTokenExpiresAt: "2026-05-01T15:30:00.000Z",
    });

    const connection = harness.connections.get("airtable-connection-1");
    expect(connection).toMatchObject({
      status: "connected",
      connectionVersion: 9,
      grantedScopes: ["data.records:read"],
      refreshOwner: null,
      refreshToken: null,
      refreshLeaseExpiresAt: null,
    });
    if (connection.credentialReference === null) {
      throw new Error("Expected the refreshed connection to have a credential reference.");
    }
    expect(await harness.secrets.get(connection.credentialReference)).toEqual({
      accessToken: "access-token-3",
      refreshToken: "provider-refresh-token-3",
    });
  });

  test("moves an invalid refresh grant to reauthorization required", async () => {
    const harness = createHarness();
    harness.connections.seed(connectedConnection());
    harness.secrets.seed("credential-current", {
      accessToken: "access-token-current",
      refreshToken: "provider-refresh-token-1",
    });
    harness.provider.refreshError = new AirtableOAuthProviderError(
      "invalid_grant",
      "Refresh token revoked",
    );

    await expectOAuthError(
      harness.service.refreshConnection({
        organizationId: ORGANIZATION_ID,
        connectionId: "airtable-connection-1",
      }),
      "reauthorization_required",
    );

    expect(harness.connections.get("airtable-connection-1")).toMatchObject({
      status: "reauthorization_required",
      connectionVersion: 6,
      refreshOwner: null,
      refreshToken: null,
      refreshLeaseExpiresAt: null,
      lastErrorCode: "invalid_grant",
      lastError: "Refresh token revoked",
    });
  });
});
