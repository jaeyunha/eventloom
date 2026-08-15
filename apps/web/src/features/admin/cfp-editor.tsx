"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  type CfpFormField as ApiCfpFormField,
  type CfpApi,
  CfpApiError,
  type CfpEventConfiguration,
  type CfpFormConfiguration,
  createCfpApi,
} from "../cfp/api";
import { getCfpStepRoute } from "../cfp/routes";
import styles from "./cfp-editor.module.css";

const ORGANIZER_STICKY_HEADER_HEIGHT = 52;
const ORGANIZER_SCROLL_CONTAINER_ID = "admin-content";
const STICKY_SECTION_GAP = 16;
const DEFAULT_FILE_REQUEST_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
] as const;
const DEFAULT_FILE_REQUEST_MAX_BYTES = 25 * 1024 * 1024;

export function cfpSectionScrollOffset(
  organizerHeaderHeight: number,
  navigationHeight: number,
): number {
  return organizerHeaderHeight + navigationHeight + STICKY_SECTION_GAP;
}

export function cfpActiveSectionThreshold(
  organizerHeaderHeight: number,
  navigationHeight: number,
): number {
  return cfpSectionScrollOffset(organizerHeaderHeight, navigationHeight) + 24;
}

export function cfpContainerScrollTop(
  containerScrollTop: number,
  targetTop: number,
  containerTop: number,
  navigationHeight: number,
): number {
  return Math.max(
    0,
    containerScrollTop + targetTop - containerTop - cfpSectionScrollOffset(0, navigationHeight),
  );
}

type FieldType =
  | "text"
  | "email"
  | "url"
  | "textarea"
  | "select"
  | "multi_select"
  | "rich_text"
  | "boolean"
  | "number"
  | "file_request";

export interface CfpFormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  visible: boolean;
  placeholder: string;
  sectionId?: string;
  key?: string;
  kind?: string;
  options?: ApiCfpFormField["options"];
  fieldRef?: NonNullable<ApiCfpFormField["fieldRef"]>;
  fieldVersion?: number;
  fileRequest?: NonNullable<ApiCfpFormField["fileRequest"]>;
  config?: Record<string, unknown>;
  description?: string;
}

export interface CfpCondition {
  type: "condition";
  field: string;
  operator: "is" | "is not";
  value: string;
}

export interface CfpConditionGroup {
  type: "group";
  operator: "AND" | "OR";
  conditions: CfpRule[];
}

export type CfpRule = CfpCondition | CfpConditionGroup;

export interface CfpConfiguration {
  eventName: string;
  slug: string;
  timezone: string;
  opensAt: string;
  closesAt: string;
  participantLimit: number;
  proposalLimit: number;
  reminderEmails: boolean;
  adminNotifications: boolean;
  welcomeTitle: string;
  welcomeBody: string;
  confirmationTitle: string;
  confirmationBody: string;
  successMessage: string;
  redirectUrl: string;
  tracks: string[];
  tags: string[];
  formats: string[];
  levels: string[];
  helpfulLinks: Array<{ label: string; href: string }>;
  fields: CfpFormField[];
  participantFields?: CfpFormField[];
  sections?: CfpFormConfiguration["sections"];
  rules?: CfpFormConfiguration["rules"];
  rule: CfpRule;
  ruleAction: string;
  ruleTargetField?: string;
  editorRuleId?: string;
  id?: string;
  status?: "draft" | "published" | "closed";
  eventVersion?: number;
  formVersion?: number;
}

const CORE_PROPOSAL_FIELDS: readonly CfpFormField[] = [
  {
    id: "title",
    key: "title",
    label: "Session title",
    type: "text",
    required: true,
    visible: true,
    placeholder: "A clear, specific title",
    options: [],
  },
  {
    id: "abstract",
    key: "abstract",
    label: "Abstract",
    type: "textarea",
    required: false,
    visible: true,
    placeholder: "A concise summary for reviewers and attendees",
    options: [],
  },
  {
    id: "description",
    key: "description",
    label: "Description",
    type: "textarea",
    required: false,
    visible: true,
    placeholder: "Objectives, outline, and expected audience takeaways",
    options: [],
  },
];

function withCoreProposalFields(fields: CfpFormField[]): CfpFormField[] {
  const coreKeys = new Set(CORE_PROPOSAL_FIELDS.map((field) => field.key));
  const fieldsByKey = new Map(fields.map((field) => [field.key ?? field.id, field]));
  return [
    ...CORE_PROPOSAL_FIELDS.map((field) => {
      const existing = fieldsByKey.get(field.key ?? field.id);
      return existing === undefined ? { ...field, options: [...(field.options ?? [])] } : existing;
    }),
    ...fields.filter((field) => !coreKeys.has(field.key ?? field.id)),
  ];
}

function createEmptyCfpConfiguration(eventId: string): CfpConfiguration {
  return {
    eventName: "",
    slug: "",
    timezone: "UTC",
    opensAt: "",
    closesAt: "",
    participantLimit: 1,
    proposalLimit: 3,
    reminderEmails: false,
    adminNotifications: false,
    welcomeTitle: "",
    welcomeBody: "",
    confirmationTitle: "",
    confirmationBody: "",
    successMessage: "",
    redirectUrl: "",
    tracks: [],
    tags: [],
    formats: [],
    levels: [],
    helpfulLinks: [],
    fields: withCoreProposalFields([]),
    rule: {
      type: "condition",
      field: "title",
      operator: "is not",
      value: "",
    },
    ruleAction: "",
    id: `${eventId}-cfp`,
    status: "draft",
  };
}

const SECTION_LINKS = [
  { id: "event-details", label: "Event details" },
  { id: "messaging", label: "Messaging" },
  { id: "taxonomy", label: "Taxonomy & links" },
  { id: "fields-rules", label: "Fields & rules" },
  { id: "public-preview", label: "Public preview" },
] as const;

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
];

function validCfpTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function localCfpDateToIso(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match || !validCfpTimeZone(timeZone)) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const localMilliseconds = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(localMilliseconds)) return null;
  let candidate = localMilliseconds;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const wallMilliseconds = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    candidate = localMilliseconds - (wallMilliseconds - candidate);
  }
  const result = new Date(candidate);
  return Number.isFinite(result.getTime()) ? result.toISOString() : null;
}

function instantFromDate(value: string, timeZone = "UTC"): string {
  if (value.includes("T")) return value;
  return localCfpDateToIso(value, timeZone) ?? `${value}T00:00:00.000Z`;
}

function dateFromInstant(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export function validateCfpDateRange(
  opensAt: string,
  closesAt: string,
  timeZone = "UTC",
): string | null {
  const openTime = Date.parse(instantFromDate(opensAt, timeZone));
  const closeTime = Date.parse(instantFromDate(closesAt, timeZone));
  if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) {
    return "Enter valid open and close dates.";
  }
  if (openTime >= closeTime) {
    return "The close date must be after the open date.";
  }
  return null;
}

export function isCfpCloseDatePast(value: string, now = new Date(), timeZone = "UTC"): boolean {
  const closeTime = Date.parse(instantFromDate(value, timeZone));
  return Number.isFinite(closeTime) && closeTime < now.getTime();
}
export function closeCfpNowInstant(
  opensAt: string,
  now = new Date(),
  timeZone = "UTC",
): string | null {
  const openTime = Date.parse(instantFromDate(opensAt, timeZone));
  const nowTime = now.getTime();
  if (!Number.isFinite(openTime) || !Number.isFinite(nowTime)) return null;

  // The API rejects an instant before the opening instant. When an organizer
  // closes a not-yet-open CFP, use the first valid instant after opening.
  return new Date(Math.max(nowTime, openTime + 1)).toISOString();
}

export function closeCfpNowConfiguration(
  configuration: CfpConfiguration,
  now = new Date(),
): CfpConfiguration {
  const closesAt = closeCfpNowInstant(configuration.opensAt, now, configuration.timezone);
  if (closesAt === null) {
    throw new Error("The CFP cannot be closed because its opening instant is invalid.");
  }
  return { ...configuration, closesAt };
}
export function selectEditorForm(
  forms: CfpFormConfiguration[],
  organizationId: string,
  eventId: string,
): CfpFormConfiguration | undefined {
  const statusOrder = { published: 0, draft: 1, closed: 2 } as const;
  return forms
    .filter((form) => form.tenantId === organizationId && form.eventId === eventId)
    .slice()
    .sort((left, right) => {
      return (
        statusOrder[left.status] - statusOrder[right.status] ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      );
    })[0];
}

export async function loadCfpEditorConfiguration(
  api: CfpApi,
  input: { readonly organizationId: string; readonly eventId: string; readonly formId?: string },
): Promise<{
  readonly event: CfpEventConfiguration;
  readonly form: CfpFormConfiguration | undefined;
}> {
  const event = await api.getEvent({
    organizationId: input.organizationId,
    eventId: input.eventId,
  });
  if (input.formId !== undefined) {
    try {
      const form = await api.getForm({
        organizationId: input.organizationId,
        eventId: input.eventId,
        formId: input.formId,
      });
      return { event, form };
    } catch (error) {
      if (!(error instanceof CfpApiError) || error.status !== 404) throw error;
      return { event, form: undefined };
    }
  }
  const forms = await api.listForms({
    organizationId: input.organizationId,
    eventId: input.eventId,
  });
  return {
    event,
    form: selectEditorForm(forms, input.organizationId, input.eventId),
  };
}

function editorFieldType(kind: string): FieldType {
  switch (kind) {
    case "email":
      return "email";
    case "url":
      return "url";
    case "rich_text":
      return "textarea";
    case "textarea":
      return "textarea";
    case "select":
      return "select";
    case "multi_select":
      return "multi_select";
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "file_request":
      return "file_request";
    default:
      return "text";
  }
}

function toEditorField(field: ApiCfpFormField): CfpFormField {
  const { config, description, fieldRef, fieldVersion, fileRequest, ...canonicalField } = field;
  return {
    ...canonicalField,
    type: editorFieldType(field.kind),
    required: field.required,
    visible: true,
    placeholder: field.placeholder ?? "",
    options: [...field.options],
    ...(description === undefined ? {} : { description }),
    ...(fieldRef === undefined ? {} : { fieldRef }),
    ...(fieldVersion === undefined ? {} : { fieldVersion }),
    ...(fileRequest === undefined ? {} : { fileRequest }),
    ...(config === undefined ? {} : { config }),
  };
}
function fieldKeyForRuleField(field: string, fields: CfpFormField[]): string {
  const normalized = field.trim().toLocaleLowerCase();
  const matched = fields.find(
    (candidate) =>
      candidate.key?.toLocaleLowerCase() === normalized ||
      candidate.id.toLocaleLowerCase() === normalized ||
      candidate.label.toLocaleLowerCase() === normalized,
  );
  if (matched?.key) return matched.key;
  if (["format", "track", "tags", "level", "language"].includes(normalized)) return normalized;
  return field.trim();
}

function serverRuleCondition(rule: CfpRule, fields: CfpFormField[]): Record<string, unknown> {
  if (rule.type === "condition") {
    return {
      type: "predicate",
      fieldKey: fieldKeyForRuleField(rule.field, fields),
      operator: rule.operator === "is not" ? "not_equals" : "equals",
      value: rule.value,
    };
  }
  return {
    type: "group",
    operator: rule.operator === "OR" ? "any" : "all",
    conditions: rule.conditions.map((condition) => serverRuleCondition(condition, fields)),
  };
}

function editorConditionalRule(
  configuration: CfpConfiguration,
  fields: CfpFormField[],
): Record<string, unknown> | null {
  const targetField = configuration.ruleTargetField?.trim();
  if (!targetField) return null;
  const target = fields.find(
    (field) => field.key === targetField || field.id === targetField || field.label === targetField,
  );
  if (!target?.key) return null;
  const serverRule = serverRuleCondition(configuration.rule, fields);
  return {
    id: configuration.editorRuleId ?? "editor-conditional-rule",
    priority: 100,
    when:
      serverRule.type === "group"
        ? serverRule
        : {
            type: "group",
            operator: "all",
            conditions: [serverRule],
          },
    actions: [{ type: "show_field", fieldKey: target.key }],
  };
}

function toEventConfiguration(
  configuration: CfpConfiguration,
  organizationId: string,
  eventId: string,
): CfpEventConfiguration {
  return {
    id: eventId,
    tenantId: organizationId,
    version: configuration.eventVersion ?? 1,
    slug: configuration.slug,
    name: configuration.eventName,
    timezone: configuration.timezone,
    opensAt: instantFromDate(configuration.opensAt, configuration.timezone),
    closesAt: instantFromDate(configuration.closesAt, configuration.timezone),
  };
}

export function toFormConfiguration(
  configuration: CfpConfiguration,
  organizationId: string,
  eventId: string,
): CfpFormConfiguration {
  const toServerField = (
    field: CfpFormField,
    fallbackSectionId: string,
    fileOwner: "submission" | "participant",
  ): ApiCfpFormField => {
    const kind =
      field.kind ??
      (field.type === "textarea" ? "rich_text" : field.type === "email" ? "email" : field.type);
    const fileRequest =
      kind === "file_request"
        ? {
            allowedMimeTypes: field.fileRequest?.allowedMimeTypes ?? [
              ...DEFAULT_FILE_REQUEST_ALLOWED_MIME_TYPES,
            ],
            maxBytes: field.fileRequest?.maxBytes ?? DEFAULT_FILE_REQUEST_MAX_BYTES,
            required: field.required,
            owner: fileOwner,
          }
        : undefined;
    return {
      id: field.id,
      sectionId: field.sectionId ?? fallbackSectionId,
      key: field.key ?? field.id,
      label: field.label,
      kind,
      ...(field.description === undefined ? {} : { description: field.description }),
      ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
      required: field.required,
      options: field.options ?? [],
      ...(field.fieldRef === undefined ? {} : { fieldRef: field.fieldRef }),
      ...(field.fieldVersion === undefined ? {} : { fieldVersion: field.fieldVersion }),
      ...(fileRequest === undefined ? {} : { fileRequest }),
      ...(field.config === undefined ? {} : { config: field.config }),
    };
  };
  const defaultSectionId = configuration.sections?.[0]?.id ?? "session";
  const taxonomyOptions: Record<string, string[]> = {
    format: configuration.formats,
    tags: configuration.tags,
    track: configuration.tracks,
    level: configuration.levels,
    language: ["English"],
  };
  const fields = configuration.fields.map((field) => {
    const options = field.key === undefined ? undefined : taxonomyOptions[field.key];
    return toServerField(
      options === undefined ? field : { ...field, options },
      defaultSectionId,
      "submission",
    );
  });
  const existingFieldKeys = new Set(fields.map((field) => field.key));
  const taxonomyFields = [
    { key: "format", label: "Format", kind: "select", options: configuration.formats },
    { key: "tags", label: "Tags", kind: "multi_select", options: configuration.tags },
    { key: "track", label: "Track", kind: "select", options: configuration.tracks },
    { key: "level", label: "Level", kind: "select", options: configuration.levels },
    { key: "language", label: "Language", kind: "select", options: ["English"] },
  ]
    .filter((field) => field.options.length > 0)
    .map((field) =>
      toServerField(
        {
          id: `server-${field.key}`,
          key: field.key,
          label: field.label,
          type: editorFieldType(field.kind),
          kind: field.kind,
          required: false,
          visible: true,
          placeholder: "",
          options: field.options,
        },
        defaultSectionId,
        "submission",
      ),
    );
  const editorRuleId = configuration.editorRuleId ?? "editor-conditional-rule";
  const ruleRecords = [...(configuration.rules ?? [])].filter(
    (rule) => !(typeof rule === "object" && rule !== null && rule.id === editorRuleId),
  );
  const editorFields = [...fields, ...taxonomyFields].map(toEditorField);
  const generatedRule = editorConditionalRule(configuration, editorFields);
  const sections =
    configuration.sections && configuration.sections.length > 0
      ? configuration.sections.map((section) => ({ ...section }))
      : [{ id: defaultSectionId, title: "Proposal", description: configuration.welcomeBody }];
  const participantFields =
    configuration.participantFields && configuration.participantFields.length > 0
      ? [
          ...configuration.participantFields.map((field) =>
            toServerField(field, defaultSectionId, "participant"),
          ),
          ...(configuration.participantFields.some(
            (field) => (field.key ?? field.id) === "biography",
          )
            ? []
            : [
                {
                  id: "participant-bio",
                  sectionId: defaultSectionId,
                  key: "biography",
                  label: "Speaker bio",
                  kind: "rich_text" as const,
                  required: false,
                  options: [] as string[],
                },
              ]),
        ]
      : [
          {
            id: "participant-first-name",
            sectionId: defaultSectionId,
            key: "firstName",
            label: "First name",
            kind: "text" as const,
            required: true,
            options: [] as string[],
          },
          {
            id: "participant-last-name",
            sectionId: defaultSectionId,
            key: "lastName",
            label: "Last name",
            kind: "text" as const,
            required: true,
            options: [] as string[],
          },
          {
            id: "participant-email",
            sectionId: defaultSectionId,
            key: "email",
            label: "Email",
            kind: "email" as const,
            required: true,
            options: [] as string[],
          },
          {
            id: "participant-bio",
            sectionId: defaultSectionId,
            key: "biography",
            label: "Speaker bio",
            kind: "rich_text" as const,
            required: false,
            options: [] as string[],
          },
        ];
  return {
    id: configuration.id ?? `${eventId}-cfp`,
    tenantId: organizationId,
    eventId,
    name: configuration.welcomeTitle,
    version: configuration.formVersion ?? 1,
    status: configuration.status ?? "draft",
    welcomeContent: `${configuration.welcomeTitle}\n${configuration.welcomeBody}`,
    settings: {
      speakerLimit: configuration.participantLimit,
      maxSubmissionsPerAccount: configuration.proposalLimit,
      remindersEnabled: configuration.reminderEmails,
      adminNotificationsEnabled: configuration.adminNotifications,
      confirmationMessage: `${configuration.confirmationTitle}\n${configuration.confirmationBody}`,
      successContent: configuration.successMessage,
      ...(configuration.redirectUrl ? { redirectUrl: configuration.redirectUrl } : {}),
    },
    sections,
    submissionFields: [
      ...fields,
      ...taxonomyFields.filter((field) => !existingFieldKeys.has(field.key)),
    ],
    rules: [...ruleRecords, ...(generatedRule === null ? [] : [generatedRule])],
    participantFields,
  };
}
export interface PersistCfpConfigurationInput {
  configuration: CfpConfiguration;
  organizationId: string;
  eventId: string;
  formId: string;
}

export async function persistCfpConfiguration(
  api: CfpApi,
  input: PersistCfpConfigurationInput,
): Promise<{ event: CfpEventConfiguration; form: CfpFormConfiguration }> {
  const dateError = validateCfpDateRange(
    input.configuration.opensAt,
    input.configuration.closesAt,
    input.configuration.timezone,
  );
  if (dateError !== null) throw new Error(dateError);

  const savedEvent = await api.saveEvent({
    organizationId: input.organizationId,
    eventId: input.eventId,
    event: toEventConfiguration(
      {
        ...input.configuration,
        eventVersion:
          input.configuration.eventVersion === undefined ? 1 : input.configuration.eventVersion + 1,
      },
      input.organizationId,
      input.eventId,
    ),
    expectedVersion: input.configuration.eventVersion ?? null,
  });
  const savedForm =
    input.configuration.formVersion === undefined
      ? await api.createForm({
          organizationId: input.organizationId,
          eventId: input.eventId,
          form: toFormConfiguration(
            { ...input.configuration, id: input.formId, formVersion: 1 },
            input.organizationId,
            input.eventId,
          ),
        })
      : await api.saveForm({
          organizationId: input.organizationId,
          eventId: input.eventId,
          form: toFormConfiguration(
            {
              ...input.configuration,
              id: input.formId,
              formVersion: input.configuration.formVersion + 1,
            },
            input.organizationId,
            input.eventId,
          ),
          expectedVersion: input.configuration.formVersion,
        });
  return { event: savedEvent, form: savedForm };
}

export function configurationFromServer(
  current: CfpConfiguration,
  event: CfpEventConfiguration,
  form: CfpFormConfiguration,
): CfpConfiguration {
  const settings = form.settings;
  const readString = (key: string, fallback: string): string => {
    const value = settings[key];
    return typeof value === "string" ? value : fallback;
  };
  const readBoolean = (key: string, fallback: boolean): boolean => {
    const value = settings[key];
    return typeof value === "boolean" ? value : fallback;
  };
  const readNumber = (key: string, fallback: number): number => {
    const value = settings[key];
    return typeof value === "number" ? value : fallback;
  };
  const optionsFor = (key: string, fallback: string[]): string[] => {
    const field = form.submissionFields.find((candidate) => candidate.key === key);
    const options = field?.options
      .filter((option): option is string => typeof option === "string")
      .map((option) => option.trim())
      .filter(Boolean);
    return options?.length ? options : fallback;
  };
  const editorRule =
    form.rules.find(
      (rule) => rule.id === "editor-conditional-rule" && Array.isArray(rule.actions),
    ) ??
    form.rules.find(
      (rule) =>
        Array.isArray(rule.actions) &&
        rule.actions.some(
          (action) =>
            typeof action === "object" &&
            action !== null &&
            action.type === "show_field" &&
            typeof action.fieldKey === "string",
        ),
    );
  const editorActions = editorRule && Array.isArray(editorRule.actions) ? editorRule.actions : [];
  const editorAction = editorActions.find(
    (action) =>
      typeof action === "object" &&
      action !== null &&
      "fieldKey" in action &&
      typeof action.fieldKey === "string",
  );
  const persistedRuleTarget =
    editorAction && typeof editorAction.fieldKey === "string" ? editorAction.fieldKey : undefined;
  const persistedEditorCondition =
    editorRule && "when" in editorRule ? editorRuleCondition(editorRule.when) : null;
  const persistedRuleTargetLabel =
    persistedRuleTarget === undefined
      ? undefined
      : form.submissionFields.find((field) => field.key === persistedRuleTarget)?.label;
  const [welcomeTitle = current.welcomeTitle, ...welcomeBody] = form.welcomeContent.split("\n");
  return {
    ...current,
    id: form.id,
    status: form.status,
    eventVersion: event.version,
    formVersion: form.version,
    eventName: event.name,
    slug: event.slug,
    timezone: event.timezone,
    opensAt: dateFromInstant(event.opensAt),
    closesAt: dateFromInstant(event.closesAt),
    participantLimit: readNumber("speakerLimit", current.participantLimit),
    proposalLimit: readNumber("maxSubmissionsPerAccount", current.proposalLimit),
    tracks: optionsFor("track", current.tracks),
    tags: optionsFor("tags", current.tags),
    formats: optionsFor("format", current.formats),
    levels: optionsFor("level", current.levels),
    reminderEmails: readBoolean("remindersEnabled", current.reminderEmails),
    adminNotifications: readBoolean("adminNotificationsEnabled", current.adminNotifications),
    welcomeTitle,
    welcomeBody: welcomeBody.join("\n") || current.welcomeBody,
    confirmationTitle:
      readString("confirmationMessage", current.confirmationTitle).split("\n")[0] ?? "",
    confirmationBody: readString("confirmationMessage", current.confirmationBody)
      .split("\n")
      .slice(1)
      .join("\n"),
    successMessage: readString("successContent", current.successMessage),
    redirectUrl: readString("redirectUrl", current.redirectUrl),
    fields: withCoreProposalFields(form.submissionFields.map(toEditorField)),
    participantFields: form.participantFields.map(toEditorField),
    sections: form.sections.map((section) => ({ ...section })),
    rules: [...form.rules],
    ...(typeof editorRule?.id === "string" ? { editorRuleId: editorRule.id } : {}),
    rule: persistedEditorCondition ?? current.rule,
    ruleAction:
      persistedRuleTargetLabel === undefined
        ? current.ruleAction
        : `show ${persistedRuleTargetLabel}`,
    ruleTargetField: persistedRuleTarget ?? current.ruleTargetField,
  };
}

export function summarizeRule(rule: CfpRule): string {
  if (rule.type === "condition") {
    return `${rule.field} ${rule.operator} ${rule.value}`;
  }

  const joiner = ` ${rule.operator} `;
  return `(${rule.conditions.map(summarizeRule).join(joiner)})`;
}

function ruleKey(rule: CfpRule): string {
  if (rule.type === "condition") {
    return `condition:${rule.field}:${rule.operator}:${rule.value}`;
  }

  return `group:${rule.operator}:${rule.conditions.map(ruleKey).join("|")}`;
}
function firstRuleCondition(rule: CfpRule): CfpCondition {
  if (rule.type === "condition") return rule;
  const nested = rule.conditions[0];
  return nested === undefined
    ? { type: "condition", field: "format", operator: "is", value: "" }
    : firstRuleCondition(nested);
}

function editorRuleCondition(value: unknown): CfpRule | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "predicate" && typeof candidate.fieldKey === "string") {
    const operator = candidate.operator === "not_equals" ? "is not" : "is";
    return {
      type: "condition",
      field: candidate.fieldKey,
      operator,
      value: typeof candidate.value === "string" ? candidate.value : String(candidate.value ?? ""),
    };
  }
  if (candidate.type !== "group" || !Array.isArray(candidate.conditions)) return null;
  const conditions = candidate.conditions.flatMap((condition): CfpRule[] => {
    const parsed = editorRuleCondition(condition);
    return parsed === null ? [] : [parsed];
  });
  if (conditions.length === 0) return null;
  if (conditions.length === 1 && conditions[0]?.type === "condition") {
    return conditions[0];
  }
  return {
    type: "group",
    operator: candidate.operator === "any" ? "OR" : "AND",
    conditions,
  };
}
function fieldOptionValues(field: CfpFormField | undefined): string[] {
  return (field?.options ?? []).flatMap((option) => {
    if (typeof option === "string") return [option];
    if (typeof option === "object" && option !== null && "value" in option) {
      return typeof option.value === "string" ? [option.value] : [];
    }
    return [];
  });
}

function fieldKeyFromLabel(label: string): string {
  const normalized = label
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-");
  return normalized.replace(/^-+|-+$/gu, "") || "custom-field";
}
function ruleMatches(rule: CfpRule, answers: Record<string, string>): boolean {
  if (rule.type === "condition") {
    const fieldKey = rule.field.trim().toLocaleLowerCase();
    const current = answers[fieldKey] ?? answers[fieldKey.replaceAll(" ", "-")];
    return rule.operator === "is not" ? current !== rule.value : current === rule.value;
  }
  const results = rule.conditions.map((condition) => ruleMatches(condition, answers));
  return rule.operator === "OR" ? results.some(Boolean) : results.every(Boolean);
}

function listFromInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateList(
  current: CfpConfiguration,
  key: "tracks" | "tags" | "formats" | "levels",
  value: string,
): CfpConfiguration {
  return { ...current, [key]: listFromInput(value) };
}

function fieldTypeLabel(type: FieldType): string {
  switch (type) {
    case "email":
      return "Email";
    case "url":
      return "URL";
    case "textarea":
    case "rich_text":
      return "Long text";
    case "select":
      return "Select";
    case "multi_select":
      return "Multi-select";
    case "boolean":
      return "Checkbox";
    case "number":
      return "Number";
    case "file_request":
      return "File request";
    default:
      return "Short text";
  }
}
function fieldReferenceLabel(reference: CfpFormField["fieldRef"]): string {
  if (reference === undefined) return "";
  if (typeof reference === "string") return reference;
  return `${reference.id} v${reference.version}`;
}

function PreviewField({
  field,
  value,
  onChange,
}: {
  field: CfpFormField;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = `preview-${field.id}`;
  const descriptionId = `${inputId}-description`;
  const commonProps = {
    id: inputId,
    name: field.id,
    value,
    placeholder: field.placeholder,
    required: field.required,
    "aria-describedby": descriptionId,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };

  return (
    <div className={styles.previewField}>
      <label htmlFor={inputId}>
        {field.label}
        {field.required ? <span className={styles.required}> *</span> : null}
      </label>
      {field.type === "textarea" || field.type === "rich_text" ? (
        <textarea {...commonProps} rows={4} />
      ) : field.type === "select" ? (
        <select
          id={inputId}
          name={field.id}
          value={value}
          required={field.required}
          aria-describedby={descriptionId}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose an option</option>
          {(field.options ?? []).map((option) => {
            const optionValue =
              typeof option === "string"
                ? option
                : typeof option === "object" && option !== null && "value" in option
                  ? String(option.value)
                  : "";
            const optionLabel =
              typeof option === "object" && option !== null && "label" in option
                ? String(option.label)
                : optionValue;
            return optionValue ? (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            ) : null;
          })}
        </select>
      ) : field.type === "file_request" ? (
        <input {...commonProps} type="file" />
      ) : (
        <input {...commonProps} type={field.type} />
      )}
      <span id={descriptionId} className={styles.srOnly}>
        {field.required ? "Required field" : "Optional field"}
      </span>
    </div>
  );
}

function RuleTree({ rule }: { rule: CfpRule }) {
  if (rule.type === "condition") {
    return (
      <li className={styles.ruleCondition}>
        <span className={styles.ruleToken}>{rule.field}</span>
        <span>{rule.operator}</span>
        <strong>{rule.value}</strong>
      </li>
    );
  }

  return (
    <li className={styles.ruleGroup}>
      <span className={styles.ruleOperator}>{rule.operator}</span>
      <ul>
        {rule.conditions.map((child) => (
          <RuleTree key={ruleKey(child)} rule={child} />
        ))}
      </ul>
    </li>
  );
}

interface CfpEditorProps {
  eventId: string;
  organizationId: string;
  formId?: string;
  api?: CfpApi;
}

export function CfpEditor({ eventId, organizationId, formId, api: providedApi }: CfpEditorProps) {
  const [configuration, setConfiguration] = useState<CfpConfiguration>(() =>
    createEmptyCfpConfiguration(eventId),
  );
  const api = useMemo(() => providedApi ?? createCfpApi(""), [providedApi]);
  const [activeSection, setActiveSection] =
    useState<(typeof SECTION_LINKS)[number]["id"]>("event-details");
  const [mobileSectionsOpen, setMobileSectionsOpen] = useState(false);
  const sectionNavRef = useRef<HTMLElement | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pastCloseAcknowledged, setPastCloseAcknowledged] = useState(false);
  const [previewResponses, setPreviewResponses] = useState<Record<string, string>>({});
  const [previewSelections, setPreviewSelections] = useState({
    track: "Community systems",
    format: "Workshop · 60 minutes",
    level: "Introductory",
  });
  const [previewMessage, setPreviewMessage] = useState("");
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [configurationLoadState, setConfigurationLoadState] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const resolvedOrganizationId = organizationId.trim();
  const requestedFormId = formId?.trim() || undefined;
  const resolvedFormId = requestedFormId ?? configuration.id;
  const dateValidationError = validateCfpDateRange(
    configuration.opensAt,
    configuration.closesAt,
    configuration.timezone,
  );
  const closeDatePast = isCfpCloseDatePast(
    configuration.closesAt,
    new Date(),
    configuration.timezone,
  );
  const effectiveClosed = configuration.status === "closed" || closeDatePast;

  useEffect(() => {
    if (!resolvedOrganizationId) {
      setConfigurationLoadState("error");
      setSaveState("error");
      return;
    }
    let active = true;
    setConfigurationLoadState("loading");
    setSaveError(null);
    void loadCfpEditorConfiguration(api, {
      organizationId: resolvedOrganizationId,
      eventId,
      ...(requestedFormId === undefined ? {} : { formId: requestedFormId }),
    })
      .then(({ event: eventConfiguration, form: formConfiguration }) => {
        if (!active) return;
        if (formConfiguration !== undefined) {
          setConfiguration((current) =>
            configurationFromServer(current, eventConfiguration, formConfiguration),
          );
        } else {
          const newFormId = requestedFormId ?? `${eventId}-cfp`;
          setConfiguration((current) => {
            const { formVersion: _formVersion, ...withoutFormVersion } = current;
            return {
              ...withoutFormVersion,
              id: newFormId,
              status: "draft",
              eventVersion: eventConfiguration.version,
              eventName: eventConfiguration.name,
              slug: eventConfiguration.slug,
              timezone: eventConfiguration.timezone,
              opensAt: dateFromInstant(eventConfiguration.opensAt),
              closesAt: dateFromInstant(eventConfiguration.closesAt),
            };
          });
        }
        setConfigurationLoadState("ready");
      })
      .catch((error: unknown) => {
        if (active) {
          setConfigurationLoadState("error");
          setSaveState("error");
          setSaveError(
            error instanceof Error ? error.message : "The CFP configuration could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [api, eventId, requestedFormId, resolvedOrganizationId]);
  useEffect(() => {
    const sections = SECTION_LINKS.map((section) => document.getElementById(section.id)).filter(
      (section): section is HTMLElement => section !== null,
    );
    if (sections.length === 0) return;

    const scrollContainer = document.getElementById(ORGANIZER_SCROLL_CONTAINER_ID);
    let frame: number | null = null;
    const updateActiveSection = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const navigationHeight = sectionNavRef.current?.getBoundingClientRect().height ?? 0;
        const scrollContainerTop =
          scrollContainer?.getBoundingClientRect().top ?? ORGANIZER_STICKY_HEADER_HEIGHT;
        const threshold = scrollContainerTop + cfpActiveSectionThreshold(0, navigationHeight);
        let currentId: (typeof SECTION_LINKS)[number]["id"] =
          (sections[0]?.id as (typeof SECTION_LINKS)[number]["id"] | undefined) ?? "event-details";
        for (const section of sections) {
          if (section.getBoundingClientRect().top <= threshold) {
            currentId = section.id as (typeof SECTION_LINKS)[number]["id"];
          } else {
            break;
          }
        }
        setActiveSection(currentId);
      });
    };

    updateActiveSection();
    const scrollTarget = scrollContainer ?? window;
    scrollTarget.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      scrollTarget.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  function updateConfiguration<K extends keyof CfpConfiguration>(
    key: K,
    value: CfpConfiguration[K],
  ): void {
    setConfiguration((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
    setSaveError(null);
    if (key === "closesAt") setPastCloseAcknowledged(false);
  }

  function updateField(fieldId: string, patch: Partial<CfpFormField>): void {
    setConfiguration((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field,
      ),
    }));
    setSaveState("idle");
  }
  function addField(): void {
    const id = `custom-field-${Date.now()}`;
    setConfiguration((current) => {
      const label = "New custom field";
      return {
        ...current,
        fields: [
          ...current.fields,
          {
            id,
            key: `${fieldKeyFromLabel(label)}-${current.fields.length + 1}`,
            label,
            type: "text",
            kind: "text",
            required: false,
            visible: true,
            placeholder: "",
            options: [],
          },
        ],
      };
    });
    setSaveState("idle");
  }

  function removeField(fieldId: string): void {
    setConfiguration((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
    setSaveState("idle");
  }

  function updatePrimaryCondition(patch: Partial<CfpCondition>): void {
    setConfiguration((current) => {
      const condition = firstRuleCondition(current.rule);
      const nextCondition = { ...condition, ...patch };
      return {
        ...current,
        rule: nextCondition,
      };
    });
    setSaveState("idle");
  }

  function updateHelpfulLink(index: number, patch: Partial<{ label: string; href: string }>): void {
    setConfiguration((current) => ({
      ...current,
      helpfulLinks: current.helpfulLinks.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      ),
    }));
    setSaveState("idle");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaveError(null);
    if (!resolvedOrganizationId || !resolvedFormId) {
      setSaveState("error");
      setSaveError("An organizer organization and form are required before saving.");
      return;
    }
    if (dateValidationError !== null) {
      setSaveState("error");
      setSaveError(dateValidationError);
      return;
    }
    if (closeDatePast && !pastCloseAcknowledged) {
      setSaveState("error");
      setSaveError("A past close date requires explicit organizer confirmation before saving.");
      return;
    }
    try {
      setSaveState("saving");
      const { event: savedEvent, form: savedForm } = await persistCfpConfiguration(api, {
        configuration,
        organizationId: resolvedOrganizationId,
        eventId,
        formId: resolvedFormId,
      });
      setConfiguration((current) => configurationFromServer(current, savedEvent, savedForm));
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof Error ? error.message : "The CFP configuration could not be saved.",
      );
    }
  }
  async function handleCloseNow(): Promise<void> {
    setSaveError(null);
    if (!resolvedOrganizationId || !resolvedFormId || configuration.formVersion === undefined) {
      setSaveState("error");
      setSaveError("Save the published CFP configuration before closing it.");
      return;
    }
    if (configuration.status !== "published") {
      setSaveState("error");
      setSaveError("Publish the CFP form before closing it.");
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Close CFP now? This is destructive: new drafts and edits will be locked immediately. Existing submissions remain visible in the speaker dashboard.",
      )
    ) {
      return;
    }

    let closingConfiguration: CfpConfiguration;
    try {
      closingConfiguration = closeCfpNowConfiguration(configuration);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "The CFP could not be closed.");
      return;
    }

    try {
      setSaveState("saving");
      const { event: savedEvent, form: savedForm } = await persistCfpConfiguration(api, {
        configuration: closingConfiguration,
        organizationId: resolvedOrganizationId,
        eventId,
        formId: resolvedFormId,
      });
      setConfiguration((current) => configurationFromServer(current, savedEvent, savedForm));
      setSaveState("saved");
      setSaveError(null);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "The CFP could not be closed.");
    }
  }

  async function handlePublish(): Promise<void> {
    setSaveError(null);
    if (!resolvedOrganizationId || !resolvedFormId || configuration.formVersion === undefined) {
      setSaveState("error");
      setSaveError("Save the CFP configuration before publishing.");
      return;
    }
    try {
      setSaveState("saving");
      const published = await api.publishForm({
        organizationId: resolvedOrganizationId,
        eventId,
        formId: resolvedFormId,
        expectedVersion: configuration.formVersion,
      });
      setConfiguration((current) => ({
        ...current,
        id: published.id,
        status: published.status,
        formVersion: published.version,
      }));
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "The CFP form could not be published.");
    }
  }

  function openSection(id: (typeof SECTION_LINKS)[number]["id"]): void {
    setActiveSection(id);
    setMobileSectionsOpen(false);
    const target = document.getElementById(id);
    if (!target) return;
    const isMobile = window.matchMedia("(max-width: 44rem)").matches;
    const scrollToTarget = () => {
      const navigationHeight = sectionNavRef.current?.getBoundingClientRect().height ?? 0;
      const scrollContainer = document.getElementById(ORGANIZER_SCROLL_CONTAINER_ID);
      const targetTop = target.getBoundingClientRect().top;
      const top =
        scrollContainer === null
          ? Math.max(
              0,
              targetTop +
                window.scrollY -
                cfpSectionScrollOffset(ORGANIZER_STICKY_HEADER_HEIGHT, navigationHeight),
            )
          : cfpContainerScrollTop(
              scrollContainer.scrollTop,
              targetTop,
              scrollContainer.getBoundingClientRect().top,
              navigationHeight,
            );
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      if (scrollContainer === null) {
        window.scrollTo({ top, behavior });
      } else {
        scrollContainer.scrollTo({ top, behavior });
      }
    };
    if (isMobile) {
      window.requestAnimationFrame(scrollToTarget);
    } else {
      scrollToTarget();
    }
  }

  function handlePreviewSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPreviewMessage(configuration.successMessage);
  }

  const configuredFieldForKey = (key: string) =>
    configuration.fields.find((field) => (field.key ?? field.id).toLocaleLowerCase() === key);
  const previewValueForKey = (key: "format" | "track" | "level"): string => {
    const configuredField = configuredFieldForKey(key);
    return configuredField === undefined
      ? previewSelections[key]
      : (previewResponses[configuredField.id] ?? "");
  };
  const previewRuleMatches = ruleMatches(firstRuleCondition(configuration.rule), {
    format: previewValueForKey("format"),
    track: previewValueForKey("track"),
    level: previewValueForKey("level"),
  });
  const visibleFields = configuration.fields.filter(
    (field) =>
      field.visible &&
      ((field.key ?? field.id) !== configuration.ruleTargetField || previewRuleMatches),
  );
  const ruleSummary = summarizeRule(configuration.rule);
  const primaryCondition = firstRuleCondition(configuration.rule);
  const ruleFields = [
    ...configuration.fields.map((field) =>
      field.key === "format"
        ? { ...field, options: configuration.formats }
        : field.key === "track"
          ? { ...field, options: configuration.tracks }
          : field,
    ),
    ...[
      {
        id: "server-format",
        key: "format",
        label: "Format",
        type: "select" as const,
        kind: "select",
        required: false,
        visible: true,
        placeholder: "",
        options: configuration.formats,
      },
      {
        id: "server-track",
        key: "track",
        label: "Track",
        type: "select" as const,
        kind: "select",
        required: false,
        visible: true,
        placeholder: "",
        options: configuration.tracks,
      },
    ].filter((field) => !configuration.fields.some((candidate) => candidate.key === field.key)),
  ];
  const selectedRuleFieldKey = fieldKeyForRuleField(primaryCondition.field, ruleFields);
  const selectedRuleField = ruleFields.find((field) => field.key === selectedRuleFieldKey);
  const selectedRuleOptions = fieldOptionValues(selectedRuleField);

  if (!resolvedOrganizationId) {
    return (
      <div className={styles.viewport}>
        <section className={styles.pageHeader} role="alert">
          <div>
            <p className={styles.eyebrow}>Organizer workspace</p>
            <h1>Organization scope required</h1>
            <p className={styles.pageIntro}>
              Open this editor from an organization-qualified event route.
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (configurationLoadState !== "ready") {
    return (
      <div className={styles.viewport}>
        <section
          className={styles.pageHeader}
          role={configurationLoadState === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <div>
            <p className={styles.eyebrow}>Organizer workspace / {eventId}</p>
            <h1>
              {configurationLoadState === "error"
                ? "Unable to load CFP configuration"
                : "Loading CFP configuration"}
            </h1>
            <p className={styles.pageIntro}>
              {configurationLoadState === "error"
                ? (saveError ?? "The event and CFP form could not be loaded.")
                : "Loading the authoritative event and form configuration."}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const publicRoute = configuration.slug
    ? getCfpStepRoute(resolvedOrganizationId, configuration.slug, "welcome")
    : null;

  async function copyPublicLink(): Promise<void> {
    if (!publicRoute || typeof navigator === "undefined" || !navigator.clipboard) return;
    const publicUrl = new URL(publicRoute, window.location.origin).toString();
    await navigator.clipboard.writeText(publicUrl);
    setPublicLinkCopied(true);
    window.setTimeout(() => setPublicLinkCopied(false), 1800);
  }

  return (
    <div className={styles.viewport}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Organizer workspace / {eventId}</p>
          <h1>Configure your call for proposals</h1>
          <p className={styles.pageIntro}>
            Shape the event details, applicant experience, and rules before publishing a clear,
            accessible public form.
          </p>
        </div>
        <div className={styles.headerActions}>
          {publicRoute ? (
            <>
              <button className={styles.secondaryButton} type="button" onClick={copyPublicLink}>
                {publicLinkCopied ? "Copied" : "Copy public link"}
              </button>
              <a className={styles.secondaryButton} href={publicRoute}>
                View public form
              </a>
              <span className="sr-only" aria-live="polite">
                {publicLinkCopied ? "Public CFP link copied to clipboard." : ""}
              </span>
            </>
          ) : null}
          <button className={styles.primaryButton} type="submit" form="cfp-editor-form">
            Save changes
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => setPublishDialogOpen(true)}
            disabled={saveState === "saving"}
          >
            Publish form
          </button>
        </div>
      </header>

      <nav ref={sectionNavRef} className={styles.sectionNav} aria-label="CFP workspace sections">
        <div className={styles.desktopSectionNav}>
          {SECTION_LINKS.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-controls={section.id}
              aria-current={activeSection === section.id ? "location" : undefined}
              className={activeSection === section.id ? styles.activeNavButton : undefined}
              onClick={() => openSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
        <Collapsible
          className={styles.mobileSectionNav}
          open={mobileSectionsOpen}
          onOpenChange={setMobileSectionsOpen}
        >
          <CollapsibleTrigger className={styles.mobileSectionTrigger} type="button">
            <span>
              <span className={styles.mobileSectionLabel}>Current section</span>
              {SECTION_LINKS.find((section) => section.id === activeSection)?.label}
            </span>
            <span aria-hidden="true">⌄</span>
          </CollapsibleTrigger>
          <CollapsibleContent className={styles.mobileSectionContent}>
            {SECTION_LINKS.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-controls={section.id}
                aria-current={activeSection === section.id ? "location" : undefined}
                className={activeSection === section.id ? styles.activeNavButton : undefined}
                onClick={() => openSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </nav>

      <div className={styles.workspaceGrid}>
        <form
          id="cfp-editor-form"
          className={styles.editorForm}
          aria-label="Event and CFP configuration"
          onSubmit={handleSave}
        >
          <section
            id="event-details"
            className={styles.panel}
            aria-labelledby="event-details-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>01 / foundation</p>
                <h2 id="event-details-heading">Event details</h2>
              </div>
              <span className={styles.statusPill}>
                {effectiveClosed
                  ? "Closed"
                  : configuration.status === "published"
                    ? "Published"
                    : "Draft"}
              </span>
            </div>
            <p className={styles.sectionDescription}>
              Give applicants the context they need and set the dates and limits that protect your
              review team.
            </p>

            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="event-name">Event name</label>
                <input
                  id="event-name"
                  name="eventName"
                  required
                  value={configuration.eventName}
                  onChange={(event) => updateConfiguration("eventName", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="event-slug">Public URL slug</label>
                <input
                  id="event-slug"
                  name="slug"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  title="Use lowercase letters, numbers, and hyphens."
                  value={configuration.slug}
                  onChange={(event) => updateConfiguration("slug", event.target.value)}
                />
                <p className={styles.fieldHint}>
                  {publicRoute
                    ? `/cfp/organizations/${resolvedOrganizationId}/events/${configuration.slug}`
                    : "Public URL unavailable until the authoritative event slug loads."}
                </p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="event-timezone">Event timezone</label>
                <select
                  id="event-timezone"
                  name="timezone"
                  required
                  value={configuration.timezone}
                  onChange={(event) => updateConfiguration("timezone", event.target.value)}
                >
                  {TIMEZONE_OPTIONS.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </select>
                <p className={styles.fieldHint}>Dates shown to applicants use this timezone.</p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="open-date">Open date</label>
                <input
                  id="open-date"
                  name="opensAt"
                  type="date"
                  required
                  value={configuration.opensAt}
                  onChange={(event) => updateConfiguration("opensAt", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="close-date">Close date</label>
                <input
                  id="close-date"
                  name="closesAt"
                  type="date"
                  required
                  value={configuration.closesAt}
                  aria-invalid={dateValidationError !== null}
                  aria-describedby="close-date-help"
                  onChange={(event) => updateConfiguration("closesAt", event.target.value)}
                />
                <p id="close-date-help" className={styles.fieldHint}>
                  The close date must be after the open date. A past close is allowed when
                  explicitly confirmed by an organizer.
                </p>
                {dateValidationError !== null ? (
                  <p className={styles.fieldHint} role="alert">
                    {dateValidationError}
                  </p>
                ) : null}
                {closeDatePast ? (
                  <>
                    <p className={styles.fieldHint} role="note">
                      Server-authoritative status: Closed. This CFP is closed to new submissions.
                      Public visitors see the closed portal and speakers cannot edit until an
                      organizer records an audited reopen.
                    </p>
                    <label className={styles.toggleRow}>
                      <input
                        id="confirm-past-close"
                        name="confirmPastClose"
                        type="checkbox"
                        checked={pastCloseAcknowledged}
                        onChange={(event) => {
                          setPastCloseAcknowledged(event.target.checked);
                          setSaveError(null);
                          setSaveState("idle");
                        }}
                      />
                      <span>
                        <strong>Confirm past close date</strong>
                        <small>I understand this save keeps the CFP closed.</small>
                      </span>
                    </label>
                  </>
                ) : null}
                {effectiveClosed && !closeDatePast ? (
                  <p className={styles.fieldHint} role="note">
                    This CFP is marked closed. The public portal is closed and speaker edits remain
                    read-only until an organizer records an audited reopen.
                  </p>
                ) : null}
                {configuration.status === "published" && !effectiveClosed ? (
                  <div>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() => void handleCloseNow()}
                      disabled={saveState === "saving"}
                    >
                      Close CFP now
                    </button>
                    <p className={styles.fieldHint}>
                      This immediately records a server-authoritative close instant in the event
                      timezone. New drafts and proposal edits will be locked; existing submissions
                      remain available.
                    </p>
                  </div>
                ) : null}
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="participant-limit">
                  Speaker limit (maximum participants per submission)
                </label>
                <input
                  id="participant-limit"
                  name="speakerLimit"
                  type="number"
                  required
                  min={1}
                  max={15}
                  step={1}
                  value={configuration.participantLimit}
                  onChange={(event) =>
                    updateConfiguration("participantLimit", Number(event.target.value))
                  }
                  aria-describedby="participant-limit-help"
                />
                <p id="participant-limit-help" className={styles.fieldHint}>
                  Up to 15 participants can collaborate on one submission.
                </p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="proposal-limit">Maximum proposals per account</label>
                <input
                  id="proposal-limit"
                  name="proposalLimit"
                  type="number"
                  required
                  min={1}
                  max={100}
                  step={1}
                  value={configuration.proposalLimit}
                  onChange={(event) =>
                    updateConfiguration("proposalLimit", Number(event.target.value))
                  }
                  aria-describedby="proposal-limit-help"
                />
                <p id="proposal-limit-help" className={styles.fieldHint}>
                  Each account can create between 1 and 100 distinct proposals for this CFP. Editing
                  an existing proposal does not use another slot.
                </p>
              </div>
            </div>

            <fieldset className={styles.toggleFieldset}>
              <legend>Notifications</legend>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={configuration.reminderEmails}
                  onChange={(event) => updateConfiguration("reminderEmails", event.target.checked)}
                />
                <span>
                  <strong>Send reminder emails</strong>
                  <small>Remind invited speakers before the CFP closes.</small>
                </span>
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={configuration.adminNotifications}
                  onChange={(event) =>
                    updateConfiguration("adminNotifications", event.target.checked)
                  }
                />
                <span>
                  <strong>Notify admins of new submissions</strong>
                  <small>Keep the organizer review queue in sync with incoming proposals.</small>
                </span>
              </label>
            </fieldset>
          </section>

          <section id="messaging" className={styles.panel} aria-labelledby="messaging-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>02 / applicant experience</p>
                <h2 id="messaging-heading">Messaging</h2>
              </div>
            </div>
            <p className={styles.sectionDescription}>
              Set the words applicants see at each handoff. Keep instructions specific, welcoming,
              and easy to scan.
            </p>
            <div className={styles.copyStack}>
              <div className={styles.fieldGroup}>
                <label htmlFor="welcome-title">Welcome heading</label>
                <input
                  id="welcome-title"
                  name="welcomeTitle"
                  required
                  value={configuration.welcomeTitle}
                  onChange={(event) => updateConfiguration("welcomeTitle", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="welcome-body">Welcome copy</label>
                <textarea
                  id="welcome-body"
                  name="welcomeBody"
                  rows={4}
                  value={configuration.welcomeBody}
                  onChange={(event) => updateConfiguration("welcomeBody", event.target.value)}
                />
              </div>
              <div className={styles.copyGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="confirmation-title">Confirmation heading</label>
                  <input
                    id="confirmation-title"
                    name="confirmationTitle"
                    required
                    value={configuration.confirmationTitle}
                    onChange={(event) =>
                      updateConfiguration("confirmationTitle", event.target.value)
                    }
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="success-message">Success message</label>
                  <input
                    id="success-message"
                    name="successMessage"
                    required
                    value={configuration.successMessage}
                    onChange={(event) => updateConfiguration("successMessage", event.target.value)}
                  />
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="confirmation-body">Confirmation copy</label>
                <textarea
                  id="confirmation-body"
                  name="confirmationBody"
                  rows={3}
                  value={configuration.confirmationBody}
                  onChange={(event) => updateConfiguration("confirmationBody", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="redirect-url">After-submit redirect URL</label>
                <input
                  id="redirect-url"
                  name="redirectUrl"
                  type="url"
                  value={configuration.redirectUrl}
                  onChange={(event) => updateConfiguration("redirectUrl", event.target.value)}
                  aria-describedby="redirect-url-help"
                />
                <p id="redirect-url-help" className={styles.fieldHint}>
                  Applicants see the success message before they continue to this URL.
                </p>
              </div>
            </div>
          </section>

          <section id="taxonomy" className={styles.panel} aria-labelledby="taxonomy-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>03 / organizer vocabulary</p>
                <h2 id="taxonomy-heading">Taxonomy &amp; helpful links</h2>
              </div>
            </div>
            <p className={styles.sectionDescription}>
              Consistent options make routing and review easier. Separate each option with a comma.
            </p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="tracks">Tracks</label>
                <input
                  id="tracks"
                  name="tracks"
                  required
                  value={configuration.tracks.join(", ")}
                  onChange={(event) =>
                    setConfiguration((current) => updateList(current, "tracks", event.target.value))
                  }
                  aria-describedby="tracks-help"
                />
                <p id="tracks-help" className={styles.fieldHint}>
                  Route proposals into a program area.
                </p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="tags">Tags</label>
                <input
                  id="tags"
                  name="tags"
                  value={configuration.tags.join(", ")}
                  onChange={(event) =>
                    setConfiguration((current) => updateList(current, "tags", event.target.value))
                  }
                  aria-describedby="tags-help"
                />
                <p id="tags-help" className={styles.fieldHint}>
                  Add searchable labels for reviewers.
                </p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="formats">Formats</label>
                <input
                  id="formats"
                  name="formats"
                  required
                  value={configuration.formats.join(", ")}
                  onChange={(event) =>
                    setConfiguration((current) =>
                      updateList(current, "formats", event.target.value),
                    )
                  }
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="levels">Levels</label>
                <input
                  id="levels"
                  name="levels"
                  value={configuration.levels.join(", ")}
                  onChange={(event) =>
                    setConfiguration((current) => updateList(current, "levels", event.target.value))
                  }
                />
              </div>
            </div>

            <div className={styles.linksBlock}>
              <div className={styles.subheadingRow}>
                <h3>Helpful links</h3>
                <span className={styles.fieldHint}>Shown on the public welcome screen.</span>
              </div>
              {configuration.helpfulLinks.map((link, index) => (
                <div className={styles.linkRow} key={link.label}>
                  <div className={styles.fieldGroup}>
                    <label htmlFor={`helpful-link-label-${index}`}>Link label {index + 1}</label>
                    <input
                      id={`helpful-link-label-${index}`}
                      required
                      value={link.label}
                      onChange={(event) => updateHelpfulLink(index, { label: event.target.value })}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor={`helpful-link-url-${index}`}>Link URL {index + 1}</label>
                    <input
                      id={`helpful-link-url-${index}`}
                      type="url"
                      required
                      value={link.href}
                      onChange={(event) => updateHelpfulLink(index, { href: event.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            id="fields-rules"
            className={styles.panel}
            aria-labelledby="fields-rules-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>04 / form logic</p>
                <h2 id="fields-rules-heading">Fields &amp; rules</h2>
              </div>
            </div>
            <p className={styles.sectionDescription}>
              Built-in speaker identity fields stay required by default. Make optional fields
              visible only when they help an applicant complete a thoughtful proposal.
            </p>
            <fieldset className={styles.fieldList}>
              <legend>Applicant fields</legend>
              <button className={styles.secondaryButton} type="button" onClick={addField}>
                Add custom field
              </button>
              {configuration.fields.map((field) => (
                <div className={styles.fieldRuleRow} key={field.id}>
                  <div className={styles.formGrid}>
                    <div className={styles.fieldGroup}>
                      <label htmlFor={`field-label-${field.id}`}>Field label</label>
                      <input
                        id={`field-label-${field.id}`}
                        value={field.label}
                        onChange={(event) => updateField(field.id, { label: event.target.value })}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label htmlFor={`field-key-${field.id}`}>Field key</label>
                      <input
                        id={`field-key-${field.id}`}
                        pattern="[A-Za-z][A-Za-z0-9_.-]*"
                        value={field.key ?? field.id}
                        onChange={(event) => updateField(field.id, { key: event.target.value })}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label htmlFor={`field-type-${field.id}`}>Field type</label>
                      <select
                        id={`field-type-${field.id}`}
                        value={field.type}
                        onChange={(event) => {
                          const type = editorFieldType(event.target.value);
                          updateField(field.id, {
                            type,
                            kind: type === "textarea" ? "rich_text" : type,
                          });
                        }}
                      >
                        <option value="text">Short text</option>
                        <option value="textarea">Long text</option>
                        <option value="select">Dropdown</option>
                        <option value="multi_select">Multi-select</option>
                        <option value="email">Email</option>
                        <option value="url">URL</option>
                        <option value="boolean">Checkbox</option>
                        <option value="number">Number</option>
                        <option value="file_request">File request</option>
                      </select>
                      {field.type === "file_request" ? (
                        <p className={styles.fieldHint}>
                          Accepts PDF, JPEG, PNG, or text files up to 25 MB.
                        </p>
                      ) : null}
                    </div>
                    {field.type === "select" || field.type === "multi_select" ? (
                      <div className={styles.fieldGroup}>
                        <label htmlFor={`field-options-${field.id}`}>Options</label>
                        <input
                          id={`field-options-${field.id}`}
                          value={fieldOptionValues(field).join(", ")}
                          onChange={(event) =>
                            updateField(field.id, { options: listFromInput(event.target.value) })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) =>
                        updateField(field.id, { required: event.target.checked })
                      }
                    />
                    Required
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={field.visible}
                      onChange={(event) => updateField(field.id, { visible: event.target.checked })}
                    />
                    Visible
                  </label>
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => removeField(field.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </fieldset>
            {configuration.participantFields && configuration.participantFields.length > 0 ? (
              <fieldset className={styles.fieldList}>
                <legend>Participant identity and profile fields</legend>
                {configuration.participantFields.map((field) => (
                  <div className={styles.fieldRuleRow} key={field.id}>
                    <div>
                      <strong>{field.label}</strong>
                      <span className={styles.fieldType}>
                        {fieldTypeLabel(field.type)}
                        {fieldReferenceLabel(field.fieldRef)
                          ? ` · reusable ${fieldReferenceLabel(field.fieldRef)}`
                          : ""}
                        {field.fieldVersion ? ` · v${field.fieldVersion}` : ""}
                      </span>
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          setConfiguration((current) => ({
                            ...current,
                            ...(current.participantFields
                              ? {
                                  participantFields: current.participantFields.map((candidate) =>
                                    candidate.id === field.id
                                      ? { ...candidate, required: event.target.checked }
                                      : candidate,
                                  ),
                                }
                              : {}),
                          }))
                        }
                      />
                      Required
                    </label>
                  </div>
                ))}
              </fieldset>
            ) : null}

            <p className={styles.fieldHint}>
              {configuration.rules?.length ?? 0} published rule
              {(configuration.rules?.length ?? 0) === 1 ? "" : "s"} will be preserved on save.
            </p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="conditional-field">Show when field</label>
                <select
                  id="conditional-field"
                  value={selectedRuleFieldKey}
                  onChange={(event) =>
                    updatePrimaryCondition({
                      field: event.target.value,
                      value:
                        fieldOptionValues(
                          ruleFields.find((field) => field.key === event.target.value),
                        )[0] ?? "",
                    })
                  }
                >
                  {ruleFields.map((field) => (
                    <option key={field.key ?? field.id} value={field.key ?? field.id}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="conditional-value">Answer is</label>
                {selectedRuleOptions.length > 0 ? (
                  <select
                    id="conditional-value"
                    value={String(primaryCondition.value ?? "")}
                    onChange={(event) => updatePrimaryCondition({ value: event.target.value })}
                  >
                    <option value="">Choose an answer</option>
                    {selectedRuleOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="conditional-value"
                    value={String(primaryCondition.value ?? "")}
                    onChange={(event) => updatePrimaryCondition({ value: event.target.value })}
                  />
                )}
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="conditional-target">Then show field</label>
                <select
                  id="conditional-target"
                  value={configuration.ruleTargetField ?? ""}
                  onChange={(event) => {
                    const target = configuration.fields.find(
                      (field) => (field.key ?? field.id) === event.target.value,
                    );
                    setConfiguration((current) => ({
                      ...current,
                      ruleTargetField: event.target.value,
                      ruleAction: target ? `show ${target.label}` : current.ruleAction,
                    }));
                    setSaveState("idle");
                  }}
                >
                  <option value="">Choose a field</option>
                  {configuration.fields.map((field) => (
                    <option key={field.id} value={field.key ?? field.id}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <section className={styles.rulePreview} aria-labelledby="condition-preview-heading">
              <div className={styles.subheadingRow}>
                <div>
                  <p className={styles.sectionKicker}>Nested condition preview</p>
                  <h3 id="condition-preview-heading">When should this field appear?</h3>
                </div>
                <span className={styles.logicBadge}>Saved on publish</span>
              </div>
              <p className={styles.ruleSummary}>
                If <strong>{ruleSummary}</strong>, then <strong>{configuration.ruleAction}</strong>.
              </p>
              <ul className={styles.ruleTree} aria-label="Nested condition tree">
                <RuleTree rule={configuration.rule} />
              </ul>
              <p className={styles.fieldHint}>
                Rules support nested AND / OR groups and are evaluated before the public form is
                published. Cycles are rejected during validation.
              </p>
            </section>

            <div className={styles.formActions}>
              <button className={styles.primaryButton} type="submit">
                Save CFP configuration
              </button>
              <span className={styles.saveStatus} role="status" aria-live="polite">
                {saveState === "saving" ? "Saving event and CFP form…" : ""}
                {saveState === "saved"
                  ? "Event and CFP form saved. The close date below reflects the server response."
                  : ""}
                {saveState === "error"
                  ? (saveError ??
                    "Changes could not be saved. Check your organizer session and try again.")
                  : ""}
              </span>
            </div>
          </section>
        </form>

        <aside className={styles.summaryAside} aria-label="Configuration summary">
          <div className={styles.summaryCard}>
            <p className={styles.sectionKicker}>At a glance</p>
            <h2>Ready for review</h2>
            <dl className={styles.summaryList}>
              <div>
                <dt>Event</dt>
                <dd>{configuration.eventName}</dd>
              </div>
              <div>
                <dt>Public URL</dt>
                <dd>
                  {publicRoute ? (
                    <a href={publicRoute}>
                      /cfp/organizations/{resolvedOrganizationId}/events/{configuration.slug}
                    </a>
                  ) : (
                    "Unavailable until event scope and slug are loaded."
                  )}
                </dd>
              </div>
              <div>
                <dt>Window</dt>
                <dd>
                  {configuration.opensAt} → {configuration.closesAt}
                </dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{configuration.timezone}</dd>
              </div>
              <div>
                <dt>Visible fields</dt>
                <dd>
                  {visibleFields.length} of {configuration.fields.length}
                </dd>
              </div>
              <div>
                <dt>Notifications</dt>
                <dd>
                  {configuration.reminderEmails && configuration.adminNotifications
                    ? "Reminders + admin alerts"
                    : configuration.reminderEmails
                      ? "Reminders only"
                      : configuration.adminNotifications
                        ? "Admin alerts only"
                        : "Off"}
                </dd>
              </div>
            </dl>
            <a className={styles.textLink} href="#public-preview">
              Jump to public preview <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className={styles.accessibilityNote}>
            <strong>Accessibility check</strong>
            <p>Every public field has a visible label, keyboard focus, and a required state.</p>
          </div>
        </aside>
      </div>

      <section
        id="public-preview"
        className={styles.previewPanel}
        aria-labelledby="public-preview-heading"
      >
        <div className={styles.previewPanelHeader}>
          <div>
            <p className={styles.sectionKicker}>05 / applicant view</p>
            <h2 id="public-preview-heading">Public form preview</h2>
            <p className={styles.sectionDescription}>
              This preview uses the current editor state. It is not published and never sends a live
              submission.
            </p>
          </div>
          {publicRoute ? (
            <a className={styles.secondaryButton} href={publicRoute}>
              Open public route
            </a>
          ) : null}
        </div>

        <div className={styles.previewGrid}>
          <form
            className={styles.publicForm}
            aria-label="Public CFP form preview"
            onSubmit={handlePreviewSubmit}
          >
            <p className={styles.previewEyebrow}>{configuration.eventName} · Call for proposals</p>
            <h3>{configuration.welcomeTitle}</h3>
            <p className={styles.previewCopy}>{configuration.welcomeBody}</p>
            <div className={styles.previewDeadline}>
              <span>Accepting proposals</span>
              <strong>
                {configuration.opensAt} – {configuration.closesAt} ({configuration.timezone})
              </strong>
            </div>

            <fieldset className={styles.previewFieldset}>
              <legend>Proposal details</legend>
              {visibleFields.map((field) => (
                <PreviewField
                  key={field.id}
                  field={field}
                  value={previewResponses[field.id] ?? ""}
                  onChange={(value) =>
                    setPreviewResponses((current) => ({ ...current, [field.id]: value }))
                  }
                />
              ))}
              {configuredFieldForKey("track") === undefined ? (
                <div className={styles.previewField}>
                  <label htmlFor="preview-track">Track</label>
                  <select
                    id="preview-track"
                    value={previewSelections.track}
                    onChange={(event) =>
                      setPreviewSelections((current) => ({ ...current, track: event.target.value }))
                    }
                  >
                    <option value="">Choose a track</option>
                    {configuration.tracks.map((track) => (
                      <option key={track} value={track}>
                        {track}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {configuredFieldForKey("format") === undefined ? (
                <div className={styles.previewField}>
                  <label htmlFor="preview-format">Format</label>
                  <select
                    id="preview-format"
                    value={previewSelections.format}
                    onChange={(event) =>
                      setPreviewSelections((current) => ({
                        ...current,
                        format: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choose a format</option>
                    {configuration.formats.map((format) => (
                      <option key={format} value={format}>
                        {format}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {configuredFieldForKey("level") === undefined ? (
                <div className={styles.previewField}>
                  <label htmlFor="preview-level">Level</label>
                  <select
                    id="preview-level"
                    value={previewSelections.level}
                    onChange={(event) =>
                      setPreviewSelections((current) => ({ ...current, level: event.target.value }))
                    }
                  >
                    <option value="">Choose a level</option>
                    {configuration.levels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </fieldset>

            <p className={styles.previewRuleNote}>
              Conditional preview: {ruleSummary} → {configuration.ruleAction}.
            </p>
            <button className={styles.primaryButton} type="submit">
              Submit preview response
            </button>
            <p className={styles.previewConfirmation}>
              <strong>{configuration.confirmationTitle}</strong> — {configuration.confirmationBody}
            </p>
            <p className={styles.previewSuccess} role="status" aria-live="polite">
              {previewMessage || configuration.successMessage}
            </p>
          </form>

          <aside className={styles.previewDetails} aria-label="Public form behavior">
            <div>
              <p className={styles.sectionKicker}>After submission</p>
              <h3>{configuration.confirmationTitle}</h3>
              <p>{configuration.confirmationBody}</p>
              <p className={styles.previewSuccessText}>{configuration.successMessage}</p>
            </div>
            <div>
              <p className={styles.sectionKicker}>Helpful links</p>
              <ul className={styles.helpfulLinks}>
                {configuration.helpfulLinks.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
            <p className={styles.fieldHint}>
              Redirect after submit: <code>{configuration.redirectUrl}</code>
            </p>
          </aside>
        </div>
      </section>
      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this CFP form?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing makes the saved CFP version available to applicants. Confirm only after
              reviewing the form and its dates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveState === "saving"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saveState === "saving"}
              onClick={() => {
                setPublishDialogOpen(false);
                void handlePublish();
              }}
            >
              Publish form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
