"use client";

import { formatUploadMimeTypes } from "@eventloom/contracts";
import { type ChangeEvent, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  WorkspaceActionBar,
  WorkspaceFormSection,
} from "../../components/workspace/workspace-state";
import { usePortal } from "./portal-provider";
import styles from "./portal-task-detail.module.css";
import { getTaskUploadPolicy, validateTaskUpload } from "./portal-task-model";
import { formatPortalFileSize } from "./portal-ui-model";
import type { PortalTask } from "./types";

type UploadPhase = "idle" | "processing" | "complete" | "failure";

export function PortalTaskUpload({ task }: Readonly<{ task: PortalTask }>) {
  const { busyTaskIds, uploadTask } = usePortal();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const policy = getTaskUploadPolicy(task);
  const kind = task.acceptedAssetKinds?.[0];
  const acceptedTypeSummary = policy.valid ? formatUploadMimeTypes(policy.allowedMimeTypes) : "";
  const busy = busyTaskIds.has(task.id) || phase === "processing";

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0] ?? null;
    setFile(selected);
    setPhase("idle");
    setError(null);
    if (!selected) return;
    const validation = validateTaskUpload(selected, policy);
    if (!validation.valid) {
      setPhase("failure");
      setError(validation.error);
      setFile(null);
      event.currentTarget.value = "";
    }
  }

  async function upload() {
    if (!file || !kind || !policy.valid) return;
    setPhase("processing");
    setError(null);
    const succeeded = await uploadTask(task, file);
    if (succeeded) {
      setPhase("complete");
      setFile(null);
    } else {
      setPhase("failure");
      setError("The file did not complete every upload step. Try again.");
    }
  }

  const summary =
    phase === "processing"
      ? "Transferring the file, finalizing it on the server, then submitting the request."
      : phase === "complete"
        ? "Transfer complete, file finalized, and request submitted for organizer review."
        : file
          ? `${file.name} is selected but has not been transferred.`
          : "Selecting a file does not upload or submit it.";

  return (
    <WorkspaceFormSection
      title="Upload lifecycle"
      description="Transfer, server finalization, and task submission are distinct steps completed by this action."
    >
      <ol className={styles.uploadSteps}>
        <li>
          <strong>1</strong>
          <span>Transfer to private storage</span>
        </li>
        <li>
          <strong>2</strong>
          <span>Finalize the immutable file version</span>
        </li>
        <li>
          <strong>3</strong>
          <span>Submit this request for organizer review</span>
        </li>
      </ol>
      <label className={styles.fileField} htmlFor={`task-upload-${task.id}`}>
        <span>Choose {kind ? kind.replaceAll("_", " ") : "task file"}</span>
        <Input
          id={`task-upload-${task.id}`}
          type="file"
          accept={policy.valid ? policy.allowedMimeTypes.join(",") : undefined}
          disabled={busy || !policy.valid || !kind}
          onChange={choose}
        />
        <small>
          {!kind
            ? "Upload unavailable: no accepted file kind was provided."
            : policy.valid
              ? `Accepted: ${acceptedTypeSummary}. Maximum ${formatPortalFileSize(policy.maxBytes)}.`
              : policy.error}
        </small>
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <WorkspaceActionBar
        summary={summary}
        actions={
          <Button
            type="button"
            disabled={busy || !file || !policy.valid || !kind}
            onClick={() => void upload()}
          >
            {busy ? "Uploading…" : "Upload and submit"}
          </Button>
        }
      />
    </WorkspaceFormSection>
  );
}
