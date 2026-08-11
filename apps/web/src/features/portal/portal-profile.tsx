"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { validatePortalSocialUrl } from "./api";
import { portalProfileHeadshot, validateBiography } from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import {
  EmptyState,
  formatPortalDate,
  formatPortalFileSize,
  InlineMutationError,
  PageHeading,
  portalAssetStateLabel,
  PortalContentState,
} from "./portal-ui";
import type { PortalDownloadGrant, PortalProfile } from "./types";

const maxJobTitleLength = 160;
const maxCompanyLength = 200;
const maxHeadshotBytes = 5 * 1024 * 1024;
const allowedHeadshotTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type ProfileDraft = {
  biography: string;
  jobTitle: string;
  company: string;
  twitter: string;
  linkedin: string;
};

function profileDraftFor(profile: PortalProfile): ProfileDraft {
  return {
    biography: profile.biography,
    jobTitle: profile.jobTitle ?? "",
    company: profile.company ?? "",
    twitter: profile.socialLinks?.twitter ?? "",
    linkedin: profile.socialLinks?.linkedin ?? "",
  };
}

function profileSocialLinksFor(
  profile: PortalProfile,
  twitter: string,
  linkedin: string,
): Record<string, string> {
  const socialLinks: Record<string, string> = { ...profile.socialLinks };
  const cleanTwitter = twitter.trim();
  const cleanLinkedin = linkedin.trim();
  if (cleanTwitter) socialLinks.twitter = cleanTwitter;
  else delete socialLinks.twitter;
  if (cleanLinkedin) socialLinks.linkedin = cleanLinkedin;
  else delete socialLinks.linkedin;
  return socialLinks;
}

function validProfileText(value: string, label: string, maxLength: number): string | null {
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
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

export function PortalProfilePage() {
  return (
    <PortalContentState>
      <PortalProfileContent />
    </PortalContentState>
  );
}

function PortalProfileContent() {
  const {
    can,
    context,
    downloadAsset,
    eventQuery,
    saveProfile,
    savingProfile,
    view,
  } = usePortal();
  const profile = view?.profiles.find(
    (candidate) => candidate.participantId === context?.primaryParticipantId,
  );
  const headshot = profile ? portalProfileHeadshot(profile, view?.assets ?? []) : undefined;
  const [biography, setBiography] = useState(profile?.biography ?? "");
  const [jobTitle, setJobTitle] = useState(profile?.jobTitle ?? "");
  const [company, setCompany] = useState(profile?.company ?? "");
  const [twitter, setTwitter] = useState(profile?.socialLinks?.twitter ?? "");
  const [linkedin, setLinkedin] = useState(profile?.socialLinks?.linkedin ?? "");
  const [selectedHeadshot, setSelectedHeadshot] = useState<File | null>(null);
  const [headshotGrant, setHeadshotGrant] = useState<{
    assetId: string;
    grant: PortalDownloadGrant;
  } | null>(null);
  const [headshotLoading, setHeadshotLoading] = useState(false);
  const [headshotDownloading, setHeadshotDownloading] = useState(false);
  const [headshotError, setHeadshotError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const selectedContextId = context?.id;

  useEffect(() => {
    if (!profile) return;
    const next = profileDraftFor(profile);
    setBiography(next.biography);
    setJobTitle(next.jobTitle);
    setCompany(next.company);
    setTwitter(next.twitter);
    setLinkedin(next.linkedin);
    setSelectedHeadshot(null);
    setValidationError(null);
    setSaveError(null);
  }, [profile]);

  useEffect(() => {
    if (selectedContextId !== undefined) setSaved(false);
  }, [selectedContextId]);

  useEffect(() => {
    let cancelled = false;
    setHeadshotGrant(null);
    setHeadshotError(null);
    if (!headshot || headshot.state !== "ready" || !can("asset-read")) {
      setHeadshotLoading(false);
      return;
    }

    setHeadshotLoading(true);
    void downloadAsset(headshot.id).then((grant) => {
      if (cancelled) return;
      setHeadshotLoading(false);
      setHeadshotGrant(grant ? { assetId: headshot.id, grant } : null);
      if (!grant) setHeadshotError("A secure preview is not available right now.");
    });
    return () => {
      cancelled = true;
    };
  }, [can, downloadAsset, headshot]);

  if (!view) return null;
  if (!profile) {
    return (
      <EmptyState
        title="No speaker profile available"
        description="Your profile will appear after the event links this account to a participant."
      />
    );
  }

  const loadedProfile = profile;
  const profileContextIsValid =
    context?.eventId === loadedProfile.eventId &&
    context.primaryParticipantId === loadedProfile.participantId;
  const canEditProfile = can("profile-self") && profileContextIsValid;
  const initials = loadedProfile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");
  const headshotTask = view.tasks.find(
    (task) =>
      task.participantId === loadedProfile.participantId &&
      task.type === "upload" &&
      task.acceptedAssetKinds?.includes("headshot"),
  );
  const initialDraft = profileDraftFor(loadedProfile);
  const hasChanges =
    biography !== initialDraft.biography ||
    jobTitle !== initialDraft.jobTitle ||
    company !== initialDraft.company ||
    twitter !== initialDraft.twitter ||
    linkedin !== initialDraft.linkedin ||
    selectedHeadshot !== null;
  const headshotStatus =
    !loadedProfile.headshotAssetId
      ? "Not uploaded"
      : headshot
        ? portalAssetStateLabel(headshot.state)
        : "Metadata unavailable";

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
    if (!canEditProfile) {
      setSaveError("You do not have permission to edit this profile in the selected event.");
      return;
    }
    const biographyValidation = validateBiography(biography);
    if (!biographyValidation.success) {
      setValidationError(biographyValidation.message);
      return;
    }
    const jobTitleError = validProfileText(jobTitle, "Job title", maxJobTitleLength);
    if (jobTitleError) {
      setValidationError(jobTitleError);
      return;
    }
    const companyError = validProfileText(company, "Company", maxCompanyLength);
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
    if (selectedHeadshot?.size === 0) {
      setValidationError("Headshot cannot be empty.");
      return;
    }
    if (selectedHeadshot && selectedHeadshot.size > maxHeadshotBytes) {
      setValidationError("Headshot must be 5 MiB or smaller.");
      return;
    }
    if (selectedHeadshot && !allowedHeadshotTypes.has(selectedHeadshot.type)) {
      setValidationError("Headshot must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (selectedHeadshot && !can("asset-write")) {
      setSaveError("You do not have permission to upload a headshot in this event.");
      return;
    }

    setValidationError(null);
    const didSave = await saveProfile({
      profile: loadedProfile,
      biography: biographyValidation.biography,
      jobTitle: jobTitle.trim(),
      company: company.trim(),
      socialLinks: profileSocialLinksFor(loadedProfile, twitter, linkedin),
      ...(selectedHeadshot ? { headshot: selectedHeadshot } : {}),
    });
    if (didSave) {
      setSelectedHeadshot(null);
      setSaved(true);
    }
  }

  async function handleHeadshotDownload() {
    if (!headshot || headshot.state !== "ready") return;
    setHeadshotDownloading(true);
    try {
      const grant = await downloadAsset(headshot.id);
      if (grant) window.location.assign(grant.url);
    } finally {
      setHeadshotDownloading(false);
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
            {headshotGrant &&
            headshot &&
            headshotGrant.assetId === headshot.id &&
            headshot.state === "ready" ? (
              <Image
                className={styles.profileAvatar}
                src={headshotGrant.grant.url}
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
              <dt>Headshot status</dt>
              <dd>{headshotStatus}</dd>
            </div>
            {headshot ? (
              <>
                <div>
                  <dt>File</dt>
                  <dd>{headshot.fileName}</dd>
                </div>
                <div>
                  <dt>Format and size</dt>
                  <dd>
                    {headshot.contentType} · {formatPortalFileSize(headshot.sizeBytes)}
                  </dd>
                </div>
                {headshot.version === undefined ? null : (
                  <div>
                    <dt>Version</dt>
                    <dd>{headshot.version}</dd>
                  </div>
                )}
                <div>
                  <dt>Asset updated</dt>
                  <dd>{formatPortalDate(headshot.finalizedAt ?? headshot.createdAt) ?? "Recently"}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Profile updated</dt>
              <dd>{formatPortalDate(loadedProfile.updatedAt) ?? "Recently"}</dd>
            </div>
          </dl>
          {headshot?.state === "rejected" && headshot.rejectionReason ? (
            <p className={styles.fieldError} role="status">
              {headshot.rejectionReason}
            </p>
          ) : null}
          {headshotLoading ? <p role="status">Preparing secure headshot access…</p> : null}
          {headshotError ? (
            <p className={styles.fieldError} role="status">
              {headshotError}
            </p>
          ) : null}
          {headshot?.state === "ready" && can("asset-read") ? (
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={headshotDownloading}
              onClick={() => void handleHeadshotDownload()}
            >
              {headshotDownloading ? "Preparing download…" : "Download headshot"}
            </button>
          ) : null}
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
            aria-busy={savingProfile}
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
                disabled={savingProfile || !canEditProfile}
                maxLength={maxJobTitleLength}
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => updateDraft("jobTitle", event.currentTarget.value)}
              />
            </label>
            <label className={styles.readOnlyField}>
              <span>Company</span>
              <input
                value={company}
                disabled={savingProfile || !canEditProfile}
                maxLength={maxCompanyLength}
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => updateDraft("company", event.currentTarget.value)}
              />
            </label>
            <label className={styles.textareaField}>
              <span>Biography</span>
              <textarea
                value={biography}
                disabled={savingProfile || !canEditProfile}
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
              <span>Twitter / X URL or handle</span>
              <input
                value={twitter}
                disabled={savingProfile || !canEditProfile}
                placeholder="https://x.com/priya or @priya"
                maxLength={2_000}
                aria-invalid={validationError ? true : undefined}
                onChange={(event) => updateDraft("twitter", event.currentTarget.value)}
              />
            </label>
            <label className={styles.readOnlyField}>
              <span>LinkedIn URL or handle</span>
              <input
                value={linkedin}
                disabled={savingProfile || !canEditProfile}
                placeholder="https://linkedin.com/in/priya"
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
                disabled={savingProfile || !canEditProfile}
                onChange={(event) => {
                  setSelectedHeadshot(event.currentTarget.files?.[0] ?? null);
                  setSaved(false);
                  setSaveError(null);
                }}
              />
              <small>
                {selectedHeadshot?.name ??
                  (loadedProfile.headshotAssetId
                    ? "Choose a new image to upload a new immutable version."
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
                disabled={savingProfile || !canEditProfile || !hasChanges}
              >
                {savingProfile ? "Saving…" : "Save profile"}
              </button>
              <button
                className={styles.tertiaryButton}
                type="button"
                disabled={savingProfile || !hasChanges}
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
