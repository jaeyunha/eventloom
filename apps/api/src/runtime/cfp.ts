import type {
  AuditEntry,
  CfpForm,
  EventCfp,
  Submission,
  SubmissionVersion,
} from "../features/cfp/model";
import {
  CfpError,
  type CfpIdempotencyCoordinator,
  type CfpRepository,
  CfpService,
} from "../features/cfp/service";
import { LOCAL_ORGANIZATION_ID } from "./constants";

const LOCAL_CFP_NOW = "2026-08-08T12:00:00.000Z";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function key(tenantId: string, id: string): string {
  return `${tenantId}\u0000${id}`;
}

function seededEvent(tenantId: string, eventId: string, name: string): EventCfp {
  return {
    id: eventId,
    tenantId,
    version: 1,
    slug: eventId,
    name,
    timezone: "America/Los_Angeles",
    opensAt: "2026-08-01T07:00:00.000Z",
    closesAt: "2026-09-15T07:00:00.000Z",
  };
}

function seededForm(tenantId: string, eventId: string, formId = "main-cfp"): CfpForm {
  return {
    id: formId,
    tenantId,
    eventId,
    name: "Main call for speakers",
    version: 1,
    status: "published",
    welcomeContent: "Share the session you want to bring to our community.",
    settings: {
      speakerLimit: 3,
      maxSubmissionsPerAccount: 3,
      remindersEnabled: true,
      adminNotificationsEnabled: true,
      confirmationMessage: "Your proposal has been received.",
      successContent: "Thank you for contributing to the program.",
      redirectUrl: "http://localhost:3015/portal",
    },
    sections: [
      { id: "session", title: "Session", description: "Tell us about the proposed session." },
      { id: "people", title: "Speakers", description: "Add the people presenting the session." },
    ],
    submissionFields: [
      {
        id: "field-title",
        sectionId: "session",
        key: "title",
        label: "Session title",
        kind: "text",
        required: true,
        options: [],
      },
      {
        id: "field-abstract",
        sectionId: "session",
        key: "abstract",
        label: "Abstract",
        kind: "rich_text",
        required: true,
        options: [],
      },
      {
        id: "field-format",
        sectionId: "session",
        key: "format",
        label: "Format",
        kind: "select",
        required: true,
        options: ["Featured Keynote", "Keynote", "Breakout Session", "Workshop"],
      },
    ],
    participantFields: [
      {
        id: "participant-first-name",
        sectionId: "people",
        key: "firstName",
        label: "First name",
        kind: "text",
        required: true,
        options: [],
      },
      {
        id: "participant-last-name",
        sectionId: "people",
        key: "lastName",
        label: "Last name",
        kind: "text",
        required: true,
        options: [],
      },
      {
        id: "participant-email",
        sectionId: "people",
        key: "email",
        label: "Email",
        kind: "email",
        required: true,
        options: [],
      },
    ],
    rules: [],
  };
}

class LocalCfpRepository implements CfpRepository {
  readonly #events = new Map<string, EventCfp>();
  readonly #forms = new Map<string, CfpForm>();
  readonly #submissions = new Map<string, Submission>();
  readonly versions: SubmissionVersion[] = [];
  readonly audits: AuditEntry[] = [];

  constructor() {
    for (const [event, formId] of [
      [seededEvent(LOCAL_ORGANIZATION_ID, "demo-event", "Open Sessionboard Demo"), "main-cfp"],
      [
        seededEvent(LOCAL_ORGANIZATION_ID, "evaluator-2026", "Welcome to our event!"),
        "evaluator-2026-cfp",
      ],
      [
        seededEvent(LOCAL_ORGANIZATION_ID, "resume-check", "Resume Draft Test Event"),
        "resume-check-cfp",
      ],
      [
        seededEvent(LOCAL_ORGANIZATION_ID, "validation-check", "Validation Test Event"),
        "validation-check-cfp",
      ],
      [seededEvent("organization-1", "summit-2026", "Open Sessionboard Summit 2026"), "main-cfp"],
    ] as const) {
      this.#events.set(key(event.tenantId, event.id), event);
      const form = seededForm(event.tenantId, event.id, formId);
      this.#forms.set(key(form.tenantId, form.id), form);
    }
  }

  async getEvent(tenantId: string, eventId: string) {
    return clone(this.#events.get(key(tenantId, eventId)) ?? null);
  }

  async saveEvent(event: EventCfp, expectedVersion: number | null): Promise<void> {
    const storageKey = key(event.tenantId, event.id);
    if ((this.#events.get(storageKey)?.version ?? null) !== expectedVersion) {
      throw new CfpError("CONFLICT", "The event CFP configuration has changed.");
    }
    this.#events.set(storageKey, clone(event));
  }

  async getForm(tenantId: string, formId: string) {
    return clone(this.#forms.get(key(tenantId, formId)) ?? null);
  }

  async listForms(tenantId: string, eventId: string) {
    return [...this.#forms.values()]
      .filter((form) => form.tenantId === tenantId && form.eventId === eventId)
      .map(clone);
  }

  async saveForm(form: CfpForm, expectedVersion: number | null): Promise<void> {
    const storageKey = key(form.tenantId, form.id);
    if ((this.#forms.get(storageKey)?.version ?? null) !== expectedVersion) {
      throw new CfpError("CONFLICT", "The CFP form has changed.");
    }
    this.#forms.set(storageKey, clone(form));
  }

  async getSubmission(tenantId: string, submissionId: string) {
    return clone(this.#submissions.get(key(tenantId, submissionId)) ?? null);
  }

  async countOwnedSubmissions(input: {
    tenantId: string;
    eventId: string;
    formId: string;
    ownerAccountId: string;
  }) {
    return [...this.#submissions.values()].filter(
      (submission) =>
        submission.tenantId === input.tenantId &&
        submission.eventId === input.eventId &&
        submission.formId === input.formId &&
        submission.ownerAccountId === input.ownerAccountId &&
        submission.status !== "withdrawn",
    ).length;
  }

  async saveSubmissionVersion(
    version: SubmissionVersion,
    expectedVersion: number | null,
    audit?: AuditEntry,
  ): Promise<void> {
    const storageKey = key(version.submission.tenantId, version.submission.id);
    if ((this.#submissions.get(storageKey)?.version ?? null) !== expectedVersion) {
      throw new CfpError("CONFLICT", "The CFP submission has changed.");
    }
    this.#submissions.set(storageKey, clone(version.submission));
    this.versions.push(clone(version));
    if (audit !== undefined) this.audits.push(clone(audit));
  }
}

class LocalCfpIdempotency implements CfpIdempotencyCoordinator {
  readonly #operations = new Map<string, Promise<unknown>>();

  run<T>(scope: string, idempotencyKey: string, operation: () => Promise<T>): Promise<T> {
    const storageKey = key(scope, idempotencyKey);
    const existing = this.#operations.get(storageKey);
    if (existing !== undefined) return existing as Promise<T>;
    const pending = operation().catch((error) => {
      this.#operations.delete(storageKey);
      throw error;
    });
    this.#operations.set(storageKey, pending);
    return pending;
  }
}

export function createLocalCfpService(): CfpService {
  let sequence = 0;
  return new CfpService({
    repository: new LocalCfpRepository(),
    idempotency: new LocalCfpIdempotency(),
    effects: { async enqueueSubmissionConfirmation() {} },
    clock: { now: () => new Date(LOCAL_CFP_NOW) },
    ids: { next: (prefix) => `${prefix}_local_${++sequence}` },
  });
}
