"use client";

import { Badge } from "../../../components/ui/badge";
import styles from ".././review-workspace.module.css";
import type { DecisionStatus } from "./organizer-decision-status";
import { formatDecisionStatus } from "./organizer-format-decision-status";

export function DecisionStatusBadge({ status }: Readonly<{ status: DecisionStatus }>) {
  const className =
    status === "accepted"
      ? styles.statusAccepted
      : status === "waitlisted"
        ? styles.statusWaitlisted
        : styles.statusRejected;
  return (
    <Badge variant="outline" className={className}>
      {formatDecisionStatus(status)}
    </Badge>
  );
}
