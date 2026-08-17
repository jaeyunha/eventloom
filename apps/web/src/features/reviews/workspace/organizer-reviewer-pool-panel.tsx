"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import type { OrganizationMember, ReviewerPool } from "../../members/api";
import styles from "../review-workspace.module.css";
import type { ReviewerPoolDraft } from "./organizer-reviewer-pool-model";

interface OrganizerReviewerPoolViewProps {
  readonly roundName: string;
  readonly reviewers: readonly OrganizationMember[];
  readonly pool: ReviewerPool | null;
  readonly draft: ReviewerPoolDraft;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  readonly message: string | null;
  readonly invitationHref: string;
  readonly onReviewerChange: (reviewerId: string, selected: boolean) => void;
  readonly onMaxAssignmentsChange: (reviewerId: string, maxAssignments: number) => void;
  readonly onSave: () => void;
  readonly onReload?: (() => void) | undefined;
}

export function OrganizerReviewerPoolView({
  roundName,
  reviewers,
  pool,
  draft,
  loading,
  saving,
  error,
  message,
  invitationHref,
  onReviewerChange,
  onMaxAssignmentsChange,
  onSave,
  onReload,
}: OrganizerReviewerPoolViewProps) {
  const selectedCount = Object.keys(draft).length;
  const grantsByReviewer = new Map(pool?.grants.map((grant) => [grant.reviewerId, grant]) ?? []);
  return (
    <Card className={styles.reviewTeamCard}>
      <CardHeader>
        <div>
          <CardTitle>Review team for {roundName}</CardTitle>
          <CardDescription>
            Organization reviewers become eligible for this round only after you add them here.
            Pending reviewers can be prepared now; access waits for invitation acceptance.
            Assignments are created separately below.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className={styles.reviewTeamContent}>
        {loading ? (
          <p className={styles.fieldHint} role="status">
            Loading review team…
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Review team unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
            {onReload ? (
              <Button type="button" variant="outline" size="sm" onClick={onReload}>
                Reload team
              </Button>
            ) : null}
          </Alert>
        ) : null}
        {!loading && !error && reviewers.length === 0 ? (
          <Empty className={styles.reviewTeamEmpty}>
            <EmptyHeader>
              <EmptyTitle>No reviewer candidates</EmptyTitle>
              <EmptyDescription>Invite a reviewer to prepare them for this round.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href={invitationHref}>Invite reviewers</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}
        {!loading && !error && reviewers.length > 0 ? (
          <ul className={styles.reviewTeamList} aria-label={`Review team for ${roundName}`}>
            {reviewers.map((reviewer) => {
              const selected = draft[reviewer.userId] !== undefined;
              const grant = grantsByReviewer.get(reviewer.userId);
              const maxAssignments = draft[reviewer.userId] ?? grant?.maxAssignments ?? 1;
              return (
                <li className={styles.reviewTeamRow} key={reviewer.userId}>
                  <Field orientation="horizontal" className={styles.reviewTeamIdentity}>
                    <Checkbox
                      id={`round-reviewer-${reviewer.userId}`}
                      checked={selected}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        onReviewerChange(reviewer.userId, checked === true)
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`round-reviewer-${reviewer.userId}`}>
                        {reviewer.name ?? reviewer.email}
                      </FieldLabel>
                      <FieldDescription>
                        {reviewer.email}
                        {reviewer.status === "pending" ? " · Pending setup" : ""}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                  <div className={styles.reviewTeamCap}>
                    <label htmlFor={`round-reviewer-cap-${reviewer.userId}`}>Assignment cap</label>
                    <Input
                      id={`round-reviewer-cap-${reviewer.userId}`}
                      type="number"
                      min={1}
                      max={10_000}
                      value={maxAssignments}
                      disabled={!selected || saving}
                      onChange={(event) =>
                        onMaxAssignmentsChange(reviewer.userId, Number(event.currentTarget.value))
                      }
                    />
                  </div>
                  <span className={styles.reviewTeamLoad}>
                    {grant === undefined
                      ? selected
                        ? `0 of ${maxAssignments} assigned`
                        : "Not in this round"
                      : `${grant.assignedCount} of ${maxAssignments} assigned`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {message ? (
          <p className={styles.reviewTeamMessage} role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className={styles.reviewTeamFooter}>
        <span>
          {selectedCount} of {reviewers.length} reviewer candidates eligible
        </span>
        <Button
          type="button"
          onClick={onSave}
          disabled={loading || saving || error !== null || reviewers.length === 0}
        >
          {saving ? "Saving…" : "Save review team"}
        </Button>
      </CardFooter>
    </Card>
  );
}
