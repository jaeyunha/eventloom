import type { SearchableSelectOption } from "../../../components/ui/searchable-select-logic";
import { participantDisplayLabel } from "./model-participant-display-label";
import type { AggregateRow } from "./organizer-aggregate-row";

export function submissionSelectOption(row: AggregateRow): SearchableSelectOption {
  const participantName = participantDisplayLabel(row.participants);
  return {
    value: row.id,
    label: row.title,
    ...(participantName ? { description: participantName } : {}),
  };
}
