"use client";

import { ArrowRight, ClipboardCheck, MailCheck, Mic2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  parseInvitationMutationHref,
  type WorkEventInvitation,
} from "./work-event-invitation-model";
import styles from "./work-hub.module.css";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type InvitationDecision = "accept" | "decline";

interface InvitationMutationError extends Error {
  readonly status: number;
  readonly code: string;
}

function mutationError(response: Response, payload: unknown): InvitationMutationError {
  const payloadRecord =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const errorRecord =
    typeof payloadRecord?.error === "object" &&
    payloadRecord.error !== null &&
    !Array.isArray(payloadRecord.error)
      ? (payloadRecord.error as Record<string, unknown>)
      : null;
  const error = new Error(
    typeof errorRecord?.message === "string" ? errorRecord.message : "Invitation update failed",
  ) as InvitationMutationError;
  Object.assign(error, {
    status: response.status,
    code: typeof errorRecord?.code === "string" ? errorRecord.code : "INVITATION_UPDATE_FAILED",
  });
  return error;
}

export async function respondToEventInvitation(
  fetcher: Fetcher,
  input: Readonly<{
    invitationId: string;
    expectedVersion: number;
    response: InvitationDecision;
  }>,
): Promise<string | null> {
  const response = await fetcher(
    `/api/account/event-invitations/${encodeURIComponent(input.invitationId)}/${input.response}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedVersion: input.expectedVersion }),
    },
  );
  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) throw mutationError(response, payload);
  return input.response === "accept" ? parseInvitationMutationHref(payload) : null;
}

function roleLabel(invitation: WorkEventInvitation): string {
  return invitation.role === "reviewer" ? "Reviewer" : "Speaker";
}

function PendingInvitation({
  invitation,
  onAccepted,
  onDeclined,
}: Readonly<{
  invitation: WorkEventInvitation;
  onAccepted: (invitation: WorkEventInvitation) => void;
  onDeclined: (invitationId: string) => void;
}>) {
  const [busy, setBusy] = useState<InvitationDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: InvitationDecision) => {
    setBusy(decision);
    setError(null);
    try {
      const workspaceHref = await respondToEventInvitation(globalThis.fetch, {
        invitationId: invitation.id,
        expectedVersion: invitation.version,
        response: decision,
      });
      if (decision === "decline") {
        onDeclined(invitation.id);
        return;
      }
      const accepted = { ...invitation, status: "accepted" as const, workspaceHref };
      onAccepted(accepted);
      if (workspaceHref === null) {
        setError("The invitation was accepted, but its workspace destination is unavailable.");
        setBusy(null);
        return;
      }
      window.location.assign(workspaceHref);
    } catch {
      setError("We could not update this invitation. Refresh the page and try again.");
      setBusy(null);
    }
  };
  const label = roleLabel(invitation);
  return (
    <Card className={styles.invitationCard} data-invitation-role={invitation.role}>
      <CardHeader className={styles.invitationHeader}>
        <span className={styles.invitationIcon} aria-hidden="true">
          {invitation.role === "reviewer" ? <ClipboardCheck /> : <Mic2 />}
        </span>
        <div>
          <div className={styles.invitationMeta}>
            <Badge variant="secondary">Pending invitation</Badge>
            <span>{label} access</span>
          </div>
          <CardTitle>{invitation.eventName}</CardTitle>
          <CardDescription>
            {invitation.organizationName === null
              ? `${label} workspace invitation`
              : `${invitation.organizationName} invited you to join as a ${label.toLowerCase()}.`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className={styles.invitationActions}>
        <Button
          type="button"
          onClick={() => void decide("accept")}
          disabled={busy !== null}
          aria-label={`Accept ${label.toLowerCase()} invitation for ${invitation.eventName}`}
        >
          {busy === "accept" ? "Accepting…" : "Accept"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              aria-label={`Decline ${label.toLowerCase()} invitation for ${invitation.eventName}`}
            >
              Decline
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Decline invitation?</AlertDialogTitle>
              <AlertDialogDescription>
                You will decline the {label.toLowerCase()} invitation for {invitation.eventName}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy !== null}>Keep invitation</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy !== null}
                onClick={() => void decide("decline")}
              >
                {busy === "decline" ? "Declining…" : "Decline invitation"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {error === null ? null : (
          <p className={styles.invitationError} role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AcceptedInvitation({ invitation }: Readonly<{ invitation: WorkEventInvitation }>) {
  const label = roleLabel(invitation);
  return (
    <li className={styles.acceptedInvitation}>
      <span className={styles.acceptedIcon} aria-hidden="true">
        {invitation.role === "reviewer" ? <ClipboardCheck /> : <Mic2 />}
      </span>
      <span className={styles.acceptedCopy}>
        <strong>{invitation.eventName}</strong>
        <small>{label} workspace</small>
      </span>
      {invitation.workspaceHref === null ? (
        <Badge variant="outline">Workspace unavailable</Badge>
      ) : (
        <Button asChild variant="outline">
          <Link href={invitation.workspaceHref}>
            Open workspace
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      )}
    </li>
  );
}

export function WorkEventInvitations({
  invitations,
  onInvitationsChange,
}: Readonly<{
  invitations: readonly WorkEventInvitation[];
  onInvitationsChange: (invitations: readonly WorkEventInvitation[]) => void;
}>) {
  const pending = invitations.filter((invitation) => invitation.status === "pending");
  const accepted = invitations.filter((invitation) => invitation.status === "accepted");
  if (invitations.length === 0) return null;
  return (
    <div className={styles.invitationSections}>
      {pending.length === 0 ? null : (
        <section
          className={styles.pendingInvitations}
          aria-labelledby="pending-invitations-heading"
        >
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIcon} aria-hidden="true">
              <MailCheck />
            </span>
            <div>
              <p className={styles.eyebrow}>New access</p>
              <h2 id="pending-invitations-heading">Event invitations</h2>
              <p>Accept an invitation to enter its workspace, or decline it if it is not yours.</p>
            </div>
          </div>
          <div className={styles.invitationGrid}>
            {pending.map((invitation) => (
              <PendingInvitation
                invitation={invitation}
                key={invitation.id}
                onAccepted={(acceptedInvitation) =>
                  onInvitationsChange(
                    invitations.map((item) =>
                      item.id === acceptedInvitation.id ? acceptedInvitation : item,
                    ),
                  )
                }
                onDeclined={(invitationId) =>
                  onInvitationsChange(invitations.filter((item) => item.id !== invitationId))
                }
              />
            ))}
          </div>
        </section>
      )}
      {accepted.length === 0 ? null : (
        <section
          className={styles.acceptedInvitations}
          aria-labelledby="accepted-invitations-heading"
        >
          <div>
            <p className={styles.eyebrow}>Event access</p>
            <h2 id="accepted-invitations-heading">Your event workspaces</h2>
          </div>
          <ul className={styles.acceptedList}>
            {accepted.map((invitation) => (
              <AcceptedInvitation invitation={invitation} key={invitation.id} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
