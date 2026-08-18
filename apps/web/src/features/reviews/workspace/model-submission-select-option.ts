import type { SearchableSelectOption } from "../../../components/ui/searchable-select-logic";
import { participantDisplayLabel } from "./model-participant-display-label";
import { submissionDisplayTitle } from "./model-submission-display-title";
import type { AggregateRow } from "./organizer-aggregate-row";

export function submissionSelectOption(row: AggregateRow): SearchableSelectOption {
  const participantName = participantDisplayLabel(row.participants);
  return {
    value: row.id,
    label: submissionDisplayTitle(row),
    ...(participantName ? { description: participantName } : {}),
  };
}
