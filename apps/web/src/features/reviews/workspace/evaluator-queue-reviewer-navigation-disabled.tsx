export function reviewerNavigationDisabled(
  destinationAvailable: boolean,
  autosavePending: boolean,
  draftBusy: boolean,
  submitBusy: boolean,
): boolean {
  return !destinationAvailable || autosavePending || draftBusy || submitBusy;
}
