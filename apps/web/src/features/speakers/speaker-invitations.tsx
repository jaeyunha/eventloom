import { AlertCircle, Eye, Send } from "lucide-react";
import type { Ref } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import type { SpeakerMutationStatus } from "./api";
import { statusLabel } from "./speaker-roster-logic";
import styles from "./speaker-workspace.module.css";

export interface SpeakerInvitationControlsProps {
  readonly previewBusy: boolean;
  readonly sendBusy: boolean;
  readonly disabled: boolean;
  readonly canSend: boolean;
  readonly onPreview: () => void;
  readonly onSend: () => void;
}

export function SpeakerInvitationControls({
  previewBusy,
  sendBusy,
  disabled,
  canSend,
  onPreview,
  onSend,
}: SpeakerInvitationControlsProps) {
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={onPreview}
        disabled={disabled || previewBusy || sendBusy}
      >
        <Eye data-icon="inline-start" />
        {previewBusy ? "Preparing invite…" : "Preview portal invite"}
      </Button>
      <Button
        variant="default"
        size="sm"
        type="button"
        onClick={onSend}
        disabled={disabled || sendBusy || previewBusy || !canSend}
      >
        <Send data-icon="inline-start" />
        {sendBusy ? "Sending invite…" : "Send portal invite"}
      </Button>
    </>
  );
}

export function FormMessage({
  message,
  error = false,
}: Readonly<{ message: string; error?: boolean }>) {
  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      <AlertCircle />
      <AlertTitle>{error ? "Action needs attention" : "Workspace update"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function SpeakerMutationFailure({
  message,
  alertRef,
}: Readonly<{
  message: string;
  alertRef?: Ref<HTMLDivElement>;
}>) {
  return (
    <Alert ref={alertRef} variant="destructive" role="alert" aria-live="assertive" tabIndex={-1}>
      <AlertCircle />
      <AlertTitle>Action needs attention</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function MutationStatusMessage({
  label,
  status,
  message,
}: Readonly<{
  label: string;
  status: SpeakerMutationStatus;
  message: string | null;
}>) {
  if (status === "idle" || message === null) return null;
  const error = status === "conflict" || status === "failure";
  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
      aria-live="polite"
      data-mutation-status={status}
      className={styles.mutationStatus}
    >
      <AlertCircle />
      <AlertTitle>
        {label} · {statusLabel(status)}
      </AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
