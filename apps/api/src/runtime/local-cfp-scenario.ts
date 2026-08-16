import type { CfpService } from "../features/cfp/service";
import type { SubmissionReviewMaterial } from "../features/evaluations/types";
import {
  type LocalSubmissionScenario,
  localSubmissionScenario,
  submissionReviewMaterial,
} from "./local-review-scenario";

export interface LocalCfpScenarioOptions {
  readonly tenantId: string;
  readonly eventId: string;
  readonly formId: string;
  readonly submissionCount: number;
  /** Test-only deterministic fixture customization; production adapters never use this path. */
  readonly submissionFactory?: (index: number) => LocalSubmissionScenario;
}

async function seedSubmission(
  service: CfpService,
  options: LocalCfpScenarioOptions,
  index: number,
): Promise<SubmissionReviewMaterial> {
  const scenario = options.submissionFactory?.(index) ?? localSubmissionScenario(index);
  const idempotencyPrefix = `local-production-scenario-${String(index + 1).padStart(3, "0")}`;
  const draft = await service.createDraft({
    tenantId: options.tenantId,
    eventId: options.eventId,
    formId: options.formId,
    ownerAccountId: scenario.ownerAccountId,
    idempotencyKey: `${idempotencyPrefix}-create`,
  });
  let version = draft.version;
  const steps = ["welcome", "account", "submission"] as const;
  for (const [stepIndex, completedStep] of steps.entries()) {
    const saved = await service.saveDraft({
      tenantId: options.tenantId,
      eventId: options.eventId,
      submissionId: draft.id,
      ownerAccountId: scenario.ownerAccountId,
      expectedVersion: version,
      completedStep,
      ...(completedStep === "submission" ? { answers: scenario.answers } : {}),
      idempotencyKey: `${idempotencyPrefix}-step-${stepIndex}`,
    });
    version = saved.version;
  }
  const participantSaved = await service.saveDraft({
    tenantId: options.tenantId,
    eventId: options.eventId,
    submissionId: draft.id,
    ownerAccountId: scenario.ownerAccountId,
    expectedVersion: version,
    completedStep: "participant",
    participants: [
      {
        id: scenario.participant.id,
        firstName: scenario.participant.firstName,
        lastName: scenario.participant.lastName,
        email: scenario.participant.email,
        role: "primary",
        biography: scenario.participant.biography,
        answers: {},
      },
    ],
    secondaryContacts: [],
    idempotencyKey: `${idempotencyPrefix}-participant`,
  });
  const reviewStepSaved = await service.saveDraft({
    tenantId: options.tenantId,
    eventId: options.eventId,
    submissionId: draft.id,
    ownerAccountId: scenario.ownerAccountId,
    expectedVersion: participantSaved.version,
    completedStep: "review",
    idempotencyKey: `${idempotencyPrefix}-review-step`,
  });
  const review = await service.review({
    tenantId: options.tenantId,
    eventId: options.eventId,
    submissionId: draft.id,
    ownerAccountId: scenario.ownerAccountId,
    idempotencyKey: `${idempotencyPrefix}-review`,
  });
  if (!review.canSubmit) {
    const issues = review.issues.map(({ path, code }) => `${path}:${code}`).join(", ");
    throw new Error(
      `Local production scenario submission ${index + 1} failed CFP review: ${issues}`,
    );
  }
  await service.submit({
    tenantId: options.tenantId,
    eventId: options.eventId,
    submissionId: draft.id,
    ownerAccountId: scenario.ownerAccountId,
    expectedVersion: reviewStepSaved.version,
    idempotencyKey: `${idempotencyPrefix}-submit`,
  });
  return submissionReviewMaterial(draft.id, scenario);
}

export async function seedLocalCfpScenario(
  service: CfpService,
  options: LocalCfpScenarioOptions,
): Promise<readonly SubmissionReviewMaterial[]> {
  if (!Number.isInteger(options.submissionCount) || options.submissionCount < 1) {
    throw new RangeError("Local CFP scenario submission count must be a positive integer.");
  }
  const submissions: SubmissionReviewMaterial[] = [];
  const batchSize = 25;
  for (let start = 0; start < options.submissionCount; start += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, options.submissionCount - start) },
      (_, offset) => seedSubmission(service, options, start + offset),
    );
    submissions.push(...(await Promise.all(batch)));
  }
  return submissions;
}
