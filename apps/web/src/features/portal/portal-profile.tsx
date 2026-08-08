"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { validateBiography } from "./model";
import { usePortal } from "./portal-provider";
import {
  EmptyState,
  InlineMutationError,
  PageHeading,
  PortalContentState,
  formatPortalDate,
} from "./portal-ui";
import styles from "./portal.module.css";
import type { PortalProfile } from "./types";

export function PortalProfilePage() {
  return (
    <PortalContentState>
      <PortalProfileContent />
    </PortalContentState>
  );
}

function PortalProfileContent() {
  const { eventQuery, saveBiography, savingProfile, view } = usePortal();
  const profile = view?.profiles[0];
  const [biography, setBiography] = useState(profile?.biography ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setBiography(profile.biography);
    }
  }, [profile]);

  if (!view) {
    return null;
  }
  if (!profile) {
    return (
      <EmptyState
        title="No speaker profile available"
        description="A profile will appear after you are added as a participant."
      />
    );
  }

  async function submitBiography(
    event: FormEvent<HTMLFormElement>,
    currentProfile: PortalProfile,
  ) {
    event.preventDefault();
    setSaved(false);
    const validation = validateBiography(biography);
    if (!validation.success) {
      setValidationError(validation.message);
      return;
    }
    setValidationError(null);
    const didSave = await saveBiography(currentProfile, validation.biography);
    setSaved(didSave);
  }

  const initials = profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");
  const headshotTask = view.tasks.find(
    (task) => task.type === "upload" && task.acceptedAssetKinds?.includes("headshot"),
  );

  return (
    <>
      <PageHeading
        eyebrow="Public event details"
        title="Speaker profile"
        description="Keep the biography the event team will use in published speaker materials up to date."
      />
      <InlineMutationError />
      <div className={styles.profileLayout}>
        <aside className={styles.panel} aria-labelledby="profile-preview-heading">
          <div className={styles.profileIdentity}>
            <span className={styles.profileAvatar} aria-hidden="true">
              {initials}
            </span>
            <div>
              <h2 id="profile-preview-heading">{profile.displayName}</h2>
              <p>Event speaker</p>
            </div>
          </div>
          <dl className={styles.profileFacts}>
            <div>
              <dt>Headshot</dt>
              <dd>{profile.headshotAssetId ? "Uploaded" : "Not uploaded"}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatPortalDate(profile.updatedAt) ?? "Recently"}</dd>
            </div>
          </dl>
          {headshotTask ? (
            <Link className={styles.secondaryButton} href={`/portal/tasks${eventQuery}`}>
              Manage headshot task
            </Link>
          ) : null}
        </aside>

        <section className={styles.panel} aria-labelledby="profile-form-heading">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Biography</p>
              <h2 id="profile-form-heading">Edit your profile</h2>
            </div>
          </div>
          <form
            className={styles.profileForm}
            onSubmit={(event) => void submitBiography(event, profile)}
          >
            <div className={styles.readOnlyField}>
              <span>Display name</span>
              <strong>{profile.displayName}</strong>
              <small>Contact the event team to change your name.</small>
            </div>
            <label className={styles.textareaField}>
              <span>Biography</span>
              <textarea
                value={biography}
                rows={10}
                maxLength={5_000}
                aria-describedby="biography-help biography-count"
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => {
                  setBiography(event.currentTarget.value);
                  setSaved(false);
                  if (validationError) {
                    setValidationError(null);
                  }
                }}
              />
              <span className={styles.fieldMeta}>
                <small id="biography-help">
                  Share your experience in plain text. Maximum 5,000 characters.
                </small>
                <small id="biography-count" aria-live="polite">
                  {biography.length.toLocaleString()}/5,000
                </small>
              </span>
            </label>
            {validationError ? (
              <p className={styles.fieldError} role="alert">
                {validationError}
              </p>
            ) : null}
            {saved ? (
              <p className={styles.saveConfirmation} role="status">
                Biography saved.
              </p>
            ) : null}
            <div className={styles.formActions}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={savingProfile || biography === profile.biography}
              >
                {savingProfile ? "Saving…" : "Save biography"}
              </button>
              <button
                className={styles.tertiaryButton}
                type="button"
                disabled={savingProfile || biography === profile.biography}
                onClick={() => {
                  setBiography(profile.biography);
                  setValidationError(null);
                  setSaved(false);
                }}
              >
                Discard changes
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
