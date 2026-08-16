import type { ReportDefinitionInput, ReportRelationship } from "./api";

export interface FieldOption {
  readonly key: string;
  readonly label: string;
}

/**
 * This is deliberately narrower than the server's complete registry. The UI only offers fields
 * that are useful to organizers and never offers evaluator-only values, assets, or personal
 * identity data. The server remains the final authorization boundary for every request.
 */
export const REPORT_FIELD_ALLOWLIST: Readonly<Record<ReportRelationship, readonly FieldOption[]>> =
  {
    sessions: [
      { key: "sessions.id", label: "Session ID" },
      { key: "sessions.title", label: "Session title" },
      { key: "sessions.description", label: "Session description" },
      { key: "sessions.abstract", label: "Session abstract" },
      { key: "sessions.status", label: "Session status" },
      { key: "sessions.startsAt", label: "Starts at" },
      { key: "sessions.endsAt", label: "Ends at" },
      { key: "sessions.room", label: "Room" },
      { key: "sessions.track", label: "Track" },
    ],
    participants: [
      { key: "participants.id", label: "Participant ID" },
      { key: "participants.displayName", label: "Participant name" },
      { key: "participants.biography", label: "Participant biography" },
    ],
    speakers: [
      { key: "speakers.id", label: "Speaker ID" },
      { key: "speakers.displayName", label: "Speaker name" },
      { key: "speakers.biography", label: "Speaker biography" },
    ],
    evaluationProgress: [
      { key: "evaluationProgress.planId", label: "Evaluation plan ID" },
      { key: "evaluationProgress.planName", label: "Evaluation plan name" },
      { key: "evaluationProgress.planVersion", label: "Evaluation plan version" },
      { key: "evaluationProgress.total", label: "Total assignments" },
      { key: "evaluationProgress.assigned", label: "Assigned" },
      { key: "evaluationProgress.inProgress", label: "In progress" },
      { key: "evaluationProgress.submitted", label: "Submitted" },
      { key: "evaluationProgress.abstained", label: "Abstained" },
      { key: "evaluationProgress.completionPercent", label: "Completion percent" },
      { key: "evaluationProgress.averageScore", label: "Average score" },
      { key: "evaluationProgress.possibleScore", label: "Possible score" },
      { key: "evaluationProgress.scoreCount", label: "Counted scores" },
    ],
  };

export const SOURCE_ORDER: readonly ReportRelationship[] = [
  "sessions",
  "participants",
  "speakers",
  "evaluationProgress",
];

export type ReportTemplateId =
  | "program-schedule"
  | "speaker-directory"
  | "participant-directory"
  | "evaluation-progress";

export interface ReportTemplate {
  readonly id: ReportTemplateId;
  readonly name: string;
  readonly description: string;
  readonly relationships: readonly ReportRelationship[];
  readonly fields: readonly string[];
  readonly order: readonly string[];
  readonly filters: ReportDefinitionInput["filters"];
  readonly sort: ReportDefinitionInput["sort"];
}

export const REPORT_TEMPLATES: readonly ReportTemplate[] = [
  {
    id: "program-schedule",
    name: "Program schedule",
    description: "Working session schedule for production and organizer coordination.",
    relationships: ["sessions"],
    fields: [
      "sessions.title",
      "sessions.status",
      "sessions.startsAt",
      "sessions.endsAt",
      "sessions.room",
      "sessions.track",
    ],
    order: [
      "sessions.title",
      "sessions.status",
      "sessions.startsAt",
      "sessions.endsAt",
      "sessions.room",
      "sessions.track",
    ],
    filters: [],
    sort: [{ field: "sessions.startsAt", direction: "asc" }],
  },
  {
    id: "speaker-directory",
    name: "Speaker directory",
    description: "Organizer-safe speaker names and biographies for event handoffs.",
    relationships: ["speakers"],
    fields: ["speakers.displayName", "speakers.biography"],
    order: ["speakers.displayName", "speakers.biography"],
    filters: [],
    sort: [{ field: "speakers.displayName", direction: "asc" }],
  },
  {
    id: "participant-directory",
    name: "Participant directory",
    description: "Participant names and biographies for event operations.",
    relationships: ["participants"],
    fields: ["participants.displayName", "participants.biography"],
    order: ["participants.displayName", "participants.biography"],
    filters: [],
    sort: [{ field: "participants.displayName", direction: "asc" }],
  },
  {
    id: "evaluation-progress",
    name: "Evaluation progress",
    description: "Plan-level review completion and aggregate scoring summary.",
    relationships: ["evaluationProgress"],
    fields: [
      "evaluationProgress.planName",
      "evaluationProgress.planVersion",
      "evaluationProgress.total",
      "evaluationProgress.assigned",
      "evaluationProgress.inProgress",
      "evaluationProgress.submitted",
      "evaluationProgress.abstained",
      "evaluationProgress.completionPercent",
      "evaluationProgress.averageScore",
      "evaluationProgress.possibleScore",
      "evaluationProgress.scoreCount",
    ],
    order: [
      "evaluationProgress.planName",
      "evaluationProgress.planVersion",
      "evaluationProgress.total",
      "evaluationProgress.assigned",
      "evaluationProgress.inProgress",
      "evaluationProgress.submitted",
      "evaluationProgress.abstained",
      "evaluationProgress.completionPercent",
      "evaluationProgress.averageScore",
      "evaluationProgress.possibleScore",
      "evaluationProgress.scoreCount",
    ],
    filters: [],
    sort: [],
  },
];

export function draftFromReportTemplate(template: ReportTemplate): ReportDefinitionInput {
  return normalizeDraft({
    name: template.name,
    description: template.description,
    relationships: [...template.relationships],
    fields: [...template.fields],
    order: [...template.order],
    filters: [...template.filters],
    sort: [...template.sort],
  });
}

export function fieldsForRelationships(
  relationships: readonly ReportRelationship[],
): readonly FieldOption[] {
  const relationshipSet = new Set(relationships);
  return SOURCE_ORDER.flatMap((relationship) =>
    relationshipSet.has(relationship) ? REPORT_FIELD_ALLOWLIST[relationship] : [],
  );
}
function sourceFieldKeys(relationships: readonly ReportRelationship[]): readonly string[] {
  return fieldsForRelationships(relationships).map((field) => field.key);
}

function arrayValue<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeDraft(next: ReportDefinitionInput): ReportDefinitionInput {
  const relationships = arrayValue(next.relationships);
  const available = new Set(sourceFieldKeys(relationships));
  const fields = arrayValue(next.fields).filter((field) => available.has(field));
  const fieldSet = new Set(fields);
  const order = arrayValue(next.order).filter((field) => fieldSet.has(field));
  const orderSet = new Set(order);
  return {
    ...next,
    relationships,
    fields,
    order: [...order, ...fields.filter((field) => !orderSet.has(field))],
    filters: arrayValue(next.filters).filter(
      (filter) => filter !== null && typeof filter === "object" && available.has(filter.field),
    ),
    sort: arrayValue(next.sort).filter(
      (sort) => sort !== null && typeof sort === "object" && available.has(sort.field),
    ),
  };
}

export const REPORT_DIALOG_COPY = {
  deleteTitle: "Delete saved report?",
  deleteCancel: "Keep report",
  deleteAction: "Delete saved report",
  dirtyTitle: "Discard unsaved recipe changes?",
  dirtyCancel: "Keep editing",
  dirtyAction: "Discard changes",
} as const;
