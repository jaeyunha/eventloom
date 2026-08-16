"use client";

import { uploadMimeTypeLabels } from "@eventloom/contracts";
import { CheckCircle2, FileText, MailCheck, Upload } from "lucide-react";
import Link from "next/link";
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
import { ThemeToggle } from "../../components/product-shell/theme-toggle";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { RichTextArea } from "../../components/ui/rich-text";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { Separator } from "../../components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { WorkspaceBrandMark } from "../../components/workspace/workspace-brand-mark";
import { WorkspaceContextBar, WorkspaceShell } from "../../components/workspace/workspace-shell";
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
import { shouldConfirmCfpApplicantContext } from "./cfp-account-context";
import { CharacterCount, Field, Input } from "./cfp-field";
import { CFP_STEP_LABELS, CfpProgress } from "./cfp-progress";
import { useCfpStartupStore } from "./cfp-startup-provider";
import { CfpSubmissionWindow } from "./cfp-submission-window";
import styles from "./cfp-wizard.module.css";
import {
  canSaveCfpDraftAtStep,
  cfpConfirmationEmailMessage,
  cfpHttpUrlIsValid,
  cfpPublishedFieldIsVisible,
  cfpReviewSubmissionDetails,
  cfpSubmissionErrorKey,
  cfpSubmissionFieldValue,
  cfpSubmissionPayload,
  shouldAuthenticateCfpAccount,
} from "./cfp-wizard-model";

export { cfpHttpUrlIsValid, cfpPublishedFieldIsVisible };

import { clearCfpSubmissionState, getCfpSubmissionPointerStorageKey } from "./draft-persistence";
import {
  cfpStepRequiresAuthentication,
  getCfpStepRoute,
  getNextCfpStep,
  getPreviousCfpStep,
} from "./routes";
import {
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
import {
  clearCfpVerificationContinuation,
  createCfpVerificationCallbackUrl,
  readCfpVerificationContinuation,
  writeCfpVerificationContinuation,
} from "./verification-continuation";

const LOCAL_MAIL_INBOX_URL =
  process.env.NODE_ENV === "development" ? "http://127.0.0.1:8025/" : null;

const CFP_COMPLETION_HANDOFF_PREFIX = "eventloom:cfp-completion:v1";

export function getCfpCompletionHandoffStorageKey(
  organizationId: string,
  eventId: string,
  formId: string,
): string {
  return `${CFP_COMPLETION_HANDOFF_PREFIX}:${encodeURIComponent(
    organizationId,
  )}:${encodeURIComponent(eventId)}:${encodeURIComponent(formId)}`;
}
export function getCfpPortalHandoffHref(
  path: "/portal" | "/portal/submissions",
  eventId?: string,
): string {
  const normalizedEventId = eventId?.trim();
  return normalizedEventId ? `${path}?event=${encodeURIComponent(normalizedEventId)}` : path;
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

function fileNameStorageKey(assetId: string): string {
  return `eventloom:cfp-upload-name:v1:${assetId}`;
}
function clearCfpVerificationContinuationFromBrowser(
  identity: { organizationId: string; eventId: string; formId: string } | null,
): void {
  if (identity === null || typeof window === "undefined") return;
  clearCfpVerificationContinuation(identity, window.localStorage);
}

function readPersistedFileNames(
  form: CfpPublishedForm | undefined,
  answers: DynamicAnswers,
  storage: Pick<Storage, "getItem">,
): Record<string, string> {
  const fileNames: Record<string, string> = {};
  for (const field of form?.submissionFields ?? []) {
    if (field.kind !== "file_request") continue;
    const answer = answers[field.key];
    const persistedAssetId =
      typeof answer === "object" &&
      answer !== null &&
      "assetId" in answer &&
      typeof answer.assetId === "string"
        ? answer.assetId
        : undefined;
    if (persistedAssetId === undefined) continue;
    const persistedFileName = storage.getItem(fileNameStorageKey(persistedAssetId));
    if (persistedFileName !== null) fileNames[persistedAssetId] = persistedFileName;
  }
  return fileNames;
}

interface CfpWizardProps {
  eventSlug: string;
  step: CfpStep;
  organizationId?: string;
  formId?: string;
  api?: CfpApi;
}

function PublicCfpShell({
  children,
  organization,
  event,
  eventName,
  form,
  formName,
  step,
  className,
}: {
  children: ReactNode;
  organization?: PublishedCfp["organization"] | undefined;
  event?: PublishedCfp["event"] | undefined;
  eventName?: string | undefined;
  form?: CfpPublishedForm | undefined;
  formName?: string | undefined;
  step?: CfpStep | undefined;
  className?: string | undefined;
}) {
  const resolvedOrganizationName = organization?.name ?? "Eventloom";
  const resolvedEventName = event?.name ?? eventName ?? "Eventloom";
  const resolvedFormName = form?.name ?? formName ?? "Call for proposals";
  const resolvedStepName = step === undefined ? "Submission complete" : CFP_STEP_LABELS[step];
  const now = Date.now();
  const opensAt = event ? Date.parse(event.opensAt) : Number.NaN;
  const closesAt = event ? Date.parse(event.closesAt) : Number.NaN;
  const windowStatus =
    Number.isFinite(closesAt) && closesAt <= now
      ? "closed"
      : Number.isFinite(opensAt) && opensAt > now
        ? "upcoming"
        : "open";

  return (
    <WorkspaceShell
      className={styles.publicWorkspace ?? ""}
      contentBodyClassName={styles.publicContentBody ?? ""}
      contextBar={
        <WorkspaceContextBar
          actions={
            <div className={styles.publicThemeAction}>
              <ThemeToggle />
            </div>
          }
          className={styles.publicContextBar ?? ""}
          event={resolvedEventName}
          metadata={resolvedStepName}
          organization={resolvedOrganizationName}
        />
      }
      mainClassName={styles.publicMain ?? ""}
      mainId="cfp-main"
      navigation={
        <div className={styles.contextRail} data-cfp-context-rail>
          <div className={styles.publicBrand}>
            <WorkspaceBrandMark />
            <span className={styles.publicBrandCopy}>
              <strong>{resolvedOrganizationName}</strong>
              <span>Applicant workspace</span>
            </span>
          </div>
          <Separator className={styles.railSeparator} />
          <div className={styles.railIntro}>
            <p className={styles.railKicker}>Call for proposals</p>
            <p className={styles.railEventName}>{resolvedEventName}</p>
            <p className={styles.railFormName}>{resolvedFormName}</p>
          </div>
          {step ? <CfpProgress step={step} /> : <CfpProgress complete />}
        </div>
      }
    >
      <div className={styles.viewport}>
        <Card className={`${styles.card} ${className ?? ""}`}>
          <div className={styles.formColumn} data-cfp-main-flow>
            {event ? (
              <div className={styles.submissionWindow}>
                <CfpSubmissionWindow
                  opensAt={event.opensAt}
                  closesAt={event.closesAt}
                  {...(form ? { limit: formSubmissionLimit(form) } : {})}
                  status={windowStatus}
                  timeZone={event.timezone}
                />
              </div>
            ) : null}
            {step ? <CfpProgress mobile step={step} /> : <CfpProgress complete mobile />}
            {children}
          </div>
        </Card>
      </div>
    </WorkspaceShell>
  );
}

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

type CfpVerificationState =
  | {
      readonly status: "waiting";
      readonly email: string;
    }
  | {
      readonly status: "resuming";
      readonly email: string;
    };

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

type CfpAccountMode = "sign_in" | "sign_up";

function configuredCfpIdentity(
  eventSlug: string,
  organizationId?: string,
  formId?: string,
): { organizationId: string; eventId: string; formId?: string } {
  const normalizedEventSlug = eventSlug.trim();
  const resolvedOrganizationId =
    organizationId?.trim() || (process.env.NODE_ENV === "test" ? "organization-1" : "");
  const resolvedFormId = formId?.trim() || undefined;
  if (!normalizedEventSlug) {
    throw new Error("CFP identity is not configured because the event slug is missing.");
  }
  if (!resolvedOrganizationId) {
    throw new Error(`CFP identity is not configured for '${normalizedEventSlug}'.`);
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
      const value = fieldValueForValidation(
        field,
        cfpSubmissionFieldValue(draft, answers, field.key),
      );
      const key = cfpSubmissionErrorKey(field.key);
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
      if (field.kind === "url" && typeof value === "string" && value.trim()) {
        if (!cfpHttpUrlIsValid(value)) {
          errors[key] = `Enter a valid ${field.label.toLowerCase()} URL.`;
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
        if (field.kind === "url" && typeof value === "string" && value.trim()) {
          if (!cfpHttpUrlIsValid(value)) {
            errors[key] = `Enter a valid ${field.label.toLowerCase()} URL.`;
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
    "submission.abstract": ["abstract"],
    "submission.description": ["description"],
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
  const routeIdentity = useMemo(() => {
    try {
      return configuredCfpIdentity(eventSlug, organizationId, formId);
    } catch {
      return null;
    }
  }, [eventSlug, organizationId, formId]);
  const api = useMemo(() => providedApi ?? createCfpApi(""), [providedApi]);
  const startupStore = useCfpStartupStore();
  const [draft, setDraft] = useState<CfpDraft>(initialDraft);
  const [dynamicAnswers, setDynamicAnswers] = useState<DynamicAnswers>({});
  const [participantAnswers, setParticipantAnswers] = useState<ParticipantAnswers>({});
  const [fileUploadStates, setFileUploadStates] = useState<FileUploadStates>({});
  const [published, setPublished] = useState<PublishedCfp | null>(null);
  const identity = useMemo(() => {
    if (routeIdentity === null || published === null) return null;
    return {
      organizationId: routeIdentity.organizationId,
      eventId: published.event.id,
      formId: published.form.id,
    };
  }, [published, routeIdentity]);
  const [authenticatedSession, setAuthenticatedSession] = useState<CfpAuthenticatedSession | null>(
    null,
  );
  const [verificationState, setVerificationState] = useState<CfpVerificationState | null>(null);
  const [confirmedApplicantContext, setConfirmedApplicantContext] = useState(false);
  const requiresApplicantContextConfirmation =
    authenticatedSession !== null &&
    identity !== null &&
    shouldConfirmCfpApplicantContext(authenticatedSession, identity.organizationId);
  const [password, setPassword] = useState("");
  const [accountMode, setAccountMode] = useState<CfpAccountMode>("sign_in");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [mutationPending, setMutationPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const verificationResumeRequestedRef = useRef(false);
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
    setVerificationState(null);
    verificationResumeRequestedRef.current = false;
    let active = true;
    const controller = new AbortController();
    if (!routeIdentity) {
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
        const startup = startupStore.load(api, routeIdentity);
        const [publishedCfp, session] = await Promise.all([startup.published, startup.session]);
        if (!active) return;
        setAuthenticatedSession(session);
        setPublished(publishedCfp);
        const canonicalIdentity = {
          organizationId: routeIdentity.organizationId,
          eventId: publishedCfp.event.id,
          formId: publishedCfp.form.id,
        };
        const verificationContinuation =
          step === "account"
            ? readCfpVerificationContinuation(canonicalIdentity, window.localStorage)
            : null;
        const activeFormId = canonicalIdentity.formId;
        const pointerKey = getCfpSubmissionPointerStorageKey(
          canonicalIdentity.organizationId,
          canonicalIdentity.eventId,
          activeFormId,
        );
        if (step === "welcome" || step === "account") {
          window.sessionStorage.removeItem(
            getCfpCompletionHandoffStorageKey(
              canonicalIdentity.organizationId,
              canonicalIdentity.eventId,
              activeFormId,
            ),
          );
        }
        const pointer = window.localStorage.getItem(pointerKey);
        if (pointer) {
          try {
            const saved = await api.loadDraft({
              organizationId: canonicalIdentity.organizationId,
              eventId: canonicalIdentity.eventId,
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
        if (verificationContinuation !== null) {
          const continuationEmail = verificationContinuation.account.email.trim().toLowerCase();
          if (session === null) {
            setDraft((current) => ({
              ...current,
              account: verificationContinuation.account,
            }));
            setVerificationState({
              status: "waiting",
              email: verificationContinuation.account.email,
            });
          } else if (session.email === continuationEmail) {
            setDraft((current) =>
              syncPrimaryParticipant(
                draftWithAuthenticatedSession(
                  {
                    ...current,
                    account: verificationContinuation.account,
                  },
                  session,
                ),
              ),
            );
            setVerificationState({ status: "resuming", email: session.email });
          } else {
            clearCfpVerificationContinuation(canonicalIdentity, window.localStorage);
          }
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
  }, [api, eventSlug, initialDraft, routeIdentity, startupStore, step]);

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
          const hasPublishedAbstract =
            published?.form.submissionFields.some((field) => field.key === "abstract") ?? false;
          if (key === "abstract" || !hasPublishedAbstract) {
            return {
              ...current,
              submission: { ...current.submission, description: String(value ?? "") },
            };
          }
          return current;
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
    if (state.status === "ready" && state.assetId && state.name) {
      window.sessionStorage.setItem(fileNameStorageKey(state.assetId), state.name);
    }
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
    const payload = cfpSubmissionPayload(nextDraft, dynamicAnswers, participantAnswers);
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
      if (!identity) throw new Error("The CFP identity is not configured.");
      if (step === "account") {
        clearCfpVerificationContinuation(identity, window.localStorage);
        setVerificationState(null);
      }
      router.push(getCfpStepRoute(identity.organizationId, eventSlug, targetStep));
    } catch (error) {
      if (!mutationGateRef.current?.isCurrent(operation.lease)) return;
      if (error instanceof CfpVerificationRequiredError) {
        setErrors({});
        setSaveState("idle");
        setSaveError(null);
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
    if (step === "account" && !authenticatedSession && accountMode === "sign_in") {
      for (const key of Object.keys(nextErrors)) {
        if (key !== "account.email" && key !== "account.password") {
          delete nextErrors[key];
        }
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }

    let nextDraft = draft;
    if (step === "account") nextDraft = syncPrimaryParticipant(draft);
    const authenticateBeforePersist = shouldAuthenticateCfpAccount(step, authenticatedSession)
      ? async (candidateDraft: CfpDraft) => {
          const authentication = await api.authenticateAccount({
            email: candidateDraft.account.email,
            mode: accountMode,
            password,
            name: `${candidateDraft.account.firstName} ${candidateDraft.account.lastName}`.trim(),
            ...(typeof window === "undefined"
              ? {}
              : {
                  verificationCallbackUrl: createCfpVerificationCallbackUrl(window.location.href),
                }),
          });
          if (authentication.status === "verification_required") {
            if (!identity) throw new Error("The CFP identity is not configured.");
            writeCfpVerificationContinuation(identity, candidateDraft.account, window.localStorage);
            setVerificationState({
              status: "waiting",
              email: candidateDraft.account.email.trim().toLowerCase(),
            });
            throw new CfpVerificationRequiredError();
          }
          setAuthenticatedSession(authentication.session);
          if (routeIdentity !== null) {
            startupStore.updateSession(routeIdentity, authentication.session);
          }
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
        router.push(
          getCfpStepRoute(
            identity?.organizationId ?? organizationId?.trim() ?? "",
            eventSlug,
            invalidStep,
          ),
        );
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
    if (previous) {
      router.push(
        getCfpStepRoute(
          identity?.organizationId ?? organizationId?.trim() ?? "",
          eventSlug,
          previous,
        ),
      );
    }
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

  function useDifferentVerificationEmail(): void {
    if (identity) clearCfpVerificationContinuationFromBrowser(identity);
    setVerificationState(null);
    setPassword("");
    updateDraft((current) => ({
      ...current,
      account: { ...current.account, email: "" },
    }));
  }

  function changeAccountMode(nextMode: CfpAccountMode): void {
    setAccountMode(nextMode);
    setSaveError(null);
    setErrors((current) => {
      if (nextMode === "sign_up") return current;

      const next = { ...current };
      delete next["account.firstName"];
      delete next["account.lastName"];
      delete next["account.acceptedTerms"];
      return next;
    });
  }

  useEffect(() => {
    if (
      step !== "account" ||
      !hydrated ||
      authenticatedSession === null ||
      verificationState?.status !== "resuming" ||
      verificationResumeRequestedRef.current
    ) {
      return;
    }
    verificationResumeRequestedRef.current = true;
    formRef.current?.requestSubmit();
  }, [authenticatedSession, hydrated, step, verificationState]);

  useEffect(() => {
    if (
      hydrated &&
      cfpStepRequiresAuthentication(step) &&
      authenticatedSession === null &&
      routeIdentity !== null
    ) {
      router.replace(getCfpStepRoute(routeIdentity.organizationId, eventSlug, "account"));
    }
  }, [authenticatedSession, eventSlug, hydrated, routeIdentity, router, step]);

  if (cfpStepRequiresAuthentication(step) && (!hydrated || authenticatedSession === null)) {
    return <span aria-hidden="true" data-cfp-route-state="checking-session" hidden />;
  }

  if (!hydrated) {
    return (
      <PublicCfpShell step={step}>
        <div aria-busy="true" aria-live="polite" className={styles.loading}>
          Loading your submission draft…
        </div>
      </PublicCfpShell>
    );
  }
  if (published === null) {
    return (
      <PublicCfpShell step={step}>
        <section className={styles.errorSummary} role="alert">
          <h2>Submission form unavailable</h2>
          <p>{saveError ?? "The published submission form could not be loaded."}</p>
        </section>
      </PublicCfpShell>
    );
  }

  return (
    <PublicCfpShell
      organization={published.organization}
      event={published.event}
      form={published.form}
      step={step}
    >
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
              The pinned server draft cannot be loaded with this form version. Discard it only when
              you are ready to start a new submission.
            </p>
          ) : null}
          <div className={styles.forwardActions}>
            <Button
              disabled={
                staleFormConflict.pinnedDraftUnavailable || staleFormConflict.submissionId === null
              }
              onClick={reloadPinnedDraft}
              type="button"
              variant="secondary"
            >
              Reload pinned draft
            </Button>
            <Button onClick={discardStaleDraftAndStartNew} type="button" variant="destructive">
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
          ({published?.event?.timezone ?? "event timezone"}). New draft creation and proposal edits
          are locked after close; the server enforces this saved status.
        </p>
      ) : null}
      {!published && saveState === "error" ? (
        <p className={styles.fieldError} role="alert">
          {saveError ?? "The published CFP could not be loaded. Refresh to try again."}
        </p>
      ) : null}
      <form
        className={step === "account" ? styles.accountForm : undefined}
        data-cfp-account-form={step === "account" ? "true" : undefined}
        ref={formRef}
        noValidate
        onSubmit={(event) => void continueFlow(event)}
      >
        {step === "welcome" ? (
          <WelcomeStep
            {...(published === null ? {} : { event: published.event, form: published.form })}
            closed={submissionsClosed}
          />
        ) : null}
        {step === "account" ? (
          <AccountStep
            accountMode={accountMode}
            authenticatedSession={authenticatedSession}
            confirmedApplicantContext={confirmedApplicantContext}
            draft={draft}
            errors={errors}
            onAccountModeChange={changeAccountMode}
            onConfirmApplicantContext={() => setConfirmedApplicantContext(true)}
            password={password}
            requiresApplicantContextConfirmation={requiresApplicantContextConfirmation}
            setPassword={setPassword}
            updateDraft={updateDraft}
            verificationState={verificationState}
            onUseDifferentEmail={useDifferentVerificationEmail}
          />
        ) : null}
        {step === "submission" ? (
          <SubmissionStep
            draft={draft}
            errors={errors}
            form={published.form}
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
            fileUploadStates={fileUploadStates}
            organizationId={identity?.organizationId ?? ""}
            {...(published === null ? {} : { form: published.form })}
            answers={dynamicAnswers}
          />
        ) : null}

        <div
          className={`${styles.actions} ${
            step === "account" ? `${styles.actionsSingleSecondary} ${styles.accountActions}` : ""
          }`}
          data-cfp-actions="true"
        >
          {step !== "welcome" ? (
            <Button
              className={styles.backButton}
              disabled={mutationPending}
              onClick={goBack}
              type="button"
              variant="outline"
            >
              ← Back
            </Button>
          ) : (
            <span />
          )}
          <div className={styles.forwardActions}>
            {canSaveCfpDraftAtStep(step) ? (
              <Button
                className={styles.draftButton}
                onClick={() => void saveNow()}
                type="button"
                variant="secondary"
                disabled={mutationPending || submissionsClosed}
              >
                Save as draft
              </Button>
            ) : null}
            {!submissionsClosed && verificationState === null ? (
              <Button
                className={styles.primaryButton}
                disabled={
                  mutationPending ||
                  (step === "account" &&
                    requiresApplicantContextConfirmation &&
                    !confirmedApplicantContext)
                }
                type="submit"
              >
                {step === "welcome" ? "Continue →" : null}
                {step === "account"
                  ? authenticatedSession
                    ? mutationPending
                      ? "Continuing…"
                      : "Continue to proposal"
                    : accountMode === "sign_in"
                      ? mutationPending
                        ? "Signing in…"
                        : "Sign in and continue"
                      : mutationPending
                        ? "Creating account…"
                        : "Create account and continue"
                  : null}
                {step === "submission" ? "Next step →" : null}
                {step === "participants" ? "Continue to review →" : null}
                {step === "review" ? "Submit" : null}
              </Button>
            ) : null}
          </div>
        </div>
      </form>
      {step !== "welcome" && step !== "account" ? (
        <div className={styles.sessionFooter} data-cfp-session-footer="true">
          {verificationState?.status === "waiting"
            ? `Verification email sent to ${verificationState.email}.`
            : verificationState?.status === "resuming"
              ? `Email verified for ${verificationState.email}. Continuing to your proposal…`
              : authenticatedSession
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
    </PublicCfpShell>
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
      <p className={styles.welcomeEyebrow}>{form?.name ?? "Call for Speakers"}</p>
      <h1>{event?.name ?? "Welcome to our event!"}</h1>
      <p className={styles.welcomePurpose}>{content}</p>
      <p className={styles.welcomeNote}>
        Your speaker portal will show the status of your submission and any tasks assigned after
        acceptance.
      </p>
      <section aria-labelledby="resources-title" className={styles.welcomeResources}>
        <h2 id="resources-title">Resources</h2>
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
      </section>
      {closed ? (
        <p className={styles.closedNotice} role="status">
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
  accountMode,
  draft,
  errors,
  confirmedApplicantContext,
  onAccountModeChange,
  onConfirmApplicantContext,
  password,
  requiresApplicantContextConfirmation,
  setPassword,
  updateDraft,
  authenticatedSession,
  verificationState,
  onUseDifferentEmail,
}: StepFormProps & {
  accountMode: CfpAccountMode;
  confirmedApplicantContext: boolean;
  onAccountModeChange: (mode: CfpAccountMode) => void;
  onConfirmApplicantContext: () => void;
  password: string;
  requiresApplicantContextConfirmation: boolean;
  setPassword: (value: string) => void;
  authenticatedSession: CfpAuthenticatedSession | null;
  verificationState: CfpVerificationState | null;
  onUseDifferentEmail: () => void;
}) {
  if (verificationState !== null) {
    const resuming = verificationState.status === "resuming";
    return (
      <section aria-live="polite" className={styles.verificationPending} role="status">
        <span aria-hidden="true" className={styles.verificationIcon}>
          <MailCheck />
        </span>
        <p className={styles.verificationEyebrow}>Email verification</p>
        <h1>{resuming ? "Email verified" : "Check your inbox"}</h1>
        {resuming ? (
          <p>Verification is complete. We’re taking you to your proposal now.</p>
        ) : (
          <>
            <p>We sent a verification link to:</p>
            <strong className={styles.verificationRecipient}>{verificationState.email}</strong>
            <p>After verification, you’ll return here and continue automatically.</p>
            <p className={styles.verificationHint}>
              {LOCAL_MAIL_INBOX_URL
                ? "Local development captures this message in Mailpit instead of sending it to Gmail."
                : "Open the link in this browser. If it is not in your inbox, check spam or promotions."}
            </p>
            <div className={styles.verificationActions}>
              {LOCAL_MAIL_INBOX_URL ? (
                <Button asChild className={styles.verificationAction} variant="secondary">
                  <a data-local-mail-inbox href={LOCAL_MAIL_INBOX_URL}>
                    Open local inbox
                  </a>
                </Button>
              ) : null}
              <Button
                className={styles.verificationAction}
                onClick={onUseDifferentEmail}
                type="button"
                variant="outline"
              >
                Use a different email
              </Button>
            </div>
          </>
        )}
      </section>
    );
  }
  const checks = getPasswordChecks(password);
  return (
    <div>
      <h1>
        {authenticatedSession
          ? `Continue as ${authenticatedSession.name}`
          : accountMode === "sign_in"
            ? "Sign in to continue"
            : "Create your account"}
      </h1>
      {authenticatedSession !== null &&
      requiresApplicantContextConfirmation &&
      !confirmedApplicantContext ? (
        <div className={styles.identityBoundary} data-cfp-applicant-context-boundary role="note">
          <strong>You are entering the applicant portal</strong>
          <p>
            This proposal will belong to {authenticatedSession.email}. Organizer and reviewer
            permissions are not used here.
          </p>
          <div className={styles.identityBoundaryActions}>
            <Button
              data-cfp-applicant-context-confirm
              onClick={onConfirmApplicantContext}
              type="button"
            >
              Continue as applicant
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href="/admin">Return to organizer workspace</Link>
            </Button>
            <Button asChild type="button" variant="ghost">
              <a href="/login?next=%2Fportal%2Fsubmissions">Use another account</a>
            </Button>
          </div>
        </div>
      ) : null}
      {!authenticatedSession ? (
        <p>
          {accountMode === "sign_in"
            ? "Use your existing Eventloom account to continue to your proposal."
            : "Create an Eventloom account to save this proposal and receive updates."}
        </p>
      ) : null}
      {!authenticatedSession ? (
        <fieldset className={styles.accountModeFieldset} data-cfp-account-access="true">
          <legend className="sr-only">Account access</legend>
          <ToggleGroup
            className={styles.accountModeSwitch}
            onValueChange={(value) => {
              if (value === "sign_in" || value === "sign_up") onAccountModeChange(value);
            }}
            spacing={0}
            type="single"
            value={accountMode}
            variant="outline"
          >
            <ToggleGroupItem
              aria-label="Existing account"
              data-cfp-account-mode="sign_in"
              value="sign_in"
            >
              Existing account
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label="Create account"
              data-cfp-account-mode="sign_up"
              value="sign_up"
            >
              Create account
            </ToggleGroupItem>
          </ToggleGroup>
        </fieldset>
      ) : null}
      <div className={styles.sectionPanel}>
        <Field error={errors["account.email"]} label="Email address" name="account.email" required>
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
          <p role="status">Signed in as {authenticatedSession.email}.</p>
        ) : (
          <>
            <Field
              error={errors["account.password"]}
              label="Password"
              name="account.password"
              required
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  autoComplete={accountMode === "sign_up" ? "new-password" : "current-password"}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              )}
            </Field>
            {accountMode === "sign_up" ? (
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
            ) : null}
          </>
        )}
        {authenticatedSession || accountMode === "sign_up" ? (
          <>
            <div className={styles.twoColumns}>
              <Field
                error={errors["account.firstName"]}
                label="First name"
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
                label="Last name"
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
          </>
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
}: StepFormProps & {
  form: CfpPublishedForm;
  answers: DynamicAnswers;
  fileUploadStates: FileUploadStates;
  onAnswerChange: (key: string, value: unknown) => void;
  onFileUpload: (field: CfpFormField, file: File) => Promise<CfpFileUploadResult>;
  onFileUploadStateChange: (key: string, state: FileUploadState) => void;
}) {
  if (form.submissionFields.length === 0) {
    return (
      <section className={styles.errorSummary} role="alert">
        <h2>Submission form unavailable</h2>
        <p>The published form does not contain any proposal fields.</p>
      </section>
    );
  }
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
  const acceptedTypeLabels = uploadMimeTypeLabels(acceptedTypes);
  const maxSizeLabel =
    maxSize === undefined
      ? undefined
      : maxSize >= 1024 * 1024
        ? `${maxSize / (1024 * 1024)} MB`
        : `${Math.ceil(maxSize / 1024)} KB`;
  const requirementParts = [
    ...(acceptedTypeLabels.length > 0 ? [`Accepted: ${acceptedTypeLabels.join(", ")}`] : []),
    ...(maxSizeLabel ? [`Max ${maxSizeLabel}`] : []),
  ];
  const helpId = `${field.key}-file-help`;
  const errorId = `${field.key}-file-error`;
  const statusId = `${field.key}-file-status`;
  const hasUploadedFile = displayState?.status === "ready";
  const uploadButtonLabel =
    displayState?.status === "pending"
      ? "Uploading…"
      : hasUploadedFile
        ? "Replace file"
        : acceptedTypeLabels.length === 1 && acceptedTypeLabels[0] === "PDF"
          ? "Choose PDF"
          : "Choose file";

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
        onStateChange({ status: "ready", name: result.fileName, assetId: result.assetId });
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
    <div className={styles.fileRequestControl}>
      {requirementParts.length > 0 ? (
        <p className={styles.fieldHint} id={helpId}>
          {requirementParts.join(" · ")}
        </p>
      ) : null}
      <div className={styles.filePicker}>
        <input
          id={id}
          accept={acceptedTypes.length > 0 ? acceptedTypes.join(",") : undefined}
          aria-describedby={[
            ...(requirementParts.length > 0 ? [helpId] : []),
            ...(displayState?.status === "error" ? [errorId] : []),
            ...(displayState?.status === "pending" || displayState?.status === "ready"
              ? [statusId]
              : []),
          ].join(" ")}
          className={styles.fileInput}
          disabled={displayState?.status === "pending"}
          onChange={handleFileChange}
          type="file"
        />
        <label
          aria-disabled={displayState?.status === "pending"}
          className={styles.fileButton}
          htmlFor={id}
        >
          <Upload aria-hidden="true" size={18} />
          {uploadButtonLabel}
        </label>
        <span className={styles.filePickerHint}>
          {hasUploadedFile
            ? "Choose a new file to replace this upload."
            : "Select a file from your device."}
        </span>
      </div>
      {displayState?.status === "pending" ? (
        <div aria-live="polite" className={styles.fileStatus} id={statusId}>
          <FileText aria-hidden="true" size={20} />
          <div>
            <strong>{displayState.name}</strong>
            <span>Uploading securely…</span>
          </div>
        </div>
      ) : null}
      {displayState?.status === "ready" ? (
        <div
          aria-live="polite"
          className={`${styles.fileStatus} ${styles.fileStatusReady}`}
          id={statusId}
        >
          <CheckCircle2 aria-hidden="true" size={20} />
          <div>
            <strong>{displayState.name ?? "Uploaded file"}</strong>
            <span>Uploaded and ready</span>
          </div>
        </div>
      ) : null}
      {displayState?.status === "error" ? (
        <p className={styles.fieldError} id={errorId} role="alert">
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
              rows={field.key === "abstract" ? 6 : 4}
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
          <section
            aria-labelledby={`cfp-section-${section.id}`}
            className={styles.sectionPanel}
            key={section.id}
          >
            <h2 id={`cfp-section-${section.id}`}>{section.title}</h2>
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
              const errorKey = cfpSubmissionErrorKey(field.key);
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
                  value={cfpSubmissionFieldValue(draft, answers, field.key)}
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
          type="button"
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
            <h2>{index === 0 ? "Primary speaker" : `Additional speaker ${index}`}</h2>
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
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            ) : null}
          </div>
          <div className={styles.participantRole}>
            <span>{index === 0 ? "Primary speaker" : "Co-speaker"}</span>
            <p>
              {index === 0
                ? "This person is the main contact and presenter for the proposal."
                : "This person will be listed as an additional presenter."}
            </p>
          </div>
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
          type="button"
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
          <section
            aria-labelledby={`participant-${participant.id}-heading`}
            className={styles.participantCard}
            key={participant.id}
          >
            <div className={styles.participantCardHeading}>
              <h2 id={`participant-${participant.id}-heading`}>
                {index === 0 ? "Primary speaker" : `Additional speaker ${index}`}
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
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <div className={styles.participantRole}>
              <span>{index === 0 ? "Primary speaker" : "Co-speaker"}</span>
              <p>
                {index === 0
                  ? "This person is the main contact and presenter for the proposal."
                  : "This person will be listed as an additional presenter."}
              </p>
            </div>
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
      <Button
        className={styles.textButton}
        onClick={addContact}
        size="sm"
        type="button"
        variant="ghost"
      >
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
              type="button"
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
  fileUploadStates,
  organizationId,
  form,
  answers,
}: {
  draft: CfpDraft;
  eventSlug: string;
  fileUploadStates: FileUploadStates;
  organizationId: string;
  form?: CfpPublishedForm;
  answers: DynamicAnswers;
}) {
  const router = useRouter();
  const submissionDetails = cfpReviewSubmissionDetails(form, draft, answers);
  const [persistedFileNames, setPersistedFileNames] = useState<Record<string, string>>({});
  useEffect(() => {
    setPersistedFileNames(readPersistedFileNames(form, answers, window.sessionStorage));
  }, [answers, form]);
  const uploadedFiles =
    form?.submissionFields.flatMap((field) => {
      if (field.kind !== "file_request") return [];
      const uploadState = fileUploadStates[fileStateKey(field.key)];
      const answer = answers[field.key];
      const persistedAssetId =
        typeof answer === "object" &&
        answer !== null &&
        "assetId" in answer &&
        typeof answer.assetId === "string"
          ? answer.assetId
          : undefined;
      if (uploadState?.status !== "ready" && persistedAssetId === undefined) return [];
      const persistedFileName =
        persistedAssetId === undefined ? undefined : persistedFileNames[persistedAssetId];
      return [
        {
          key: field.key,
          label: field.label,
          name:
            uploadState?.status === "ready" && uploadState.name
              ? uploadState.name
              : (persistedFileName ?? "Uploaded file"),
        },
      ];
    }) ?? [];
  return (
    <div>
      <h1>Review your submission</h1>
      <p>Check that everything looks correct. You can go back to make changes before submitting.</p>
      <section className={styles.reviewCard}>
        <div className={styles.reviewHeading}>
          <h2>Tell us about your submission</h2>
          <Button
            className={styles.textButton}
            onClick={() => router.push(getCfpStepRoute(organizationId, eventSlug, "submission"))}
            size="sm"
            type="button"
            variant="ghost"
          >
            ✎ Edit session
          </Button>
        </div>
        {submissionDetails.map((detail) => (
          <ReviewValue key={detail.key} label={detail.label} value={detail.value} />
        ))}
        {uploadedFiles.length > 0 ? (
          <div className={styles.reviewFiles}>
            <p className={styles.reviewFilesLabel}>Uploaded files</p>
            {uploadedFiles.map((file) => (
              <div className={styles.reviewFile} key={file.key}>
                <FileText aria-hidden="true" size={20} />
                <div>
                  <span>{file.label}</span>
                  <strong>{file.name}</strong>
                </div>
                <span className={styles.reviewFileStatus}>
                  <CheckCircle2 aria-hidden="true" size={16} />
                  Ready
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className={styles.reviewCard}>
        <div className={styles.reviewHeading}>
          <h2>Tell us about you</h2>
          <Button
            className={styles.textButton}
            onClick={() => router.push(getCfpStepRoute(organizationId, eventSlug, "participants"))}
            size="sm"
            type="button"
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
            <ReviewValue label="Biography" value={participant.biography || "Not provided"} />
          </div>
        ))}
      </section>
    </div>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  if (value.trim().length === 0) return null;
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
  const [publishedCfp, setPublishedCfp] = useState<PublishedCfp | null>(null);
  const api = useMemo(() => providedApi ?? createCfpApi(""), [providedApi]);
  const startupStore = useCfpStartupStore();

  useEffect(() => {
    let active = true;
    let identity: { organizationId: string; eventId: string; formId?: string };
    try {
      identity = configuredCfpIdentity(eventSlug, organizationId, formId);
    } catch {
      const scopedOrganizationId = organizationId?.trim() ?? "";
      if (scopedOrganizationId.length > 0) {
        router.replace(getCfpStepRoute(scopedOrganizationId, eventSlug, "review"));
      }
      return () => {
        active = false;
      };
    }
    void (async () => {
      try {
        const published = await startupStore.load(api, identity).published;
        if (!active) return;
        setPublishedCfp(published);
        const canonicalEventId = published.event.id;
        const activeFormId = published.form.id;
        const handoff = window.sessionStorage.getItem(
          getCfpCompletionHandoffStorageKey(
            identity.organizationId,
            canonicalEventId,
            activeFormId,
          ),
        );
        const submissionId = handoff?.trim() ?? "";
        if (!submissionId) {
          router.replace(getCfpStepRoute(identity.organizationId, eventSlug, "review"));
          return;
        }
        const receipt = await api.getReceipt({
          organizationId: identity.organizationId,
          eventId: canonicalEventId,
          submissionId,
        });
        if (!active) return;
        if (!receipt.submissionId || !receipt.submittedAt) {
          router.replace(getCfpStepRoute(identity.organizationId, eventSlug, "review"));
          return;
        }
        let submissionTitle = "";
        let recipient = "";
        try {
          const submission = await api.loadDraft({
            organizationId: identity.organizationId,
            eventId: canonicalEventId,
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
          eventId: canonicalEventId,
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
        router.replace(getCfpStepRoute(identity.organizationId, eventSlug, "review"));
      }
    })();

    return () => {
      active = false;
    };
  }, [api, eventSlug, formId, organizationId, router, startupStore]);
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
    router.push(getCfpStepRoute(completionIdentity.organizationId, eventSlug, "submission"));
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
    router.push(getCfpStepRoute(completionIdentity.organizationId, eventSlug, "welcome"));
  }

  if (!confirmed) {
    return (
      <PublicCfpShell
        event={publishedCfp?.event}
        form={publishedCfp?.form}
        organization={publishedCfp?.organization}
      >
        <div aria-busy="true" aria-live="polite" className={styles.loading}>
          Confirming your submission…
        </div>
      </PublicCfpShell>
    );
  }

  return (
    <PublicCfpShell
      className={styles.completeCard}
      event={publishedCfp?.event}
      form={publishedCfp?.form}
      organization={publishedCfp?.organization}
    >
      <div className={styles.completeContent}>
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
        {completionIdentity?.canEdit ? (
          <Button
            className={styles.textButton}
            onClick={editSubmission}
            type="button"
            variant="ghost"
          >
            Edit submission
          </Button>
        ) : null}
        <Button
          className={styles.textButton}
          onClick={submitAnotherSession}
          type="button"
          variant="ghost"
        >
          Submit another session
        </Button>
        <Button
          className={styles.primaryButton}
          onClick={() =>
            router.push(getCfpPortalHandoffHref("/portal/submissions", completionIdentity?.eventId))
          }
          type="button"
        >
          View submission status dashboard
        </Button>
      </div>
    </PublicCfpShell>
  );
}
