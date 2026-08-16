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

export function fieldsForRelationships(
  relationships: readonly ReportRelationship[],
): readonly FieldOption[] {
  return SOURCE_ORDER.flatMap((relationship) =>
    relationships.includes(relationship) ? REPORT_FIELD_ALLOWLIST[relationship] : [],
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
  const order = arrayValue(next.order).filter((field) => fields.includes(field));
  return {
    ...next,
    relationships,
    fields,
    order: [...order, ...fields.filter((field) => !order.includes(field))],
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
