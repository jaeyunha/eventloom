"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "../../components/ui/button";
import { CharacterCount, Field, Input, Select } from "./cfp-field";
import { RichTextArea } from "../../components/ui/rich-text";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { Stepper } from "../../components/ui/stepper";
import {
  type CfpApi,
  CfpApiError,
  type CfpAuthenticatedSession,
  type CfpFileUploadResult,
  type CfpFormField,
  CfpMutationGate,
  type CfpMutationLease,
  type CfpPublishedForm,
  type CfpServerSubmission,
  createCfpApi,
  isCfpSchemaVersionConflict,
  type PublishedCfp,
} from "./api";
import styles from "./cfp-wizard.module.css";
import { clearCfpSubmissionState, getCfpSubmissionPointerStorageKey } from "./draft-persistence";
import { getCfpStepRoute, getNextCfpStep, getPreviousCfpStep } from "./routes";
import {
  CFP_STEPS,
  type CfpDraft,
  type CfpParticipant,
  type CfpSecondaryContact,
  type CfpStep,
  createEmptyDraft,
  createEmptyParticipant,
  syncPrimaryParticipant,
} from "./types";
import {
  getFirstInvalidStep,
  getPasswordChecks,
  type ValidationErrors,
  validateStep,
} from "./validation";

const STEP_LABELS: Record<CfpStep, string> = {
  welcome: "Welcome!",
  account: "Account",
  submission: "Submission",
  participants: "Participant",
  review: "Review",
};

const FORMAT_OPTIONS = ["Featured Keynote", "Breakout Session", "Panel", "Workshop"];
const TRACK_OPTIONS = ["Track 1", "Track 2", "Track 3", "Community"];
const LEVEL_OPTIONS = ["Introductory", "Intermediate", "Advanced", "All levels"];
const LANGUAGE_OPTIONS = ["English"];
const TAG_OPTIONS = ["Tag A", "Tag B", "Tag C", "Leadership"];
const CFP_COMPLETION_HANDOFF_PREFIX = "open-sessionboard:cfp-completion:v1";

export function getCfpCompletionHandoffStorageKey(
  organizationId: string,
  eventId: string,
  formId: string,
): string {
  return `${CFP_COMPLETION_HANDOFF_PREFIX}:${encodeURIComponent(
    organizationId,
  )}:${encodeURIComponent(eventId)}:${encodeURIComponent(formId)}`;
}

export function canResumeCfpSubmission(
  status: CfpServerSubmission["status"],
  step: CfpStep,
): boolean {
  return (
    status === "draft" || status === "reopened" || (status === "submitted" && step === "submission")
  );
}

export function rotateCfpCompletionIdentity(
  identity: { organizationId: string; eventId: string; formId: string },
  submissionId: string,
  localStorage: Pick<Storage, "removeItem">,
  sessionStorage: Pick<Storage, "setItem">,
): void {
  localStorage.removeItem(
    getCfpSubmissionPointerStorageKey(identity.organizationId, identity.eventId, identity.formId),
  );
  sessionStorage.setItem(
    getCfpCompletionHandoffStorageKey(identity.organizationId, identity.eventId, identity.formId),
    submissionId.trim(),
  );
}
type FormFieldOption =
  | string
  | {
      value: string;
      label?: string;
      description?: string;
      disabled?: boolean;
    };

type DynamicAnswers = Record<string, unknown>;
type ParticipantAnswers = Record<string, DynamicAnswers>;

interface EvaluatedFieldState {
  visible: boolean;
  required: boolean;
}

interface FileUploadState {
  status: "idle" | "pending" | "ready" | "error";
  assetId?: string;
  name?: string;
  message?: string;
}

type FileUploadStates = Record<string, FileUploadState>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionDetails(option: FormFieldOption): {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
} {
  if (typeof option === "string") return { value: option, label: option };
  return {
    value: option.value,
    label: option.label ?? option.value,
    ...(option.description === undefined ? {} : { description: option.description }),
    ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
  };
}

function fieldOptions(field: CfpFormField): Array<ReturnType<typeof optionDetails>> {
  return field.options.flatMap((option) => {
    if (typeof option === "string") return [optionDetails(option)];
    if (!isRecord(option) || typeof option.value !== "string") return [];
    return [
      optionDetails({
        value: option.value,
        ...(typeof option.label === "string" ? { label: option.label } : {}),
        ...(typeof option.description === "string" ? { description: option.description } : {}),
        ...(typeof option.disabled === "boolean" ? { disabled: option.disabled } : {}),
      }),
    ];
  });
}

function fieldConfig(field: CfpFormField, key: string): unknown {
  if (isRecord(field.fileRequest) && key in field.fileRequest) return field.fileRequest[key];
  if (isRecord(field.config) && key in field.config) return field.config[key];
  const rawField = field as unknown as Record<string, unknown>;
  return key in rawField ? rawField[key] : undefined;
}

function isFileField(field: CfpFormField): boolean {
  return ["file", "file_request", "upload"].includes(field.kind.toLowerCase().replaceAll("-", "_"));
}
function fieldRequired(field: CfpFormField): boolean {
  return field.required || (isFileField(field) && field.fileRequest?.required === true);
}

function scalarValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const leftValues = scalarValues(left);
  const rightValues = scalarValues(right);
  if (leftValues.length === 0 || rightValues.length === 0) return Object.is(left, right);
  return leftValues.some((value) => rightValues.includes(value));
}

function evaluateCondition(condition: unknown, answers: DynamicAnswers): boolean {
  if (!isRecord(condition)) return false;
  if (condition.type === "group") {
    const children = Array.isArray(condition.conditions) ? condition.conditions : [];
    const results = children.map((child) => evaluateCondition(child, answers));
    return condition.operator === "any" || condition.operator === "OR"
      ? results.some(Boolean)
      : results.length > 0 && results.every(Boolean);
  }
  if (condition.type !== "predicate" && condition.type !== "condition") return false;
  const fieldKey =
    typeof condition.fieldKey === "string"
      ? condition.fieldKey
      : typeof condition.field === "string"
        ? condition.field
        : "";
  if (!fieldKey) return false;
  const current = answers[fieldKey];
  const expected = condition.value;
  switch (condition.operator) {
    case "is_empty":
    case "empty":
      return scalarValues(current).length === 0;
    case "is_not_empty":
    case "not_empty":
      return scalarValues(current).length > 0;
    case "not_equals":
    case "is not":
    case "neq":
      return !valuesEqual(current, expected);
    case "in":
      return Array.isArray(expected) && expected.some((item) => valuesEqual(current, item));
    case "not_in":
      return Array.isArray(expected) && !expected.some((item) => valuesEqual(current, item));
    case "contains":
      return scalarValues(current).some((value) =>
        scalarValues(expected).some((candidate) => value.includes(candidate)),
      );
    default:
      return valuesEqual(current, expected);
  }
}

function evaluatePublishedFields(
  form: CfpPublishedForm,
  answers: DynamicAnswers,
): {
  fields: Map<string, EvaluatedFieldState>;
  sections: Map<string, boolean>;
} {
  const rules = [...(form.rules ?? [])].sort((left, right) => {
    const leftPriority = typeof left.priority === "number" ? left.priority : 0;
    const rightPriority = typeof right.priority === "number" ? right.priority : 0;
    return leftPriority - rightPriority;
  });
  const conditionalFieldKeys = new Set(
    rules.flatMap((rule) =>
      isRecord(rule) && Array.isArray(rule.actions)
        ? rule.actions.flatMap((action) =>
            isRecord(action) && action.type === "show_field" && typeof action.fieldKey === "string"
              ? [action.fieldKey]
              : [],
          )
        : [],
    ),
  );
  const fields = new Map(
    form.submissionFields
      .concat(form.participantFields)
      .map((field) => [
        field.key,
        { visible: !conditionalFieldKeys.has(field.key), required: fieldRequired(field) },
      ]),
  );
  const sections = new Map(form.sections.map((section) => [section.id, true]));
  for (const rule of rules) {
    const when = isRecord(rule) ? (rule.when ?? rule.condition) : undefined;
    if (!evaluateCondition(when, answers)) continue;
    const actions = isRecord(rule) && Array.isArray(rule.actions) ? rule.actions : [];
    for (const action of actions) {
      if (!isRecord(action) || typeof action.type !== "string") continue;
      const fieldKey = typeof action.fieldKey === "string" ? action.fieldKey : undefined;
      const sectionId = typeof action.sectionId === "string" ? action.sectionId : undefined;
      if (fieldKey && fields.has(fieldKey)) {
        const current = fields.get(fieldKey);
        if (!current) continue;
        if (action.type === "show_field") current.visible = true;
        if (action.type === "hide_field" || action.type === "skip_field") current.visible = false;
        if (action.type === "require_field") current.required = true;
      }
      if (sectionId && sections.has(sectionId)) {
        if (action.type === "show_section") sections.set(sectionId, true);
        if (action.type === "hide_section" || action.type === "skip_section") {
          sections.set(sectionId, false);
        }
      }
    }
  }
  return { fields, sections };
}

function fileStateKey(fieldKey: string, participantIndex?: number): string {
  return participantIndex === undefined ? fieldKey : `participants.${participantIndex}.${fieldKey}`;
}

interface CfpWizardProps {
  eventSlug: string;
  step: CfpStep;
  organizationId?: string;
  formId?: string;
  api?: CfpApi;
}

const WIZARD_STEPS = CFP_STEPS.map((step) => ({
  id: step,
  label: STEP_LABELS[step],
}));

function ErrorSummary({ errors }: { errors: ValidationErrors }) {
  const messages = [...new Set(Object.values(errors))];
  if (messages.length === 0) return null;

  return (
    <div className={styles.errorSummary} role="alert" tabIndex={-1}>
      <strong>Check the highlighted fields.</strong>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

function newId(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

interface CfpMutationOperation {
  lease: CfpMutationLease;
  localRevision: number;
  createIdempotencyKey: string;
  saveIdempotencyKey: string;
  reviewIdempotencyKey: string;
  submitIdempotencyKey: string;
}

class CfpVerificationRequiredError extends Error {
  constructor() {
    super("Account verification is required before the CFP can continue.");
    this.name = "CfpVerificationRequiredError";
  }
}

function mutationIdempotencyKey(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function mutationMayHaveCommitted(error: unknown): boolean {
  if (error instanceof CfpApiError) {
    return error.code === "CFP_REQUEST_TIMEOUT" || error.status >= 500;
  }
  return true;
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof CfpApiError) return error.message;
  if (error instanceof TypeError) {
    return "The CFP request could not reach the server. Check your connection and try again.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function mergeParticipant(
  draft: CfpDraft,
  index: number,
  patch: Partial<CfpParticipant>,
): CfpDraft {
  return {
    ...draft,
    participants: draft.participants.map((participant, participantIndex) =>
      participantIndex === index ? { ...participant, ...patch } : participant,
    ),
  };
}

function mergeSecondaryContact(
  draft: CfpDraft,
  index: number,
  patch: Partial<CfpSecondaryContact>,
): CfpDraft {
  return {
    ...draft,
    secondaryContacts: draft.secondaryContacts.map((contact, contactIndex) =>
      contactIndex === index ? { ...contact, ...patch } : contact,
    ),
  };
}

function configuredCfpIdentity(
  eventSlug: string,
  organizationId?: string,
  formId?: string,
): { organizationId: string; eventId: string; formId?: string } {
  const normalizedEventSlug = eventSlug.trim();
  const resolvedOrganizationId =
    organizationId?.trim() || process.env.NEXT_PUBLIC_ORGANIZATION_ID?.trim() || "";
  const resolvedFormId = formId?.trim() || process.env.NEXT_PUBLIC_CFP_FORM_ID?.trim() || undefined;
  if (!normalizedEventSlug) {
    throw new Error("CFP identity is not configured because the event slug is missing.");
  }
  if (!resolvedOrganizationId) {
    const localMode =
      process.env.NEXT_PUBLIC_APP_ENV === "local" || process.env.APP_ENV === "local";
    if (localMode) {
      return {
        organizationId: "local-organization",
        eventId: normalizedEventSlug,
        formId: normalizedEventSlug === "demo-event" ? "main-cfp" : `${normalizedEventSlug}-cfp`,
      };
    }
    throw new Error(
      `CFP identity is not configured for '${normalizedEventSlug}'. Set NEXT_PUBLIC_ORGANIZATION_ID.`,
    );
  }
  return {
    organizationId: resolvedOrganizationId,
    eventId: normalizedEventSlug,
    ...(resolvedFormId ? { formId: resolvedFormId } : {}),
  };
}

function answerString(answers: Record<string, unknown>, key: string): string {
  const value = answers[key];
  return typeof value === "string" ? value : "";
}
function answerBoolean(answers: Record<string, unknown>, key: string): boolean {
  return answers[key] === true;
}

function draftFromSubmission(eventSlug: string, submission: CfpServerSubmission): CfpDraft {
  const primary =
    submission.participants.find((participant) => participant.role === "primary") ??
    submission.participants[0];
  return {
    schemaVersion: 1,
    eventSlug,
    account: {
      email: answerString(submission.answers, "accountEmail") || primary?.email || "",
      firstName: answerString(submission.answers, "accountFirstName") || primary?.firstName || "",
      lastName: answerString(submission.answers, "accountLastName") || primary?.lastName || "",
      acceptedTerms:
        answerBoolean(submission.answers, "accountAcceptedTerms") ||
        submission.completedSteps.includes("account"),
    },
    submission: {
      title: answerString(submission.answers, "title"),
      description:
        answerString(submission.answers, "abstract") ||
        answerString(submission.answers, "description"),
      format: answerString(submission.answers, "format"),
      tags: Array.isArray(submission.answers.tags)
        ? submission.answers.tags.filter((value): value is string => typeof value === "string")
        : [],
      track: answerString(submission.answers, "track"),
      level: answerString(submission.answers, "level"),
      language: answerString(submission.answers, "language") || "English",
    },
    participants:
      submission.participants.length > 0
        ? submission.participants.map((participant) => ({
            id: participant.id,
            role: participant.role === "primary" ? "Speaker" : "Co-speaker",
            firstName: participant.firstName,
            lastName: participant.lastName,
            email: participant.email,
            mobilePhone: "",
            biography: participant.biography,
          }))
        : [
            {
              id: "primary-speaker",
              role: "Speaker",
              firstName: answerString(submission.answers, "accountFirstName"),
              lastName: answerString(submission.answers, "accountLastName"),
              email: answerString(submission.answers, "accountEmail"),
              mobilePhone: "",
              biography: "",
            },
          ],
    secondaryContacts: submission.secondaryContacts.map((contact) => {
      const [firstName = "", ...lastName] = contact.name.split(" ");
      return { id: contact.id, firstName, lastName: lastName.join(" "), email: contact.email };
    }),
    updatedAt: submission.updatedAt,
    receipt:
      submission.status === "submitted" && submission.submittedAt
        ? { id: submission.id, submittedAt: submission.submittedAt }
        : null,
  };
}
function draftWithAuthenticatedSession(
  draft: CfpDraft,
  session: CfpAuthenticatedSession,
): CfpDraft {
  return {
    ...draft,
    account: {
      ...draft.account,
      email: draft.account.email || session.email,
      firstName: draft.account.firstName || session.firstName,
      lastName: draft.account.lastName || session.lastName,
    },
  };
}
function submissionAnswersFromServer(submission: CfpServerSubmission): DynamicAnswers {
  return { ...submission.answers };
}

function participantAnswersFromServer(submission: CfpServerSubmission): ParticipantAnswers {
  return Object.fromEntries(
    submission.participants.map((participant) => [participant.id, { ...participant.answers }]),
  );
}

function submissionPayload(
  draft: CfpDraft,
  dynamicAnswers: DynamicAnswers,
  participantAnswers: ParticipantAnswers,
): {
  answers: Record<string, unknown>;
  participants: CfpServerSubmission["participants"];
  secondaryContacts: CfpServerSubmission["secondaryContacts"];
} {
  const answers = { ...dynamicAnswers };
  return {
    answers: {
      ...answers,
      title: draft.submission.title,
      abstract: draft.submission.description,
      description: draft.submission.description,
      format: draft.submission.format,
      tags: draft.submission.tags,
      track: draft.submission.track,
      level: draft.submission.level,
      language: draft.submission.language,
      accountEmail: draft.account.email,
      accountFirstName: draft.account.firstName,
      accountLastName: draft.account.lastName,
      accountAcceptedTerms: draft.account.acceptedTerms,
    },
    participants: draft.participants.map((participant) => {
      const customAnswers = participantAnswers[participant.id] ?? {};
      return {
        id: participant.id,
        firstName: participant.firstName,
        lastName: participant.lastName,
        email: participant.email,
        role: participant.role === "Speaker" ? "primary" : "co_speaker",
        biography: participant.biography,
        answers: { ...customAnswers },
      };
    }),
    secondaryContacts: draft.secondaryContacts.map((contact) => ({
      id: contact.id,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      email: contact.email,
    })),
  };
}

function publishedOptions(form: CfpPublishedForm, key: string, fallback: string[]): string[] {
  const field = form.submissionFields.find((candidate) => candidate.key === key);
  const options = field ? fieldOptions(field).map((option) => option.label) : [];
  return options.length > 0 ? options : fallback;
}
function reviewValueString(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => reviewValueString(item))
      .filter((item) => item !== "Not specified");
    return items.length > 0 ? items.join(", ") : "Not specified";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim().length > 0) return value;
  return "Not specified";
}

export function cfpReviewAudienceLevel(
  form: CfpPublishedForm | undefined,
  answers: DynamicAnswers,
  legacyLevel: string,
): { label: string; value: string } {
  const customField = form?.submissionFields.find((field) => field.id === "field-audience-level");
  if (customField !== undefined) {
    return {
      label: customField.label,
      value: reviewValueString(answers[customField.key]),
    };
  }
  return { label: "Level", value: reviewValueString(legacyLevel) };
}
export function cfpConfirmationEmailMessage(recipient: string): string {
  const delivery =
    recipient.trim().length > 0 ? ` is queued for ${recipient.trim()}` : " is queued";
  return `A confirmation email${delivery} and will include the event name and talk title.`;
}

function submissionValue(draft: CfpDraft, answers: DynamicAnswers, key: string): unknown {
  switch (key) {
    case "title":
      return draft.submission.title;
    case "abstract":
    case "description":
      return draft.submission.description;
    case "format":
      return draft.submission.format;
    case "tags":
      return draft.submission.tags;
    case "track":
      return draft.submission.track;
    case "level":
      return draft.submission.level;
    case "language":
      return draft.submission.language;
    case "accountEmail":
      return draft.account.email;
    case "accountFirstName":
      return draft.account.firstName;
    case "accountLastName":
      return draft.account.lastName;
    case "accountAcceptedTerms":
      return draft.account.acceptedTerms;
    default:
      return answers[key];
  }
}

function participantValue(
  participant: CfpParticipant,
  answers: DynamicAnswers,
  key: string,
): unknown {
  switch (key) {
    case "firstName":
      return participant.firstName;
    case "lastName":
      return participant.lastName;
    case "email":
      return participant.email;
    case "biography":
      return participant.biography;
    case "mobilePhone":
      return participant.mobilePhone;
    default:
      return answers[key];
  }
}
function formSubmissionErrorKey(key: string): string {
  if (key === "title") return "submission.title";
  if (key === "abstract" || key === "description") return "submission.description";
  return `submission.${key}`;
}

function fieldIsEmpty(value: unknown): boolean {
  if (typeof value === "boolean") return value === false;
  if (Array.isArray(value)) return value.length === 0;
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

function fieldValueForValidation(field: CfpFormField, value: unknown): unknown {
  if (isFileField(field)) return value;
  return value;
}

function dynamicFormErrors(
  form: CfpPublishedForm,
  draft: CfpDraft,
  answers: DynamicAnswers,
  participantAnswers: ParticipantAnswers,
  fileStates: FileUploadStates,
  step: CfpStep,
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (step === "submission" || step === "review") {
    const evaluated = evaluatePublishedFields(form, {
      ...answers,
      accountEmail: draft.account.email,
      accountFirstName: draft.account.firstName,
      accountLastName: draft.account.lastName,
    });
    for (const field of form.submissionFields) {
      const state = evaluated.fields.get(field.key) ?? {
        visible: true,
        required: fieldRequired(field),
      };
      if (!state.visible) continue;
      const value = fieldValueForValidation(field, submissionValue(draft, answers, field.key));
      const key = formSubmissionErrorKey(field.key);
      const fileState = fileStates[fileStateKey(field.key)];
      if (isFileField(field) && fileState?.status === "error") {
        errors[key] = fileState.message ?? `${field.label} could not be uploaded.`;
        continue;
      }
      if (isFileField(field) && fileState?.status === "pending") {
        errors[key] = `${field.label} is still uploading.`;
        continue;
      }
      if (state.required && fieldIsEmpty(value)) {
        errors[key] = `${field.label} is required.`;
        continue;
      }
      if (field.kind === "email" && typeof value === "string" && value.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
          errors[key] = `Enter a valid ${field.label.toLowerCase()}.`;
        }
      }
      if (["select", "multi_select"].includes(field.kind) && field.options.length > 0) {
        const allowed = new Set(fieldOptions(field).map((option) => option.value));
        const selected = scalarValues(value);
        if (selected.some((item) => !allowed.has(item))) {
          errors[key] = `Choose a valid option for ${field.label}.`;
        }
      }
    }
  }
  if (step === "participants" || step === "review") {
    for (const [index, participant] of draft.participants.entries()) {
      const customAnswers = participantAnswers[participant.id] ?? {};
      const participantFormAnswers = {
        ...answers,
        ...customAnswers,
        firstName: participant.firstName,
        lastName: participant.lastName,
        email: participant.email,
        biography: participant.biography,
        mobilePhone: participant.mobilePhone,
      };
      const evaluated = evaluatePublishedFields(form, participantFormAnswers);
      for (const field of form.participantFields) {
        const state = evaluated.fields.get(field.key) ?? {
          visible: true,
          required: fieldRequired(field),
        };
        if (!state.visible) continue;
        const value = participantValue(participant, customAnswers, field.key);
        const key = `participants.${index}.${field.key}`;
        const fileState = fileStates[fileStateKey(field.key, index)];
        if (isFileField(field) && fileState?.status === "error") {
          errors[key] = fileState.message ?? `${field.label} could not be uploaded.`;
          continue;
        }
        if (isFileField(field) && fileState?.status === "pending") {
          errors[key] = `${field.label} is still uploading.`;
          continue;
        }
        if (state.required && fieldIsEmpty(value)) {
          errors[key] = `${field.label} is required.`;
          continue;
        }
        if (field.kind === "email" && typeof value === "string" && value.trim()) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
            errors[key] = `Enter a valid ${field.label.toLowerCase()}.`;
          }
        }
      }
    }
  }
  return errors;
}

function removeFixedErrorsForDynamicForm(
  errors: ValidationErrors,
  form: CfpPublishedForm | undefined,
  step: CfpStep,
): ValidationErrors {
  if (!form || form.submissionFields.length === 0 || (step !== "submission" && step !== "review")) {
    return errors;
  }
  const keys = new Set(form.submissionFields.map((field) => field.key));
  const aliases: Record<string, string[]> = {
    "submission.title": ["title"],
    "submission.description": ["abstract", "description"],
    "submission.format": ["format"],
    "submission.tags": ["tags"],
    "submission.track": ["track"],
    "submission.level": ["level"],
    "submission.language": ["language"],
  };
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([key]) =>
        !key.startsWith("submission.") || (aliases[key] ?? []).some((alias) => keys.has(alias)),
    ),
  );
}
function firstInvalidPublishedStep(
  form: CfpPublishedForm,
  draft: CfpDraft,
  answers: DynamicAnswers,
  participantAnswers: ParticipantAnswers,
  fileStates: FileUploadStates,
): CfpStep | null {
  const accountErrors = validateStep("account", draft, "Aa1!aaaa");
  delete accountErrors["account.password"];
  if (Object.keys(accountErrors).length > 0) return "account";
  const submissionErrors = {
    ...removeFixedErrorsForDynamicForm(validateStep("submission", draft), form, "submission"),
    ...dynamicFormErrors(form, draft, answers, participantAnswers, fileStates, "submission"),
  };
  if (Object.keys(submissionErrors).length > 0) return "submission";
  const participantErrors = {
    ...validateStep("participants", draft),
    ...dynamicFormErrors(form, draft, answers, participantAnswers, fileStates, "participants"),
  };
  if (Object.keys(participantErrors).length > 0) return "participants";
  return null;
}
function formSubmissionLimit(form?: CfpPublishedForm): number {
  const value = form?.settings.maxSubmissionsPerAccount;
  return typeof value === "number" && Number.isFinite(value) ? value : 3;
}
function cfpIsClosed(event: PublishedCfp["event"] | undefined): boolean {
  return event !== undefined && Date.parse(event.closesAt) <= Date.now();
}
function formatCfpWindowDate(value: string, timeZone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(timestamp));
  } catch {
    return value;
  }
}

export function CfpWizard({
  eventSlug,
  step,
  organizationId,
  formId,
  api: providedApi,
}: CfpWizardProps) {
  const router = useRouter();
  const initialDraft = useMemo(() => createEmptyDraft(eventSlug), [eventSlug]);
  const identity = useMemo(() => {
    try {
      return configuredCfpIdentity(eventSlug, organizationId, formId);
    } catch {
      return null;
    }
  }, [eventSlug, organizationId, formId]);
  const api = useMemo(() => providedApi ?? createCfpApi(""), [providedApi]);
  const [draft, setDraft] = useState<CfpDraft>(initialDraft);
  const [dynamicAnswers, setDynamicAnswers] = useState<DynamicAnswers>({});
  const [participantAnswers, setParticipantAnswers] = useState<ParticipantAnswers>({});
  const [fileUploadStates, setFileUploadStates] = useState<FileUploadStates>({});
  const [published, setPublished] = useState<PublishedCfp | null>(null);
  const [authenticatedSession, setAuthenticatedSession] = useState<CfpAuthenticatedSession | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [mutationPending, setMutationPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const fileDraftCreationRef = useRef<Promise<CfpServerSubmission> | null>(null);
  const versionRef = useRef(1);
  const formVersionRef = useRef<number | null>(null);
  const draftRevisionRef = useRef(0);
  const mutationGateRef = useRef<CfpMutationGate | null>(null);
  const mutationOperationRef = useRef<CfpMutationOperation | null>(null);
  if (mutationGateRef.current === null) mutationGateRef.current = new CfpMutationGate();
  const [staleFormConflict, setStaleFormConflict] = useState<{
    submissionId: string | null;
    pinnedDraftUnavailable: boolean;
  } | null>(null);
  const submissionsClosed = cfpIsClosed(published?.event);
  function noteLocalChange(): void {
    draftRevisionRef.current += 1;
    if (!mutationGateRef.current?.isActive()) {
      mutationOperationRef.current = null;
      setSaveState("idle");
    }
    setSaveError(null);
    setErrors({});
  }

  function beginMutation(): CfpMutationOperation | null {
    const lease = mutationGateRef.current?.begin();
    if (!lease) return null;
    const operation = mutationOperationRef.current ?? {
      lease,
      localRevision: draftRevisionRef.current,
      createIdempotencyKey: mutationIdempotencyKey("cfp-draft"),
      saveIdempotencyKey: mutationIdempotencyKey("cfp-save"),
      reviewIdempotencyKey: mutationIdempotencyKey("cfp-review"),
      submitIdempotencyKey: mutationIdempotencyKey("cfp-submit"),
    };
    operation.lease = lease;
    mutationOperationRef.current = operation;
    setMutationPending(true);
    setSaveError(null);
    return operation;
  }

  function finishMutation(operation: CfpMutationOperation, keepForRetry: boolean): void {
    mutationGateRef.current?.finish(operation.lease);
    if (!mutationGateRef.current?.isActive()) setMutationPending(false);
    if (!keepForRetry && mutationOperationRef.current === operation) {
      mutationOperationRef.current = null;
    }
  }

  function markAuthoritativeSubmission(
    saved: CfpServerSubmission,
    localRevision: number,
    nextDraft: CfpDraft,
    completedStep: "account" | "submission" | "participant" | "review" | undefined,
    operation: CfpMutationOperation | undefined,
  ): void {
    if (operation && !mutationGateRef.current?.isCurrent(operation.lease)) return;
    versionRef.current = saved.version;
    formVersionRef.current = saved.formVersion;
    if (draftRevisionRef.current !== localRevision) return;
    setDynamicAnswers(submissionAnswersFromServer(saved));
    setParticipantAnswers(participantAnswersFromServer(saved));
    const mappedDraft = draftFromSubmission(eventSlug, saved);
    setDraft(
      completedStep === "participant"
        ? mappedDraft
        : {
            ...mappedDraft,
            account: nextDraft.account,
            submission: nextDraft.submission,
            participants: nextDraft.participants,
            secondaryContacts: nextDraft.secondaryContacts,
          },
    );
  }

  async function reconcileAuthoritativeVersion(): Promise<void> {
    if (!identity || !submissionIdRef.current) return;
    const saved = await api.loadDraft({
      organizationId: identity.organizationId,
      eventId: identity.eventId,
      submissionId: submissionIdRef.current,
    });
    if (!mutationGateRef.current?.isActive()) return;
    submissionIdRef.current = saved.id;
    versionRef.current = saved.version;
    formVersionRef.current = saved.formVersion;
  }

  useEffect(() => {
    setAuthenticatedSession(null);
    let active = true;
    const controller = new AbortController();
    if (!identity) {
      setSaveState("error");
      setHydrated(true);
      return () => {
        active = false;
        fileDraftCreationRef.current = null;
        controller.abort();
        mutationGateRef.current?.invalidate();
      };
    }

    void (async () => {
      try {
        const publishedCfp = await api.getPublished({ ...identity, signal: controller.signal });
        let session: CfpAuthenticatedSession | null = null;
        try {
          session =
            typeof api.getSession === "function"
              ? await api.getSession({ signal: controller.signal })
              : null;
        } catch {
          // A session lookup failure must not block anonymous CFP access.
        }
        if (!active) return;
        setAuthenticatedSession(session);
        setPublished(publishedCfp);
        const activeFormId = identity.formId ?? publishedCfp.form.id;
        const pointerKey = getCfpSubmissionPointerStorageKey(
          identity.organizationId,
          identity.eventId,
          activeFormId,
        );
        if (step === "welcome" || step === "account") {
          window.sessionStorage.removeItem(
            getCfpCompletionHandoffStorageKey(
              identity.organizationId,
              identity.eventId,
              activeFormId,
            ),
          );
        }
        const pointer = window.localStorage.getItem(pointerKey);
        if (pointer) {
          try {
            const saved = await api.loadDraft({
              organizationId: identity.organizationId,
              eventId: identity.eventId,
              submissionId: pointer,
              signal: controller.signal,
            });
            if (!active) return;
            if (canResumeCfpSubmission(saved.status, step)) {
              submissionIdRef.current = saved.id;
              versionRef.current = saved.version;
              formVersionRef.current = saved.formVersion;
              setStaleFormConflict(null);
              setDynamicAnswers(submissionAnswersFromServer(saved));
              setParticipantAnswers(participantAnswersFromServer(saved));
              setDraft(
                session
                  ? draftWithAuthenticatedSession(draftFromSubmission(eventSlug, saved), session)
                  : draftFromSubmission(eventSlug, saved),
              );
            } else {
              window.localStorage.removeItem(pointerKey);
              submissionIdRef.current = null;
              versionRef.current = 1;
              formVersionRef.current = publishedCfp.form.version;
              setStaleFormConflict(null);
              setDynamicAnswers({});
              setParticipantAnswers({});
              setFileUploadStates({});
              setErrors({});
              setPassword("");
              setSaveState("idle");
              setSaveError(null);
              setDraft(
                session ? draftWithAuthenticatedSession(initialDraft, session) : initialDraft,
              );
            }
          } catch (error) {
            if (isCfpSchemaVersionConflict(error)) {
              formVersionRef.current = null;
              setStaleFormConflict({ submissionId: pointer, pinnedDraftUnavailable: true });
              setHydrated(true);
              return;
            }
            if (!(error instanceof CfpApiError) || (error.status !== 401 && error.status !== 404)) {
              throw error;
            }
            window.localStorage.removeItem(pointerKey);
            submissionIdRef.current = null;
            versionRef.current = 1;
            formVersionRef.current = publishedCfp.form.version;
            setStaleFormConflict(null);
            setDynamicAnswers({});
            setParticipantAnswers({});
            setFileUploadStates({});
            setErrors({});
            setPassword("");
            setSaveState("idle");
            setSaveError(null);
            setDraft(session ? draftWithAuthenticatedSession(initialDraft, session) : initialDraft);
          }
        } else {
          formVersionRef.current = publishedCfp.form.version;
          submissionIdRef.current = null;
          versionRef.current = 1;
          setStaleFormConflict(null);
          setDraft(session ? draftWithAuthenticatedSession(initialDraft, session) : initialDraft);
          setDynamicAnswers({});
          setParticipantAnswers({});
          setFileUploadStates({});
          setErrors({});
          setPassword("");
          setSaveState("idle");
          setSaveError(null);
        }
        setHydrated(true);
      } catch (error) {
        if (!active) return;
        if (isCfpSchemaVersionConflict(error)) {
          formVersionRef.current = null;
          setStaleFormConflict({
            submissionId: submissionIdRef.current,
            pinnedDraftUnavailable: submissionIdRef.current === null,
          });
        }
        setSaveState("error");
        setSaveError(
          mutationErrorMessage(
            error,
            "The published CFP could not be loaded. Refresh to try again.",
          ),
        );
        setHydrated(true);
      }
    })();

    return () => {
      active = false;
      fileDraftCreationRef.current = null;
      controller.abort();
      mutationGateRef.current?.invalidate();
    };
  }, [api, eventSlug, identity, initialDraft, step]);

  function updateDraft(update: (current: CfpDraft) => CfpDraft): void {
    setDraft((current) => ({ ...update(current), updatedAt: new Date().toISOString() }));
    noteLocalChange();
    setErrors({});
  }
  function setSubmissionAnswer(key: string, value: unknown): void {
    setDynamicAnswers((current) => ({ ...current, [key]: value }));
    if (
      ["title", "abstract", "description", "format", "tags", "track", "level", "language"].includes(
        key,
      )
    ) {
      updateDraft((current) => {
        if (key === "title") {
          return { ...current, submission: { ...current.submission, title: String(value ?? "") } };
        }
        if (key === "abstract" || key === "description") {
          return {
            ...current,
            submission: { ...current.submission, description: String(value ?? "") },
          };
        }
        if (key === "tags") {
          return {
            ...current,
            submission: {
              ...current.submission,
              tags: Array.isArray(value)
                ? value.filter((item): item is string => typeof item === "string")
                : [],
            },
          };
        }
        return {
          ...current,
          submission: {
            ...current.submission,
            [key]: String(value ?? ""),
          },
        };
      });
      return;
    }
    noteLocalChange();
    setErrors({});
  }

  function setParticipantAnswer(participantId: string, key: string, value: unknown): void {
    setParticipantAnswers((current) => ({
      ...current,
      [participantId]: { ...(current[participantId] ?? {}), [key]: value },
    }));
    noteLocalChange();
    setErrors({});
  }

  function setFileUploadState(key: string, state: FileUploadState): void {
    setFileUploadStates((current) => ({ ...current, [key]: state }));
    noteLocalChange();
    setErrors({});
  }
  async function handleFileUpload(
    field: CfpFormField,
    participantId: string | undefined,
    file: File,
  ): Promise<CfpFileUploadResult> {
    if (!identity) throw new Error("CFP identity is not configured.");
    const uploadFile = api.uploadFile;
    if (uploadFile === undefined) {
      throw new CfpApiError(
        "CFP_FILE_UPLOAD_UNAVAILABLE",
        "Private file uploads are not configured.",
        400,
      );
    }
    const activeFormId = identity.formId ?? published?.form.id;
    if (!activeFormId) throw new Error("The published CFP form is unavailable.");
    let submissionId = submissionIdRef.current;
    if (!submissionId) {
      let creation = fileDraftCreationRef.current;
      if (creation === null) {
        creation = api.createDraft({
          organizationId: identity.organizationId,
          eventId: identity.eventId,
          formId: activeFormId,
          idempotencyKey: mutationIdempotencyKey("cfp-file-draft"),
        });
        fileDraftCreationRef.current = creation;
      }
      let created: CfpServerSubmission;
      try {
        created = await creation;
      } finally {
        if (fileDraftCreationRef.current === creation) fileDraftCreationRef.current = null;
      }
      submissionId = created.id;
      submissionIdRef.current = created.id;
      versionRef.current = created.version;
      formVersionRef.current = created.formVersion;
      window.localStorage.setItem(
        getCfpSubmissionPointerStorageKey(identity.organizationId, identity.eventId, activeFormId),
        created.id,
      );
    }
    const result = await uploadFile({
      organizationId: identity.organizationId,
      eventId: identity.eventId,
      submissionId,
      fieldKey: field.key,
      ...(participantId === undefined ? {} : { participantId }),
      file,
      idempotencyKey: mutationIdempotencyKey("cfp-file-upload"),
    });
    if (result.state !== "ready" || result.assetId.trim().length === 0) {
      throw new CfpApiError(
        "CFP_FILE_UPLOAD_REJECTED",
        "The uploaded file was rejected during finalization.",
        409,
      );
    }
    return result;
  }

  async function persistServerDraft(
    nextDraft: CfpDraft,
    completedStep?: "account" | "submission" | "participant" | "review",
    operation?: CfpMutationOperation,
  ): Promise<CfpServerSubmission> {
    if (!identity) throw new Error("CFP identity is not configured.");
    const activeFormId = identity.formId ?? published?.form.id;
    if (!activeFormId) throw new Error("The published CFP form is unavailable.");
    const localRevision = draftRevisionRef.current;
    let submissionId = submissionIdRef.current;
    let version = versionRef.current;
    let formVersion = formVersionRef.current;
    if (!submissionId) {
      const created = await api.createDraft({
        organizationId: identity.organizationId,
        eventId: identity.eventId,
        formId: activeFormId,
        ...(operation === undefined ? {} : { idempotencyKey: operation.createIdempotencyKey }),
      });
      if (operation && !mutationGateRef.current?.isCurrent(operation.lease)) return created;
      submissionId = created.id;
      submissionIdRef.current = created.id;
      version = created.version;
      versionRef.current = created.version;
      formVersion = created.formVersion;
      formVersionRef.current = created.formVersion;
      window.localStorage.setItem(
        getCfpSubmissionPointerStorageKey(identity.organizationId, identity.eventId, activeFormId),
        created.id,
      );
      if (!created.completedSteps.includes("welcome")) {
        throw new Error("The CFP draft did not record the completed welcome step.");
      }
    }
    if (formVersion === null) throw new Error("The CFP form version is unavailable.");
    const payload = submissionPayload(nextDraft, dynamicAnswers, participantAnswers);
    const saved = await api.saveDraft({
      organizationId: identity.organizationId,
      eventId: identity.eventId,
      submissionId,
      expectedVersion: version,
      formVersion,
      ...(operation === undefined ? {} : { idempotencyKey: operation.saveIdempotencyKey }),
      answers: payload.answers,
      ...(completedStep === undefined ? {} : { completedStep }),
      ...(completedStep === "participant"
        ? {
            participants: payload.participants,
            secondaryContacts: payload.secondaryContacts,
          }
        : {}),
    });
    if (saved.formVersion !== formVersion) {
      throw new CfpApiError("CONFLICT", "The submission schema version is stale.", 409);
    }
    markAuthoritativeSubmission(saved, localRevision, nextDraft, completedStep, operation);
    return saved;
  }

  async function saveAndNavigate(
    nextDraft: CfpDraft,
    targetStep: CfpStep | "complete",
    beforePersist?: (draft: CfpDraft) => Promise<CfpDraft | undefined>,
  ): Promise<void> {
    if (staleFormConflict) return;
    if (step === "welcome" && submissionsClosed) {
      setSaveState("idle");
      return;
    }
    const operation = beginMutation();
    if (!operation) return;
    setDraft(nextDraft);
    draftRevisionRef.current += 1;
    operation.localRevision = draftRevisionRef.current;
    let draftToPersist = nextDraft;
    let keepForRetry = false;
    try {
      setSaveState("saving");
      const preparedDraft = await beforePersist?.(draftToPersist);
      if (preparedDraft !== undefined) {
        draftToPersist = preparedDraft;
        setDraft(preparedDraft);
      }
      if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
      if (targetStep === "complete") {
        const saved = await persistServerDraft(draftToPersist, "review", operation);
        if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
        if (draftRevisionRef.current !== operation.localRevision) {
          setSaveError(
            "The draft changed while it was saving. Save again to keep the latest edits.",
          );
          setSaveState("error");
          return;
        }
        if (!identity || !submissionIdRef.current) {
          throw new Error("The CFP draft is unavailable.");
        }
        const review = await api.review({
          organizationId: identity.organizationId,
          eventId: identity.eventId,
          submissionId: submissionIdRef.current,
          idempotencyKey: operation.reviewIdempotencyKey,
        });
        if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
        if (!review.canSubmit) {
          setErrors(Object.fromEntries(review.issues.map((issue) => [issue.path, issue.message])));
          setSaveState("error");
          return;
        }
        const formVersion = formVersionRef.current;
        if (formVersion === null) throw new Error("The CFP form version is unavailable.");
        const submitRevision = draftRevisionRef.current;
        const result = await api.submit({
          organizationId: identity.organizationId,
          eventId: identity.eventId,
          submissionId: submissionIdRef.current,
          expectedVersion: saved.version,
          formVersion,
          idempotencyKey: operation.submitIdempotencyKey,
        });
        if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
        if (result.submission.formVersion !== formVersion) {
          throw new CfpApiError("CONFLICT", "The submission schema version is stale.", 409);
        }
        const activeFormId = identity.formId ?? published?.form.id;
        if (!activeFormId) throw new Error("The published CFP form is unavailable.");
        rotateCfpCompletionIdentity(
          {
            organizationId: identity.organizationId,
            eventId: identity.eventId,
            formId: activeFormId,
          },
          result.submission.id,
          window.localStorage,
          window.sessionStorage,
        );
        versionRef.current = result.submission.version;
        if (draftRevisionRef.current === submitRevision) {
          setDynamicAnswers(submissionAnswersFromServer(result.submission));
          setParticipantAnswers(participantAnswersFromServer(result.submission));
          const submittedDraft = draftFromSubmission(eventSlug, result.submission);
          setDraft({
            ...submittedDraft,
            receipt: {
              id: result.receipt.id,
              submittedAt: result.receipt.submittedAt,
            },
          });
        }
      } else if (step !== "welcome") {
        const completedStep =
          step === "account"
            ? "account"
            : step === "submission"
              ? "submission"
              : step === "participants"
                ? "participant"
                : undefined;
        await persistServerDraft(draftToPersist, completedStep, operation);
      }
      if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
      if (draftRevisionRef.current !== operation.localRevision) {
        setSaveError("The draft changed while it was saving. Save again to keep the latest edits.");
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      router.push(getCfpStepRoute(eventSlug, targetStep));
    } catch (error) {
      if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
      if (error instanceof CfpVerificationRequiredError) {
        const authErrors = {
          "account.auth":
            "Check your email to verify your account, then submit this step again to continue.",
        };
        setErrors(authErrors);
        setSaveState("idle");
        setSaveError(null);
        focusFirstError(authErrors);
        return;
      }
      if (isCfpSchemaVersionConflict(error)) {
        setStaleFormConflict({
          submissionId: submissionIdRef.current,
          pinnedDraftUnavailable: false,
        });
      }
      keepForRetry = mutationMayHaveCommitted(error);
      const shouldReconcile =
        keepForRetry || (error instanceof CfpApiError && error.status === 409);
      if (shouldReconcile) {
        try {
          await reconcileAuthoritativeVersion();
        } catch {
          // Keep the original mutation error visible; retrying uses the same idempotency keys.
        }
      }
      setSaveError(
        mutationErrorMessage(
          error,
          "The draft could not be saved. Check your connection and try again.",
        ),
      );
      setSaveState("error");
    } finally {
      finishMutation(operation, keepForRetry);
    }
  }

  function focusFirstError(nextErrors: ValidationErrors): void {
    const firstKey = Object.keys(nextErrors)[0];
    if (!firstKey) return;
    window.setTimeout(() => {
      document.getElementById(firstKey)?.focus();
    });
  }

  async function continueFlow(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (step === "welcome" && submissionsClosed) {
      setSaveState("idle");
      return;
    }
    const nextErrors = published
      ? {
          ...removeFixedErrorsForDynamicForm(
            validateStep(step, draft, password),
            published.form,
            step,
          ),
          ...dynamicFormErrors(
            published.form,
            draft,
            dynamicAnswers,
            participantAnswers,
            fileUploadStates,
            step,
          ),
        }
      : validateStep(step, draft, password);
    if (step === "account" && authenticatedSession) {
      delete nextErrors["account.password"];
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }

    let nextDraft = draft;
    if (step === "account") nextDraft = syncPrimaryParticipant(draft);
    const authenticateBeforePersist =
      step === "account" && !authenticatedSession && process.env.NEXT_PUBLIC_APP_ENV !== "local"
        ? async (candidateDraft: CfpDraft) => {
            const authentication = await api.authenticateAccount({
              email: candidateDraft.account.email,
              password,
              name: `${candidateDraft.account.firstName} ${candidateDraft.account.lastName}`.trim(),
              ...(typeof window === "undefined"
                ? {}
                : { verificationCallbackUrl: window.location.href }),
            });
            if (authentication.status === "verification_required") {
              throw new CfpVerificationRequiredError();
            }
            setAuthenticatedSession(authentication.session);
            return syncPrimaryParticipant(
              draftWithAuthenticatedSession(candidateDraft, authentication.session),
            );
          }
        : undefined;
    if (step === "review") {
      const invalidStep = published
        ? firstInvalidPublishedStep(
            published.form,
            draft,
            dynamicAnswers,
            participantAnswers,
            fileUploadStates,
          )
        : getFirstInvalidStep(draft);
      if (invalidStep) {
        router.push(getCfpStepRoute(eventSlug, invalidStep));
        return;
      }
    }

    await saveAndNavigate(nextDraft, getNextCfpStep(step), authenticateBeforePersist);
  }

  async function saveNow(): Promise<void> {
    if (staleFormConflict) return;
    const operation = beginMutation();
    if (!operation) return;
    let keepForRetry = false;
    try {
      setSaveState("saving");
      const completedStep =
        step === "account"
          ? "account"
          : step === "submission"
            ? "submission"
            : step === "participants"
              ? "participant"
              : undefined;
      await persistServerDraft(draft, completedStep, operation);
      if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
      if (draftRevisionRef.current !== operation.localRevision) {
        setSaveError("The draft changed while it was saving. Save again to keep the latest edits.");
        setSaveState("error");
        return;
      }
      setSaveState("saved");
    } catch (error) {
      if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
      if (isCfpSchemaVersionConflict(error)) {
        setStaleFormConflict({
          submissionId: submissionIdRef.current,
          pinnedDraftUnavailable: false,
        });
      }
      keepForRetry = mutationMayHaveCommitted(error);
      const shouldReconcile =
        keepForRetry || (error instanceof CfpApiError && error.status === 409);
      if (shouldReconcile) {
        try {
          await reconcileAuthoritativeVersion();
        } catch {
          // Keep the original mutation error visible; retrying uses the same idempotency keys.
        }
      }
      setSaveError(
        mutationErrorMessage(
          error,
          "The draft could not be saved. Check your connection and try again.",
        ),
      );
      setSaveState("error");
    } finally {
      finishMutation(operation, keepForRetry);
    }
  }

  function goBack(): void {
    if (mutationGateRef.current?.isActive()) return;
    const previous = getPreviousCfpStep(step);
    if (previous) router.push(getCfpStepRoute(eventSlug, previous));
  }

  function reloadPinnedDraft(): void {
    window.location.reload();
  }

  function discardStaleDraftAndStartNew(): void {
    if (!identity) return;
    const activeFormId = identity.formId ?? published?.form.id;
    if (!activeFormId) return;
    window.localStorage.removeItem(
      getCfpSubmissionPointerStorageKey(identity.organizationId, identity.eventId, activeFormId),
    );
    submissionIdRef.current = null;
    formVersionRef.current = null;
    versionRef.current = 1;
    setStaleFormConflict(null);
    setSaveError(null);
    setSaveState("idle");
    window.location.reload();
  }

  if (!hydrated) {
    return (
      <main className={styles.viewport}>
        <section aria-busy="true" aria-live="polite" className={styles.card}>
          <p className={styles.loading}>Loading your submission draft…</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.viewport}>
      <section className={styles.card}>
        <Stepper currentStep={step} label="Submission progress" steps={WIZARD_STEPS} />
        <div className={styles.limitBanner}>
          Submission Limit: {formSubmissionLimit(published?.form)} submissions per user
        </div>
        <ErrorSummary errors={errors} />
        {staleFormConflict ? (
          <section className={styles.errorSummary} role="alert">
            <h2>This form has changed</h2>
            <p>
              The organizer updated this submission form. Reload the latest form before continuing;
              your existing server draft will not be silently migrated.
            </p>
            {staleFormConflict.pinnedDraftUnavailable ? (
              <p>
                The pinned server draft cannot be loaded with this form version. Discard it only
                when you are ready to start a new submission.
              </p>
            ) : null}
            <div className={styles.forwardActions}>
              <Button
                disabled={
                  staleFormConflict.pinnedDraftUnavailable ||
                  staleFormConflict.submissionId === null
                }
                onClick={reloadPinnedDraft}
                variant="secondary"
              >
                Reload pinned draft
              </Button>
              <Button onClick={discardStaleDraftAndStartNew} variant="destructive">
                Discard stale draft and start new
              </Button>
            </div>
          </section>
        ) : null}
        {submissionsClosed ? (
          <p className={styles.fieldError} role="status">
            CFP closed at{" "}
            {published?.event
              ? formatCfpWindowDate(published.event.closesAt, published.event.timezone)
              : "the server-recorded close instant"}{" "}
            ({published?.event?.timezone ?? "event timezone"}). New draft creation and proposal
            edits are locked after close; the server enforces this saved status.
          </p>
        ) : null}
        {!published && saveState === "error" ? (
          <p className={styles.fieldError} role="alert">
            {saveError ?? "The published CFP could not be loaded. Refresh to try again."}
          </p>
        ) : null}
        <form noValidate onSubmit={(event) => void continueFlow(event)}>
          {step === "welcome" ? (
            <WelcomeStep
              {...(published === null ? {} : { event: published.event, form: published.form })}
              closed={submissionsClosed}
            />
          ) : null}
          {step === "account" ? (
            <AccountStep
              authenticatedSession={authenticatedSession}
              draft={draft}
              errors={errors}
              password={password}
              setPassword={setPassword}
              updateDraft={updateDraft}
            />
          ) : null}
          {step === "submission" ? (
            <SubmissionStep
              draft={draft}
              errors={errors}
              {...(published === null ? {} : { form: published.form })}
              answers={dynamicAnswers}
              fileUploadStates={fileUploadStates}
              onAnswerChange={setSubmissionAnswer}
              onFileUploadStateChange={setFileUploadState}
              onFileUpload={(field, file) => handleFileUpload(field, undefined, file)}
              updateDraft={updateDraft}
            />
          ) : null}
          {step === "participants" ? (
            <ParticipantsStep
              draft={draft}
              errors={errors}
              {...(published === null ? {} : { form: published.form })}
              answers={participantAnswers}
              fileUploadStates={fileUploadStates}
              onAnswerChange={setParticipantAnswer}
              onFileUpload={(field, participantId, file) =>
                handleFileUpload(field, participantId, file)
              }
              onFileUploadStateChange={setFileUploadState}
              updateDraft={updateDraft}
            />
          ) : null}
          {step === "review" ? (
            <ReviewStep
              draft={draft}
              eventSlug={eventSlug}
              {...(published === null ? {} : { form: published.form })}
              answers={dynamicAnswers}
            />
          ) : null}

          <div className={styles.actions}>
            {step !== "welcome" ? (
              <Button
                className={styles.backButton}
                disabled={mutationPending}
                onClick={goBack}
                variant="outline"
              >
                ← Back
              </Button>
            ) : (
              <span />
            )}
            <div className={styles.forwardActions}>
              {step !== "welcome" &&
              (step !== "account" || process.env.NEXT_PUBLIC_APP_ENV === "local") ? (
                <Button
                  className={styles.draftButton}
                  onClick={() => void saveNow()}
                  variant="secondary"
                  disabled={mutationPending || submissionsClosed}
                >
                  Save as draft
                </Button>
              ) : null}
              {!submissionsClosed ? (
                <Button className={styles.primaryButton} disabled={mutationPending} type="submit">
                  {step === "welcome" ? "Continue →" : null}
                  {step === "account"
                    ? authenticatedSession
                      ? "Continue →"
                      : "Continue with email →"
                    : null}
                  {step === "submission" ? "Next step →" : null}
                  {step === "participants" ? "Continue to review →" : null}
                  {step === "review" ? "Submit" : null}
                </Button>
              ) : null}
            </div>
          </div>
        </form>
        {step !== "welcome" ? (
          <div className={styles.sessionFooter}>
            {authenticatedSession
              ? `Signed in as ${authenticatedSession.name} (${authenticatedSession.email}).`
              : `Account details entered for ${draft.account.firstName || "Speaker"} ${draft.account.lastName} (${draft.account.email || "email pending"}). Sign-in completes when you continue from the Account step.`}
          </div>
        ) : null}
        <p
          aria-live="polite"
          className={saveState === "error" ? styles.saveError : styles.saveStatus}
        >
          {saveState === "saving" ? "Saving draft…" : null}
          {saveState === "saved" ? "Draft saved" : null}
          {saveState === "error" && staleFormConflict === null
            ? (saveError ?? "Draft could not be saved. Check your connection and try again.")
            : null}
        </p>
      </section>
    </main>
  );
}

function WelcomeStep({
  event,
  form,
  closed = false,
}: {
  event?: PublishedCfp["event"];
  form?: CfpPublishedForm;
  closed?: boolean;
}) {
  const content =
    form?.welcomeContent || "Our event welcomes leaders, practitioners, and change-makers.";
  return (
    <div className={styles.welcomeContent}>
      <h1>{event?.name ?? "Welcome to our event!"}</h1>
      <h2>{form?.name ?? "Call for Speakers"}</h2>
      <p>{content}</p>
      <p>
        Use this form to propose a topic. Your speaker portal will show the status of your
        submission and any tasks assigned after acceptance.
      </p>
      <h2>Helpful Tips and Important Information</h2>
      <ul>
        <li>
          <a href="#speaker-agreement">Speaker Agreement Terms and Conditions</a>
        </li>
        <li>
          <a href="#application-faq">FAQs for the Speaker Application Process</a>
        </li>
        <li>
          <a href="#speaker-resources">Speaker Tips and Resources Guide</a>
        </li>
      </ul>
      {event ? (
        <>
          <h2>Dates and Deadlines</h2>
          <p>
            {formatCfpWindowDate(event.opensAt, event.timezone)} –{" "}
            {formatCfpWindowDate(event.closesAt, event.timezone)} ({event.timezone})
          </p>
        </>
      ) : null}
      {closed ? (
        <p role="status">
          Submissions are closed. Existing submissions remain available in your speaker portal.
        </p>
      ) : null}
    </div>
  );
}

interface StepFormProps {
  draft: CfpDraft;
  errors: ValidationErrors;
  updateDraft: (update: (current: CfpDraft) => CfpDraft) => void;
}

function AccountStep({
  draft,
  errors,
  password,
  setPassword,
  updateDraft,
  authenticatedSession,
}: StepFormProps & {
  password: string;
  setPassword: (value: string) => void;
  authenticatedSession: CfpAuthenticatedSession | null;
}) {
  const checks = getPasswordChecks(password);
  return (
    <div>
      <h1>
        {authenticatedSession
          ? `Continue as ${authenticatedSession.name}`
          : "Create account or sign in"}
      </h1>
      {!authenticatedSession ? (
        <p>
          Enter an existing account password to sign in. If the email is new, the same action
          creates the account.
        </p>
      ) : null}
      <div className={styles.sectionPanel}>
        <Field
          error={errors["account.email"]}
          label="Your Email Address:"
          name="account.email"
          required
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              autoComplete="email"
              readOnly={authenticatedSession !== null}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  account: { ...current.account, email: event.target.value },
                }))
              }
              type="email"
              value={draft.account.email}
            />
          )}
        </Field>
        {authenticatedSession ? (
          <p role="status">
            You are signed in as {authenticatedSession.email}. No password is needed to continue.
          </p>
        ) : (
          <>
            <Field
              error={errors["account.password"]}
              label="Password:"
              name="account.password"
              required
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              )}
            </Field>
            <ul className={styles.passwordChecks}>
              <PasswordCheck passed={checks.minimumLength}>
                Password includes at least 8 characters
              </PasswordCheck>
              <PasswordCheck passed={checks.specialCharacter}>
                Password includes at least 1 special character
              </PasswordCheck>
              <PasswordCheck passed={checks.number}>
                Password includes at least 1 number
              </PasswordCheck>
              <PasswordCheck passed={checks.capitalLetter}>
                Password includes at least 1 capital letter
              </PasswordCheck>
            </ul>
          </>
        )}
        <div className={styles.twoColumns}>
          <Field
            error={errors["account.firstName"]}
            label="First Name"
            name="account.firstName"
            required
          >
            {(controlProps) => (
              <>
                <Input
                  {...controlProps}
                  maxLength={255}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      account: { ...current.account, firstName: event.target.value },
                    }))
                  }
                  value={draft.account.firstName}
                />
                <CharacterCount current={draft.account.firstName.length} maximum={255} />
              </>
            )}
          </Field>
          <Field
            error={errors["account.lastName"]}
            label="Last Name"
            name="account.lastName"
            required
          >
            {(controlProps) => (
              <>
                <Input
                  {...controlProps}
                  maxLength={255}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      account: { ...current.account, lastName: event.target.value },
                    }))
                  }
                  value={draft.account.lastName}
                />
                <CharacterCount current={draft.account.lastName.length} maximum={255} />
              </>
            )}
          </Field>
        </div>
        <label className={styles.consent} data-error-key="account.acceptedTerms">
          <input
            aria-invalid={Boolean(errors["account.acceptedTerms"])}
            checked={draft.account.acceptedTerms}
            id="account.acceptedTerms"
            onChange={(event) =>
              updateDraft((current) => ({
                ...current,
                account: { ...current.account, acceptedTerms: event.target.checked },
              }))
            }
            type="checkbox"
          />
          <span>
            I agree to the <a href="#terms">Terms of Service</a> and{" "}
            <a href="#privacy">Privacy Policy</a>.{" "}
            <span aria-hidden="true" className={styles.required}>
              *
            </span>
          </span>
        </label>
        {errors["account.acceptedTerms"] ? (
          <span className={styles.fieldError} role="alert">
            {errors["account.acceptedTerms"]}
          </span>
        ) : null}
        {errors["account.auth"] ? (
          <p id="account.auth" className={styles.fieldError} role="alert">
            {errors["account.auth"]}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PasswordCheck({ children, passed }: { children: ReactNode; passed: boolean }) {
  return (
    <li className={passed ? styles.checkPassed : styles.checkPending}>
      <span aria-hidden="true">{passed ? "✓" : "×"}</span> {children}
    </li>
  );
}

function SubmissionStep({
  draft,
  errors,
  form,
  answers,
  fileUploadStates,
  onAnswerChange,
  onFileUpload,
  onFileUploadStateChange,
  updateDraft,
}: StepFormProps & {
  form?: CfpPublishedForm;
  answers: DynamicAnswers;
  fileUploadStates: FileUploadStates;
  onAnswerChange: (key: string, value: unknown) => void;
  onFileUpload: (field: CfpFormField, file: File) => Promise<CfpFileUploadResult>;
  onFileUploadStateChange: (key: string, state: FileUploadState) => void;
}) {
  if (form && form.submissionFields.length > 0) {
    return (
      <DynamicSubmissionFields
        answers={answers}
        draft={draft}
        errors={errors}
        fileUploadStates={fileUploadStates}
        form={form}
        onAnswerChange={onAnswerChange}
        onFileUpload={onFileUpload}
        onFileUploadStateChange={onFileUploadStateChange}
      />
    );
  }
  const formatOptions = form ? publishedOptions(form, "format", FORMAT_OPTIONS) : FORMAT_OPTIONS;
  const trackOptions = form ? publishedOptions(form, "track", TRACK_OPTIONS) : TRACK_OPTIONS;
  const levelOptions = form ? publishedOptions(form, "level", LEVEL_OPTIONS) : LEVEL_OPTIONS;
  const languageOptions = form
    ? publishedOptions(form, "language", LANGUAGE_OPTIONS)
    : LANGUAGE_OPTIONS;
  const tagOptions = form ? publishedOptions(form, "tags", TAG_OPTIONS) : TAG_OPTIONS;
  function toggleTag(tag: string): void {
    updateDraft((current) => ({
      ...current,
      submission: {
        ...current.submission,
        tags: current.submission.tags.includes(tag)
          ? current.submission.tags.filter((item) => item !== tag)
          : [...current.submission.tags, tag],
      },
    }));
  }

  return (
    <div>
      <h1>Tell us about your submission</h1>
      <p>What do you want to present? Fill out the following information to tell us more.</p>
      <Field error={errors["submission.title"]} label="Title" name="submission.title" required>
        {(controlProps) => (
          <>
            <Input
              {...controlProps}
              maxLength={255}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  submission: { ...current.submission, title: event.target.value },
                }))
              }
              value={draft.submission.title}
            />
            <CharacterCount current={draft.submission.title.length} maximum={255} />
          </>
        )}
      </Field>
      <Field
        error={errors["submission.description"]}
        label="Description"
        name="submission.description"
        required
      >
        {(controlProps) => (
          <RichTextArea
            {...controlProps}
            maxLength={5000}
            onValueChange={(value) =>
              updateDraft((current) => ({
                ...current,
                submission: { ...current.submission, description: value },
              }))
            }
            placeholder="Enter text here…"
            rows={8}
            value={draft.submission.description}
          />
        )}
      </Field>
      <SearchableField
        errorKey="submission.format"
        errors={errors}
        label="Format"
        options={formatOptions}
        required
        value={draft.submission.format}
        onChange={(value) =>
          updateDraft((current) => ({
            ...current,
            submission: { ...current.submission, format: value },
          }))
        }
      />
      <fieldset
        className={errors["submission.tags"] ? styles.invalidFieldset : styles.tagFieldset}
        id="submission.tags"
        tabIndex={-1}
      >
        <legend>
          Tags{" "}
          <span aria-hidden="true" className={styles.required}>
            *
          </span>
        </legend>
        <div className={styles.tagOptions}>
          {tagOptions.map((tag) => (
            <label key={tag}>
              <input
                checked={draft.submission.tags.includes(tag)}
                onChange={() => toggleTag(tag)}
                type="checkbox"
              />{" "}
              {tag}
            </label>
          ))}
        </div>
        {errors["submission.tags"] ? (
          <span className={styles.fieldError} role="alert">
            {errors["submission.tags"]}
          </span>
        ) : null}
      </fieldset>
      <SearchableField
        errorKey="submission.track"
        errors={errors}
        label="Track"
        options={trackOptions}
        required
        value={draft.submission.track}
        onChange={(value) =>
          updateDraft((current) => ({
            ...current,
            submission: { ...current.submission, track: value },
          }))
        }
      />
      <SearchableField
        errorKey="submission.level"
        errors={errors}
        label="Level"
        options={levelOptions}
        value={draft.submission.level}
        onChange={(value) =>
          updateDraft((current) => ({
            ...current,
            submission: { ...current.submission, level: value },
          }))
        }
      />
      <SearchableField
        errorKey="submission.language"
        errors={errors}
        label="Language"
        options={languageOptions}
        value={draft.submission.language}
        onChange={(value) =>
          updateDraft((current) => ({
            ...current,
            submission: { ...current.submission, language: value },
          }))
        }
      />
    </div>
  );
}

function SearchableField({
  errorKey,
  errors,
  label,
  onChange,
  options,
  required = false,
  value,
}: {
  errorKey: string;
  errors: ValidationErrors;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  required?: boolean;
  value: string;
}) {
  return (
    <Field error={errors[errorKey]} label={label} name={errorKey} required={required}>
      {(controlProps) => (
        <SearchableSelect
          {...(controlProps["aria-describedby"]
            ? { describedBy: controlProps["aria-describedby"] }
            : {})}
          id={controlProps.id}
          invalid={Boolean(controlProps["aria-invalid"])}
          onValueChange={onChange}
          options={options.map((option) => ({ label: option, value: option }))}
          placeholder="Search or select…"
          required={required}
          value={value}
        />
      )}
    </Field>
  );
}
function FileRequestControl({
  field,
  state,
  value,
  id,
  onChange,
  onUpload,
  onStateChange,
}: {
  field: CfpFormField;
  state: FileUploadState | undefined;
  value: unknown;
  id: string;
  onChange: (value: unknown) => void;
  onUpload: (file: File) => Promise<CfpFileUploadResult>;
  onStateChange: (state: FileUploadState) => void;
}) {
  const configuredMimeTypes =
    fieldConfig(field, "allowedMimeTypes") ?? fieldConfig(field, "mimeTypes");
  const maxBytes = fieldConfig(field, "maxBytes");
  const acceptedTypes = Array.isArray(configuredMimeTypes)
    ? configuredMimeTypes.filter((type): type is string => typeof type === "string")
    : [];
  const maxSize = typeof maxBytes === "number" && Number.isFinite(maxBytes) ? maxBytes : undefined;
  const persistedAssetId =
    isRecord(value) && typeof value.assetId === "string" && value.assetId.trim()
      ? value.assetId
      : undefined;
  const displayState =
    state ??
    (persistedAssetId === undefined
      ? undefined
      : { status: "ready" as const, assetId: persistedAssetId });
  const uploadSequenceRef = useRef(0);

  function mimeTypeAllowed(contentType: string): boolean {
    const normalized = contentType.trim().toLowerCase();
    return acceptedTypes.some((allowed) => {
      const normalizedAllowed = allowed.trim().toLowerCase();
      if (normalizedAllowed === "*/*" || normalizedAllowed === "*") return true;
      if (normalizedAllowed.endsWith("/*"))
        return normalized.startsWith(normalizedAllowed.slice(0, -1));
      return normalizedAllowed === normalized;
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    const sequence = ++uploadSequenceRef.current;
    event.currentTarget.value = "";
    if (!file) {
      onChange(undefined);
      onStateChange({ status: "idle" });
      return;
    }
    onChange(undefined);
    if (acceptedTypes.length > 0 && !mimeTypeAllowed(file.type)) {
      onStateChange({
        status: "error",
        name: file.name,
        message: `Choose a file of an allowed type (${acceptedTypes.join(", ")}).`,
      });
      return;
    }
    if (maxSize !== undefined && file.size > maxSize) {
      onStateChange({
        status: "error",
        name: file.name,
        message: `The selected file must be ${maxSize} bytes or smaller.`,
      });
      return;
    }
    onStateChange({ status: "pending", name: file.name });
    void onUpload(file)
      .then((result) => {
        if (sequence !== uploadSequenceRef.current) return;
        if (result.state !== "ready" || result.assetId.trim().length === 0) {
          throw new CfpApiError(
            "CFP_FILE_UPLOAD_REJECTED",
            "The uploaded file was rejected during finalization.",
            409,
          );
        }
        onChange({ assetId: result.assetId });
        onStateChange({ status: "ready", name: file.name, assetId: result.assetId });
      })
      .catch((error) => {
        if (sequence !== uploadSequenceRef.current) return;
        onStateChange({
          status: "error",
          name: file.name,
          message: mutationErrorMessage(error, "The file could not be uploaded."),
        });
      });
  }

  return (
    <div>
      <input
        id={id}
        accept={acceptedTypes.length > 0 ? acceptedTypes.join(",") : undefined}
        aria-describedby={displayState?.status === "error" ? `${field.key}-file-error` : undefined}
        onChange={handleFileChange}
        type="file"
      />
      {displayState?.status === "pending" ? (
        <p aria-live="polite" className={styles.fieldHint}>
          {displayState.name} is uploading…
        </p>
      ) : null}
      {displayState?.status === "ready" ? (
        <p aria-live="polite" className={styles.fieldHint}>
          {displayState.name ?? "The selected file"} is uploaded and ready.
        </p>
      ) : null}
      {displayState?.status === "error" ? (
        <p className={styles.fieldError} id={`${field.key}-file-error`} role="alert">
          {displayState.message}
        </p>
      ) : null}
    </div>
  );
}

function SearchableMultiField({
  field,
  value,
  id,
  describedBy,
  onChange,
}: {
  field: CfpFormField;
  value: string[];
  id: string;
  describedBy: string | undefined;
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const options = fieldOptions(field).filter((option) =>
    `${option.label} ${option.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery),
  );
  return (
    <div>
      <label className={styles.srOnly} htmlFor={id}>
        Search {field.label} options
      </label>
      <Input
        aria-describedby={describedBy}
        id={id}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search options…"
        type="search"
        value={query}
      />
      <div className={styles.tagOptions}>
        {options.map((option) => (
          <label key={option.value}>
            <input
              checked={value.includes(option.value)}
              disabled={option.disabled}
              onChange={() =>
                onChange(
                  value.includes(option.value)
                    ? value.filter((item) => item !== option.value)
                    : [...value, option.value],
                )
              }
              type="checkbox"
            />{" "}
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function PublishedFieldControl({
  field,
  value,
  error,
  onChange,
  onFileUpload,
  fileState,
  onFileStateChange,
  errorKey,
}: {
  field: CfpFormField;
  value: unknown;
  error: string | undefined;
  onFileUpload: (file: File) => Promise<CfpFileUploadResult>;
  onChange: (value: unknown) => void;
  fileState: FileUploadState | undefined;
  onFileStateChange: (state: FileUploadState) => void;
  errorKey: string;
}) {
  const kind = field.kind.toLowerCase().replaceAll("-", "_");
  const valueString = typeof value === "string" ? value : "";
  const options = fieldOptions(field);
  const maxLength = fieldConfig(field, "maxLength");
  const description = fieldConfig(field, "description");
  const configuredPlaceholder = fieldConfig(field, "placeholder");
  const placeholder =
    field.placeholder ?? (typeof configuredPlaceholder === "string" ? configuredPlaceholder : "");
  const hint = typeof description === "string" ? description : undefined;
  return (
    <Field error={error} hint={hint} label={field.label} name={errorKey} required={field.required}>
      {(controlProps) => {
        if (isFileField(field)) {
          return (
            <FileRequestControl
              field={field}
              value={value}
              id={controlProps.id}
              onChange={onChange}
              onUpload={(file) => onFileUpload(file)}
              onStateChange={onFileStateChange}
              state={fileState}
            />
          );
        }
        if (kind === "rich_text") {
          return (
            <RichTextArea
              {...controlProps}
              maxLength={typeof maxLength === "number" ? maxLength : 10000}
              onValueChange={onChange}
              placeholder={placeholder}
              rows={7}
              value={valueString}
            />
          );
        }
        if (kind === "select") {
          return (
            <SearchableSelect
              {...(controlProps["aria-describedby"]
                ? { describedBy: controlProps["aria-describedby"] }
                : {})}
              id={controlProps.id}
              invalid={Boolean(controlProps["aria-invalid"])}
              onValueChange={onChange as (value: string) => void}
              options={options}
              placeholder={placeholder || "Search or select…"}
              required={field.required}
              value={valueString}
            />
          );
        }
        if (kind === "multi_select") {
          return (
            <SearchableMultiField
              field={field}
              id={controlProps.id}
              describedBy={controlProps["aria-describedby"]}
              onChange={onChange as (value: string[]) => void}
              value={
                Array.isArray(value)
                  ? value.filter((item): item is string => typeof item === "string")
                  : []
              }
            />
          );
        }
        if (kind === "boolean") {
          return (
            <label>
              <input
                {...controlProps}
                checked={value === true}
                onChange={(event) => onChange(event.currentTarget.checked)}
                type="checkbox"
              />{" "}
              {field.label}
            </label>
          );
        }
        if (kind === "number") {
          return (
            <Input
              {...controlProps}
              onChange={(event) =>
                onChange(event.currentTarget.value === "" ? "" : Number(event.currentTarget.value))
              }
              placeholder={placeholder}
              type="number"
              value={typeof value === "number" ? value : valueString}
            />
          );
        }
        if (kind === "email" || kind === "url" || kind === "text") {
          return (
            <Input
              {...controlProps}
              onChange={(event) => onChange(event.currentTarget.value)}
              placeholder={placeholder}
              type={kind}
              value={valueString}
            />
          );
        }
        return (
          <Input
            {...controlProps}
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder={placeholder}
            value={valueString}
          />
        );
      }}
    </Field>
  );
}

function DynamicSubmissionFields({
  form,
  draft,
  answers,
  errors,
  fileUploadStates,
  onAnswerChange,
  onFileUpload,
  onFileUploadStateChange,
}: {
  form: CfpPublishedForm;
  draft: CfpDraft;
  answers: DynamicAnswers;
  errors: ValidationErrors;
  fileUploadStates: FileUploadStates;
  onFileUpload: (field: CfpFormField, file: File) => Promise<CfpFileUploadResult>;
  onAnswerChange: (key: string, value: unknown) => void;
  onFileUploadStateChange: (key: string, state: FileUploadState) => void;
}) {
  const evaluated = evaluatePublishedFields(form, {
    ...answers,
    accountEmail: draft.account.email,
    accountFirstName: draft.account.firstName,
    accountLastName: draft.account.lastName,
  });
  const sections =
    form.sections.length > 0
      ? form.sections
      : [{ id: "submission", title: "Submission", description: "" }];
  return (
    <div>
      <h1>Tell us about your submission</h1>
      <p>What do you want to present? Fill out the following information to tell us more.</p>
      {sections.map((section) => {
        if (evaluated.sections.get(section.id) === false) return null;
        const fields = form.submissionFields.filter((field) => field.sectionId === section.id);
        if (fields.length === 0) return null;
        return (
          <section className={styles.sectionPanel} key={section.id}>
            <h2>{section.title}</h2>
            {section.description ? <p>{section.description}</p> : null}
            {fields.map((field) => {
              const fieldState = evaluated.fields.get(field.key) ?? {
                visible: true,
                required: fieldRequired(field),
              };
              if (!fieldState.visible) return null;
              const configuredField =
                fieldState.required === field.required
                  ? field
                  : { ...field, required: fieldState.required };
              const errorKey = formSubmissionErrorKey(field.key);
              return (
                <PublishedFieldControl
                  key={field.id}
                  error={errors[errorKey]}
                  errorKey={errorKey}
                  field={configuredField}
                  fileState={fileUploadStates[fileStateKey(field.key)]}
                  onChange={(value) => onAnswerChange(field.key, value)}
                  onFileUpload={(file) => onFileUpload(field, file)}
                  onFileStateChange={(state) =>
                    onFileUploadStateChange(fileStateKey(field.key), state)
                  }
                  value={submissionValue(draft, answers, field.key)}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function ParticipantsStep({
  draft,
  errors,
  form,
  answers,
  fileUploadStates,
  onAnswerChange,
  onFileUpload,
  onFileUploadStateChange,
  updateDraft,
}: StepFormProps & {
  form?: CfpPublishedForm;
  answers: ParticipantAnswers;
  fileUploadStates: FileUploadStates;
  onAnswerChange: (participantId: string, key: string, value: unknown) => void;
  onFileUpload: (
    field: CfpFormField,
    participantId: string,
    file: File,
  ) => Promise<CfpFileUploadResult>;
  onFileUploadStateChange: (key: string, state: FileUploadState) => void;
}) {
  if (form && form.participantFields.length > 0) {
    return (
      <DynamicParticipantsFields
        answers={answers}
        draft={draft}
        errors={errors}
        fileUploadStates={fileUploadStates}
        form={form}
        onAnswerChange={onAnswerChange}
        onFileUpload={onFileUpload}
        onFileUploadStateChange={onFileUploadStateChange}
        updateDraft={updateDraft}
      />
    );
  }
  function addParticipant(): void {
    if (draft.participants.length >= 15) return;
    updateDraft((current) => ({
      ...current,
      participants: [
        ...current.participants,
        createEmptyParticipant(newId("participant"), "Co-speaker"),
      ],
    }));
  }

  return (
    <div>
      <div className={styles.participantHeading}>
        <div>
          <h1>Tell us about you</h1>
          <p>
            Give us information about yourself and your credentials for presenting at our event.
          </p>
        </div>
        <Button
          className={styles.addButton}
          disabled={draft.participants.length >= 15}
          onClick={addParticipant}
          size="sm"
          variant="secondary"
        >
          ＋ Add participant
        </Button>
      </div>
      {errors.participants ? (
        <p className={styles.fieldError} id="participants" role="alert" tabIndex={-1}>
          {errors.participants}
        </p>
      ) : null}
      {draft.participants.map((participant, index) => (
        <section className={styles.participantCard} key={participant.id}>
          <div className={styles.participantCardHeading}>
            <h2>
              Participant {index + 1} of {draft.participants.length}
            </h2>
            {index > 0 ? (
              <Button
                className={styles.removeButton}
                onClick={() =>
                  updateDraft((current) => ({
                    ...current,
                    participants: current.participants.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  }))
                }
                size="sm"
                variant="ghost"
              >
                Remove
              </Button>
            ) : null}
          </div>
          <Field label="Role for this participant" name={`participants.${index}.role`}>
            {(controlProps) => (
              <Select
                {...controlProps}
                onChange={(event) =>
                  updateDraft((current) =>
                    mergeParticipant(current, index, {
                      role: event.target.value as CfpParticipant["role"],
                    }),
                  )
                }
                value={participant.role}
              >
                <option>Speaker</option>
                <option>Co-speaker</option>
                <option>Moderator</option>
              </Select>
            )}
          </Field>
          <div className={styles.twoColumns}>
            <Field
              error={errors[`participants.${index}.firstName`]}
              label="First Name"
              name={`participants.${index}.firstName`}
              required
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  maxLength={255}
                  onChange={(event) =>
                    updateDraft((current) =>
                      mergeParticipant(current, index, { firstName: event.target.value }),
                    )
                  }
                  value={participant.firstName}
                />
              )}
            </Field>
            <Field
              error={errors[`participants.${index}.lastName`]}
              label="Last Name"
              name={`participants.${index}.lastName`}
              required
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  maxLength={255}
                  onChange={(event) =>
                    updateDraft((current) =>
                      mergeParticipant(current, index, { lastName: event.target.value }),
                    )
                  }
                  value={participant.lastName}
                />
              )}
            </Field>
          </div>
          <Field
            error={errors[`participants.${index}.email`]}
            label="Email"
            name={`participants.${index}.email`}
            required
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                onChange={(event) =>
                  updateDraft((current) =>
                    mergeParticipant(current, index, { email: event.target.value }),
                  )
                }
                type="email"
                value={participant.email}
              />
            )}
          </Field>
          <Field label="Mobile Phone" name={`participants.${index}.mobilePhone`}>
            {(controlProps) => (
              <Input
                {...controlProps}
                autoComplete="tel"
                onChange={(event) =>
                  updateDraft((current) =>
                    mergeParticipant(current, index, { mobilePhone: event.target.value }),
                  )
                }
                placeholder="+1"
                type="tel"
                value={participant.mobilePhone}
              />
            )}
          </Field>
          <Field
            error={errors[`participants.${index}.biography`]}
            label="Biography"
            name={`participants.${index}.biography`}
          >
            {(controlProps) => (
              <RichTextArea
                {...controlProps}
                maxLength={5000}
                onValueChange={(value) =>
                  updateDraft((current) => mergeParticipant(current, index, { biography: value }))
                }
                placeholder="Tell us a bit about yourself"
                rows={6}
                value={participant.biography}
              />
            )}
          </Field>
        </section>
      ))}
      <SecondaryContacts draft={draft} errors={errors} updateDraft={updateDraft} />
    </div>
  );
}

function DynamicParticipantsFields({
  form,
  draft,
  errors,
  answers,
  fileUploadStates,
  onAnswerChange,
  onFileUpload,
  onFileUploadStateChange,
  updateDraft,
}: StepFormProps & {
  form: CfpPublishedForm;
  answers: ParticipantAnswers;
  fileUploadStates: FileUploadStates;
  onFileUpload: (
    field: CfpFormField,
    participantId: string,
    file: File,
  ) => Promise<CfpFileUploadResult>;
  onAnswerChange: (participantId: string, key: string, value: unknown) => void;
  onFileUploadStateChange: (key: string, state: FileUploadState) => void;
}) {
  const configuredIdentityKeys = new Set(form.participantFields.map((field) => field.key));
  const identityFields: CfpFormField[] = [
    {
      id: "participant-first-name",
      sectionId: "participants",
      key: "firstName",
      label: "First Name",
      kind: "text",
      required: true,
      options: [],
    },
    {
      id: "participant-last-name",
      sectionId: "participants",
      key: "lastName",
      label: "Last Name",
      kind: "text",
      required: true,
      options: [],
    },
    {
      id: "participant-email",
      sectionId: "participants",
      key: "email",
      label: "Email",
      kind: "email",
      required: true,
      options: [],
    },
  ];
  const fields = [
    ...identityFields.filter((field) => !configuredIdentityKeys.has(field.key)),
    ...form.participantFields,
  ];

  function updateParticipantField(index: number, key: string, value: unknown): void {
    const patch: Partial<CfpParticipant> = {};
    if (key === "firstName") patch.firstName = String(value ?? "");
    if (key === "lastName") patch.lastName = String(value ?? "");
    if (key === "email") patch.email = String(value ?? "");
    if (key === "biography") patch.biography = String(value ?? "");
    if (key === "mobilePhone") patch.mobilePhone = String(value ?? "");
    if (Object.keys(patch).length > 0) {
      updateDraft((current) => mergeParticipant(current, index, patch));
    } else {
      const participant = draft.participants[index];
      if (participant) onAnswerChange(participant.id, key, value);
    }
  }

  function addParticipant(): void {
    if (draft.participants.length >= 15) return;
    const participant = createEmptyParticipant(newId("participant"), "Co-speaker");
    updateDraft((current) => ({
      ...current,
      participants: [...current.participants, participant],
    }));
  }

  return (
    <div>
      <div className={styles.participantHeading}>
        <div>
          <h1>Tell us about you</h1>
          <p>
            Give us information about yourself and your credentials for presenting at our event.
          </p>
        </div>
        <Button
          className={styles.addButton}
          disabled={draft.participants.length >= 15}
          onClick={addParticipant}
          size="sm"
          variant="secondary"
        >
          ＋ Add participant
        </Button>
      </div>
      {errors.participants ? (
        <p className={styles.fieldError} id="participants" role="alert" tabIndex={-1}>
          {errors.participants}
        </p>
      ) : null}
      {draft.participants.map((participant, index) => {
        const participantCustomAnswers = answers[participant.id] ?? {};
        const evaluated = evaluatePublishedFields(form, {
          ...participantCustomAnswers,
          firstName: participant.firstName,
          lastName: participant.lastName,
          email: participant.email,
          biography: participant.biography,
          mobilePhone: participant.mobilePhone,
        });
        return (
          <section className={styles.participantCard} key={participant.id}>
            <div className={styles.participantCardHeading}>
              <h2>
                Participant {index + 1} of {draft.participants.length}
              </h2>
              {index > 0 ? (
                <Button
                  className={styles.removeButton}
                  onClick={() =>
                    updateDraft((current) => ({
                      ...current,
                      participants: current.participants.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    }))
                  }
                  size="sm"
                  variant="ghost"
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <Field label="Role for this participant" name={`participants.${index}.role`}>
              {(controlProps) => (
                <Select
                  {...controlProps}
                  onChange={(event) =>
                    updateDraft((current) =>
                      mergeParticipant(current, index, {
                        role: event.target.value as CfpParticipant["role"],
                      }),
                    )
                  }
                  value={participant.role}
                >
                  <option>Speaker</option>
                  <option>Co-speaker</option>
                  <option>Moderator</option>
                </Select>
              )}
            </Field>
            {fields.map((field) => {
              const state = evaluated.fields.get(field.key) ?? {
                visible: true,
                required: fieldRequired(field),
              };
              if (!state.visible) return null;
              const configuredField =
                state.required === field.required ? field : { ...field, required: state.required };
              const errorKey = `participants.${index}.${field.key}`;
              return (
                <PublishedFieldControl
                  key={field.id}
                  error={errors[errorKey]}
                  errorKey={errorKey}
                  field={configuredField}
                  fileState={fileUploadStates[fileStateKey(field.key, index)]}
                  onChange={(value) => updateParticipantField(index, field.key, value)}
                  onFileUpload={(file) => onFileUpload(field, participant.id, file)}
                  onFileStateChange={(state) =>
                    onFileUploadStateChange(fileStateKey(field.key, index), state)
                  }
                  value={participantValue(participant, participantCustomAnswers, field.key)}
                />
              );
            })}
            {!configuredIdentityKeys.has("biography") ? (
              <Field
                error={errors[`participants.${index}.biography`]}
                label="Biography"
                name={`participants.${index}.biography`}
              >
                {(controlProps) => (
                  <RichTextArea
                    {...controlProps}
                    maxLength={5000}
                    onValueChange={(value) => updateParticipantField(index, "biography", value)}
                    rows={6}
                    value={participant.biography}
                  />
                )}
              </Field>
            ) : null}
            {!configuredIdentityKeys.has("mobilePhone") ? (
              <Field label="Mobile Phone" name={`participants.${index}.mobilePhone`}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    onChange={(event) =>
                      updateParticipantField(index, "mobilePhone", event.target.value)
                    }
                    type="tel"
                    value={participant.mobilePhone}
                  />
                )}
              </Field>
            ) : null}
          </section>
        );
      })}
      <SecondaryContacts draft={draft} errors={errors} updateDraft={updateDraft} />
    </div>
  );
}
function SecondaryContacts({ draft, errors, updateDraft }: StepFormProps) {
  function addContact(): void {
    const contact: CfpSecondaryContact = {
      id: newId("contact"),
      firstName: "",
      lastName: "",
      email: "",
    };
    updateDraft((current) => ({
      ...current,
      secondaryContacts: [...current.secondaryContacts, contact],
    }));
  }

  return (
    <section className={styles.secondaryContacts}>
      <Button className={styles.textButton} onClick={addContact} size="sm" variant="ghost">
        ＋ Add Secondary Contact
      </Button>
      <p>Secondary contacts can assist with tasks and communication.</p>
      {draft.secondaryContacts.map((contact, index) => (
        <div className={styles.contactCard} key={contact.id}>
          <div className={styles.participantCardHeading}>
            <h2>Secondary contact {index + 1}</h2>
            <Button
              className={styles.removeButton}
              onClick={() =>
                updateDraft((current) => ({
                  ...current,
                  secondaryContacts: current.secondaryContacts.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                }))
              }
              size="sm"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
          <div className={styles.twoColumns}>
            <Field
              error={errors[`secondaryContacts.${index}.firstName`]}
              label="First Name"
              name={`secondaryContacts.${index}.firstName`}
              required
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  onChange={(event) =>
                    updateDraft((current) =>
                      mergeSecondaryContact(current, index, { firstName: event.target.value }),
                    )
                  }
                  value={contact.firstName}
                />
              )}
            </Field>
            <Field
              error={errors[`secondaryContacts.${index}.lastName`]}
              label="Last Name"
              name={`secondaryContacts.${index}.lastName`}
              required
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  onChange={(event) =>
                    updateDraft((current) =>
                      mergeSecondaryContact(current, index, { lastName: event.target.value }),
                    )
                  }
                  value={contact.lastName}
                />
              )}
            </Field>
          </div>
          <Field
            error={errors[`secondaryContacts.${index}.email`]}
            label="Email"
            name={`secondaryContacts.${index}.email`}
            required
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                onChange={(event) =>
                  updateDraft((current) =>
                    mergeSecondaryContact(current, index, { email: event.target.value }),
                  )
                }
                type="email"
                value={contact.email}
              />
            )}
          </Field>
        </div>
      ))}
    </section>
  );
}

function ReviewStep({
  draft,
  eventSlug,
  form,
  answers,
}: {
  draft: CfpDraft;
  eventSlug: string;
  form?: CfpPublishedForm;
  answers: DynamicAnswers;
}) {
  const router = useRouter();
  const audienceLevel = cfpReviewAudienceLevel(form, answers, draft.submission.level);
  return (
    <div>
      <h1>Review your submission</h1>
      <p>Check that everything looks correct. You can go back to make changes before submitting.</p>
      <section className={styles.reviewCard}>
        <div className={styles.reviewHeading}>
          <h2>Tell us about your submission</h2>
          <Button
            className={styles.textButton}
            onClick={() => router.push(getCfpStepRoute(eventSlug, "submission"))}
            size="sm"
            variant="ghost"
          >
            ✎ Edit session
          </Button>
        </div>
        <ReviewValue label="Title" value={draft.submission.title} />
        <ReviewValue label="Description" value={draft.submission.description} />
        <ReviewValue label="Format" value={draft.submission.format} />
        <ReviewValue label="Tags" value={draft.submission.tags.join(", ")} />
        <ReviewValue label="Track" value={draft.submission.track} />
        <ReviewValue label={audienceLevel.label} value={audienceLevel.value} />
        <ReviewValue label="Language" value={draft.submission.language || "Not specified"} />
      </section>
      <section className={styles.reviewCard}>
        <div className={styles.reviewHeading}>
          <h2>Tell us about you</h2>
          <Button
            className={styles.textButton}
            onClick={() => router.push(getCfpStepRoute(eventSlug, "participants"))}
            size="sm"
            variant="ghost"
          >
            ✎ Edit participants
          </Button>
        </div>
        {draft.participants.map((participant) => (
          <div className={styles.reviewParticipant} key={participant.id}>
            <h3>
              {participant.firstName} {participant.lastName} <span>{participant.role}</span>
            </h3>
            <ReviewValue label="Email" value={participant.email} />
            <ReviewValue label="Mobile Phone" value={participant.mobilePhone || "Not provided"} />
            <ReviewValue label="Biography" value={participant.biography || "Not provided"} />
          </div>
        ))}
      </section>
    </div>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return (
    <dl className={styles.reviewValue}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </dl>
  );
}

export function CfpComplete({
  eventSlug,
  organizationId,
  formId,
  api: providedApi,
}: {
  eventSlug: string;
  organizationId?: string;
  formId?: string;
  api?: CfpApi;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationDetails, setConfirmationDetails] = useState<{
    eventName: string;
    submissionTitle: string;
    recipient: string;
    confirmationMessage: string;
    successContent: string;
  } | null>(null);
  const [completionIdentity, setCompletionIdentity] = useState<{
    organizationId: string;
    eventId: string;
    formId: string;
    submissionId: string;
    canEdit: boolean;
  } | null>(null);
  const api = useMemo(() => providedApi ?? createCfpApi(""), [providedApi]);

  useEffect(() => {
    let active = true;
    let identity: { organizationId: string; eventId: string; formId?: string };
    try {
      identity = configuredCfpIdentity(eventSlug, organizationId, formId);
    } catch {
      router.replace(getCfpStepRoute(eventSlug, "review"));
      return () => {
        active = false;
      };
    }
    void (async () => {
      try {
        const published = await api.getPublished({
          organizationId: identity.organizationId,
          eventId: identity.eventId,
          ...(identity.formId === undefined ? {} : { formId: identity.formId }),
        });
        const activeFormId = identity.formId ?? published.form.id;
        const handoff = window.sessionStorage.getItem(
          getCfpCompletionHandoffStorageKey(
            identity.organizationId,
            identity.eventId,
            activeFormId,
          ),
        );
        const submissionId = handoff?.trim() ?? "";
        if (!submissionId) {
          router.replace(getCfpStepRoute(eventSlug, "review"));
          return;
        }
        const receipt = await api.getReceipt({
          organizationId: identity.organizationId,
          eventId: identity.eventId,
          submissionId,
        });
        if (!active) return;
        if (!receipt.submissionId || !receipt.submittedAt) {
          router.replace(getCfpStepRoute(eventSlug, "review"));
          return;
        }
        let submissionTitle = "";
        let recipient = "";
        try {
          const submission = await api.loadDraft({
            organizationId: identity.organizationId,
            eventId: identity.eventId,
            submissionId,
          });
          const title = submission.answers.title;
          submissionTitle = typeof title === "string" ? title : "";
          const primary = submission.participants.find(
            (participant) => participant.role === "primary",
          );
          recipient =
            primary?.email ??
            (typeof submission.answers.accountEmail === "string"
              ? submission.answers.accountEmail
              : "");
        } catch {
          // The receipt remains sufficient to confirm submission when the draft view is unavailable.
        }
        if (!active) return;
        setCompletionIdentity({
          organizationId: identity.organizationId,
          eventId: identity.eventId,
          formId: activeFormId,
          submissionId,
          canEdit: !cfpIsClosed(published.event),
        });
        setConfirmationDetails({
          eventName: published.event.name,
          confirmationMessage:
            published.form.settings.confirmationMessage || "Your proposal has been received.",
          successContent:
            published.form.settings.successContent || "Thank you for contributing to the program.",
          submissionTitle,
          recipient,
        });
        setConfirmed(true);
      } catch {
        router.replace(getCfpStepRoute(eventSlug, "review"));
      }
    })();

    return () => {
      active = false;
    };
  }, [api, eventSlug, formId, organizationId, router]);
  function editSubmission(): void {
    if (completionIdentity === null || !completionIdentity.canEdit) return;
    window.localStorage.setItem(
      getCfpSubmissionPointerStorageKey(
        completionIdentity.organizationId,
        completionIdentity.eventId,
        completionIdentity.formId,
      ),
      completionIdentity.submissionId,
    );
    router.push(getCfpStepRoute(eventSlug, "submission"));
  }
  function submitAnotherSession(): void {
    if (completionIdentity === null) return;
    clearCfpSubmissionState(eventSlug, completionIdentity, window.localStorage);
    window.sessionStorage.removeItem(
      getCfpCompletionHandoffStorageKey(
        completionIdentity.organizationId,
        completionIdentity.eventId,
        completionIdentity.formId,
      ),
    );
    router.push(getCfpStepRoute(eventSlug, "welcome"));
  }

  if (!confirmed) {
    return (
      <main className={styles.viewport}>
        <section aria-busy="true" aria-live="polite" className={styles.card}>
          <p className={styles.loading}>Confirming your submission…</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.viewport}>
      <section className={`${styles.card} ${styles.completeCard}`}>
        <div aria-hidden="true" className={styles.successMarker}>
          ✓
        </div>
        <h1>
          {confirmationDetails?.submissionTitle
            ? `Submission received: ${confirmationDetails.submissionTitle}`
            : "Submission received"}
        </h1>
        <p>
          {confirmationDetails?.eventName ?? "Your event"} received your proposal.{" "}
          {cfpConfirmationEmailMessage(confirmationDetails?.recipient ?? "")}
        </p>
        <p>{confirmationDetails?.confirmationMessage ?? "Your proposal has been received."}</p>
        <p>{confirmationDetails?.successContent ?? "Thank you for contributing to the program."}</p>
        <p>
          Check your speaker status dashboard for the submission and any tasks that need to be
          completed.
        </p>
        <a href="/portal/submissions">View submission status dashboard</a>
        {completionIdentity?.canEdit ? (
          <Button className={styles.textButton} onClick={editSubmission} variant="ghost">
            Edit submission
          </Button>
        ) : null}
        <Button className={styles.textButton} onClick={submitAnotherSession} variant="ghost">
          Submit another session
        </Button>
        <Button className={styles.primaryButton} onClick={() => router.push("/portal")}>
          Continue to portal →
        </Button>
      </section>
    </main>
  );
}
