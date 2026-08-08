export const CFP_STEPS = ["welcome", "account", "submission", "participants", "review"] as const;

export type CfpStep = (typeof CFP_STEPS)[number];

export interface CfpAccount {
  email: string;
  firstName: string;
  lastName: string;
  acceptedTerms: boolean;
}

export interface CfpSubmission {
  title: string;
  description: string;
  format: string;
  tags: string[];
  track: string;
  level: string;
  language: string;
}

export interface CfpParticipant {
  id: string;
  role: "Speaker" | "Co-speaker" | "Moderator";
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  biography: string;
}

export interface CfpSecondaryContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface CfpSubmissionReceipt {
  id: string;
  submittedAt: string;
}

export interface CfpDraft {
  schemaVersion: 1;
  eventSlug: string;
  account: CfpAccount;
  submission: CfpSubmission;
  participants: CfpParticipant[];
  secondaryContacts: CfpSecondaryContact[];
  updatedAt: string;
  receipt: CfpSubmissionReceipt | null;
}

export function createEmptyParticipant(
  id: string,
  role: CfpParticipant["role"] = "Speaker",
): CfpParticipant {
  return {
    id,
    role,
    firstName: "",
    lastName: "",
    email: "",
    mobilePhone: "",
    biography: "",
  };
}

export function createEmptyDraft(eventSlug: string, now = new Date().toISOString()): CfpDraft {
  return {
    schemaVersion: 1,
    eventSlug,
    account: {
      email: "",
      firstName: "",
      lastName: "",
      acceptedTerms: false,
    },
    submission: {
      title: "",
      description: "",
      format: "",
      tags: [],
      track: "",
      level: "",
      language: "English",
    },
    participants: [createEmptyParticipant("primary")],
    secondaryContacts: [],
    updatedAt: now,
    receipt: null,
  };
}

export function syncPrimaryParticipant(draft: CfpDraft, now = new Date().toISOString()): CfpDraft {
  const primary = draft.participants[0] ?? createEmptyParticipant("primary");
  const syncedPrimary: CfpParticipant = {
    ...primary,
    firstName: primary.firstName || draft.account.firstName,
    lastName: primary.lastName || draft.account.lastName,
    email: primary.email || draft.account.email,
  };

  return {
    ...draft,
    participants: [syncedPrimary, ...draft.participants.slice(1)],
    updatedAt: now,
  };
}

export function markDraftSubmitted(
  draft: CfpDraft,
  receiptId: string,
  now = new Date().toISOString(),
): CfpDraft {
  if (draft.receipt) return draft;

  return {
    ...draft,
    updatedAt: now,
    receipt: {
      id: receiptId,
      submittedAt: now,
    },
  };
}
