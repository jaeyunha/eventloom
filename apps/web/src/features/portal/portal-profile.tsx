"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  createPortalApi,
  PortalApiError,
  type PortalProfileDto,
  validatePortalSocialUrl,
} from "./api";
import { validateBiography } from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import {
  EmptyState,
  formatPortalDate,
  InlineMutationError,
  PageHeading,
  PortalContentState,
} from "./portal-ui";
import type { PortalAsset, PortalProfile } from "./types";

const maxProfileTextLength = 200;
const maxHeadshotBytes = 5 * 1024 * 1024;

type EditablePortalProfile = PortalProfileDto;

type ProfileDraft = {
  biography: string;
  jobTitle: string;
  company: string;
  twitter: string;
  linkedin: string;
};

function editableProfile(profile: PortalProfile): EditablePortalProfile {
  return profile as EditablePortalProfile;
}

function profileDraftFor(profile: PortalProfile): ProfileDraft {
  const details = editableProfile(profile);
  return {
    biography: profile.biography,
    jobTitle: details.jobTitle ?? "",
    company: details.company ?? "",
    twitter: details.socialLinks?.twitter ?? "",
    linkedin: details.socialLinks?.linkedin ?? "",
  };
}

function profileSocialLinksFor(
  profile: PortalProfile,
  twitter: string,
  linkedin: string,
): Record<string, string> {
  const current = editableProfile(profile).socialLinks ?? {};
  const socialLinks: Record<string, string> = { ...current };
  const cleanTwitter = twitter.trim();
  const cleanLinkedin = linkedin.trim();
  if (cleanTwitter) socialLinks.twitter = cleanTwitter;
  else delete socialLinks.twitter;
  if (cleanLinkedin) socialLinks.linkedin = cleanLinkedin;
  else delete socialLinks.linkedin;
  return socialLinks;
}

function validProfileText(value: string, label: string): string | null {
  const normalized = value.trim();
  if (normalized.length > maxProfileTextLength) {
    return `${label} must be ${maxProfileTextLength} characters or fewer.`;
  }
  if (
    [...normalized].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint < 0x20 && codePoint !== 0x09;
    })
  ) {
    return `${label} contains an unsupported control character.`;
  }
  return null;
}

function profileAssetMismatch(
  asset: PortalAsset,
  eventId: string,
  participantId: string,
): PortalApiError | null {
  if (
    asset.eventId !== eventId ||
    asset.participantId !== participantId ||
    asset.kind !== "headshot"
  ) {
    return new PortalApiError(
      "CONTEXT_MISMATCH",
      "The headshot response belongs to a different event or participant.",
      409,
    );
  }
  return null;
}

export function PortalProfilePage() {
  return (
    <PortalContentState>
      <PortalProfileContent />
    </PortalContentState>
  );
}

function PortalProfileContent() {
  const { context, eventQuery, can, view } = usePortal();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const profileApi = useMemo(() => (apiBaseUrl ? createPortalApi(apiBaseUrl) : null), [apiBaseUrl]);
  const profile =
    view?.profiles.find((candidate) => candidate.participantId === context?.primaryParticipantId) ??
    view?.profiles[0];
  const details = profile ? editableProfile(profile) : undefined;
  const [biography, setBiography] = useState(profile?.biography ?? "");
  const [jobTitle, setJobTitle] = useState(details?.jobTitle ?? "");
  const [company, setCompany] = useState(details?.company ?? "");
  const [twitter, setTwitter] = useState(details?.socialLinks?.twitter ?? "");
  const [linkedin, setLinkedin] = useState(details?.socialLinks?.linkedin ?? "");
  const [selectedHeadshot, setSelectedHeadshot] = useState<File | null>(null);
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileVersion, setProfileVersion] = useState(profile?.version ?? 0);
  const selectedContextId = context?.id;

  useEffect(() => {
    if (!profile) return;
    const next = profileDraftFor(profile);
    setBiography(next.biography);
    setJobTitle(next.jobTitle);
    setCompany(next.company);
    setTwitter(next.twitter);
    setLinkedin(next.linkedin);
    setProfileVersion(profile.version);
    setSelectedHeadshot(null);
    setValidationError(null);
    setSaveError(null);
  }, [profile]);

  useEffect(() => {
    if (selectedContextId !== undefined) setSaved(false);
  }, [selectedContextId]);

  useEffect(() => {
    let cancelled = false;
    async function loadHeadshotGrant() {
      if (
        !profile ||
        !details?.headshotAssetId ||
        !context ||
        profile.eventId !== context.eventId ||
        !context.participantIds.includes(profile.participantId) ||
        !profileApi?.getDownloadGrant ||
        !can("asset-read")
      ) {
        setHeadshotUrl(null);
        return;
      }
      try {
        const grant = await profileApi.getDownloadGrant(context.eventId, details.headshotAssetId);
        if (!cancelled) setHeadshotUrl(grant.url);
      } catch {
        if (!cancelled) setHeadshotUrl(null);
      }
    }
    void loadHeadshotGrant();
    return () => {
      cancelled = true;
    };
  }, [can, context, details?.headshotAssetId, profile, profileApi]);

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

  const loadedProfile = profile;
  const profileDetails = editableProfile(loadedProfile);
  const profileContextIsValid =
    context?.eventId === loadedProfile.eventId &&
    context.participantIds.includes(loadedProfile.participantId);
  const canEditProfile = can("profile-self") && profileContextIsValid;
  const initials = loadedProfile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");
  const headshotTask = view.tasks.find(
    (task) => task.type === "upload" && task.acceptedAssetKinds?.includes("headshot"),
  );
  const initialDraft = profileDraftFor(loadedProfile);
  const hasChanges =
    biography !== initialDraft.biography ||
    jobTitle !== initialDraft.jobTitle ||
    company !== initialDraft.company ||
    twitter !== initialDraft.twitter ||
    linkedin !== initialDraft.linkedin ||
    selectedHeadshot !== null;

  function updateDraft(field: keyof ProfileDraft, value: string) {
    if (field === "biography") setBiography(value);
    if (field === "jobTitle") setJobTitle(value);
    if (field === "company") setCompany(value);
    if (field === "twitter") setTwitter(value);
    if (field === "linkedin") setLinkedin(value);
    setSaved(false);
    setSaveError(null);
    if (validationError) setValidationError(null);
  }

  function resetDraft() {
    const next = profileDraftFor(loadedProfile);
    setBiography(next.biography);
    setJobTitle(next.jobTitle);
    setCompany(next.company);
    setTwitter(next.twitter);
    setLinkedin(next.linkedin);
    setSelectedHeadshot(null);
    setValidationError(null);
    setSaveError(null);
    setSaved(false);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setSaveError(null);
    if (!canEditProfile || !context) {
      setSaveError("You do not have permission to edit this profile in the selected event.");
      return;
    }
    const biographyValidation = validateBiography(biography);
    if (!biographyValidation.success) {
      setValidationError(biographyValidation.message);
      return;
    }
    const jobTitleError = validProfileText(jobTitle, "Job title");
    if (jobTitleError) {
      setValidationError(jobTitleError);
      return;
    }
    const companyError = validProfileText(company, "Company");
    if (companyError) {
      setValidationError(companyError);
      return;
    }
    const twitterError = validatePortalSocialUrl(twitter, "twitter");
    if (twitterError) {
      setValidationError(twitterError);
      return;
    }
    const linkedinError = validatePortalSocialUrl(linkedin, "linkedin");
    if (linkedinError) {
      setValidationError(linkedinError);
      return;
    }
    if (selectedHeadshot && selectedHeadshot.size > maxHeadshotBytes) {
      setValidationError("Headshot must be 5 MiB or smaller.");
      return;
    }
    if (selectedHeadshot && !can("asset-write")) {
      setSaveError("You do not have permission to upload a headshot in this event.");
      return;
    }
    if (!profileApi?.updateProfile) {
      setSaveError("The speaker portal profile API is not available yet.");
      return;
    }
    const updateProfile = profileApi.updateProfile;
    if (selectedHeadshot && (!profileApi.uploadFile || !profileApi.finalizeAsset)) {
      setSaveError("Private headshot uploads are not available yet.");
      return;
    }

    setValidationError(null);
    setSaving(true);
    try {
      let headshotAssetId: string | undefined;
      if (selectedHeadshot && profileApi.uploadFile && profileApi.finalizeAsset) {
        const pending = await profileApi.uploadFile({
          eventId: context.eventId,
          participantId: loadedProfile.participantId,
          kind: "headshot",
          file: selectedHeadshot,
          ...(profileDetails.headshotAssetId
            ? { supersedesAssetId: profileDetails.headshotAssetId }
            : {}),
        });
        const uploadMismatch = profileAssetMismatch(
          pending,
          context.eventId,
          loadedProfile.participantId,
        );
        if (uploadMismatch) throw uploadMismatch;
        const finalized = await profileApi.finalizeAsset({
          eventId: context.eventId,
          assetId: pending.id,
          state: "ready",
        });
        const finalizeMismatch = profileAssetMismatch(
          finalized,
          context.eventId,
          loadedProfile.participantId,
        );
        if (finalizeMismatch || finalized.state !== "ready") {
          throw (
            finalizeMismatch ??
            new PortalApiError(
              "UPLOAD_NOT_READY",
              "The headshot could not be finalized. Try again.",
              409,
            )
          );
        }
        headshotAssetId = finalized.id;
      }

      const updated = await updateProfile({
        eventId: context.eventId,
        participantId: loadedProfile.participantId,
        biography: biographyValidation.biography,
        jobTitle: jobTitle.trim(),
        company: company.trim(),
        socialLinks: profileSocialLinksFor(loadedProfile, twitter, linkedin),
        ...(headshotAssetId === undefined ? {} : { headshotAssetId }),
        expectedVersion: profileVersion,
      });
      if (
        updated.eventId !== context.eventId ||
        updated.participantId !== loadedProfile.participantId
      ) {
        throw new PortalApiError(
          "CONTEXT_MISMATCH",
          "The profile response belongs to a different event or participant.",
          409,
        );
      }
      setBiography(updated.biography);
      setProfileVersion(updated.version);
      setJobTitle(updated.jobTitle ?? jobTitle.trim());
      setCompany(updated.company ?? company.trim());
      setTwitter(updated.socialLinks?.twitter ?? twitter.trim());
      setLinkedin(updated.socialLinks?.linkedin ?? linkedin.trim());
      setSelectedHeadshot(null);
      if (updated.headshotAssetId && can("asset-read") && profileApi.getDownloadGrant) {
        const grant = await profileApi.getDownloadGrant(context.eventId, updated.headshotAssetId);
        setHeadshotUrl(grant.url);
      } else {
        setHeadshotUrl(null);
      }
      setSaved(true);
    } catch (profileError) {
      setSaveError(
        profileError instanceof PortalApiError || profileError instanceof Error
          ? profileError.message
          : "The profile could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Public event details"
        title="Speaker profile"
        description="Keep your biography, role, social links, and headshot up to date for the event team."
      />
      <InlineMutationError />
      <div className={styles.profileLayout}>
        <aside className={styles.panel} aria-labelledby="profile-preview-heading">
          <div className={styles.profileIdentity}>
            {headshotUrl ? (
              <Image
                className={styles.profileAvatar}
                src={headshotUrl}
                alt={`${loadedProfile.displayName} headshot`}
                width={68}
                height={68}
                unoptimized
              />
            ) : (
              <span className={styles.profileAvatar} aria-hidden="true">
                {initials}
              </span>
            )}
            <div>
              <h2 id="profile-preview-heading">{loadedProfile.displayName}</h2>
              <p>
                {[jobTitle.trim(), company.trim()].filter(Boolean).join(" · ") || "Event speaker"}
              </p>
            </div>
          </div>
          <dl className={styles.profileFacts}>
            <div>
              <dt>Headshot</dt>
              <dd>{profileDetails.headshotAssetId ? "Uploaded" : "Not uploaded"}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatPortalDate(loadedProfile.updatedAt) ?? "Recently"}</dd>
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
              <p className={styles.eyebrow}>Profile details</p>
              <h2 id="profile-form-heading">Edit your profile</h2>
            </div>
          </div>
          <form
            className={styles.profileForm}
            onSubmit={(event) => void submitProfile(event)}
            noValidate
          >
            <div className={styles.readOnlyField}>
              <span>Display name</span>
              <strong>{loadedProfile.displayName}</strong>
              <small>Contact the event team to change your name.</small>
            </div>
            <label className={styles.readOnlyField}>
              <span>Job title</span>
              <input
                value={jobTitle}
                maxLength={maxProfileTextLength}
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => updateDraft("jobTitle", event.currentTarget.value)}
              />
            </label>
            <label className={styles.readOnlyField}>
              <span>Company</span>
              <input
                value={company}
                maxLength={maxProfileTextLength}
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => updateDraft("company", event.currentTarget.value)}
              />
            </label>
            <label className={styles.textareaField}>
              <span>Biography</span>
              <textarea
                value={biography}
                rows={10}
                maxLength={5_000}
                aria-describedby="biography-help biography-count"
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => updateDraft("biography", event.currentTarget.value)}
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
            <label className={styles.readOnlyField}>
              <span>Twitter / X URL</span>
              <input
                type="url"
                value={twitter}
                placeholder="https://x.com/…"
                maxLength={2_000}
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => updateDraft("twitter", event.currentTarget.value)}
              />
            </label>
            <label className={styles.readOnlyField}>
              <span>LinkedIn URL</span>
              <input
                type="url"
                value={linkedin}
                placeholder="https://linkedin.com/in/…"
                maxLength={2_000}
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => updateDraft("linkedin", event.currentTarget.value)}
              />
            </label>
            <label className={styles.fileField}>
              <span>Headshot</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  setSelectedHeadshot(event.currentTarget.files?.[0] ?? null);
                  setSaved(false);
                  setSaveError(null);
                }}
              />
              <small>
                {selectedHeadshot?.name ??
                  (profileDetails.headshotAssetId
                    ? "Choose a new image to upload a new version."
                    : "JPEG, PNG, or WebP up to 5 MiB.")}
              </small>
            </label>
            {validationError ? (
              <p className={styles.fieldError} role="alert">
                {validationError}
              </p>
            ) : null}
            {saveError ? (
              <p className={styles.fieldError} role="alert">
                {saveError}
              </p>
            ) : null}
            {saved ? (
              <p className={styles.saveConfirmation} role="status">
                Profile saved.
              </p>
            ) : null}
            <div className={styles.formActions}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={saving || !canEditProfile || !hasChanges}
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
              <button
                className={styles.tertiaryButton}
                type="button"
                disabled={saving || !hasChanges}
                onClick={resetDraft}
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
