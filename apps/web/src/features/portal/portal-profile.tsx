"use client";

import { type SyntheticEvent, useEffect, useReducer, useRef } from "react";
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
import type { PortalDownloadGrant, PortalProfile } from "./types";

type ProfileControl = HTMLInputElement | HTMLTextAreaElement;
type PortalProfileState = {
  draft: ProfileDraft | null;
  selectedHeadshot: File | null;
  errors: ProfileErrors;
  saveError: string | null;
  saved: boolean;
  headshotGrant: PortalDownloadGrant | null;
  headshotLoading: boolean;
  headshotError: string | null;
};

type PortalProfileAction =
  | { type: "profile-loaded"; draft: ProfileDraft }
  | { type: "draft-updated"; field: keyof ProfileDraft; value: string | boolean }
  | { type: "headshot-selected"; file: File | null }
  | { type: "draft-reset"; draft: ProfileDraft }
  | { type: "submit-started" }
  | { type: "save-error"; message: string }
  | { type: "validation-failed"; errors: ProfileErrors }
  | { type: "saved" }
  | { type: "context-changed" }
  | { type: "headshot-reset" }
  | { type: "headshot-loading" }
  | { type: "headshot-resolved"; grant: PortalDownloadGrant | null }
  | { type: "headshot-failed"; message: string };

function initialPortalProfileState(profile: PortalProfile | undefined): PortalProfileState {
  return {
    draft: profile ? profileDraftFor(profile) : null,
    selectedHeadshot: null,
    errors: {},
    saveError: null,
    saved: false,
    headshotGrant: null,
    headshotLoading: false,
    headshotError: null,
  };
}

function portalProfileReducer(
  state: PortalProfileState,
  action: PortalProfileAction,
): PortalProfileState {
  switch (action.type) {
    case "profile-loaded":
      return {
        ...state,
        draft: action.draft,
        selectedHeadshot: null,
        errors: {},
        saveError: null,
      };
    case "draft-updated": {
      if (!state.draft) return state;
      const errors = { ...state.errors };
      delete errors[action.field];
      return {
        ...state,
        draft: { ...state.draft, [action.field]: action.value },
        errors,
        saveError: null,
        saved: false,
      };
    }
    case "headshot-selected": {
      const errors = { ...state.errors };
      delete errors.headshot;
      return {
        ...state,
        selectedHeadshot: action.file,
        errors,
        saveError: null,
        saved: false,
      };
    }
    case "draft-reset":
      return {
        ...state,
        draft: action.draft,
        selectedHeadshot: null,
        errors: {},
        saveError: null,
        saved: false,
      };
    case "submit-started":
      return { ...state, saveError: null, saved: false };
    case "save-error":
      return { ...state, saveError: action.message, saved: false };
    case "validation-failed":
      return { ...state, errors: action.errors };
    case "saved":
      return { ...state, selectedHeadshot: null, saved: true };
    case "context-changed":
      return { ...state, saved: false };
    case "headshot-reset":
      return { ...state, headshotGrant: null, headshotError: null, headshotLoading: false };
    case "headshot-loading":
      return { ...state, headshotLoading: true };
    case "headshot-resolved":
      return {
        ...state,
        headshotGrant: action.grant,
        headshotLoading: false,
        headshotError: action.grant ? null : "A secure preview is not available right now.",
      };
    case "headshot-failed":
      return { ...state, headshotLoading: false, headshotError: action.message };
  }
}

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
  const [profileState, dispatch] = useReducer(
    portalProfileReducer,
    profile,
    initialPortalProfileState,
  );
  const {
    draft,
    selectedHeadshot,
    errors,
    saveError,
    saved,
    headshotGrant,
    headshotLoading,
    headshotError,
  } = profileState;
  const fieldElements = useRef<Partial<Record<ProfileField, ProfileControl>>>({});
  const selectedContextId = context?.id;

  useEffect(() => {
    if (!profile) return;
    dispatch({ type: "profile-loaded", draft: profileDraftFor(profile) });
    const fileInput = fieldElements.current.headshot as HTMLInputElement | undefined;
    if (fileInput) fileInput.value = "";
  }, [profile]);

  useEffect(() => {
    if (selectedContextId !== undefined) dispatch({ type: "context-changed" });
  }, [selectedContextId]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "headshot-reset" });
    if (headshot?.state !== "ready" || !can("asset-read")) return;
    dispatch({ type: "headshot-loading" });
    void downloadAsset(headshot.id).then((grant) => {
      if (cancelled) return;
      dispatch({ type: "headshot-resolved", grant });
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
    dispatch({ type: "draft-updated", field, value });
  }

  function resetDraft() {
    dispatch({ type: "draft-reset", draft: profileDraftFor(loadedProfile) });
    const fileInput = fieldElements.current.headshot as HTMLInputElement | undefined;
    if (fileInput) fileInput.value = "";
  }

  async function submitProfile(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    dispatch({ type: "submit-started" });
    if (!canEditProfile) {
      dispatch({
        type: "save-error",
        message: "You do not have permission to edit this profile in the selected event.",
      });
      return;
    }
    const nextErrors = validateProfileDraft(loadedDraft, selectedHeadshot);
    dispatch({ type: "validation-failed", errors: nextErrors });
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidProfileField(nextErrors, fieldElements.current);
      return;
    }
    if (selectedHeadshot && !can("asset-write")) {
      dispatch({
        type: "save-error",
        message: "You do not have permission to upload a headshot in this event.",
      });
      return;
    }
    const didSave = await saveProfile({
      profile: loadedProfile,
      ...profilePayloadFor(loadedProfile, loadedDraft),
      ...(selectedHeadshot ? { headshot: selectedHeadshot } : {}),
    });
    if (didSave) dispatch({ type: "saved" });
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
              onHeadshotChange={(file) => dispatch({ type: "headshot-selected", file })}
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
