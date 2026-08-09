import {
  type AuditEntry,
  type CfpForm,
  type EventCfp,
  eventCfpSchema,
  type Submission,
  type SubmissionStep,
  type SubmissionVersion,
  submissionSchema,
  submissionSteps,
} from "./model";
import { evaluateFormRules, validateCfpForm, validateSubmissionAnswers } from "./rules";
import { sanitizeForm, sanitizePlainText, sanitizeSubmission } from "./sanitize";

export type CfpErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "FORM_LIMIT_REACHED"
  | "SUBMISSION_LIMIT_REACHED"
  | "CFP_NOT_OPEN"
  | "CFP_CLOSED"
  | "FORM_NOT_PUBLISHED"
  | "INVALID_TRANSITION"
  | "IDEMPOTENCY_KEY_REQUIRED";

export class CfpError extends Error {
  readonly code: CfpErrorCode;
  readonly details?: unknown;

  constructor(code: CfpErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CfpError";
    this.code = code;
    this.details = details;
  }
}

export interface CfpRepository {
  getEvent(tenantId: string, eventId: string): Promise<EventCfp | null>;
  saveEvent(event: EventCfp, expectedVersion: number | null): Promise<void>;
  getForm(tenantId: string, formId: string): Promise<CfpForm | null>;
  listForms(tenantId: string, eventId: string): Promise<CfpForm[]>;
  saveForm(form: CfpForm, expectedVersion: number | null): Promise<void>;
  getSubmission(tenantId: string, submissionId: string): Promise<Submission | null>;
  countOwnedSubmissions(input: {
    tenantId: string;
    eventId: string;
    formId: string;
    ownerAccountId: string;
  }): Promise<number>;
  saveSubmissionVersion(
    version: SubmissionVersion,
    expectedVersion: number | null,
    audit?: AuditEntry,
  ): Promise<void>;
}

export interface CfpIdempotencyCoordinator {
  run<T>(scope: string, key: string, operation: () => Promise<T>): Promise<T>;
}

/**
 * Enqueues are durable and deduplicated by idempotencyKey. Implementations must make retries safe.
 */
export interface CfpEffects {
  enqueueSubmissionConfirmation(input: {
    submission: Submission;
    form: CfpForm;
    idempotencyKey: string;
  }): Promise<void>;
}

export interface CfpClock {
  now(): Date;
}

export interface CfpIdGenerator {
  next(prefix: "submission" | "participant" | "contact"): string;
}

export interface ReviewIssue {
  path: string;
  code: string;
  message: string;
}

export interface SubmissionReview {
  submissionId: string;
  version: number;
  canSubmit: boolean;
  issues: ReviewIssue[];
  matchedRuleIds: string[];
  routes: ReturnType<typeof evaluateFormRules>["routes"];
}

export interface CfpReceipt {
  id: string;
  submissionId: string;
  version: number;
  submittedAt: string;
}

export interface PublicCfpEvent {
  id: EventCfp["id"];
  slug: EventCfp["slug"];
  name: EventCfp["name"];
  timezone: EventCfp["timezone"];
  opensAt: EventCfp["opensAt"];
  closesAt: EventCfp["closesAt"];
}

export type PublicCfpForm = Omit<
  CfpForm,
  "tenantId" | "eventId" | "rules" | "settings" | "status"
> & {
  status: "published";
  settings: Pick<
    CfpForm["settings"],
    | "speakerLimit"
    | "maxSubmissionsPerAccount"
    | "confirmationMessage"
    | "successContent"
    | "redirectUrl"
  >;
};

export interface PublishedCfp {
  event: PublicCfpEvent;
  form: PublicCfpForm;
}

export interface SubmitResult {
  submission: Submission;
  receipt?: CfpReceipt;
  confirmationQueued: boolean;
}

const requiredCompletedSteps: SubmissionStep[] = [
  "welcome",
  "account",
  "submission",
  "participant",
  "review",
];

function requireIdempotencyKey(key: string): string {
  const normalized = key.trim();
  if (normalized.length === 0 || normalized.length > 200) {
    throw new CfpError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A non-empty idempotency key of at most 200 characters is required.",
    );
  }
  return normalized;
}

function ensureTenant(resourceTenantId: string, tenantId: string): void {
  if (resourceTenantId !== tenantId) {
    throw new CfpError("FORBIDDEN", "The resource does not belong to this tenant.");
  }
}

function ensureEventFormMatch(event: EventCfp, form: CfpForm): void {
  if (event.tenantId !== form.tenantId || event.id !== form.eventId) {
    throw new CfpError("FORBIDDEN", "The CFP form does not belong to this event.");
  }
}

function ensureOpen(event: EventCfp, now: Date): void {
  const timestamp = now.getTime();
  if (timestamp < Date.parse(event.opensAt)) {
    throw new CfpError("CFP_NOT_OPEN", "The CFP is not open yet.");
  }
  if (timestamp >= Date.parse(event.closesAt)) {
    throw new CfpError("CFP_CLOSED", "The CFP is closed.");
  }
}

function addCompletedStep(
  completedSteps: SubmissionStep[],
  completedStep: SubmissionStep | undefined,
): SubmissionStep[] {
  if (!completedStep || completedSteps.includes(completedStep)) {
    return completedSteps;
  }
  const targetIndex = submissionSteps.indexOf(completedStep);
  const missingPriorStep = submissionSteps
    .slice(0, targetIndex)
    .find((step) => !completedSteps.includes(step));
  if (missingPriorStep) {
    throw new CfpError(
      "VALIDATION_FAILED",
      `Step '${missingPriorStep}' must be completed before '${completedStep}'.`,
    );
  }
  return [...completedSteps, completedStep].sort(
    (left, right) => submissionSteps.indexOf(left) - submissionSteps.indexOf(right),
  );
}

function validateReview(submission: Submission, form: CfpForm): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  if (submission.participants.length === 0) {
    issues.push({
      path: "participants",
      code: "required",
      message: "At least one participant is required.",
    });
  }
  if (submission.participants.length > form.settings.speakerLimit) {
    issues.push({
      path: "participants",
      code: "speaker_limit",
      message: `This form allows at most ${form.settings.speakerLimit} speakers.`,
    });
  }
  const primaryCount = submission.participants.filter(
    (participant) => participant.role === "primary",
  ).length;
  if (primaryCount !== 1) {
    issues.push({
      path: "participants",
      code: "primary_participant",
      message: "Exactly one primary participant is required.",
    });
  }

  const participantEmails = submission.participants
    .map((participant) => participant.email.trim().toLowerCase())
    .filter(Boolean);
  const duplicateParticipantEmail = participantEmails.find(
    (email, index) => participantEmails.indexOf(email) !== index,
  );
  if (duplicateParticipantEmail) {
    issues.push({
      path: "participants",
      code: "duplicate_email",
      message: "Participant email addresses must be unique.",
    });
  }

  for (const [index, contact] of submission.secondaryContacts.entries()) {
    if (!contact.name || !contact.email) {
      issues.push({
        path: `secondaryContacts.${index}`,
        code: "required",
        message: "Secondary contact name and email are required.",
      });
    } else if (participantEmails.includes(contact.email.toLowerCase())) {
      issues.push({
        path: `secondaryContacts.${index}.email`,
        code: "duplicate_email",
        message: "A secondary contact must not duplicate a participant email.",
      });
    }
  }

  issues.push(...validateSubmissionAnswers(form, submission.answers, submission.participants));
  for (const step of requiredCompletedSteps) {
    if (!submission.completedSteps.includes(step)) {
      issues.push({
        path: "completedSteps",
        code: "incomplete_step",
        message: `Submission step '${step}' is incomplete.`,
      });
    }
  }
  return issues;
}

export class CfpService {
  readonly #repository: CfpRepository;
  readonly #idempotency: CfpIdempotencyCoordinator;
  readonly #effects: CfpEffects;
  readonly #clock: CfpClock;
  readonly #ids: CfpIdGenerator;

  constructor(dependencies: {
    repository: CfpRepository;
    idempotency: CfpIdempotencyCoordinator;
    effects: CfpEffects;
    clock?: CfpClock;
    ids?: CfpIdGenerator;
  }) {
    this.#repository = dependencies.repository;
    this.#idempotency = dependencies.idempotency;
    this.#effects = dependencies.effects;
    this.#clock = dependencies.clock ?? { now: () => new Date() };
    this.#ids =
      dependencies.ids ??
      ({ next: (prefix) => `${prefix}_${crypto.randomUUID()}` } satisfies CfpIdGenerator);
  }
  async getEvent(input: { tenantId: string; eventId: string }): Promise<EventCfp> {
    return this.#getEvent(input.tenantId, input.eventId);
  }

  async getForm(input: { tenantId: string; formId: string }): Promise<CfpForm> {
    return this.#getForm(input.tenantId, input.formId);
  }

  async getPublishedCfp(input: {
    tenantId: string;
    eventId: string;
    formId?: string;
  }): Promise<PublishedCfp> {
    const event = await this.#getEvent(input.tenantId, input.eventId);
    const form = input.formId
      ? await this.#getForm(input.tenantId, input.formId)
      : (await this.#repository.listForms(input.tenantId, input.eventId)).find(
          (candidate) => candidate.status === "published",
        );
    if (!form) {
      throw new CfpError("NOT_FOUND", "The published CFP form was not found.");
    }
    ensureEventFormMatch(event, form);
    if (form.status !== "published") {
      throw new CfpError("FORM_NOT_PUBLISHED", "The CFP form is not published.");
    }
    const sanitizedForm = sanitizeForm(form);
    const {
      tenantId: _tenantId,
      eventId: _eventId,
      rules: _rules,
      settings,
      ...publicForm
    } = sanitizedForm;
    return {
      event: {
        id: event.id,
        slug: event.slug,
        name: event.name,
        timezone: event.timezone,
        opensAt: event.opensAt,
        closesAt: event.closesAt,
      },
      form: {
        ...publicForm,
        status: "published",
        settings: {
          speakerLimit: settings.speakerLimit,
          maxSubmissionsPerAccount: settings.maxSubmissionsPerAccount,
          confirmationMessage: settings.confirmationMessage,
          successContent: settings.successContent,
          ...(settings.redirectUrl === undefined ? {} : { redirectUrl: settings.redirectUrl }),
        },
      },
    };
  }
  async getPublishedForm(input: {
    tenantId: string;
    eventId: string;
    formId?: string;
  }): Promise<PublishedCfp> {
    return this.getPublishedCfp(input);
  }
  async getReceipt(input: {
    tenantId: string;
    submissionId: string;
    ownerAccountId: string;
  }): Promise<CfpReceipt> {
    const submission = await this.#getOwnedSubmission(input);
    if (submission.status !== "submitted" || submission.submittedAt === undefined) {
      throw new CfpError("NOT_FOUND", "A submission receipt is not available.");
    }
    return {
      id: submission.id,
      submissionId: submission.id,
      version: submission.version,
      submittedAt: submission.submittedAt,
    };
  }

  async loadDraft(input: {
    tenantId: string;
    submissionId: string;
    ownerAccountId: string;
  }): Promise<Submission> {
    const submission = await this.#getOwnedSubmission(input);
    const event = await this.#getEvent(input.tenantId, submission.eventId);
    const form = await this.#getForm(input.tenantId, submission.formId);
    ensureEventFormMatch(event, form);
    return sanitizeSubmission(submission, form);
  }

  async createForm(input: {
    tenantId: string;
    form: unknown;
    expectedVersion: number | null;
    idempotencyKey: string;
  }): Promise<CfpForm> {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.#idempotency.run(`${input.tenantId}:cfp:create-form`, key, () =>
      this.saveForm(input.form, input.expectedVersion),
    );
  }

  async publishForm(input: {
    tenantId: string;
    eventId: string;
    formId: string;
    organizerId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }): Promise<CfpForm> {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.#idempotency.run(`${input.tenantId}:cfp:publish:${input.formId}`, key, async () => {
      const current = await this.#getForm(input.tenantId, input.formId);
      ensureEventFormMatch(await this.#getEvent(input.tenantId, input.eventId), current);
      if (current.version !== input.expectedVersion) {
        throw new CfpError("CONFLICT", "The CFP form has changed since it was loaded.");
      }
      if (current.status === "published") return current;
      const published = sanitizeForm({
        ...current,
        status: "published",
        version: current.version + 1,
      });
      await this.#repository.saveForm(published, current.version);
      return published;
    });
  }

  async saveEvent(input: unknown, expectedVersion: number | null): Promise<EventCfp> {
    const parsed = eventCfpSchema.safeParse(input);
    if (!parsed.success) {
      throw new CfpError("VALIDATION_FAILED", "The event CFP configuration is invalid.", {
        issues: parsed.error.issues,
      });
    }
    const event = {
      ...parsed.data,
      name: sanitizePlainText(parsed.data.name),
    };
    await this.#repository.saveEvent(event, expectedVersion);
    return event;
  }

  async saveForm(input: unknown, expectedVersion: number | null): Promise<CfpForm> {
    const validation = validateCfpForm(input);
    if (!validation.success) {
      throw new CfpError("VALIDATION_FAILED", "The CFP form configuration is invalid.", {
        issues: validation.issues,
      });
    }
    const form = sanitizeForm(validation.form);
    const sanitizedValidation = validateCfpForm(form);
    if (!sanitizedValidation.success) {
      throw new CfpError("VALIDATION_FAILED", "Sanitized CFP form configuration is invalid.", {
        issues: sanitizedValidation.issues,
      });
    }
    const event = await this.#getEvent(form.tenantId, form.eventId);
    ensureEventFormMatch(event, form);
    const forms = await this.#repository.listForms(form.tenantId, form.eventId);
    if (!forms.some((existing) => existing.id === form.id) && forms.length >= 20) {
      throw new CfpError("FORM_LIMIT_REACHED", "An event cannot have more than 20 CFP forms.");
    }
    await this.#repository.saveForm(form, expectedVersion);
    return form;
  }

  async createDraft(input: {
    tenantId: string;
    eventId: string;
    formId: string;
    ownerAccountId: string;
    idempotencyKey: string;
  }): Promise<Submission> {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.#idempotency.run(
      `${input.tenantId}:cfp:create:${input.formId}:${input.ownerAccountId}:${key}`,
      key,
      async () => {
        const event = await this.#getEvent(input.tenantId, input.eventId);
        const form = await this.#getForm(input.tenantId, input.formId);
        ensureEventFormMatch(event, form);
        if (form.status !== "published") {
          throw new CfpError("FORM_NOT_PUBLISHED", "The CFP form is not published.");
        }
        ensureOpen(event, this.#clock.now());
        const ownedCount = await this.#repository.countOwnedSubmissions({
          tenantId: input.tenantId,
          eventId: input.eventId,
          formId: input.formId,
          ownerAccountId: input.ownerAccountId,
        });
        if (ownedCount >= form.settings.maxSubmissionsPerAccount) {
          throw new CfpError(
            "SUBMISSION_LIMIT_REACHED",
            "The account has reached this form's submission limit.",
          );
        }

        const now = this.#clock.now().toISOString();
        const submission = submissionSchema.parse({
          id: this.#ids.next("submission"),
          tenantId: input.tenantId,
          eventId: input.eventId,
          formId: input.formId,
          ownerAccountId: input.ownerAccountId,
          formVersion: form.version,
          version: 1,
          status: "draft",
          completedSteps: [],
          answers: {},
          participants: [],
          secondaryContacts: [],
          createdAt: now,
          updatedAt: now,
        });
        await this.#repository.saveSubmissionVersion(
          {
            submission,
            reason: "draft_created",
            actorId: input.ownerAccountId,
            idempotencyKey: key,
          },
          null,
        );
        return submission;
      },
    );
  }

  async saveDraft(input: {
    tenantId: string;
    submissionId: string;
    ownerAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    completedStep?: SubmissionStep;
    answers?: Record<string, unknown>;
    participants?: Submission["participants"];
    secondaryContacts?: Submission["secondaryContacts"];
  }): Promise<Submission> {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.#idempotency.run(
      `${input.tenantId}:cfp:save:${input.submissionId}:${key}`,
      key,
      async () => {
        const current = await this.#getOwnedSubmission(input);
        if (current.version !== input.expectedVersion) {
          throw new CfpError("CONFLICT", "The submission has changed since it was loaded.");
        }
        const event = await this.#getEvent(input.tenantId, current.eventId);
        const form = await this.#getForm(input.tenantId, current.formId);
        ensureEventFormMatch(event, form);
        this.#ensureEditable(current, event);

        const next = sanitizeSubmission(
          submissionSchema.parse({
            ...current,
            formVersion: form.version,
            version: current.version + 1,
            completedSteps: addCompletedStep(current.completedSteps, input.completedStep),
            answers: input.answers ?? current.answers,
            participants: input.participants ?? current.participants,
            secondaryContacts: input.secondaryContacts ?? current.secondaryContacts,
            updatedAt: this.#clock.now().toISOString(),
          }),
          form,
        );
        if (next.participants.length > form.settings.speakerLimit) {
          throw new CfpError(
            "VALIDATION_FAILED",
            `This form allows at most ${form.settings.speakerLimit} speakers.`,
          );
        }
        await this.#repository.saveSubmissionVersion(
          {
            submission: next,
            reason: "draft_saved",
            actorId: input.ownerAccountId,
            idempotencyKey: key,
          },
          current.version,
        );
        return next;
      },
    );
  }

  async review(input: {
    tenantId: string;
    submissionId: string;
    ownerAccountId: string;
    idempotencyKey: string;
  }): Promise<SubmissionReview> {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.#idempotency.run(
      `${input.tenantId}:cfp:review:${input.submissionId}:${key}`,
      key,
      async () => {
        const submission = await this.#getOwnedSubmission(input);
        if (submission.status === "withdrawn") {
          throw new CfpError("INVALID_TRANSITION", "A withdrawn submission cannot be reviewed.");
        }
        const event = await this.#getEvent(input.tenantId, submission.eventId);
        const form = await this.#getForm(input.tenantId, submission.formId);
        ensureEventFormMatch(event, form);
        if (submission.status !== "reopened") {
          ensureOpen(event, this.#clock.now());
        }
        const sanitized = sanitizeSubmission(submission, form);
        const issues = validateReview(sanitized, form);
        const evaluated = evaluateFormRules(form, sanitized.answers);
        return {
          submissionId: submission.id,
          version: submission.version,
          canSubmit: issues.length === 0,
          issues,
          matchedRuleIds: evaluated.matchedRuleIds,
          routes: evaluated.routes,
        };
      },
    );
  }

  async submit(input: {
    tenantId: string;
    submissionId: string;
    ownerAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }): Promise<SubmitResult> {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.#idempotency.run(
      `${input.tenantId}:cfp:submit:${input.submissionId}:${key}`,
      key,
      async () => {
        const current = await this.#getOwnedSubmission(input);
        if (current.status === "submitted") {
          const form = await this.#getForm(input.tenantId, current.formId);
          await this.#effects.enqueueSubmissionConfirmation({
            submission: current,
            form,
            idempotencyKey: `${current.tenantId}:${current.id}:submission-confirmation`,
          });
          return {
            submission: current,
            receipt: {
              id: current.id,
              submissionId: current.id,
              version: current.version,
              submittedAt: current.submittedAt ?? current.updatedAt,
            },
            confirmationQueued: false,
          };
        }
        if (current.status !== "draft" && current.status !== "reopened") {
          throw new CfpError("INVALID_TRANSITION", "This submission cannot be submitted.");
        }
        if (current.version !== input.expectedVersion) {
          throw new CfpError("CONFLICT", "The submission has changed since it was loaded.");
        }
        const event = await this.#getEvent(input.tenantId, current.eventId);
        const form = await this.#getForm(input.tenantId, current.formId);
        ensureEventFormMatch(event, form);
        if (current.status !== "reopened") {
          if (form.status !== "published") {
            throw new CfpError("FORM_NOT_PUBLISHED", "The CFP form is not published.");
          }
          ensureOpen(event, this.#clock.now());
        }

        const sanitized = sanitizeSubmission(current, form);
        const issues = validateReview(sanitized, form);
        if (issues.length > 0) {
          throw new CfpError("VALIDATION_FAILED", "The submission is not ready to submit.", {
            issues,
          });
        }
        const now = this.#clock.now().toISOString();
        const submitted = submissionSchema.parse({
          ...sanitized,
          formVersion: form.version,
          version: current.version + 1,
          status: "submitted",
          submittedAt: now,
          updatedAt: now,
        });
        await this.#repository.saveSubmissionVersion(
          {
            submission: submitted,
            reason: "submitted",
            actorId: input.ownerAccountId,
            idempotencyKey: key,
          },
          current.version,
        );
        await this.#effects.enqueueSubmissionConfirmation({
          submission: submitted,
          form,
          idempotencyKey: `${submitted.tenantId}:${submitted.id}:submission-confirmation`,
        });
        return {
          submission: submitted,
          receipt: {
            id: submitted.id,
            submissionId: submitted.id,
            version: submitted.version,
            submittedAt: submitted.submittedAt ?? submitted.updatedAt,
          },
          confirmationQueued: true,
        };
      },
    );
  }

  async reopen(input: {
    tenantId: string;
    submissionId: string;
    organizerId: string;
    expectedVersion: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<Submission> {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.#idempotency.run(
      `${input.tenantId}:cfp:reopen:${input.submissionId}:${key}`,
      key,
      async () => {
        const current = await this.#getSubmission(input.tenantId, input.submissionId);
        if (current.status !== "submitted") {
          throw new CfpError("INVALID_TRANSITION", "Only a submitted record can be reopened.");
        }
        if (current.version !== input.expectedVersion) {
          throw new CfpError("CONFLICT", "The submission has changed since it was loaded.");
        }
        const reason = sanitizePlainText(input.reason);
        if (!reason) {
          throw new CfpError("VALIDATION_FAILED", "A reopen reason is required.");
        }
        const now = this.#clock.now().toISOString();
        const reopened = submissionSchema.parse({
          ...current,
          version: current.version + 1,
          status: "reopened",
          reopenedAt: now,
          updatedAt: now,
        });
        await this.#repository.saveSubmissionVersion(
          {
            submission: reopened,
            reason: "reopened",
            actorId: input.organizerId,
            idempotencyKey: key,
          },
          current.version,
          {
            tenantId: input.tenantId,
            eventId: current.eventId,
            submissionId: current.id,
            actorId: input.organizerId,
            action: "submission_reopened",
            reason,
            occurredAt: now,
          },
        );
        return reopened;
      },
    );
  }

  async withdraw(input: {
    tenantId: string;
    submissionId: string;
    ownerAccountId: string;
    expectedVersion: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<Submission> {
    const key = requireIdempotencyKey(input.idempotencyKey);
    return this.#idempotency.run(
      `${input.tenantId}:cfp:withdraw:${input.submissionId}:${key}`,
      key,
      async () => {
        const current = await this.#getOwnedSubmission(input);
        if (current.status === "withdrawn") {
          return current;
        }
        if (current.finalDecisionAt) {
          throw new CfpError(
            "INVALID_TRANSITION",
            "A submission cannot be withdrawn after a final decision.",
          );
        }
        if (current.version !== input.expectedVersion) {
          throw new CfpError("CONFLICT", "The submission has changed since it was loaded.");
        }
        const reason = sanitizePlainText(input.reason);
        if (!reason) {
          throw new CfpError("VALIDATION_FAILED", "A withdrawal reason is required.");
        }
        const now = this.#clock.now().toISOString();
        const withdrawn = submissionSchema.parse({
          ...current,
          version: current.version + 1,
          status: "withdrawn",
          withdrawnAt: now,
          updatedAt: now,
        });
        await this.#repository.saveSubmissionVersion(
          {
            submission: withdrawn,
            reason: "withdrawn",
            actorId: input.ownerAccountId,
            idempotencyKey: key,
          },
          current.version,
          {
            tenantId: input.tenantId,
            eventId: current.eventId,
            submissionId: current.id,
            actorId: input.ownerAccountId,
            action: "submission_withdrawn",
            reason,
            occurredAt: now,
          },
        );
        return withdrawn;
      },
    );
  }

  async #getEvent(tenantId: string, eventId: string): Promise<EventCfp> {
    const event = await this.#repository.getEvent(tenantId, eventId);
    if (!event) {
      throw new CfpError("NOT_FOUND", "The event was not found.");
    }
    ensureTenant(event.tenantId, tenantId);
    return event;
  }

  async #getForm(tenantId: string, formId: string): Promise<CfpForm> {
    const form = await this.#repository.getForm(tenantId, formId);
    if (!form) {
      throw new CfpError("NOT_FOUND", "The CFP form was not found.");
    }
    ensureTenant(form.tenantId, tenantId);
    return form;
  }

  async #getSubmission(tenantId: string, submissionId: string): Promise<Submission> {
    const submission = await this.#repository.getSubmission(tenantId, submissionId);
    if (!submission) {
      throw new CfpError("NOT_FOUND", "The submission was not found.");
    }
    ensureTenant(submission.tenantId, tenantId);
    return submission;
  }

  async #getOwnedSubmission(input: {
    tenantId: string;
    submissionId: string;
    ownerAccountId: string;
  }): Promise<Submission> {
    const submission = await this.#getSubmission(input.tenantId, input.submissionId);
    if (submission.ownerAccountId !== input.ownerAccountId) {
      throw new CfpError("FORBIDDEN", "The submission is not owned by this account.");
    }
    return submission;
  }

  #ensureEditable(submission: Submission, event: EventCfp): void {
    if (submission.status === "withdrawn") {
      throw new CfpError("INVALID_TRANSITION", "A withdrawn submission cannot be edited.");
    }
    if (submission.status === "reopened") {
      return;
    }
    ensureOpen(event, this.#clock.now());
  }
}
