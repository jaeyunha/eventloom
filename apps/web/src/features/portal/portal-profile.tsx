"use client";

import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { portalProfileHeadshot } from "./model";
import styles from "./portal-profile.module.css";
import { ProfileActions } from "./portal-profile-actions";
import { ProfileHeadshotCard } from "./portal-profile-headshot";
import {
  focusFirstInvalidProfileField,
  type ProfileDraft,
  type ProfileErrors,
  type ProfileField,
  profileDraftFor,
  profileDraftIsDirty,
  profilePayloadFor,
  validateProfileDraft,
} from "./portal-profile-model";
import { PrivateLogisticsSection, PublicProfileSection } from "./portal-profile-sections";
import { usePortal } from "./portal-provider";
import { EmptyState, InlineMutationError, PageHeading, PortalContentState } from "./portal-ui";
import type { PortalDownloadGrant } from "./types";

type ProfileControl = HTMLInputElement | HTMLTextAreaElement;

export function PortalProfilePage() {
  return (
    <PortalContentState>
      <PortalProfileContent />
    </PortalContentState>
  );
}

function PortalProfileContent() {
  const { can, context, downloadAsset, eventQuery, saveProfile, savingProfile, view } = usePortal();
  const profile = view?.profiles.find(
    (candidate) => candidate.participantId === context?.primaryParticipantId,
  );
  const headshot = profile ? portalProfileHeadshot(profile, view?.assets ?? []) : undefined;
  const [draft, setDraft] = useState<ProfileDraft | null>(
    profile ? profileDraftFor(profile) : null,
  );
  const [selectedHeadshot, setSelectedHeadshot] = useState<File | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [headshotGrant, setHeadshotGrant] = useState<PortalDownloadGrant | null>(null);
  const [headshotLoading, setHeadshotLoading] = useState(false);
  const [headshotError, setHeadshotError] = useState<string | null>(null);
  const fieldElements = useRef<Partial<Record<ProfileField, ProfileControl>>>({});
  const selectedContextId = context?.id;

  useEffect(() => {
    if (!profile) return;
    setDraft(profileDraftFor(profile));
    setSelectedHeadshot(null);
    setErrors({});
    setSaveError(null);
    const fileInput = fieldElements.current.headshot as HTMLInputElement | undefined;
    if (fileInput) fileInput.value = "";
  }, [profile]);

  useEffect(() => {
    if (selectedContextId !== undefined) setSaved(false);
  }, [selectedContextId]);

  useEffect(() => {
    let cancelled = false;
    setHeadshotGrant(null);
    setHeadshotError(null);
    if (headshot?.state !== "ready" || !can("asset-read")) {
      setHeadshotLoading(false);
      return;
    }
    setHeadshotLoading(true);
    void downloadAsset(headshot.id).then((grant) => {
      if (cancelled) return;
      setHeadshotLoading(false);
      setHeadshotGrant(grant);
      if (!grant) setHeadshotError("A secure preview is not available right now.");
    });
    return () => {
      cancelled = true;
    };
  }, [can, downloadAsset, headshot]);

  if (!view) return null;
  if (!profile || !draft) {
    return (
      <EmptyState
        title="No speaker profile available"
        description="Your profile will appear after the event links this account to a participant."
      />
    );
  }

  const loadedProfile = profile;
  const loadedDraft = draft;
  const profileContextIsValid =
    context?.eventId === loadedProfile.eventId &&
    context.primaryParticipantId === loadedProfile.participantId;
  const canEditProfile = can("profile-self") && profileContextIsValid;
  const initialDraft = profileDraftFor(loadedProfile);
  const hasChanges = profileDraftIsDirty(loadedDraft, initialDraft) || selectedHeadshot !== null;
  const headshotTask = view.tasks.find(
    (task) =>
      task.participantId === loadedProfile.participantId &&
      task.type === "upload" &&
      task.acceptedAssetKinds?.includes("headshot"),
  );
  const fieldRefs = Object.fromEntries(
    Object.keys(initialDraft)
      .concat("headshot")
      .map((field) => [
        field,
        (node: ProfileControl | null) => {
          if (node) fieldElements.current[field as ProfileField] = node;
          else delete fieldElements.current[field as ProfileField];
        },
      ]),
  );

  function updateDraft(field: keyof ProfileDraft, value: string | boolean) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSaved(false);
    setSaveError(null);
  }

  function resetDraft() {
    setDraft(profileDraftFor(loadedProfile));
    setSelectedHeadshot(null);
    setErrors({});
    setSaveError(null);
    setSaved(false);
    const fileInput = fieldElements.current.headshot as HTMLInputElement | undefined;
    if (fileInput) fileInput.value = "";
  }

  async function submitProfile(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSaved(false);
    setSaveError(null);
    if (!canEditProfile) {
      setSaveError("You do not have permission to edit this profile in the selected event.");
      return;
    }
    const nextErrors = validateProfileDraft(loadedDraft, selectedHeadshot);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidProfileField(nextErrors, fieldElements.current);
      return;
    }
    if (selectedHeadshot && !can("asset-write")) {
      setSaveError("You do not have permission to upload a headshot in this event.");
      return;
    }
    const didSave = await saveProfile({
      profile: loadedProfile,
      ...profilePayloadFor(loadedProfile, loadedDraft),
      ...(selectedHeadshot ? { headshot: selectedHeadshot } : {}),
    });
    if (didSave) {
      setSelectedHeadshot(null);
      setSaved(true);
    }
  }

  const disabled = savingProfile || !canEditProfile;
  const previewProfile = {
    ...loadedProfile,
    jobTitle: loadedDraft.jobTitle,
    company: loadedDraft.company,
  };
  return (
    <>
      <PageHeading
        eyebrow="Speaker profile"
        title="Your event profile"
        description="Manage what attendees see and share private logistics securely with the event team."
      />
      <InlineMutationError />
      <div className={styles.layout}>
        <ProfileHeadshotCard
          profile={previewProfile}
          headshot={headshot}
          grant={headshotGrant}
          loading={headshotLoading}
          error={headshotError}
          canRead={can("asset-read")}
          taskHref={headshotTask ? `/portal/tasks${eventQuery}` : null}
          downloadAsset={downloadAsset}
        />
        <form
          className={styles.editor}
          aria-busy={savingProfile}
          noValidate
          onSubmit={(event) => void submitProfile(event)}
        >
          <div className={styles.sections}>
            <PublicProfileSection
              profile={loadedProfile}
              draft={loadedDraft}
              errors={errors}
              disabled={disabled}
              selectedHeadshot={selectedHeadshot}
              fieldRefs={fieldRefs}
              onChange={updateDraft}
              onHeadshotChange={(file) => {
                setSelectedHeadshot(file);
                setErrors((current) => {
                  const next = { ...current };
                  delete next.headshot;
                  return next;
                });
                setSaved(false);
                setSaveError(null);
              }}
            />
            <PrivateLogisticsSection
              draft={loadedDraft}
              errors={errors}
              disabled={disabled}
              fieldRefs={fieldRefs}
              onChange={updateDraft}
            />
          </div>
          <ProfileActions
            saving={savingProfile}
            saved={saved}
            dirty={hasChanges}
            canEdit={canEditProfile}
            error={saveError}
            onDiscard={resetDraft}
          />
        </form>
      </div>
    </>
  );
}
