export type ScorecardPrimaryAction =
  | { readonly kind: "submit"; readonly label: "Submit review"; readonly disabled: boolean }
  | { readonly kind: "open-next"; readonly label: "Open next review"; readonly disabled: false }
  | { readonly kind: "submitted"; readonly label: "Review submitted"; readonly disabled: true };

export function scorecardPrimaryAction({
  submitted,
  hasNext,
  submitBusy,
  autosavePending,
}: Readonly<{
  submitted: boolean;
  hasNext: boolean;
  submitBusy: boolean;
  autosavePending: boolean;
}>): ScorecardPrimaryAction {
  if (submitted) {
    return hasNext
      ? { kind: "open-next", label: "Open next review", disabled: false }
      : { kind: "submitted", label: "Review submitted", disabled: true };
  }
  return {
    kind: "submit",
    label: "Submit review",
    disabled: submitBusy || autosavePending,
  };
}
