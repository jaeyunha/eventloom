type MaybePromise<T> = T | Promise<T>;

export type AirtableOAuthAttemptStatus =
  | "pending"
  | "exchanging"
  | "consumed"
  | "failed"
  | "expired";

export type AirtableConnectionStatus =
  | "disconnected"
  | "authorizing"
  | "connected"
  | "refreshing"
  | "paused"
  | "reauthorization_required"
  | "disconnecting";

export interface AirtableOAuthAttempt {
  id: string;
  organizationId: string;
  initiatingUserId: string;
  connectionId: string;
  stateHash: string;
  pkceVerifierCiphertext: string;
  returnPath: string;
  callbackCodeHash: string | null;
  status: AirtableOAuthAttemptStatus;
  exchangeOwner: string | null;
  exchangeToken: string | null;
  exchangeLeaseExpiresAt: string | null;
  attemptVersion: number;
  /** Connection generation that this attempt is authorized to finalize. */
  authorizationConnectionVersion: number;
  expiresAt: string;
  consumedAt: string | null;
  resultRedirect: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AirtableOAuthConnection {
  id: string;
  organizationId: string;
  status: AirtableConnectionStatus;
  authMode: "oauth" | "pat";
  credentialReference: string | null;
  airtableUserId: string | null;
  airtableAccountId: string | null;
  grantedScopes: readonly string[];
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  connectionVersion: number;
  refreshOwner: string | null;
  refreshToken: string | null;
  refreshLeaseExpiresAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AirtableOAuthCredentials {
  accessToken: string;
  refreshToken: string;
}

export interface AirtableOAuthTokenResponse {
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds?: number | null;
  grantedScopes?: readonly string[];
  airtableUserId?: string | null;
  airtableAccountId?: string | null;
}

export interface AirtableOAuthAttemptStore {
  /** Creates only while the attempt's authorizing connection generation remains current. */
  create(attempt: AirtableOAuthAttempt): Promise<void>;

  /** Invalidates unfinished attempts from an earlier connection authorization generation. */
  supersede(input: {
    organizationId: string;
    connectionId: string;
    authorizationConnectionVersion: number;
    supersededAt: string;
  }): Promise<void>;

  findByStateHash(stateHash: string): Promise<AirtableOAuthAttempt | null>;

  /**
   * Atomically claims a pending attempt, or steals an exchanging attempt whose
   * lease has expired. Recovery is permitted only for the same callback code.
   */
  claimExchange(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    callbackCodeHash: string;
    exchangeOwner: string;
    exchangeToken: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }): Promise<AirtableOAuthAttempt | null>;

  /** Atomically expires a pending or exchanging attempt at the expected version. */
  expire(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    expiredAt: string;
  }): Promise<boolean>;

  /**
   * Atomically consumes the claimed attempt and connects its associated
   * connection. Implementations backed by SQL must update both rows in one
   * transaction so a consumed callback can never point at an unfinalized token.
   */
  finalizeExchange(input: {
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
  } | null>;

  /** Marks only the worker's current exchange claim as failed. */
  failExchange(input: {
    attemptId: string;
    expectedAttemptVersion: number;
    exchangeToken: string;
    failedAt: string;
    errorCode: string;
  }): Promise<boolean>;
}

export interface AirtableOAuthConnectionStore {
  /** Creates or transitions the organization's OAuth connection to authorizing. */
  beginAuthorization(input: {
    proposedConnectionId: string;
    organizationId: string;
    startedAt: string;
  }): Promise<AirtableOAuthConnection>;

  findById(connectionId: string): Promise<AirtableOAuthConnection | null>;

  /**
   * Atomically claims a connected connection, or steals a refresh claim after
   * its lease expires. Every successful claim rotates the lease token.
   */
  claimRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshOwner: string;
    refreshToken: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }): Promise<AirtableOAuthConnection | null>;

  /** Finalizes only the current, unexpired refresh lease. */
  finalizeRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshToken: string;
    finalizedAt: string;
    credentialReference: string;
    grantedScopes: readonly string[];
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string | null;
  }): Promise<AirtableOAuthConnection | null>;

  /** Releases only the current, unexpired lease and records its failure. */
  failRefresh(input: {
    connectionId: string;
    organizationId: string;
    expectedConnectionVersion: number;
    refreshToken: string;
    failedAt: string;
    errorCode: string;
    errorMessage: string;
    reauthorizationRequired: boolean;
  }): Promise<boolean>;
}

export interface AirtableOAuthSecretStore {
  /**
   * Writes an immutable candidate secret and returns its unique reference. The
   * reference is activated only by a successful database finalize operation.
   */
  put(input: {
    connectionId: string;
    source: "authorization" | "refresh";
    claimToken: string;
    credentials: AirtableOAuthCredentials;
  }): Promise<string>;

  get(credentialReference: string): Promise<AirtableOAuthCredentials>;

  /** Removes a candidate that failed to become active. Must be idempotent. */
  discard(credentialReference: string): Promise<void>;
}

export interface AirtableOAuthProvider {
  authorizationUrl(input: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    scopes: readonly string[];
  }): MaybePromise<string>;

  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<AirtableOAuthTokenResponse>;

  refreshAccessToken(input: { refreshToken: string }): Promise<AirtableOAuthTokenResponse>;
}

export interface AirtableOAuthCrypto {
  randomId(prefix: string): string;
  randomUrlSafe(byteLength: number): string;
  sha256Base64Url(value: string): MaybePromise<string>;
  encrypt(value: string): MaybePromise<string>;
  decrypt(ciphertext: string): MaybePromise<string>;
}

export type AirtableOAuthErrorCode =
  | "invalid_request"
  | "invalid_state"
  | "wrong_user"
  | "attempt_expired"
  | "callback_replayed"
  | "callback_in_progress"
  | "attempt_failed"
  | "callback_claim_lost"
  | "connection_unavailable"
  | "exchange_failed"
  | "invalid_token_response"
  | "refresh_in_progress"
  | "refresh_unavailable"
  | "reauthorization_required"
  | "refresh_failed"
  | "refresh_claim_lost";

export class AirtableOAuthError extends Error {
  readonly code: AirtableOAuthErrorCode;
  readonly retryable: boolean;

  constructor(code: AirtableOAuthErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "AirtableOAuthError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class AirtableOAuthProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly reauthorizationRequired: boolean;

  constructor(
    code: string,
    message: string,
    options: {
      retryable?: boolean;
      reauthorizationRequired?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "AirtableOAuthProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.reauthorizationRequired = options.reauthorizationRequired ?? code === "invalid_grant";
  }
}

export interface AirtableOAuthServiceDependencies {
  attempts: AirtableOAuthAttemptStore;
  connections: AirtableOAuthConnectionStore;
  secrets: AirtableOAuthSecretStore;
  provider: AirtableOAuthProvider;
  crypto: AirtableOAuthCrypto;
  redirectUri: string;
  scopes: readonly string[];
  workerId: string;
  now?: () => Date;
  attemptTtlMs?: number;
  exchangeLeaseMs?: number;
  refreshLeaseMs?: number;
}

export interface BeginAirtableAuthorizationResult {
  attemptId: string;
  connectionId: string;
  authorizationUrl: string;
  expiresAt: string;
}

export interface HandleAirtableCallbackResult {
  organizationId: string;
  connectionId: string;
  connectionVersion: number;
  redirectTo: string;
}

export interface RefreshAirtableConnectionResult {
  connectionId: string;
  connectionVersion: number;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string | null;
}

const DEFAULT_ATTEMPT_TTL_MS = 10 * 60 * 1_000;
const DEFAULT_EXCHANGE_LEASE_MS = 30 * 1_000;
const DEFAULT_REFRESH_LEASE_MS = 30 * 1_000;

export class AirtableOAuthService {
  private readonly attempts: AirtableOAuthAttemptStore;
  private readonly connections: AirtableOAuthConnectionStore;
  private readonly secrets: AirtableOAuthSecretStore;
  private readonly provider: AirtableOAuthProvider;
  private readonly crypto: AirtableOAuthCrypto;
  private readonly redirectUri: string;
  private readonly scopes: readonly string[];
  private readonly workerId: string;
  private readonly now: () => Date;
  private readonly attemptTtlMs: number;
  private readonly exchangeLeaseMs: number;
  private readonly refreshLeaseMs: number;

  constructor(dependencies: AirtableOAuthServiceDependencies) {
    this.attempts = dependencies.attempts;
    this.connections = dependencies.connections;
    this.secrets = dependencies.secrets;
    this.provider = dependencies.provider;
    this.crypto = dependencies.crypto;
    this.redirectUri = requireNonEmpty(dependencies.redirectUri, "redirectUri");
    this.scopes = normalizeScopes(dependencies.scopes);
    this.workerId = requireNonEmpty(dependencies.workerId, "workerId");
    this.now = dependencies.now ?? (() => new Date());
    this.attemptTtlMs = positiveDuration(
      dependencies.attemptTtlMs ?? DEFAULT_ATTEMPT_TTL_MS,
      "attemptTtlMs",
    );
    this.exchangeLeaseMs = positiveDuration(
      dependencies.exchangeLeaseMs ?? DEFAULT_EXCHANGE_LEASE_MS,
      "exchangeLeaseMs",
    );
    this.refreshLeaseMs = positiveDuration(
      dependencies.refreshLeaseMs ?? DEFAULT_REFRESH_LEASE_MS,
      "refreshLeaseMs",
    );
  }

  async beginAuthorization(input: {
    organizationId: string;
    initiatingUserId: string;
    returnPath: string;
  }): Promise<BeginAirtableAuthorizationResult> {
    const organizationId = requireNonEmpty(input.organizationId, "organizationId");
    const initiatingUserId = requireNonEmpty(input.initiatingUserId, "initiatingUserId");
    const returnPath = normalizeReturnPath(input.returnPath);
    const startedAt = this.currentTime();
    const attemptId = this.crypto.randomId("airtable_oauth_attempt");
    const proposedConnectionId = this.crypto.randomId("airtable_connection");
    const state = this.crypto.randomUrlSafe(32);
    const codeVerifier = this.crypto.randomUrlSafe(64);

    const [stateHash, codeChallenge, pkceVerifierCiphertext] = await Promise.all([
      this.crypto.sha256Base64Url(state),
      this.crypto.sha256Base64Url(codeVerifier),
      this.crypto.encrypt(codeVerifier),
    ]);

    const expiresAt = addMilliseconds(startedAt, this.attemptTtlMs);
    const authorizationUrl = await this.provider.authorizationUrl({
      redirectUri: this.redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod: "S256",
      scopes: this.scopes,
    });

    const connection = await this.connections.beginAuthorization({
      proposedConnectionId,
      organizationId,
      startedAt,
    });

    if (
      connection.organizationId !== organizationId ||
      connection.authMode !== "oauth" ||
      connection.status !== "authorizing"
    ) {
      throw new AirtableOAuthError(
        "connection_unavailable",
        "The Airtable connection could not enter authorization state.",
      );
    }

    await this.attempts.supersede({
      organizationId,
      connectionId: connection.id,
      authorizationConnectionVersion: connection.connectionVersion,
      supersededAt: startedAt,
    });

    try {
      await this.attempts.create({
        id: attemptId,
        organizationId,
        initiatingUserId,
        connectionId: connection.id,
        stateHash,
        pkceVerifierCiphertext,
        returnPath,
        callbackCodeHash: null,
        status: "pending",
        exchangeOwner: null,
        exchangeToken: null,
        exchangeLeaseExpiresAt: null,
        attemptVersion: 1,
        authorizationConnectionVersion: connection.connectionVersion,
        expiresAt,
        consumedAt: null,
        resultRedirect: null,
        errorCode: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      });
    } catch {
      throw new AirtableOAuthError(
        "connection_unavailable",
        "The Airtable connection changed while authorization was starting.",
        true,
      );
    }

    return {
      attemptId,
      connectionId: connection.id,
      authorizationUrl,
      expiresAt,
    };
  }

  async handleCallback(input: {
    organizationId: string;
    userId: string;
    state: string;
    code: string;
  }): Promise<HandleAirtableCallbackResult> {
    const organizationId = requireNonEmpty(input.organizationId, "organizationId");
    const userId = requireNonEmpty(input.userId, "userId");
    const state = requireNonEmpty(input.state, "state");
    const code = requireNonEmpty(input.code, "code");
    const claimedAt = this.currentTime();
    const [stateHash, callbackCodeHash] = await Promise.all([
      this.crypto.sha256Base64Url(state),
      this.crypto.sha256Base64Url(code),
    ]);

    let attempt = await this.attempts.findByStateHash(stateHash);
    if (attempt === null) {
      throw new AirtableOAuthError("invalid_state", "The OAuth state is invalid.");
    }

    await this.assertCallbackEligible(attempt, organizationId, userId, callbackCodeHash, claimedAt);

    const exchangeToken = this.crypto.randomUrlSafe(32);
    const claimed = await this.attempts.claimExchange({
      attemptId: attempt.id,
      expectedAttemptVersion: attempt.attemptVersion,
      callbackCodeHash,
      exchangeOwner: this.workerId,
      exchangeToken,
      claimedAt,
      leaseExpiresAt: addMilliseconds(claimedAt, this.exchangeLeaseMs),
    });

    if (claimed === null) {
      attempt = await this.attempts.findByStateHash(stateHash);
      if (attempt !== null) {
        await this.assertCallbackEligible(
          attempt,
          organizationId,
          userId,
          callbackCodeHash,
          this.currentTime(),
        );
      }

      throw new AirtableOAuthError(
        "callback_claim_lost",
        "The OAuth callback was claimed by another worker.",
        true,
      );
    }

    return this.exchangeAndFinalize(claimed, exchangeToken, code);
  }

  async refreshConnection(input: {
    organizationId: string;
    connectionId: string;
  }): Promise<RefreshAirtableConnectionResult> {
    const organizationId = requireNonEmpty(input.organizationId, "organizationId");
    const connectionId = requireNonEmpty(input.connectionId, "connectionId");
    const claimedAt = this.currentTime();
    let connection = await this.connections.findById(connectionId);

    if (connection === null) {
      throw new AirtableOAuthError(
        "refresh_unavailable",
        "The Airtable connection does not exist.",
      );
    }

    this.assertRefreshEligible(connection, organizationId, claimedAt);

    const refreshLeaseToken = this.crypto.randomUrlSafe(32);
    const claimed = await this.connections.claimRefresh({
      connectionId,
      organizationId,
      expectedConnectionVersion: connection.connectionVersion,
      refreshOwner: this.workerId,
      refreshToken: refreshLeaseToken,
      claimedAt,
      leaseExpiresAt: addMilliseconds(claimedAt, this.refreshLeaseMs),
    });

    if (claimed === null) {
      connection = await this.connections.findById(connectionId);
      if (connection !== null) {
        this.assertRefreshEligible(connection, organizationId, this.currentTime());
      }

      throw new AirtableOAuthError(
        "refresh_claim_lost",
        "The token refresh was claimed by another worker.",
        true,
      );
    }

    return this.refreshAndFinalize(claimed, refreshLeaseToken);
  }

  private async exchangeAndFinalize(
    attempt: AirtableOAuthAttempt,
    exchangeToken: string,
    code: string,
  ): Promise<HandleAirtableCallbackResult> {
    let candidateReference: string | null = null;

    try {
      const codeVerifier = await this.crypto.decrypt(attempt.pkceVerifierCiphertext);
      const tokenResponse = await this.provider.exchangeAuthorizationCode({
        code,
        codeVerifier,
        redirectUri: this.redirectUri,
      });
      const tokens = validateAuthorizationTokenResponse(tokenResponse, this.scopes);
      const finalizedAt = this.currentTime();

      candidateReference = await this.secrets.put({
        connectionId: attempt.connectionId,
        source: "authorization",
        claimToken: exchangeToken,
        credentials: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });

      const finalized = await this.attempts.finalizeExchange({
        attemptId: attempt.id,
        expectedAttemptVersion: attempt.attemptVersion,
        exchangeToken,
        finalizedAt,
        resultRedirect: attempt.returnPath,
        connection: {
          id: attempt.connectionId,
          organizationId: attempt.organizationId,
          credentialReference: candidateReference,
          airtableUserId: tokenResponse.airtableUserId ?? null,
          airtableAccountId: tokenResponse.airtableAccountId ?? null,
          grantedScopes: tokens.grantedScopes,
          accessTokenExpiresAt: addSeconds(finalizedAt, tokens.accessTokenExpiresInSeconds),
          refreshTokenExpiresAt:
            tokens.refreshTokenExpiresInSeconds === null
              ? null
              : addSeconds(finalizedAt, tokens.refreshTokenExpiresInSeconds),
        },
      });

      if (finalized === null) {
        await this.secrets.discard(candidateReference);
        candidateReference = null;
        throw new AirtableOAuthError(
          "callback_claim_lost",
          "The OAuth exchange lease expired before it could be finalized.",
          true,
        );
      }

      return {
        organizationId: finalized.connection.organizationId,
        connectionId: finalized.connection.id,
        connectionVersion: finalized.connection.connectionVersion,
        redirectTo: finalized.attempt.resultRedirect ?? attempt.returnPath,
      };
    } catch (error) {
      if (candidateReference !== null) {
        await this.secrets.discard(candidateReference);
      }

      if (error instanceof AirtableOAuthError && error.code === "callback_claim_lost") {
        throw error;
      }

      const failedAt = this.currentTime();
      const failureCode =
        error instanceof AirtableOAuthProviderError
          ? error.code
          : error instanceof AirtableOAuthError
            ? error.code
            : "exchange_failed";
      const markedFailed = await this.attempts.failExchange({
        attemptId: attempt.id,
        expectedAttemptVersion: attempt.attemptVersion,
        exchangeToken,
        failedAt,
        errorCode: failureCode,
      });

      if (!markedFailed) {
        throw new AirtableOAuthError(
          "callback_claim_lost",
          "The OAuth exchange claim changed while handling a failure.",
          true,
        );
      }

      if (error instanceof AirtableOAuthError) {
        throw error;
      }

      throw new AirtableOAuthError(
        "exchange_failed",
        "Airtable rejected the authorization code exchange.",
      );
    }
  }

  private async refreshAndFinalize(
    connection: AirtableOAuthConnection,
    refreshLeaseToken: string,
  ): Promise<RefreshAirtableConnectionResult> {
    let candidateReference: string | null = null;

    try {
      if (connection.credentialReference === null) {
        throw new AirtableOAuthError(
          "refresh_unavailable",
          "The Airtable connection has no OAuth credential.",
        );
      }

      const currentCredentials = await this.secrets.get(connection.credentialReference);
      const tokenResponse = await this.provider.refreshAccessToken({
        refreshToken: currentCredentials.refreshToken,
      });
      const tokens = validateRefreshTokenResponse(
        tokenResponse,
        currentCredentials.refreshToken,
        connection.grantedScopes,
        connection.refreshTokenExpiresAt,
      );
      const finalizedAt = this.currentTime();

      candidateReference = await this.secrets.put({
        connectionId: connection.id,
        source: "refresh",
        claimToken: refreshLeaseToken,
        credentials: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });

      const finalized = await this.connections.finalizeRefresh({
        connectionId: connection.id,
        organizationId: connection.organizationId,
        expectedConnectionVersion: connection.connectionVersion,
        refreshToken: refreshLeaseToken,
        finalizedAt,
        credentialReference: candidateReference,
        grantedScopes: tokens.grantedScopes,
        accessTokenExpiresAt: addSeconds(finalizedAt, tokens.accessTokenExpiresInSeconds),
        refreshTokenExpiresAt:
          tokens.refreshTokenExpiresInSeconds === undefined
            ? connection.refreshTokenExpiresAt
            : tokens.refreshTokenExpiresInSeconds === null
              ? null
              : addSeconds(finalizedAt, tokens.refreshTokenExpiresInSeconds),
      });

      if (finalized === null) {
        await this.secrets.discard(candidateReference);
        candidateReference = null;
        throw new AirtableOAuthError(
          "refresh_claim_lost",
          "The refresh lease expired before it could be finalized.",
          true,
        );
      }

      const accessTokenExpiresAt = finalized.accessTokenExpiresAt;
      if (accessTokenExpiresAt === null) {
        throw new AirtableOAuthError(
          "refresh_claim_lost",
          "The finalized connection is missing an access token expiry.",
          true,
        );
      }

      return {
        connectionId: finalized.id,
        connectionVersion: finalized.connectionVersion,
        accessTokenExpiresAt,
        refreshTokenExpiresAt: finalized.refreshTokenExpiresAt,
      };
    } catch (error) {
      if (candidateReference !== null) {
        await this.secrets.discard(candidateReference);
      }

      if (error instanceof AirtableOAuthError && error.code === "refresh_claim_lost") {
        throw error;
      }

      const failedAt = this.currentTime();
      const providerError = error instanceof AirtableOAuthProviderError ? error : null;
      const reauthorizationRequired = providerError?.reauthorizationRequired ?? false;
      const errorCode = providerError?.code ?? "refresh_failed";
      const errorMessage = error instanceof Error ? error.message : "Unknown refresh failure";
      const released = await this.connections.failRefresh({
        connectionId: connection.id,
        organizationId: connection.organizationId,
        expectedConnectionVersion: connection.connectionVersion,
        refreshToken: refreshLeaseToken,
        failedAt,
        errorCode,
        errorMessage,
        reauthorizationRequired,
      });

      if (!released) {
        throw new AirtableOAuthError(
          "refresh_claim_lost",
          "The refresh claim changed while handling a failure.",
          true,
        );
      }

      if (reauthorizationRequired) {
        throw new AirtableOAuthError(
          "reauthorization_required",
          "Airtable requires this connection to be authorized again.",
        );
      }

      if (error instanceof AirtableOAuthError) {
        throw error;
      }

      throw new AirtableOAuthError(
        "refresh_failed",
        "The Airtable access token could not be refreshed.",
        providerError?.retryable ?? true,
      );
    }
  }

  private async assertCallbackEligible(
    attempt: AirtableOAuthAttempt,
    organizationId: string,
    userId: string,
    callbackCodeHash: string,
    observedAt: string,
  ): Promise<void> {
    if (attempt.organizationId !== organizationId) {
      throw new AirtableOAuthError(
        "invalid_state",
        "The OAuth state is invalid for this organization.",
      );
    }

    if (attempt.initiatingUserId !== userId) {
      throw new AirtableOAuthError(
        "wrong_user",
        "The OAuth callback must be completed by the initiating user.",
      );
    }

    if (attempt.status === "expired" || isAtOrBefore(attempt.expiresAt, observedAt)) {
      if (attempt.status === "pending" || attempt.status === "exchanging") {
        await this.attempts.expire({
          attemptId: attempt.id,
          expectedAttemptVersion: attempt.attemptVersion,
          expiredAt: observedAt,
        });
      }

      throw new AirtableOAuthError(
        "attempt_expired",
        "The OAuth authorization attempt has expired.",
      );
    }

    if (attempt.status === "consumed") {
      throw new AirtableOAuthError(
        "callback_replayed",
        "The OAuth callback has already been consumed.",
      );
    }

    if (attempt.status === "failed") {
      throw new AirtableOAuthError(
        "attempt_failed",
        "The OAuth authorization attempt has already failed.",
      );
    }

    if (attempt.status === "exchanging") {
      if (attempt.callbackCodeHash === null || attempt.callbackCodeHash !== callbackCodeHash) {
        throw new AirtableOAuthError(
          "callback_replayed",
          "The OAuth state was reused with a different authorization code.",
        );
      }

      if (
        attempt.exchangeLeaseExpiresAt !== null &&
        !isAtOrBefore(attempt.exchangeLeaseExpiresAt, observedAt)
      ) {
        throw new AirtableOAuthError(
          "callback_in_progress",
          "The OAuth callback is already being exchanged.",
          true,
        );
      }
    }
  }

  private assertRefreshEligible(
    connection: AirtableOAuthConnection,
    organizationId: string,
    observedAt: string,
  ): void {
    if (connection.organizationId !== organizationId || connection.authMode !== "oauth") {
      throw new AirtableOAuthError(
        "refresh_unavailable",
        "The Airtable connection is not available for OAuth refresh.",
      );
    }

    if (connection.status === "reauthorization_required") {
      throw new AirtableOAuthError(
        "reauthorization_required",
        "Airtable requires this connection to be authorized again.",
      );
    }

    if (connection.status === "refreshing") {
      if (
        connection.refreshLeaseExpiresAt !== null &&
        !isAtOrBefore(connection.refreshLeaseExpiresAt, observedAt)
      ) {
        throw new AirtableOAuthError(
          "refresh_in_progress",
          "The Airtable connection is already being refreshed.",
          true,
        );
      }
      return;
    }

    if (connection.status !== "connected") {
      throw new AirtableOAuthError(
        "refresh_unavailable",
        `The Airtable connection cannot refresh from ${connection.status} state.`,
      );
    }
  }

  private currentTime(): string {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new AirtableOAuthError("invalid_request", "The OAuth clock returned an invalid date.");
    }
    return now.toISOString();
  }
}

function validateAuthorizationTokenResponse(
  response: AirtableOAuthTokenResponse,
  configuredScopes: readonly string[],
): {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number | null;
  grantedScopes: readonly string[];
} {
  const accessToken = validateToken(response.accessToken, "access token");
  const refreshToken = validateToken(response.refreshToken, "refresh token");
  const accessTokenExpiresInSeconds = positiveSeconds(
    response.accessTokenExpiresInSeconds,
    "access token lifetime",
  );
  const refreshTokenExpiresInSeconds =
    response.refreshTokenExpiresInSeconds === undefined ||
    response.refreshTokenExpiresInSeconds === null
      ? null
      : positiveSeconds(response.refreshTokenExpiresInSeconds, "refresh token lifetime");

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresInSeconds,
    refreshTokenExpiresInSeconds,
    grantedScopes:
      response.grantedScopes === undefined
        ? configuredScopes
        : normalizeScopes(response.grantedScopes),
  };
}

function validateRefreshTokenResponse(
  response: AirtableOAuthTokenResponse,
  currentRefreshToken: string,
  currentScopes: readonly string[],
  currentRefreshTokenExpiresAt: string | null,
): {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number | null | undefined;
  grantedScopes: readonly string[];
} {
  const accessToken = validateToken(response.accessToken, "access token");
  const accessTokenExpiresInSeconds = positiveSeconds(
    response.accessTokenExpiresInSeconds,
    "access token lifetime",
  );
  const refreshTokenRotated = response.refreshToken !== undefined && response.refreshToken !== null;
  const refreshToken = refreshTokenRotated
    ? validateToken(response.refreshToken, "refresh token")
    : currentRefreshToken;

  let refreshTokenExpiresInSeconds: number | null | undefined;
  if (response.refreshTokenExpiresInSeconds !== undefined) {
    refreshTokenExpiresInSeconds =
      response.refreshTokenExpiresInSeconds === null
        ? null
        : positiveSeconds(response.refreshTokenExpiresInSeconds, "refresh token lifetime");
  } else if (refreshTokenRotated && currentRefreshTokenExpiresAt !== null) {
    // A rotated token must not inherit the previous token's absolute expiry.
    refreshTokenExpiresInSeconds = null;
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresInSeconds,
    refreshTokenExpiresInSeconds,
    grantedScopes:
      response.grantedScopes === undefined
        ? currentScopes
        : normalizeScopes(response.grantedScopes),
  };
}

function validateToken(value: string | null | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AirtableOAuthError(
      "invalid_token_response",
      `Airtable returned an invalid ${label}.`,
    );
  }
  return value;
}

function normalizeScopes(scopes: readonly string[]): readonly string[] {
  const normalized = [...new Set(scopes.map((scope) => scope.trim()))].filter(
    (scope) => scope.length > 0,
  );
  if (normalized.length === 0) {
    throw new AirtableOAuthError(
      "invalid_request",
      "At least one Airtable OAuth scope is required.",
    );
  }
  return normalized;
}

function normalizeReturnPath(returnPath: string): string {
  if (!returnPath.startsWith("/") || returnPath.startsWith("//") || returnPath.includes("\\")) {
    throw new AirtableOAuthError(
      "invalid_request",
      "The OAuth return path must be an application-relative path.",
    );
  }
  return returnPath;
}

function requireNonEmpty(value: string, label: string): string {
  if (value.length === 0) {
    throw new AirtableOAuthError("invalid_request", `${label} must not be empty.`);
  }
  return value;
}

function positiveDuration(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AirtableOAuthError("invalid_request", `${label} must be a positive integer.`);
  }
  return value;
}

function positiveSeconds(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new AirtableOAuthError(
      "invalid_token_response",
      `Airtable returned an invalid ${label}.`,
    );
  }
  return value;
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  const result = new Date(Date.parse(timestamp) + milliseconds);
  if (!Number.isFinite(result.getTime())) {
    throw new AirtableOAuthError(
      "invalid_request",
      "An OAuth lease or expiry timestamp overflowed.",
    );
  }
  return result.toISOString();
}

function addSeconds(timestamp: string, seconds: number): string {
  return addMilliseconds(timestamp, seconds * 1_000);
}

function isAtOrBefore(timestamp: string, observedAt: string): boolean {
  return Date.parse(timestamp) <= Date.parse(observedAt);
}
