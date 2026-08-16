import { LoaderCircle, Sparkles } from "lucide-react";
import type { FormEventHandler } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WorkspaceSurface } from "@/components/workspace/workspace-ui";
import type { RemixField, RemixSourceRecord, RemixSourceType } from "../api";
import styles from "../remix-workspace.module.css";
import { RemixSourcePicker } from "./remix-source-picker";
import { fieldLabels } from "./remix-workspace-model";
import { RemixWritingDirection } from "./remix-writing-direction";

interface RemixComposerProps {
  readonly sourceType: RemixSourceType;
  readonly onSourceTypeChange: (value: RemixSourceType) => void;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly tagFilter: string;
  readonly onTagFilterChange: (value: string) => void;
  readonly trackFilter: string;
  readonly onTrackFilterChange: (value: string) => void;
  readonly records: readonly RemixSourceRecord[];
  readonly selectedSourceIds: readonly string[];
  readonly onToggleSource: (sourceId: string) => void;
  readonly loading: boolean;
  readonly error: string | null;
  readonly availableFields: readonly RemixField[];
  readonly fields: readonly RemixField[];
  readonly onToggleField: (field: RemixField) => void;
  readonly tone: string;
  readonly onToneChange: (value: string) => void;
  readonly guidance: string;
  readonly onGuidanceChange: (value: string) => void;
  readonly actionError: string | null;
  readonly actionMessage: string | null;
  readonly busyAction: string | null;
  readonly onGenerate: FormEventHandler<HTMLFormElement>;
}

export function RemixComposer(props: RemixComposerProps) {
  const selectedFields = props.fields.map((field) => fieldLabels[field]).join(", ");
  const canGenerate =
    !props.loading &&
    props.busyAction === null &&
    props.selectedSourceIds.length > 0 &&
    props.fields.length > 0 &&
    props.tone.trim().length > 0;

  return (
    <WorkspaceSurface
      id="remix-composer"
      title="Create suggestions"
      description="Choose content and give the writing direction once. Suggestions stay private for review."
      actions={
        <Button type="submit" form="remix-composer-form" disabled={!canGenerate}>
          {props.busyAction === "generate" ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <Sparkles data-icon="inline-start" />
          )}
          {props.busyAction === "generate" ? "Generating suggestions…" : "Generate suggestions"}
        </Button>
      }
    >
      <form id="remix-composer-form" data-workflow="remix-composer" onSubmit={props.onGenerate}>
        <div className={styles.composerGrid}>
          <RemixSourcePicker {...props} />
          <RemixWritingDirection {...props} />
        </div>
        {props.actionError ? (
          <div className={styles.inlineMessage}>
            <Alert variant="destructive">
              <AlertTitle>Suggestion not created</AlertTitle>
              <AlertDescription>{props.actionError}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        {props.actionMessage ? (
          <p className={styles.inlineMessage} role="status">
            {props.actionMessage}
          </p>
        ) : null}
        <footer className={styles.composerFooter}>
          <div className={styles.requestSummary}>
            <strong>
              {props.selectedSourceIds.length} selected · {selectedFields || "No fields selected"}
            </strong>
            <span>Nothing changes until you review and apply a suggestion.</span>
          </div>
        </footer>
      </form>
    </WorkspaceSurface>
  );
}
