import type { RefCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "../../components/ui";
import styles from "./portal-profile.module.css";
import {
  type ProfileDraft,
  type ProfileErrors,
  type ProfileField,
  profileLimits,
} from "./portal-profile-model";
import type { PortalProfile } from "./types";

type ProfileControl = HTMLInputElement | HTMLTextAreaElement;
type FieldRefs = Partial<Record<ProfileField, RefCallback<ProfileControl>>>;

interface PublicProfileSectionProps {
  readonly profile: PortalProfile;
  readonly draft: ProfileDraft;
  readonly errors: ProfileErrors;
  readonly disabled: boolean;
  readonly selectedHeadshot: File | null;
  readonly fieldRefs: FieldRefs;
  readonly onChange: (field: keyof ProfileDraft, value: string | boolean) => void;
  readonly onHeadshotChange: (file: File | null) => void;
}

function ErrorMessage({ field, errors }: { field: ProfileField; errors: ProfileErrors }) {
  const error = errors[field];
  return error ? <FieldError id={`profile-${field}-error`}>{error}</FieldError> : null;
}

export function PublicProfileSection({
  profile,
  draft,
  errors,
  disabled,
  selectedHeadshot,
  fieldRefs,
  onChange,
  onHeadshotChange,
}: PublicProfileSectionProps) {
  return (
    <section aria-labelledby="public-profile-heading">
      <Card>
        <CardHeader className={styles.sectionHeader}>
          <div>
            <CardTitle id="public-profile-heading">Public program profile</CardTitle>
            <CardDescription>
              These details may appear in the event program, speaker directory, and promotions.
            </CardDescription>
          </div>
          <span className={styles.visibilityBadge}>Public</span>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className={styles.fieldGrid}>
              <Field>
                <FieldLabel>Display name</FieldLabel>
                <div className={styles.readOnlyValue}>{profile.displayName}</div>
                <FieldDescription>Contact the event team to change your name.</FieldDescription>
              </Field>
              <Field data-invalid={Boolean(errors.jobTitle)}>
                <FieldLabel htmlFor="profile-job-title">Job title</FieldLabel>
                <Input
                  ref={fieldRefs.jobTitle as RefCallback<HTMLInputElement>}
                  id="profile-job-title"
                  value={draft.jobTitle}
                  maxLength={profileLimits.jobTitle}
                  disabled={disabled}
                  aria-invalid={errors.jobTitle ? true : undefined}
                  aria-describedby={errors.jobTitle ? "profile-jobTitle-error" : undefined}
                  onChange={(event) => onChange("jobTitle", event.currentTarget.value)}
                />
                <ErrorMessage field="jobTitle" errors={errors} />
              </Field>
              <Field data-invalid={Boolean(errors.company)}>
                <FieldLabel htmlFor="profile-company">Company</FieldLabel>
                <Input
                  ref={fieldRefs.company as RefCallback<HTMLInputElement>}
                  id="profile-company"
                  value={draft.company}
                  maxLength={profileLimits.company}
                  disabled={disabled}
                  aria-invalid={errors.company ? true : undefined}
                  aria-describedby={errors.company ? "profile-company-error" : undefined}
                  onChange={(event) => onChange("company", event.currentTarget.value)}
                />
                <ErrorMessage field="company" errors={errors} />
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.biography)}>
              <FieldLabel htmlFor="profile-biography">Biography</FieldLabel>
              <Textarea
                ref={fieldRefs.biography as RefCallback<HTMLTextAreaElement>}
                id="profile-biography"
                className={styles.biography}
                value={draft.biography}
                maxLength={profileLimits.biography}
                disabled={disabled}
                aria-invalid={errors.biography ? true : undefined}
                aria-describedby={errors.biography ? "profile-biography-error" : undefined}
                onChange={(event) => onChange("biography", event.currentTarget.value)}
              />
              <div className={styles.fieldMeta}>
                <FieldDescription>Plain text, up to 5,000 characters.</FieldDescription>
                <span aria-live="polite">{draft.biography.length.toLocaleString()}/5,000</span>
              </div>
              <ErrorMessage field="biography" errors={errors} />
            </Field>
            <div className={styles.fieldGrid}>
              <Field data-invalid={Boolean(errors.twitter)}>
                <FieldLabel htmlFor="profile-twitter">Twitter / X URL or handle</FieldLabel>
                <Input
                  ref={fieldRefs.twitter as RefCallback<HTMLInputElement>}
                  id="profile-twitter"
                  value={draft.twitter}
                  maxLength={profileLimits.social}
                  placeholder="https://x.com/priya or @priya"
                  disabled={disabled}
                  aria-invalid={errors.twitter ? true : undefined}
                  aria-describedby={errors.twitter ? "profile-twitter-error" : undefined}
                  onChange={(event) => onChange("twitter", event.currentTarget.value)}
                />
                <ErrorMessage field="twitter" errors={errors} />
              </Field>
              <Field data-invalid={Boolean(errors.linkedin)}>
                <FieldLabel htmlFor="profile-linkedin">LinkedIn URL or handle</FieldLabel>
                <Input
                  ref={fieldRefs.linkedin as RefCallback<HTMLInputElement>}
                  id="profile-linkedin"
                  value={draft.linkedin}
                  maxLength={profileLimits.social}
                  placeholder="https://linkedin.com/in/priya"
                  disabled={disabled}
                  aria-invalid={errors.linkedin ? true : undefined}
                  aria-describedby={errors.linkedin ? "profile-linkedin-error" : undefined}
                  onChange={(event) => onChange("linkedin", event.currentTarget.value)}
                />
                <ErrorMessage field="linkedin" errors={errors} />
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.headshot)}>
              <FieldLabel htmlFor="profile-headshot">Headshot</FieldLabel>
              <Input
                ref={fieldRefs.headshot as RefCallback<HTMLInputElement>}
                id="profile-headshot"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={disabled}
                aria-invalid={errors.headshot ? true : undefined}
                aria-describedby={errors.headshot ? "profile-headshot-error" : undefined}
                onChange={(event) => onHeadshotChange(event.currentTarget.files?.[0] ?? null)}
              />
              <FieldDescription>
                {selectedHeadshot?.name ??
                  (profile.headshotAssetId
                    ? "Choose a replacement to create a new immutable version."
                    : "JPEG, PNG, or WebP up to 5 MiB.")}
              </FieldDescription>
              <ErrorMessage field="headshot" errors={errors} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </section>
  );
}
