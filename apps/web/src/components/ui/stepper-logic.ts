export type StepState = "complete" | "current" | "upcoming";

export function getStepState(index: number, currentIndex: number): StepState {
  if (index < currentIndex) {
    return "complete";
  }
  if (index === currentIndex) {
    return "current";
  }
  return "upcoming";
}
