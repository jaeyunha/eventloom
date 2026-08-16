import type { DecisionStatus } from "./organizer-decision-status";

export interface ApiDecision {
  status: DecisionStatus;
  version: number;
  history: readonly {
    reason: string;
  }[];
}
