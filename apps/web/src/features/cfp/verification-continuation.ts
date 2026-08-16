import type { CfpDraft } from "./types";

const CFP_VERIFICATION_CONTINUATION_PREFIX = "eventloom:cfp-verification:v1";
const CFP_VERIFICATION_CONTINUATION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const CFP_VERIFICATION_RETURN_PARAMETER = "cfpVerification";
const CFP_VERIFICATION_RETURN_VALUE = "complete";

export interface CfpVerificationIdentity {
  readonly organizationId: string;
  readonly eventId: string;
  readonly formId: string;
}

export interface CfpVerificationContinuation {
  readonly account: CfpDraft["account"];
  readonly requestedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storageKey(identity: CfpVerificationIdentity): string {
  return `${CFP_VERIFICATION_CONTINUATION_PREFIX}:${encodeURIComponent(
    identity.organizationId,
  )}:${encodeURIComponent(identity.eventId)}:${encodeURIComponent(identity.formId)}`;
}

export function createCfpVerificationCallbackUrl(currentUrl: string): string {
  const callback = new URL(currentUrl);
  callback.searchParams.set(CFP_VERIFICATION_RETURN_PARAMETER, CFP_VERIFICATION_RETURN_VALUE);
  return callback.toString();
}

export function writeCfpVerificationContinuation(
  identity: CfpVerificationIdentity,
  account: CfpDraft["account"],
  storage: Pick<Storage, "setItem">,
): void {
  const continuation: CfpVerificationContinuation = {
    account: { ...account },
    requestedAt: new Date().toISOString(),
  };
  storage.setItem(storageKey(identity), JSON.stringify(continuation));
}

export function readCfpVerificationContinuation(
  identity: CfpVerificationIdentity,
  storage: Pick<Storage, "getItem" | "removeItem">,
): CfpVerificationContinuation | null {
  const key = storageKey(identity);
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.account) || typeof parsed.requestedAt !== "string") {
      storage.removeItem(key);
      return null;
    }
    const requestedAt = Date.parse(parsed.requestedAt);
    const account = parsed.account;
    if (
      !Number.isFinite(requestedAt) ||
      Date.now() - requestedAt > CFP_VERIFICATION_CONTINUATION_MAX_AGE_MS ||
      typeof account.email !== "string" ||
      typeof account.firstName !== "string" ||
      typeof account.lastName !== "string" ||
      typeof account.acceptedTerms !== "boolean"
    ) {
      storage.removeItem(key);
      return null;
    }
    return {
      account: {
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
        acceptedTerms: account.acceptedTerms,
      },
      requestedAt: parsed.requestedAt,
    };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    storage.removeItem(key);
    return null;
  }
}

export function clearCfpVerificationContinuation(
  identity: CfpVerificationIdentity,
  storage: Pick<Storage, "removeItem">,
): void {
  storage.removeItem(storageKey(identity));
}
