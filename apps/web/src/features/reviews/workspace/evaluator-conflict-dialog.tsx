"use client";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import styles from "../review-workspace.module.css";
import type { EvaluatorController } from "./evaluator-controller";
export function EvaluatorConflictDialog({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const {
    conflictDialogOpen,
    setConflictDialogOpen,
    abstentionReasonRef,
    abstentionReason,
    setAbstentionReason,
    abstentionBusy,
    abstentionError,
    declareAbstention,
  } = controller;
  return (
    <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Declare a conflict</DialogTitle>
          <DialogDescription>
            A written reason is required. Declaring a conflict removes this assignment from your
            reviewer inbox and records the reason for organizer audit.
          </DialogDescription>
        </DialogHeader>
        <div className={styles.formField}>
          <label htmlFor="abstention-reason">
            Reason for abstention <span>(required)</span>
          </label>
          <textarea
            ref={abstentionReasonRef}
            id="abstention-reason"
            value={abstentionReason}
            disabled={abstentionBusy}
            onChange={(event) => setAbstentionReason(event.currentTarget.value)}
            rows={4}
            required
            aria-describedby="abstention-help"
            placeholder="Describe the conflict for the organizer audit log."
          />
          <p className={styles.fieldHint} id="abstention-help">
            This reason is visible to organizers.
          </p>
        </div>
        {abstentionError ? (
          <p className={styles.formError} role="alert">
            {abstentionError}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void declareAbstention()}
            disabled={abstentionBusy}
          >
            {abstentionBusy ? "Declaring…" : "Declare conflict and abstain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
