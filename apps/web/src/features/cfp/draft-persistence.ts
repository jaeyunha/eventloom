import type { CfpDraft, CfpParticipant, CfpSecondaryContact } from "./types";

export interface CfpDraftPersistence {
  load(eventSlug: string): Promise<CfpDraft | null>;
  save(draft: CfpDraft): Promise<void>;
  clear(eventSlug: string): Promise<void>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = "open-sessionboard:cfp-draft:v1";

export function getCfpDraftStorageKey(eventSlug: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(eventSlug)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isParticipant(value: unknown): value is CfpParticipant {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    (value.role === "Speaker" || value.role === "Co-speaker" || value.role === "Moderator") &&
    typeof value.firstName === "string" &&
    typeof value.lastName === "string" &&
    typeof value.email === "string" &&
    typeof value.mobilePhone === "string" &&
    typeof value.biography === "string"
  );
}

function isSecondaryContact(value: unknown): value is CfpSecondaryContact {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.firstName === "string" &&
    typeof value.lastName === "string" &&
    typeof value.email === "string"
  );
}

export function isCfpDraft(value: unknown, eventSlug?: string): value is CfpDraft {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.eventSlug !== "string") return false;
  if (eventSlug !== undefined && value.eventSlug !== eventSlug) return false;
  if (!isRecord(value.account) || !isRecord(value.submission)) return false;
  if (!Array.isArray(value.participants) || !value.participants.every(isParticipant)) return false;
  if (!Array.isArray(value.secondaryContacts) || !value.secondaryContacts.every(isSecondaryContact)) return false;

  const receiptIsValid =
    value.receipt === null ||
    (isRecord(value.receipt) &&
      typeof value.receipt.id === "string" &&
      typeof value.receipt.submittedAt === "string");

  return (
    typeof value.account.email === "string" &&
    typeof value.account.firstName === "string" &&
    typeof value.account.lastName === "string" &&
    typeof value.account.acceptedTerms === "boolean" &&
    typeof value.submission.title === "string" &&
    typeof value.submission.description === "string" &&
    typeof value.submission.format === "string" &&
    isStringArray(value.submission.tags) &&
    typeof value.submission.track === "string" &&
    typeof value.submission.level === "string" &&
    typeof value.submission.language === "string" &&
    typeof value.updatedAt === "string" &&
    receiptIsValid
  );
}

export class BrowserCfpDraftPersistence implements CfpDraftPersistence {
  readonly #storage: StorageLike;

  constructor(storage: StorageLike) {
    this.#storage = storage;
  }

  async load(eventSlug: string): Promise<CfpDraft | null> {
    const serialized = this.#storage.getItem(getCfpDraftStorageKey(eventSlug));
    if (!serialized) return null;

    try {
      const candidate: unknown = JSON.parse(serialized);
      return isCfpDraft(candidate, eventSlug) ? candidate : null;
    } catch {
      return null;
    }
  }

  async save(draft: CfpDraft): Promise<void> {
    this.#storage.setItem(getCfpDraftStorageKey(draft.eventSlug), JSON.stringify(draft));
  }

  async clear(eventSlug: string): Promise<void> {
    this.#storage.removeItem(getCfpDraftStorageKey(eventSlug));
  }
}

export class MemoryCfpDraftPersistence implements CfpDraftPersistence {
  readonly #drafts = new Map<string, CfpDraft>();

  async load(eventSlug: string): Promise<CfpDraft | null> {
    const draft = this.#drafts.get(eventSlug);
    return draft ? structuredClone(draft) : null;
  }

  async save(draft: CfpDraft): Promise<void> {
    this.#drafts.set(draft.eventSlug, structuredClone(draft));
  }

  async clear(eventSlug: string): Promise<void> {
    this.#drafts.delete(eventSlug);
  }
}
