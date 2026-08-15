export function reviewerSelectionBlocked(
  pendingAssignmentId: string | null,
  selectedAssignmentId: string | null,
  nextAssignmentId: string | null,
): boolean {
  return pendingAssignmentId !== null && nextAssignmentId !== selectedAssignmentId;
}
