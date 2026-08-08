import { describe, expect, it } from "vitest";
import type {
  AuditEntry,
  CfpForm,
  EventCfp,
  Submission,
  SubmissionStep,
  SubmissionVersion,
} from "./model";
import { evaluateFormRules, validateCfpForm } from "./rules";
import {
  CfpError,
  type CfpIdempotencyCoordinator,
  type CfpRepository,
  CfpService,
} from "./service";

const event: EventCfp = {
  id: "event_1",
  tenantId: "tenant_1",
  version: 1,
  slug: "future-conf",
  name: "Future Conf",
  timezone: "America/Los_Angeles",
  opensAt: "2026-08-01T07:00:00.000Z",
  closesAt: "2026-08-10T07:00:00.000Z",
};

function buildForm(overrides: Partial<CfpForm> = {}): CfpForm {
  return {
    id: "form_1",
    tenantId: "tenant_1",
    eventId: "event_1",
    name: "Main CFP",
    version: 1,
    status: "published",
    welcomeContent: "Welcome",
    settings: {
      speakerLimit: 3,
      maxSubmissionsPerAccount: 2,
      remindersEnabled: true,
      adminNotificationsEnabled: true,
      confirmationMessage: "Received",
      successContent: "Thank you",
      redirectUrl: "https://example.com/portal",
    },
    sections: [
      { id: "session", title: "Session", description: "Session details" },
      { id: "people", title: "People", description: "Speaker details" },
    ],
    submissionFields: [
      {
        id: "field_title",
        sectionId: "session",
        key: "title",
        label: "Title",
        kind: "text",
        required: true,
        options: [],
      },
      {
        id: "field_abstract",
        sectionId: "session",
        key: "abstract",
        label: "Abstract",
        kind: "rich_text",
        required: false,
        options: [],
      },
      {
        id: "field_format",
        sectionId: "session",
        key: "format",
        label: "Format",
        kind: "select",
        required: true,
        options: ["talk", "workshop"],
      },
    ],
    participantFields: [
      {
        id: "participant_first_name",
        sectionId: "people",
        key: "firstName",
        label: "First name",
        kind: "text",
        required: true,
        options: [],
      },
      {
        id: "participant_last_name",
        sectionId: "people",
        key: "lastName",
        label: "Last name",
        kind: "text",
        required: true,
        options: [],
      },
      {
        id: "participant_email",
        sectionId: "people",
        key: "email",
        label: "Email",
        kind: "email",
        required: true,
        options: [],
      },
    ],
    rules: [
      {
        id: "route_talks",
        priority: 10,
        when: {
          type: "group",
          operator: "all",
          conditions: [
            {
              type: "group",
              operator: "any",
              conditions: [
                { type: "predicate", fieldKey: "format", operator: "equals", value: "talk" },
                {
                  type: "predicate",
                  fieldKey: "format",
                  operator: "equals",
                  value: "workshop",
                },
              ],
            },
          ],
        },
        actions: [
          { type: "require_field", fieldKey: "abstract" },
          { type: "route", queue: "technical", tags: ["programming"] },
        ],
      },
    ],
    ...overrides,
  };
}

class MemoryRepository implements CfpRepository {
  events = new Map<string, EventCfp>();
  forms = new Map<string, CfpForm>();
  submissions = new Map<string, Submission>();
  versions: SubmissionVersion[] = [];
  audits: AuditEntry[] = [];

  constructor() {
    this.events.set(event.id, structuredClone(event));
    const form = buildForm();
    this.forms.set(form.id, structuredClone(form));
  }

  async getEvent(tenantId: string, eventId: string): Promise<EventCfp | null> {
    const found = this.events.get(eventId);
    return found?.tenantId === tenantId ? structuredClone(found) : null;
  }

  async saveEvent(value: EventCfp, expectedVersion: number | null): Promise<void> {
    const current = this.events.get(value.id);
    if ((current?.version ?? null) !== expectedVersion) {
      throw new CfpError("CONFLICT", "event version conflict");
    }
    this.events.set(value.id, structuredClone(value));
  }

  async getForm(tenantId: string, formId: string): Promise<CfpForm | null> {
    const found = this.forms.get(formId);
    return found?.tenantId === tenantId ? structuredClone(found) : null;
  }

  async listForms(tenantId: string, eventId: string): Promise<CfpForm[]> {
    return [...this.forms.values()]
      .filter((form) => form.tenantId === tenantId && form.eventId === eventId)
      .map((form) => structuredClone(form));
  }

  async saveForm(value: CfpForm, expectedVersion: number | null): Promise<void> {
    const current = this.forms.get(value.id);
    if ((current?.version ?? null) !== expectedVersion) {
      throw new CfpError("CONFLICT", "form version conflict");
    }
    this.forms.set(value.id, structuredClone(value));
  }

  async getSubmission(tenantId: string, submissionId: string): Promise<Submission | null> {
    const found = this.submissions.get(submissionId);
    return found?.tenantId === tenantId ? structuredClone(found) : null;
  }

  async countOwnedSubmissions(input: {
    tenantId: string;
    eventId: string;
    formId: string;
    ownerAccountId: string;
  }): Promise<number> {
    return [...this.submissions.values()].filter(
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
    const current = this.submissions.get(version.submission.id);
    if ((current?.version ?? null) !== expectedVersion) {
      throw new CfpError("CONFLICT", "submission version conflict");
    }
    this.submissions.set(version.submission.id, structuredClone(version.submission));
    this.versions.push(structuredClone(version));
    if (audit) {
      this.audits.push(structuredClone(audit));
    }
  }
}

class MemoryIdempotency implements CfpIdempotencyCoordinator {
  readonly #operations = new Map<string, Promise<unknown>>();

  run<T>(scope: string, _key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.#operations.get(scope);
    if (existing) {
      return existing as Promise<T>;
    }
    const pending = operation();
    this.#operations.set(scope, pending);
    return pending;
  }
}

function createFixture(now = "2026-08-08T12:00:00.000Z") {
  const repository = new MemoryRepository();
  const confirmations: string[] = [];
  const confirmationKeys = new Set<string>();
  let sequence = 0;
  const clock = { current: new Date(now), now: () => clock.current };
  const service = new CfpService({
    repository,
    idempotency: new MemoryIdempotency(),
    effects: {
      enqueueSubmissionConfirmation: async ({ submission, idempotencyKey }) => {
        if (!confirmationKeys.has(idempotencyKey)) {
          confirmationKeys.add(idempotencyKey);
          confirmations.push(submission.id);
        }
      },
    },
    clock,
    ids: { next: (prefix) => `${prefix}_${++sequence}` },
  });
  return { service, repository, confirmations, clock };
}

async function completeValidDraft(
  service: CfpService,
  idempotencyPrefix = "flow",
): Promise<Submission> {
  let submission = await service.createDraft({
    tenantId: "tenant_1",
    eventId: "event_1",
    formId: "form_1",
    ownerAccountId: "account_1",
    idempotencyKey: `${idempotencyPrefix}-create`,
  });

  const steps: SubmissionStep[] = ["welcome", "account", "submission", "participant", "review"];
  for (const step of steps) {
    submission = await service.saveDraft({
      tenantId: "tenant_1",
      submissionId: submission.id,
      ownerAccountId: "account_1",
      expectedVersion: submission.version,
      idempotencyKey: `${idempotencyPrefix}-${step}`,
      completedStep: step,
      ...(step === "submission"
        ? { answers: { title: "Typed APIs", abstract: "<img src=x>Useful", format: "talk" } }
        : {}),
      ...(step === "participant"
        ? {
            participants: [
              {
                id: "participant_1",
                firstName: "Ada",
                lastName: "Lovelace",
                email: "ADA@example.com",
                role: "primary" as const,
                biography: "<script>alert(1)</script>Engineer",
                answers: {},
              },
            ],
          }
        : {}),
    });
  }
  return submission;
}

describe("CFP rules and configuration", () => {
  it("accepts nested routing rules and rejects dependency cycles", () => {
    expect(validateCfpForm(buildForm())).toMatchObject({ success: true });

    const skipped = buildForm({
      rules: [
        {
          id: "skip_abstract",
          priority: 1,
          when: {
            type: "group",
            operator: "all",
            conditions: [
              {
                type: "predicate",
                fieldKey: "format",
                operator: "equals",
                value: "workshop",
              },
            ],
          },
          actions: [{ type: "skip_field", fieldKey: "abstract" }],
        },
      ],
    });
    expect(evaluateFormRules(skipped, { format: "workshop" }).fields.abstract).toEqual({
      visible: false,
      required: false,
      skipped: true,
    });

    const cyclic = buildForm({
      rules: [
        {
          id: "cycle_a",
          priority: 1,
          when: {
            type: "group",
            operator: "all",
            conditions: [
              { type: "predicate", fieldKey: "title", operator: "is_not_empty" },
            ],
          },
          actions: [{ type: "show_field", fieldKey: "abstract" }],
        },
        {
          id: "cycle_b",
          priority: 2,
          when: {
            type: "group",
            operator: "all",
            conditions: [
              { type: "predicate", fieldKey: "abstract", operator: "is_not_empty" },
            ],
          },
          actions: [{ type: "require_field", fieldKey: "title" }],
        },
      ],
    });
    expect(validateCfpForm(cyclic)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "rule_cycle" })]),
    });
  });

  it("enforces the 20-form cap and sanitizes persisted form content", async () => {
    const { service, repository } = createFixture();
    for (let index = 2; index <= 20; index += 1) {
      repository.forms.set(`form_${index}`, buildForm({ id: `form_${index}` }));
    }

    await expect(
      service.saveForm(buildForm({ id: "form_21" }), null),
    ).rejects.toMatchObject({ code: "FORM_LIMIT_REACHED" });

    const saved = await service.saveForm(
      buildForm({ welcomeContent: "<script>bad()</script> Welcome", version: 2 }),
      1,
    );
    expect(saved.welcomeContent).toBe("scriptbad()/script Welcome");
  });
});

describe("CFP submission lifecycle", () => {
  it("autosaves ordered steps, sanitizes input, previews routing, and submits once", async () => {
    const { service, repository, confirmations } = createFixture();
    const firstCreate = await service.createDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
      ownerAccountId: "account_idempotent",
      idempotencyKey: "same-create",
    });
    const repeatedCreate = await service.createDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
      ownerAccountId: "account_idempotent",
      idempotencyKey: "same-create",
    });
    expect(repeatedCreate.id).toBe(firstCreate.id);

    const ready = await completeValidDraft(service);
    expect(ready.completedSteps).toEqual([
      "welcome",
      "account",
      "submission",
      "participant",
      "review",
    ]);
    expect(ready.answers.abstract).toBe("img src=xUseful");
    expect(ready.participants[0]?.biography).toBe("scriptalert(1)/scriptEngineer");
    expect(ready.participants[0]?.email).toBe("ada@example.com");

    const [review, repeatedReview] = await Promise.all([
      service.review({
        tenantId: "tenant_1",
        submissionId: ready.id,
        ownerAccountId: "account_1",
        idempotencyKey: "review-once",
      }),
      service.review({
        tenantId: "tenant_1",
        submissionId: ready.id,
        ownerAccountId: "account_1",
        idempotencyKey: "review-once",
      }),
    ]);
    expect(review).toEqual(repeatedReview);
    expect(review).toMatchObject({
      canSubmit: true,
      matchedRuleIds: ["route_talks"],
      routes: [{ queue: "technical", tags: ["programming"] }],
    });

    const [submitted, repeatedSubmit] = await Promise.all([
      service.submit({
        tenantId: "tenant_1",
        submissionId: ready.id,
        ownerAccountId: "account_1",
        expectedVersion: ready.version,
        idempotencyKey: "submit-once",
      }),
      service.submit({
        tenantId: "tenant_1",
        submissionId: ready.id,
        ownerAccountId: "account_1",
        expectedVersion: ready.version,
        idempotencyKey: "submit-once",
      }),
    ]);
    expect(submitted).toEqual(repeatedSubmit);
    expect(submitted.submission.status).toBe("submitted");
    expect(confirmations).toEqual([ready.id]);
    expect(repository.versions.filter((version) => version.reason === "submitted")).toHaveLength(1);

    const retryWithNewKey = await service.submit({
      tenantId: "tenant_1",
      submissionId: ready.id,
      ownerAccountId: "account_1",
      expectedVersion: ready.version,
      idempotencyKey: "submit-new-key",
    });
    expect(retryWithNewKey.confirmationQueued).toBe(false);
    expect(confirmations).toHaveLength(1);
  });

  it("returns accessible validation issues before submission", async () => {
    const { service } = createFixture();
    let draft = await service.createDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
      ownerAccountId: "account_1",
      idempotencyKey: "invalid-create",
    });
    for (const step of ["welcome", "account", "submission", "participant", "review"] as const) {
      draft = await service.saveDraft({
        tenantId: "tenant_1",
        submissionId: draft.id,
        ownerAccountId: "account_1",
        expectedVersion: draft.version,
        idempotencyKey: `invalid-${step}`,
        completedStep: step,
      });
    }

    const review = await service.review({
      tenantId: "tenant_1",
      submissionId: draft.id,
      ownerAccountId: "account_1",
      idempotencyKey: "invalid-review",
    });
    expect(review.canSubmit).toBe(false);
    expect(review.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "participants", code: "required" }),
        expect.objectContaining({ path: "answers.title", code: "required" }),
      ]),
    );
    await expect(
      service.submit({
        tenantId: "tenant_1",
        submissionId: draft.id,
        ownerAccountId: "account_1",
        expectedVersion: draft.version,
        idempotencyKey: "invalid-submit",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("enforces open dates, per-account limits, ownership, and step order", async () => {
    const { service, clock } = createFixture("2026-07-31T12:00:00.000Z");
    await expect(
      service.createDraft({
        tenantId: "tenant_1",
        eventId: "event_1",
        formId: "form_1",
        ownerAccountId: "account_1",
        idempotencyKey: "too-early",
      }),
    ).rejects.toMatchObject({ code: "CFP_NOT_OPEN" });

    clock.current = new Date("2026-08-08T12:00:00.000Z");
    const first = await service.createDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
      ownerAccountId: "account_1",
      idempotencyKey: "limit-1",
    });
    await service.createDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
      ownerAccountId: "account_1",
      idempotencyKey: "limit-2",
    });
    await expect(
      service.createDraft({
        tenantId: "tenant_1",
        eventId: "event_1",
        formId: "form_1",
        ownerAccountId: "account_1",
        idempotencyKey: "limit-3",
      }),
    ).rejects.toMatchObject({ code: "SUBMISSION_LIMIT_REACHED" });
    await expect(
      service.saveDraft({
        tenantId: "tenant_1",
        submissionId: first.id,
        ownerAccountId: "other_account",
        expectedVersion: first.version,
        idempotencyKey: "wrong-owner",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.saveDraft({
        tenantId: "tenant_1",
        submissionId: first.id,
        ownerAccountId: "account_1",
        expectedVersion: first.version,
        idempotencyKey: "skip-step",
        completedStep: "submission",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("requires audited reopening for post-close edits and allows pre-decision withdrawal", async () => {
    const { service, repository, clock } = createFixture();
    const ready = await completeValidDraft(service, "closed-flow");
    const submitted = await service.submit({
      tenantId: "tenant_1",
      submissionId: ready.id,
      ownerAccountId: "account_1",
      expectedVersion: ready.version,
      idempotencyKey: "closed-submit",
    });

    clock.current = new Date("2026-08-11T12:00:00.000Z");
    await expect(
      service.saveDraft({
        tenantId: "tenant_1",
        submissionId: ready.id,
        ownerAccountId: "account_1",
        expectedVersion: submitted.submission.version,
        idempotencyKey: "closed-edit",
        answers: { ...submitted.submission.answers, title: "Late edit" },
      }),
    ).rejects.toMatchObject({ code: "CFP_CLOSED" });

    const reopened = await service.reopen({
      tenantId: "tenant_1",
      submissionId: ready.id,
      organizerId: "organizer_1",
      expectedVersion: submitted.submission.version,
      reason: "Speaker supplied a correction",
      idempotencyKey: "reopen-once",
    });
    const edited = await service.saveDraft({
      tenantId: "tenant_1",
      submissionId: ready.id,
      ownerAccountId: "account_1",
      expectedVersion: reopened.version,
      idempotencyKey: "late-edit",
      answers: { ...reopened.answers, title: "Late edit" },
    });
    expect(edited.answers.title).toBe("Late edit");
    expect(repository.audits).toEqual([
      expect.objectContaining({
        action: "submission_reopened",
        actorId: "organizer_1",
        reason: "Speaker supplied a correction",
      }),
    ]);

    const withdrawn = await service.withdraw({
      tenantId: "tenant_1",
      submissionId: ready.id,
      ownerAccountId: "account_1",
      expectedVersion: edited.version,
      reason: "Cannot attend",
      idempotencyKey: "withdraw-once",
    });
    expect(withdrawn.status).toBe("withdrawn");
    expect(repository.audits.at(-1)).toMatchObject({ action: "submission_withdrawn" });
  });
});
