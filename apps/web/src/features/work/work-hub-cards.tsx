import { ArrowRight, Building2, ClipboardCheck, Mic2 } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "./work-hub.module.css";
import type { WorkHubModel } from "./work-hub-model";

function ContextNames({ names }: Readonly<{ names: readonly string[] }>) {
  if (names.length === 0) return null;
  return <p className={styles.contextNames}>{names.slice(0, 3).join(" · ")}</p>;
}

function OrganizerCard({ model }: Readonly<{ model: NonNullable<WorkHubModel["organizer"]> }>) {
  return (
    <Card className={`${styles.workspaceCard} ${styles.organizerCard}`} data-workspace="organizer">
      <CardHeader className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Building2 aria-hidden="true" />
        </span>
        <div>
          <CardTitle>Organizer workspace</CardTitle>
          <CardDescription>
            Shape programs, teams, submissions, and event operations.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className={styles.cardBody}>
        <div className={styles.metrics}>
          <Badge variant="secondary">
            {model.organizationCount} organization{model.organizationCount === 1 ? "" : "s"}
          </Badge>
        </div>
        <ContextNames names={model.organizationNames} />
        <div className={styles.actions}>
          {model.continueHref && model.continueLabel ? (
            <Button asChild>
              <Link href={model.continueHref}>
                {model.continueLabel}
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          <Button asChild variant={model.continueHref ? "outline" : "default"}>
            <Link href="/admin">Manage events</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewerCard({ model }: Readonly<{ model: NonNullable<WorkHubModel["reviewer"]> }>) {
  return (
    <Card className={styles.workspaceCard} data-workspace="reviewer">
      <CardHeader className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <ClipboardCheck aria-hidden="true" />
        </span>
        <div>
          <CardTitle>Reviewer workspace</CardTitle>
          <CardDescription>
            Score the submissions assigned to you across review rounds.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className={styles.cardBody}>
        <div className={styles.metrics}>
          <Badge variant="secondary">{model.assignmentCount} assigned</Badge>
          {model.inProgressCount > 0 ? (
            <Badge variant="outline">{model.inProgressCount} in progress</Badge>
          ) : null}
          {model.submittedCount > 0 ? (
            <Badge variant="outline">{model.submittedCount} submitted</Badge>
          ) : null}
        </div>
        <ContextNames names={model.eventNames} />
        <Button asChild>
          <Link href="/review">
            {model.inProgressCount > 0 ? "Continue reviews" : "Review assignments"}
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ParticipantCard({ model }: Readonly<{ model: NonNullable<WorkHubModel["participant"]> }>) {
  const eventNames = [...new Set([...model.proposalEventNames, ...model.speakerTaskEventNames])];
  return (
    <Card className={styles.workspaceCard} data-workspace="participant">
      <CardHeader className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Mic2 aria-hidden="true" />
        </span>
        <div>
          <CardTitle>Participant workspace</CardTitle>
          <CardDescription>
            Follow proposals and complete work for accepted sessions.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className={styles.cardBody}>
        <div className={styles.metrics}>
          {model.proposalCount > 0 ? (
            <Badge variant="secondary">
              {model.proposalCount} proposal{model.proposalCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
          {model.speakerTaskEventCount > 0 ? (
            <Badge variant="outline">
              Speaker work in {model.speakerTaskEventCount} event
              {model.speakerTaskEventCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <ContextNames names={eventNames} />
        <div className={styles.actions}>
          {model.proposalCount > 0 ? (
            <Button asChild>
              <Link href="/portal/submissions">View my proposals</Link>
            </Button>
          ) : null}
          {model.speakerTaskEventCount > 0 ? (
            <Button asChild variant={model.proposalCount > 0 ? "outline" : "default"}>
              <Link href="/portal/tasks">Complete speaker tasks</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkHubCards({
  model,
  hasEventInvitations = false,
}: Readonly<{ model: WorkHubModel; hasEventInvitations?: boolean }>) {
  const availableCount = [model.organizer, model.reviewer, model.participant].filter(
    Boolean,
  ).length;
  return (
    <section className={styles.workspaceGrid} id="workspaces" aria-label="Authorized workspaces">
      {model.organizer ? <OrganizerCard model={model.organizer} /> : null}
      {model.reviewer ? <ReviewerCard model={model.reviewer} /> : null}
      {model.participant ? <ParticipantCard model={model.participant} /> : null}
      {availableCount === 0 && !hasEventInvitations ? (
        <Alert className={styles.emptyState}>
          <AlertTitle>No assigned work yet</AlertTitle>
          <AlertDescription>
            This account is authenticated, but no organizer, reviewer, or participant workspace is
            currently available.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
