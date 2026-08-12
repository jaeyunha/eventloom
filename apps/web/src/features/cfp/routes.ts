import type { CfpStep } from "./types";

export function getCfpStepRoute(
  organizationId: string,
  eventSlug: string,
  step: CfpStep | "complete",
): string {
  const base = `/cfp/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}`;
  if (step === "welcome") return base;
  return `${base}/${step}`;
}

export function getNextCfpStep(step: CfpStep): CfpStep | "complete" {
  switch (step) {
    case "welcome":
      return "account";
    case "account":
      return "submission";
    case "submission":
      return "participants";
    case "participants":
      return "review";
    case "review":
      return "complete";
  }
}

export function getPreviousCfpStep(step: CfpStep): CfpStep | null {
  switch (step) {
    case "welcome":
      return null;
    case "account":
      return "welcome";
    case "submission":
      return "account";
    case "participants":
      return "submission";
    case "review":
      return "participants";
  }
}
