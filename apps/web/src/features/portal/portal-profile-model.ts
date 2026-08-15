import { validatePortalSocialUrl } from "./api";
import { validateBiography } from "./model";
import type { PortalProfile, PortalTravelLogistics } from "./types";

export const profileLimits = {
  jobTitle: 160,
  company: 200,
  biography: 5_000,
  social: 2_000,
  accommodation: 500,
  dietaryRequirements: 2_000,
  accessibilityNeeds: 2_000,
  travelNotes: 5_000,
} as const;

export const maxHeadshotBytes = 5 * 1024 * 1024;
const allowedHeadshotTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ProfileDraft = {
  biography: string;
  jobTitle: string;
  company: string;
  twitter: string;
  linkedin: string;
  travelRequired: boolean;
  arrivalAt: string;
  departureAt: string;
  accommodation: string;
  dietaryRequirements: string;
  accessibilityNeeds: string;
  travelNotes: string;
};

export type ProfileField = keyof ProfileDraft | "headshot";
export type ProfileErrors = Partial<Record<ProfileField, string>>;

const profileFieldOrder: readonly ProfileField[] = [
  "jobTitle",
  "company",
  "biography",
  "twitter",
  "linkedin",
  "headshot",
  "arrivalAt",
  "departureAt",
  "accommodation",
  "dietaryRequirements",
  "accessibilityNeeds",
  "travelNotes",
];

export function profileDraftFor(profile: PortalProfile): ProfileDraft {
  return {
    biography: profile.biography,
    jobTitle: profile.jobTitle ?? "",
    company: profile.company ?? "",
    twitter: profile.socialLinks?.twitter ?? "",
    linkedin: profile.socialLinks?.linkedin ?? "",
    travelRequired: profile.travelLogistics?.travelRequired ?? false,
    arrivalAt: profile.travelLogistics?.arrivalAt ?? "",
    departureAt: profile.travelLogistics?.departureAt ?? "",
    accommodation: profile.travelLogistics?.accommodation ?? "",
    dietaryRequirements: profile.travelLogistics?.dietaryRequirements ?? "",
    accessibilityNeeds: profile.travelLogistics?.accessibilityNeeds ?? "",
    travelNotes: profile.travelLogistics?.travelNotes ?? "",
  };
}

function socialLinksFor(profile: PortalProfile, draft: ProfileDraft): Record<string, string> {
  const socialLinks = { ...profile.socialLinks };
  for (const [network, value] of [
    ["twitter", draft.twitter],
    ["linkedin", draft.linkedin],
  ] as const) {
    const normalized = value.trim();
    if (normalized) socialLinks[network] = normalized;
    else delete socialLinks[network];
  }
  return socialLinks;
}

function travelLogisticsFor(draft: ProfileDraft): PortalTravelLogistics {
  return {
    travelRequired: draft.travelRequired,
    arrivalAt: draft.arrivalAt.trim() || null,
    departureAt: draft.departureAt.trim() || null,
    accommodation: draft.accommodation.trim(),
    dietaryRequirements: draft.dietaryRequirements.trim(),
    accessibilityNeeds: draft.accessibilityNeeds.trim(),
    travelNotes: draft.travelNotes.trim(),
  };
}

export function profilePayloadFor(profile: PortalProfile, draft: ProfileDraft) {
  const biography = validateBiography(draft.biography);
  return {
    biography: biography.success ? biography.biography : draft.biography.trim(),
    jobTitle: draft.jobTitle.trim(),
    company: draft.company.trim(),
    socialLinks: socialLinksFor(profile, draft),
    travelLogistics: travelLogisticsFor(draft),
  };
}

function textError(value: string, label: string, limit: number): string | null {
  const normalized = value.trim();
  if (normalized.length > limit)
    return `${label} must be ${limit.toLocaleString()} characters or fewer.`;
  if (
    [...normalized].some(
      (character) => (character.codePointAt(0) ?? 0) < 0x20 && character !== "\t",
    )
  ) {
    return `${label} contains an unsupported control character.`;
  }
  return null;
}

export function validateProfileDraft(draft: ProfileDraft, headshot: File | null): ProfileErrors {
  const errors: ProfileErrors = {};
  const biography = validateBiography(draft.biography);
  if (!biography.success) errors.biography = biography.message;
  for (const [field, label, limit] of [
    ["jobTitle", "Job title", profileLimits.jobTitle],
    ["company", "Company", profileLimits.company],
    ["accommodation", "Accommodation", profileLimits.accommodation],
    ["dietaryRequirements", "Dietary requirements", profileLimits.dietaryRequirements],
    ["accessibilityNeeds", "Accessibility needs", profileLimits.accessibilityNeeds],
    ["travelNotes", "Travel notes", profileLimits.travelNotes],
  ] as const) {
    const error = textError(draft[field], label, limit);
    if (error) errors[field] = error;
  }
  const twitterError = validatePortalSocialUrl(draft.twitter, "twitter");
  if (twitterError) errors.twitter = twitterError;
  const linkedinError = validatePortalSocialUrl(draft.linkedin, "linkedin");
  if (linkedinError) errors.linkedin = linkedinError;
  const arrivalTime = draft.arrivalAt ? Date.parse(draft.arrivalAt) : null;
  const departureTime = draft.departureAt ? Date.parse(draft.departureAt) : null;
  if (draft.arrivalAt && Number.isNaN(arrivalTime)) {
    errors.arrivalAt = "Enter a valid arrival date and time.";
  }
  if (draft.departureAt && Number.isNaN(departureTime)) {
    errors.departureAt = "Enter a valid departure date and time.";
  } else if (
    arrivalTime !== null &&
    departureTime !== null &&
    !Number.isNaN(arrivalTime) &&
    departureTime < arrivalTime
  ) {
    errors.departureAt = "Departure must be after arrival.";
  }
  if (headshot?.size === 0) errors.headshot = "Headshot cannot be empty.";
  else if (headshot && headshot.size > maxHeadshotBytes) {
    errors.headshot = "Headshot must be 5 MiB or smaller.";
  } else if (headshot && !allowedHeadshotTypes.has(headshot.type)) {
    errors.headshot = "Headshot must be a JPEG, PNG, or WebP image.";
  }
  return errors;
}

export function profileDraftIsDirty(current: ProfileDraft, initial: ProfileDraft): boolean {
  return profileFieldOrder.some(
    (field) => field !== "headshot" && current[field] !== initial[field],
  );
}

export function focusFirstInvalidProfileField(
  errors: ProfileErrors,
  refs: Partial<Record<ProfileField, { focus(): void } | null>>,
): void {
  const first = profileFieldOrder.find((field) => errors[field]);
  if (first) refs[first]?.focus();
}
