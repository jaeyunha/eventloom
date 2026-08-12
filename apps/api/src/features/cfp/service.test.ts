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
  type CfpFileAssetAuthorizer,
  type CfpIdempotencyCoordinator,
  type CfpRepository,
  type CfpReusableField,
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
  reusableFields: Array<CfpReusableField> = [];

  constructor() {
    this.events.set(event.id, structuredClone(event));
    const form = buildForm();
    this.forms.set(form.id, structuredClone(form));
  }

  async getEvent(tenantId: string, eventId: string): Promise<EventCfp | null> {
    const found = this.events.get(eventId);
    return found?.tenantId === tenantId ? structuredClone(found) : null;
  }

  async getEventBySlug(tenantId: string, eventSlug: string): Promise<EventCfp | null> {
    const found = [...this.events.values()].find(
      (candidate) => candidate.tenantId === tenantId && candidate.slug === eventSlug,
    );
    return found === undefined ? null : structuredClone(found);
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
  async getReusableField(
    tenantId: string,
    fieldId: string,
    version: number,
  ): Promise<CfpReusableField | null> {
    const found = this.reusableFields.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.id === fieldId &&
        candidate.version === version,
    );
    return found === undefined ? null : structuredClone(found);
  }

  async getSubmission(tenantId: string, submissionId: string): Promise<Submission | null> {
    const found = this.submissions.get(submissionId);
    return found?.tenantId === tenantId ? structuredClone(found) : null;
  }
  async listSubmissionsForEvent(tenantId: string, eventId: string): Promise<Submission[]> {
    return [...this.submissions.values()]
      .filter((submission) => submission.tenantId === tenantId && submission.eventId === eventId)
      .map((submission) => structuredClone(submission));
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
class BatchedMemoryRepository extends MemoryRepository {
  readonly listFormsByIdsCalls: string[][] = [];

  async listFormsByIds(ids: readonly string[]): Promise<readonly CfpForm[]> {
    this.listFormsByIdsCalls.push([...ids]);
    const requested = new Set(ids);
    return [...this.forms.values()]
      .filter((form) => requested.has(form.id))
      .map((form) => structuredClone(form));
  }
}
class OrganizerReadModelRepository extends MemoryRepository {
  readonly organizerReadModelCalls: Array<{ tenantId: string; eventId: string }> = [];

  async getOrganizerSubmissionsReadModel(tenantId: string, eventId: string) {
    this.organizerReadModelCalls.push({ tenantId, eventId });
    return {
      submissions: [...this.submissions.values()].map((submission) => structuredClone(submission)),
      forms: [...this.forms.values()].map((form) => structuredClone(form)),
    };
  }

  override async listSubmissionsForEvent(
    _tenantId: string,
    _eventId: string,
  ): Promise<Submission[]> {
    throw new Error("The legacy submission listing must not be used.");
  }
}

class DualRejectingOrganizerRepository extends MemoryRepository {
  override async getEvent(_tenantId: string, _eventId: string): Promise<EventCfp | null> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return null;
  }

  override async listSubmissionsForEvent(
    _tenantId: string,
    _eventId: string,
  ): Promise<Submission[]> {
    throw new CfpError("CONFLICT", "submission read failed");
  }
}
class DualRejectingReadModelRepository extends MemoryRepository {
  override async getEvent(_tenantId: string, _eventId: string): Promise<EventCfp | null> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return null;
  }

  async getOrganizerSubmissionsReadModel(): Promise<never> {
    throw new CfpError("CONFLICT", "organizer read failed");
  }
}

class ParallelFormRepository extends MemoryRepository {
  readonly formReadIds: string[] = [];
  activeFormReads = 0;
  maxConcurrentFormReads = 0;

  async getForm(tenantId: string, formId: string): Promise<CfpForm | null> {
    this.formReadIds.push(formId);
    this.activeFormReads += 1;
    this.maxConcurrentFormReads = Math.max(this.maxConcurrentFormReads, this.activeFormReads);
    try {
      await Promise.resolve();
      return await super.getForm(tenantId, formId);
    } finally {
      this.activeFormReads -= 1;
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

function createFixture(
  now = "2026-08-08T12:00:00.000Z",
  fileAssets?: CfpFileAssetAuthorizer,
  repository: MemoryRepository = new MemoryRepository(),
) {
  const confirmations: string[] = [];
  const confirmationPayloads: Array<{ eventName: string; submissionTitle: string }> = [];
  const confirmationKeys = new Set<string>();
  let sequence = 0;
  const clock = { current: new Date(now), now: () => clock.current };
  const service = new CfpService({
    repository,
    idempotency: new MemoryIdempotency(),
    effects: {
      enqueueSubmissionConfirmation: async ({
        submission,
        event: queuedEvent,
        submissionTitle,
        idempotencyKey,
      }) => {
        if (!confirmationKeys.has(idempotencyKey)) {
          confirmationKeys.add(idempotencyKey);
          confirmations.push(submission.id);
          confirmationPayloads.push({
            eventName: queuedEvent?.name ?? "",
            submissionTitle: submissionTitle ?? "",
          });
        }
      },
    },
    clock,
    ids: { next: (prefix) => `${prefix}_${++sequence}` },
    ...(fileAssets === undefined ? {} : { fileAssets }),
  });
  return { service, repository, confirmations, confirmationPayloads, clock };
}

function buildOrganizerSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission_1",
    tenantId: "tenant_1",
    eventId: "event_1",
    formId: "form_1",
    ownerAccountId: "account_1",
    formVersion: 1,
    version: 1,
    status: "submitted",
    completedSteps: ["welcome", "account", "submission", "participant", "review"],
    answers: { title: "A submission" },
    participants: [
      {
        id: "participant_1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        role: "primary",
        biography: "Engineer",
        answers: { firstName: "Ada" },
      },
    ],
    secondaryContacts: [],
    createdAt: "2026-08-08T12:00:00.000Z",
    updatedAt: "2026-08-08T12:00:00.000Z",
    submittedAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
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
            conditions: [{ type: "predicate", fieldKey: "title", operator: "is_not_empty" }],
          },
          actions: [{ type: "show_field", fieldKey: "abstract" }],
        },
        {
          id: "cycle_b",
          priority: 2,
          when: {
            type: "group",
            operator: "all",
            conditions: [{ type: "predicate", fieldKey: "abstract", operator: "is_not_empty" }],
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

    await expect(service.saveForm(buildForm({ id: "form_21" }), null)).rejects.toMatchObject({
      code: "FORM_LIMIT_REACHED",
    });

    const saved = await service.saveForm(
      buildForm({ welcomeContent: "<script>bad()</script> Welcome", version: 2 }),
      1,
    );
    expect(saved.welcomeContent).toBe("scriptbad()/script Welcome");
  });
  it("persists dynamic participant fields and publishes safe conditional rules", async () => {
    const { service } = createFixture();
    const saved = await service.saveForm(
      buildForm({
        version: 2,
        rules: [
          {
            id: "show_company",
            priority: 1,
            when: {
              type: "group",
              operator: "all",
              conditions: [
                { type: "predicate", fieldKey: "format", operator: "equals", value: "talk" },
              ],
            },
            actions: [
              { type: "show_field", fieldKey: "participantCompany" },
              { type: "route", queue: "private-admin-queue", tags: [] },
            ],
          },
        ],
        participantFields: [
          ...buildForm().participantFields,
          {
            id: "participant_company",
            sectionId: "people",
            key: "participantCompany",
            label: "Company",
            kind: "text",
            required: false,
            options: [],
            description: "<script>private</script>Company",
          },
        ],
      }),
      1,
    );
    expect(saved.participantFields.at(-1)).toMatchObject({
      key: "participantCompany",
      description: "scriptprivate/scriptCompany",
    });

    const published = await service.getPublishedCfp({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
    });
    expect(published.form.participantFields).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "participantCompany" })]),
    );
    expect(published.form.rules[0]?.actions).toEqual([
      { type: "show_field", fieldKey: "participantCompany" },
    ]);
    expect(published.form.settings).not.toHaveProperty("adminNotificationsEnabled");
    expect(published.form.settings).not.toHaveProperty("remindersEnabled");
  });

  it("resolves a public CFP by organization-scoped slug and returns canonical IDs", async () => {
    const { service } = createFixture();

    const published = await service.getPublishedCfp({
      tenantId: "tenant_1",
      eventSlug: "future-conf",
    });

    expect(published.event).toMatchObject({ id: "event_1", slug: "future-conf" });
    expect(published.form.id).toBe("form_1");
    await expect(
      service.getPublishedCfp({ tenantId: "tenant_2", eventSlug: "future-conf" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("fails closed when a public event has multiple published forms", async () => {
    const { service, repository } = createFixture();
    const second = buildForm({ id: "form_2", name: "Secondary CFP" });
    repository.forms.set(second.id, second);

    await expect(
      service.getPublishedCfp({ tenantId: "tenant_1", eventSlug: "future-conf" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.getPublishedCfp({
        tenantId: "tenant_1",
        eventSlug: "future-conf",
        formId: "form_1",
      }),
    ).resolves.toMatchObject({ form: { id: "form_1" } });
  });

  it("authorizes reusable field versions within the tenant", async () => {
    const { service, repository } = createFixture();
    repository.reusableFields.push({
      tenantId: "tenant_1",
      id: "shared_company",
      version: 3,
    });
    const form = buildForm({ version: 2 });
    form.submissionFields = form.submissionFields.map((field, index) =>
      index === 0 ? { ...field, fieldRef: { id: "shared_company", version: 3 } } : field,
    );
    const saved = await service.saveForm(form, 1);
    expect(saved.version).toBe(2);
    expect(saved.submissionFields[0]).toMatchObject({
      fieldRef: { id: "shared_company", version: 3 },
    });

    const crossTenant = createFixture();
    crossTenant.repository.reusableFields.push({
      tenantId: "tenant_2",
      id: "shared_company",
      version: 3,
    });
    const crossTenantForm = buildForm({
      version: 2,
      submissionFields: form.submissionFields,
    });
    await expect(crossTenant.service.saveForm(crossTenantForm, 1)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("accepts only authorized finalized file assets and preserves schema versions", async () => {
    const fileAssets: CfpFileAssetAuthorizer = {
      getAsset: async (input) => ({
        assetId: input.assetId,
        tenantId: input.tenantId,
        eventId: input.eventId,
        submissionId: input.submissionId,
        owner: input.owner,
        state: "ready",
        contentType: "application/pdf",
        sizeBytes: 512,
      }),
    };
    const { service, repository } = createFixture("2026-08-08T12:00:00.000Z", fileAssets);
    const fileForm = buildForm({
      version: 2,
      submissionFields: [
        ...buildForm().submissionFields,
        {
          id: "field_slides",
          sectionId: "session",
          key: "slides",
          label: "Slides",
          kind: "file_request",
          required: true,
          options: [],
          fileRequest: {
            allowedMimeTypes: ["application/pdf"],
            maxBytes: 1024,
            required: true,
            owner: "submission",
          },
        },
      ],
    });
    await service.saveForm(fileForm, 1);
    const draft = await service.createDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
      ownerAccountId: "account_1",
      idempotencyKey: "file-create",
    });
    await expect(
      service.saveDraft({
        tenantId: "tenant_1",
        submissionId: draft.id,
        ownerAccountId: "account_1",
        expectedVersion: draft.version,
        formVersion: 2,
        idempotencyKey: "file-object-key",
        answers: { title: "Session", slides: { assetId: "asset-1", objectKey: "events/private" } },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const saved = await service.saveDraft({
      tenantId: "tenant_1",
      submissionId: draft.id,
      ownerAccountId: "account_1",
      expectedVersion: draft.version,
      formVersion: 2,
      idempotencyKey: "file-valid",
      answers: { title: "Session", slides: { assetId: "asset-1" } },
    });
    expect(saved.formVersion).toBe(2);
    expect(saved.answers.slides).toEqual({ assetId: "asset-1" });

    await service.saveForm(buildForm({ version: 3 }), 2);
    await expect(
      service.saveDraft({
        tenantId: "tenant_1",
        submissionId: draft.id,
        ownerAccountId: "account_1",
        expectedVersion: saved.version,
        formVersion: 2,
        idempotencyKey: "stale-schema",
        answers: { title: "Stale" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.submissions.get(draft.id)?.formVersion).toBe(2);
  });
});

describe("CFP submission lifecycle", () => {
  it("autosaves ordered steps, sanitizes input, previews routing, and submits once", async () => {
    const { service, repository, confirmations, confirmationPayloads } = createFixture();
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
    expect(firstCreate.completedSteps).toEqual(["welcome"]);

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
    expect(confirmationPayloads).toEqual([
      { eventName: "Future Conf", submissionTitle: "Typed APIs" },
    ]);
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

  it("allows a submitter to edit a submitted proposal while the CFP remains open", async () => {
    const { service, clock } = createFixture();
    const ready = await completeValidDraft(service, "open-edit");
    const submitted = await service.submit({
      tenantId: "tenant_1",
      submissionId: ready.id,
      ownerAccountId: "account_1",
      expectedVersion: ready.version,
      idempotencyKey: "open-submit",
    });

    clock.current = new Date("2026-08-09T12:00:00.000Z");
    const edited = await service.saveDraft({
      tenantId: "tenant_1",
      submissionId: ready.id,
      ownerAccountId: "account_1",
      expectedVersion: submitted.submission.version,
      idempotencyKey: "open-edit-save",
      answers: {
        ...submitted.submission.answers,
        abstract: `${String(submitted.submission.answers.abstract)} Updated: now includes 2026 benchmark data.`,
      },
    });

    expect(edited.status).toBe("submitted");
    expect(edited.answers.abstract).toContain("Updated: now includes 2026 benchmark data.");
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
  it("creates a new authenticated submission with authoritative versions before review", async () => {
    const { service, repository } = createFixture();
    const created = await service.createDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
      ownerAccountId: "speaker_account",
      idempotencyKey: "new-flow-create",
    });

    expect(created).toMatchObject({
      tenantId: "tenant_1",
      ownerAccountId: "speaker_account",
      formVersion: 1,
      version: 1,
      completedSteps: ["welcome"],
    });

    const account = await service.saveDraft({
      tenantId: "tenant_1",
      submissionId: created.id,
      ownerAccountId: "speaker_account",
      expectedVersion: created.version,
      formVersion: created.formVersion,
      idempotencyKey: "new-flow-account",
      completedStep: "account",
      answers: {
        accountEmail: "speaker@example.com",
        accountFirstName: "Taylor",
        accountLastName: "Speaker",
        accountAcceptedTerms: true,
      },
    });
    const submission = await service.saveDraft({
      tenantId: "tenant_1",
      submissionId: created.id,
      ownerAccountId: "speaker_account",
      expectedVersion: account.version,
      formVersion: account.formVersion,
      idempotencyKey: "new-flow-submission",
      completedStep: "submission",
      answers: {
        accountEmail: "speaker@example.com",
        accountFirstName: "Taylor",
        accountLastName: "Speaker",
        accountAcceptedTerms: true,
        title: "Reliable APIs",
        abstract: "A practical session about durable API contracts.",
        format: "talk",
      },
    });
    const participant = await service.saveDraft({
      tenantId: "tenant_1",
      submissionId: created.id,
      ownerAccountId: "speaker_account",
      expectedVersion: submission.version,
      formVersion: submission.formVersion,
      idempotencyKey: "new-flow-participant",
      completedStep: "participant",
      participants: [
        {
          id: "speaker-participant",
          firstName: "Taylor",
          lastName: "Speaker",
          email: "speaker@example.com",
          role: "primary",
          biography: "Principal engineer and conference speaker.",
          answers: {},
        },
      ],
    });
    const reviewed = await service.saveDraft({
      tenantId: "tenant_1",
      submissionId: created.id,
      ownerAccountId: "speaker_account",
      expectedVersion: participant.version,
      formVersion: participant.formVersion,
      idempotencyKey: "new-flow-review",
      completedStep: "review",
    });

    expect(reviewed.version).toBe(5);
    expect(reviewed.formVersion).toBe(created.formVersion);
    expect(reviewed.completedSteps).toEqual([
      "welcome",
      "account",
      "submission",
      "participant",
      "review",
    ]);
    expect(reviewed.answers).toMatchObject({
      title: "Reliable APIs",
      abstract: "A practical session about durable API contracts.",
    });

    await expect(
      service.review({
        tenantId: "tenant_1",
        submissionId: reviewed.id,
        ownerAccountId: "speaker_account",
        idempotencyKey: "new-flow-review-check",
      }),
    ).resolves.toMatchObject({ canSubmit: true, version: reviewed.version });

    await expect(
      service.saveDraft({
        tenantId: "tenant_1",
        submissionId: reviewed.id,
        ownerAccountId: "speaker_account",
        expectedVersion: account.version,
        formVersion: reviewed.formVersion,
        idempotencyKey: "new-flow-stale",
        answers: { ...reviewed.answers, title: "Stale write" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      service.saveDraft({
        tenantId: "tenant_2",
        submissionId: reviewed.id,
        ownerAccountId: "speaker_account",
        expectedVersion: reviewed.version,
        formVersion: reviewed.formVersion,
        idempotencyKey: "new-flow-cross-tenant",
        answers: { ...reviewed.answers, title: "Cross-tenant write" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(repository.submissions.get(reviewed.id)).toMatchObject({
      version: reviewed.version,
      tenantId: "tenant_1",
      ownerAccountId: "speaker_account",
      answers: { title: "Reliable APIs" },
    });
  });
  it("saves and reloads a title-only incomplete draft for its owner", async () => {
    const { service } = createFixture();
    const created = await service.createDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: "form_1",
      ownerAccountId: "account_1",
      idempotencyKey: "title-only-create",
    });
    const accountStep = await service.saveDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      submissionId: created.id,
      ownerAccountId: "account_1",
      expectedVersion: created.version,
      formVersion: created.formVersion,
      completedStep: "account",
      idempotencyKey: "title-only-account",
    });
    const saved = await service.saveDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      submissionId: created.id,
      ownerAccountId: "account_1",
      expectedVersion: accountStep.version,
      formVersion: accountStep.formVersion,
      completedStep: "submission",
      answers: { title: "Title-only draft" },
      idempotencyKey: "title-only-save",
    });

    const loaded = await service.loadDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      submissionId: saved.id,
      ownerAccountId: "account_1",
    });
    expect(loaded).toEqual(saved);
    expect(loaded).toMatchObject({
      status: "draft",
      completedSteps: ["welcome", "account", "submission"],
      answers: { title: "Title-only draft" },
    });
    await expect(
      service.loadDraft({
        tenantId: "tenant_1",
        eventId: "event_other",
        submissionId: saved.id,
        ownerAccountId: "account_1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const edited = await service.saveDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      submissionId: loaded.id,
      ownerAccountId: "account_1",
      expectedVersion: loaded.version,
      formVersion: loaded.formVersion,
      answers: { abstract: "A partial edit must preserve the saved title." },
      idempotencyKey: "title-only-edit",
    });
    const reloaded = await service.loadDraft({
      tenantId: "tenant_1",
      eventId: "event_1",
      submissionId: edited.id,
      ownerAccountId: "account_1",
    });
    expect(reloaded).toEqual(edited);
    expect(reloaded.answers).toEqual({
      title: "Title-only draft",
      abstract: "A partial edit must preserve the saved title.",
    });
  });

  it("deduplicates organizer form enrichment through the optional batch lookup", async () => {
    const repository = new BatchedMemoryRepository();
    const { service } = createFixture(undefined, undefined, repository);
    for (let index = 1; index <= 4; index += 1) {
      repository.submissions.set(
        `submission_${index}`,
        buildOrganizerSubmission({ id: `submission_${index}` }),
      );
    }

    const records = await service.listOrganizerSubmissions({
      tenantId: "tenant_1",
      eventId: "event_1",
    });

    expect(records).toHaveLength(4);
    expect(repository.listFormsByIdsCalls).toEqual([["form_1"]]);
    expect(records[0]).toEqual({
      submission: expect.objectContaining({ id: "submission_1" }),
      submissionFields: repository.forms.get("form_1")?.submissionFields,
      participantFields: repository.forms.get("form_1")?.participantFields,
    });
    expect(records[0]?.submission.participants).toEqual(buildOrganizerSubmission().participants);
  });
  it("uses one organizer submission read model for scoped enrichment", async () => {
    const repository = new OrganizerReadModelRepository();
    repository.forms.set(
      "form_other_event",
      buildForm({ id: "form_other_event", eventId: "event_other" }),
    );
    repository.forms.set(
      "form_other_tenant",
      buildForm({ id: "form_other_tenant", tenantId: "tenant_other" }),
    );
    repository.submissions.set("submission_a", buildOrganizerSubmission({ id: "submission_a" }));
    repository.submissions.set("submission_b", buildOrganizerSubmission({ id: "submission_b" }));
    repository.submissions.set(
      "submission_wrong_tenant",
      buildOrganizerSubmission({ id: "submission_wrong_tenant", tenantId: "tenant_other" }),
    );
    repository.submissions.set(
      "submission_wrong_event",
      buildOrganizerSubmission({ id: "submission_wrong_event", eventId: "event_other" }),
    );
    repository.submissions.set(
      "submission_wrong_form_event",
      buildOrganizerSubmission({
        id: "submission_wrong_form_event",
        formId: "form_other_event",
      }),
    );
    const { service } = createFixture(undefined, undefined, repository);

    const records = await service.listOrganizerSubmissions({
      tenantId: "tenant_1",
      eventId: "event_1",
    });

    expect(repository.organizerReadModelCalls).toEqual([
      { tenantId: "tenant_1", eventId: "event_1" },
    ]);
    expect(records.map(({ submission }) => submission.id)).toEqual([
      "submission_a",
      "submission_b",
    ]);
    expect(records[0]).toEqual({
      submission: expect.objectContaining({ id: "submission_a" }),
      submissionFields: repository.forms.get("form_1")?.submissionFields,
      participantFields: repository.forms.get("form_1")?.participantFields,
    });
  });

  it("prioritizes event ownership failure when both organizer reads reject", async () => {
    const repository = new DualRejectingOrganizerRepository();
    const { service } = createFixture(undefined, undefined, repository);

    await expect(
      service.listOrganizerSubmissions({ tenantId: "tenant_other", eventId: "event_1" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "The event was not found.",
    });
  });
  it("prioritizes event ownership failure when the batch organizer read rejects", async () => {
    const repository = new DualRejectingReadModelRepository();
    const { service } = createFixture(undefined, undefined, repository);

    await expect(
      service.listOrganizerSubmissions({ tenantId: "tenant_other", eventId: "event_1" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "The event was not found.",
    });
  });
  it("keeps cross-tenant forms returned by a batch lookup out of organizer enrichment", async () => {
    const repository = new BatchedMemoryRepository();
    repository.forms.set("form_1", buildForm({ tenantId: "tenant_other" }));
    repository.submissions.set("submission_1", buildOrganizerSubmission());
    const { service } = createFixture(undefined, undefined, repository);

    await expect(
      service.listOrganizerSubmissions({ tenantId: "tenant_1", eventId: "event_1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.listFormsByIdsCalls).toEqual([["form_1"]]);
  });

  it("parallelizes fallback form lookup across unique form ids", async () => {
    const repository = new ParallelFormRepository();
    repository.forms.set("form_2", buildForm({ id: "form_2" }));
    repository.submissions.set(
      "submission_1",
      buildOrganizerSubmission({ id: "submission_1", formId: "form_1" }),
    );
    repository.submissions.set(
      "submission_2",
      buildOrganizerSubmission({ id: "submission_2", formId: "form_2" }),
    );
    const { service } = createFixture(undefined, undefined, repository);

    const records = await service.listOrganizerSubmissions({
      tenantId: "tenant_1",
      eventId: "event_1",
    });

    expect(records).toHaveLength(2);
    expect(repository.formReadIds).toEqual(["form_1", "form_2"]);
    expect(repository.maxConcurrentFormReads).toBe(2);
  });
  it("lists canonical organizer submissions with scoped forms and current schema metadata", async () => {
    const { service, repository } = createFixture();
    const organizerForm = buildForm();
    repository.forms.set(organizerForm.id, structuredClone(organizerForm));
    const canonicalSubmission: Submission = {
      id: "submission_canonical",
      tenantId: "tenant_1",
      eventId: "event_1",
      formId: organizerForm.id,
      ownerAccountId: "account_1",
      formVersion: organizerForm.version,
      version: 4,
      status: "submitted",
      completedSteps: ["welcome", "account", "submission", "participant", "review"],
      answers: {
        title: "Canonical submission",
        abstract: "Exact server-owned answers",
        format: "talk",
      },
      participants: [
        {
          id: "participant_primary",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          role: "primary",
          biography: "Primary speaker",
          answers: { firstName: "Ada" },
        },
        {
          id: "participant_co",
          firstName: "Grace",
          lastName: "Hopper",
          email: "grace@example.com",
          role: "co_speaker",
          biography: "Co-speaker",
          answers: { firstName: "Grace" },
        },
      ],
      secondaryContacts: [],
      createdAt: "2026-08-08T12:00:00.000Z",
      updatedAt: "2026-08-08T12:30:00.000Z",
      submittedAt: "2026-08-08T12:30:00.000Z",
    };
    repository.submissions.set(canonicalSubmission.id, structuredClone(canonicalSubmission));
    repository.submissions.set(
      "submission_other_event",
      structuredClone({
        ...canonicalSubmission,
        id: "submission_other_event",
        eventId: "event_other",
      }),
    );

    const records = await service.listOrganizerSubmissions({
      tenantId: "tenant_1",
      eventId: "event_1",
    });
    expect(records).toEqual([
      {
        submission: canonicalSubmission,
        submissionFields: organizerForm.submissionFields,
        participantFields: organizerForm.participantFields,
      },
    ]);
    expect(records[0]?.submission.participants).toEqual(canonicalSubmission.participants);
  });
  it("lists submitted records against the current schema after a form revision", async () => {
    const { service, repository } = createFixture();
    const previousForm = buildForm();
    const currentForm = buildForm({
      version: previousForm.version + 1,
      submissionFields: previousForm.submissionFields.map((field) => ({
        ...field,
        label: `Current ${field.label}`,
      })),
      participantFields: previousForm.participantFields.map((field) => ({
        ...field,
        label: `Current ${field.label}`,
      })),
    });
    repository.forms.set(currentForm.id, structuredClone(currentForm));
    repository.events.set(
      event.id,
      structuredClone({
        ...event,
        closesAt: "2026-08-12T07:00:00.000Z",
      }),
    );

    const originalSubmission = buildOrganizerSubmission();
    const primaryParticipant = originalSubmission.participants.at(0);
    if (primaryParticipant === undefined) {
      throw new Error("The organizer submission fixture requires a primary participant.");
    }
    const storedSubmission = structuredClone({
      ...originalSubmission,
      id: "submission_old_schema",
      formVersion: previousForm.version,
      answers: {
        title: "Legacy title",
        format: "talk",
        legacyAnswer: "preserve exactly",
      },
      participants: [
        primaryParticipant,
        {
          ...primaryParticipant,
          id: "participant_2",
          firstName: "Grace",
          lastName: "Hopper",
          email: "grace@example.com",
          answers: { firstName: "Grace", legacyRole: "co-speaker" },
        },
      ],
    });
    repository.submissions.set(storedSubmission.id, storedSubmission);

    const records = await service.listOrganizerSubmissions({
      tenantId: "tenant_1",
      eventId: "event_1",
    });

    expect(records).toEqual([
      {
        submission: storedSubmission,
        submissionFields: currentForm.submissionFields,
        participantFields: currentForm.participantFields,
      },
    ]);
    expect(records[0]?.submission.answers).toEqual(storedSubmission.answers);
    expect(records[0]?.submission.participants).toEqual(storedSubmission.participants);
    expect(records[0]?.submissionFields.map(({ id }) => id)).toEqual(
      previousForm.submissionFields.map(({ id }) => id),
    );
    expect(records[0]?.participantFields.map(({ id }) => id)).toEqual(
      previousForm.participantFields.map(({ id }) => id),
    );

    await expect(
      service.saveDraft({
        tenantId: "tenant_1",
        eventId: "event_1",
        submissionId: storedSubmission.id,
        ownerAccountId: storedSubmission.ownerAccountId,
        expectedVersion: storedSubmission.version,
        formVersion: storedSubmission.formVersion,
        idempotencyKey: "stale-form-revision-write",
        answers: { title: "Rejected stale update" },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "The CFP form schema version is no longer available for this submission.",
      details: {
        submissionFormVersion: previousForm.version,
        currentFormVersion: currentForm.version,
      },
    });
    expect(repository.submissions.get(storedSubmission.id)).toEqual(storedSubmission);
  });
});
