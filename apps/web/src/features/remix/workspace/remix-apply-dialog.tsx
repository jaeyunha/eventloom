import type { RefObject } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RemixApplyDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function RemixApplyDialog({
  open,
  onOpenChange,
  busy,
  error,
  onConfirm,
  returnFocusRef,
}: RemixApplyDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Apply these content changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Only the reviewed fields will change. The server records the revision and the organizer
            who applied it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null ? (
          <Alert variant="destructive">
            <AlertTitle>Apply failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Applying changes…" : "Confirm and apply"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
