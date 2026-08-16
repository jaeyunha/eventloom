import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarClock } from "lucide-react";
import styles from "../review-workspace.module.css";
import type { ReviewRound } from "./organizer-review-round";
import { utcDateTimeLabel } from "./model-date-label";

export const ROUND_AVAILABILITY_NOTICE_ID = "round-availability-notice";

interface EvaluatorRoundAvailabilityNoticeProps {
  readonly round: ReviewRound;
}

export function EvaluatorRoundAvailabilityNotice({ round }: EvaluatorRoundAvailabilityNoticeProps) {
  if (round.status === "open") return null;

  const scheduled = round.status === "scheduled";
  const instant = scheduled ? round.opensAtIso : round.closesAtIso;
  const fallback = scheduled ? round.opensAt : round.closesAt;

  return (
    <Alert
      id={ROUND_AVAILABILITY_NOTICE_ID}
      className={styles.roundAvailabilityNotice}
      role="status"
      data-round-availability={round.status}
    >
      <CalendarClock aria-hidden="true" />
      <AlertTitle>
        {scheduled ? "Scoring opens " : "Scoring closed "}
        <time dateTime={instant}>{utcDateTimeLabel(instant ?? fallback)}</time>
      </AlertTitle>
      <AlertDescription>
        {scheduled
          ? "Scores, written responses, comments, and submission stay locked until this round opens. You can review the submission now."
          : "Scores, written responses, comments, and submission are read-only because this round has closed."}
      </AlertDescription>
    </Alert>
  );
}
