import { Button } from "../../components/ui";
import styles from "./portal-profile.module.css";

interface ProfileActionsProps {
  readonly saving: boolean;
  readonly saved: boolean;
  readonly dirty: boolean;
  readonly canEdit: boolean;
  readonly error: string | null;
  readonly onDiscard: () => void;
}

export function ProfileActions({
  saving,
  saved,
  dirty,
  canEdit,
  error,
  onDiscard,
}: ProfileActionsProps) {
  return (
    <>
      {error ? (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      ) : null}
      <p
        className={styles.saveStatus}
        role="status"
        aria-live="polite"
        data-state={saved ? "saved" : undefined}
      >
        {saving
          ? "Saving profile…"
          : saved
            ? "Profile saved."
            : dirty
              ? "Unsaved changes."
              : "All changes saved."}
      </p>
      <div className={styles.actions}>
        <Button type="submit" disabled={saving || !canEdit || !dirty}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
        <Button type="button" variant="outline" disabled={saving || !dirty} onClick={onDiscard}>
          Discard changes
        </Button>
      </div>
    </>
  );
}
