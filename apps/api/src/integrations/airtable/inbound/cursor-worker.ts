export interface AirtableWebhookFieldChange {
  baseTransactionNumber: number;
  tableId: string;
  recordId: string;
  fieldId: string;
  entityType: string | null;
  applicationId: string | null;
  sourceValueJson: string;
  sourceHash: string;
}

export interface AirtableWebhookCursorClaim {
  registrationId: string;
  organizationId: string;
  connectionId: string;
  providerWebhookId: string;
  baseId?: string;
  credentialReference?: string;
  authMode?: "oauth" | "pat";
  nextCursor: string;
  rowVersion: number;
  claimToken: string;
}

export interface ClaimAirtableWebhookCursorInput {
  claimOwner: string;
  claimToken: string;
  claimedAt: string;
  leaseExpiresAt: string;
}

export interface AdvanceAirtableWebhookCursorInput {
  registrationId: string;
  claimToken: string;
  expectedRowVersion: number;
  expectedCursor: string;
  nextCursor: string;
  fetchedAt: string;
  leaseExpiresAt: string | null;
  releaseClaim: boolean;
  changes: readonly AirtableWebhookFieldChange[];
}

export type AdvanceAirtableWebhookCursorResult =
  | {
      kind: "advanced";
      claim: AirtableWebhookCursorClaim | null;
    }
  | {
      kind: "lease_lost";
    };

export interface MarkAirtableCursorRetentionGapInput {
  registrationId: string;
  claimToken: string;
  expectedRowVersion: number;
  expectedCursor: string;
  recoveryCursor: string | null;
  detectedAt: string;
}

export interface ReleaseAirtableWebhookCursorInput {
  registrationId: string;
  claimToken: string;
  expectedRowVersion: number;
}

export interface AirtableWebhookCursorStore {
  claimNext(input: ClaimAirtableWebhookCursorInput): Promise<AirtableWebhookCursorClaim | null>;

  /** Inserts the page and advances the cursor in the same row-version CAS transaction. */
  advancePage(
    input: AdvanceAirtableWebhookCursorInput,
  ): Promise<AdvanceAirtableWebhookCursorResult>;

  /** Marks the cursor for a full reconciliation and releases its claim by token CAS. */
  markRetentionGap(input: MarkAirtableCursorRetentionGapInput): Promise<boolean>;

  releaseClaim(input: ReleaseAirtableWebhookCursorInput): Promise<boolean>;
}

export type AirtableWebhookPayloadPage =
  | {
      kind: "page";
      nextCursor: string;
      mightHaveMore: boolean;
      changes: readonly AirtableWebhookFieldChange[];
    }
  | {
      kind: "retention_gap";
      recoveryCursor: string | null;
    };

export interface AirtableWebhookPayloadProvider {
  fetchPage(input: {
    organizationId?: string;
    connectionId?: string;
    baseId?: string;
    credentialReference?: string;
    authMode?: "oauth" | "pat";
    providerWebhookId: string;
    cursor: string;
  }): Promise<AirtableWebhookPayloadPage>;
}

export interface AirtableReconciliationCommand {
  request(input: {
    commandId: string;
    organizationId: string;
    connectionId: string;
    registrationId: string;
    reason: "webhook_retention_gap";
    observedCursor: string;
  }): Promise<void>;
}

export interface AirtableCursorWorkerDependencies {
  cursors: AirtableWebhookCursorStore;
  provider: AirtableWebhookPayloadProvider;
  reconciliation: AirtableReconciliationCommand;
  createClaimToken: () => string;
  now: () => Date;
}

export interface RunAirtableCursorWorkerOptions {
  workerId: string;
  leaseDurationMs: number;
  maxPages?: number;
}

export type AirtableCursorWorkerResult =
  | {
      kind: "idle";
    }
  | {
      kind: "processed";
      registrationId: string;
      pages: number;
      changes: number;
    }
  | {
      kind: "reconciliation_required";
      registrationId: string;
    }
  | {
      kind: "lease_lost";
      registrationId: string;
      pages: number;
      changes: number;
    };

const DEFAULT_MAX_PAGES = 100;

export async function runAirtableCursorWorkerOnce(
  dependencies: AirtableCursorWorkerDependencies,
  options: RunAirtableCursorWorkerOptions,
): Promise<AirtableCursorWorkerResult> {
  assertPositiveInteger(options.leaseDurationMs, "leaseDurationMs");

  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  assertPositiveInteger(maxPages, "maxPages");

  const claimToken = dependencies.createClaimToken();
  if (claimToken.length === 0) {
    throw new Error("createClaimToken must return a non-empty token");
  }

  const claimedAt = dependencies.now();
  const claim = await dependencies.cursors.claimNext({
    claimOwner: options.workerId,
    claimToken,
    claimedAt: claimedAt.toISOString(),
    leaseExpiresAt: addMilliseconds(claimedAt, options.leaseDurationMs),
  });

  if (claim === null) {
    return { kind: "idle" };
  }

  let activeClaim: AirtableWebhookCursorClaim | null = claim;
  let pages = 0;
  let changes = 0;

  try {
    while (pages < maxPages) {
      const pageClaim = activeClaim;
      const page = await dependencies.provider.fetchPage({
        organizationId: pageClaim.organizationId,
        connectionId: pageClaim.connectionId,
        ...(pageClaim.baseId === undefined ? {} : { baseId: pageClaim.baseId }),
        ...(pageClaim.credentialReference === undefined
          ? {}
          : { credentialReference: pageClaim.credentialReference }),
        ...(pageClaim.authMode === undefined ? {} : { authMode: pageClaim.authMode }),
        providerWebhookId: pageClaim.providerWebhookId,
        cursor: pageClaim.nextCursor,
      });
      const fetchedAt = dependencies.now();

      if (page.kind === "retention_gap") {
        await dependencies.reconciliation.request({
          commandId: createRetentionGapCommandId(pageClaim),
          organizationId: pageClaim.organizationId,
          connectionId: pageClaim.connectionId,
          registrationId: pageClaim.registrationId,
          reason: "webhook_retention_gap",
          observedCursor: pageClaim.nextCursor,
        });

        const marked = await dependencies.cursors.markRetentionGap({
          registrationId: pageClaim.registrationId,
          claimToken: pageClaim.claimToken,
          expectedRowVersion: pageClaim.rowVersion,
          expectedCursor: pageClaim.nextCursor,
          recoveryCursor: page.recoveryCursor,
          detectedAt: fetchedAt.toISOString(),
        });
        activeClaim = null;

        if (!marked) {
          return {
            kind: "lease_lost",
            registrationId: claim.registrationId,
            pages,
            changes,
          };
        }

        return {
          kind: "reconciliation_required",
          registrationId: claim.registrationId,
        };
      }

      if (page.mightHaveMore && page.nextCursor === pageClaim.nextCursor) {
        throw new Error("Airtable returned more pages without advancing its cursor");
      }

      pages += 1;
      changes += page.changes.length;

      const releaseClaim = !page.mightHaveMore || pages === maxPages;
      const leaseBase = dependencies.now();
      const advanced = await dependencies.cursors.advancePage({
        registrationId: pageClaim.registrationId,
        claimToken: pageClaim.claimToken,
        expectedRowVersion: pageClaim.rowVersion,
        expectedCursor: pageClaim.nextCursor,
        nextCursor: page.nextCursor,
        fetchedAt: fetchedAt.toISOString(),
        leaseExpiresAt: releaseClaim ? null : addMilliseconds(leaseBase, options.leaseDurationMs),
        releaseClaim,
        changes: page.changes,
      });

      if (advanced.kind === "lease_lost") {
        activeClaim = null;
        return {
          kind: "lease_lost",
          registrationId: claim.registrationId,
          pages,
          changes,
        };
      }

      if (advanced.claim === null) {
        activeClaim = null;
        return {
          kind: "processed",
          registrationId: claim.registrationId,
          pages,
          changes,
        };
      }

      activeClaim = advanced.claim;
    }

    throw new Error("Airtable cursor worker exhausted its page limit unexpectedly");
  } catch (error) {
    if (activeClaim !== null) {
      await dependencies.cursors.releaseClaim({
        registrationId: activeClaim.registrationId,
        claimToken: activeClaim.claimToken,
        expectedRowVersion: activeClaim.rowVersion,
      });
    }
    throw error;
  }
}

function createRetentionGapCommandId(claim: AirtableWebhookCursorClaim): string {
  return ["airtable-reconcile", claim.connectionId, claim.registrationId, claim.rowVersion].join(
    ":",
  );
}

function addMilliseconds(date: Date, milliseconds: number): string {
  return new Date(date.getTime() + milliseconds).toISOString();
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}
