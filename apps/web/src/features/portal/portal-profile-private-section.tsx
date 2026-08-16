import type { RefCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  TemporalPicker,
  Textarea,
} from "../../components/ui";
import {
  type SpeakerEventTemporalContext,
  travelDateWarnings,
} from "../speakers/speaker-temporal-policy";
import styles from "./portal-profile.module.css";
import {
  type ProfileDraft,
  type ProfileErrors,
  type ProfileField,
  profileLimits,
} from "./portal-profile-model";

type ProfileControl = HTMLInputElement | HTMLTextAreaElement;
type FieldRefs = Partial<Record<ProfileField, RefCallback<ProfileControl>>>;

interface PrivateLogisticsSectionProps {
  readonly draft: ProfileDraft;
  readonly errors: ProfileErrors;
  readonly disabled: boolean;
  readonly fieldRefs: FieldRefs;
  readonly temporalContext?: SpeakerEventTemporalContext;
  readonly onChange: (field: keyof ProfileDraft, value: string | boolean) => void;
}

function ErrorMessage({ field, errors }: { field: ProfileField; errors: ProfileErrors }) {
  const error = errors[field];
  return error ? <FieldError id={`profile-${field}-error`}>{error}</FieldError> : null;
}

export function PrivateLogisticsSection({
  draft,
  errors,
  disabled,
  fieldRefs,
  temporalContext,
  onChange,
}: PrivateLogisticsSectionProps) {
  const travelWarnings =
    temporalContext === undefined
      ? []
      : travelDateWarnings(draft.arrivalAt, draft.departureAt, temporalContext);
  return (
    <section aria-labelledby="private-logistics-heading">
      <Card>
        <CardHeader className={styles.sectionHeader}>
          <div>
            <CardTitle id="private-logistics-heading">Private event logistics</CardTitle>
            <CardDescription>
              Shared only with authorized event staff for travel, hospitality, and access planning.
              This information is not published.
            </CardDescription>
          </div>
          <span className={styles.visibilityBadge}>Private</span>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal" className={styles.checkboxField}>
              <Checkbox
                id="profile-travel-required"
                checked={draft.travelRequired}
                disabled={disabled}
                onCheckedChange={(checked) => onChange("travelRequired", checked === true)}
              />
              <div>
                <FieldLabel htmlFor="profile-travel-required">Travel required</FieldLabel>
                <FieldDescription>I need the event team to coordinate travel.</FieldDescription>
              </div>
            </Field>
            <div className={styles.fieldGrid}>
              <Field
                style={{ gridColumn: "1 / -1" }}
                data-invalid={Boolean(errors.arrivalAt || errors.departureAt)}
              >
                <TemporalPicker
                  id="profile-travel-window"
                  mode="range"
                  precision="date"
                  startValue={draft.arrivalAt}
                  endValue={draft.departureAt}
                  startLabel="Arrival date"
                  endLabel="Departure date"
                  eyebrow="Travel window"
                  description="Choose date-only travel details. Dates outside the event are allowed and flagged for review."
                  clearable
                  disabled={disabled}
                  onChange={({ start, end }) => {
                    onChange("arrivalAt", start);
                    onChange("departureAt", end);
                  }}
                />
                <ErrorMessage field="arrivalAt" errors={errors} />
                <ErrorMessage field="departureAt" errors={errors} />
                {travelWarnings.map((warning) => (
                  <FieldDescription key={warning} role="status">
                    {warning}
                  </FieldDescription>
                ))}
              </Field>
              <Field data-invalid={Boolean(errors.accommodation)}>
                <FieldLabel htmlFor="profile-accommodation">Accommodation</FieldLabel>
                <Input
                  ref={fieldRefs.accommodation as RefCallback<HTMLInputElement>}
                  id="profile-accommodation"
                  value={draft.accommodation}
                  maxLength={profileLimits.accommodation}
                  disabled={disabled}
                  aria-invalid={errors.accommodation ? true : undefined}
                  aria-describedby={
                    errors.accommodation ? "profile-accommodation-error" : undefined
                  }
                  onChange={(event) => onChange("accommodation", event.currentTarget.value)}
                />
                <ErrorMessage field="accommodation" errors={errors} />
              </Field>
            </div>
            <div className={styles.fieldGrid}>
              <Field data-invalid={Boolean(errors.dietaryRequirements)}>
                <FieldLabel htmlFor="profile-dietary">Dietary requirements</FieldLabel>
                <Textarea
                  ref={fieldRefs.dietaryRequirements as RefCallback<HTMLTextAreaElement>}
                  id="profile-dietary"
                  value={draft.dietaryRequirements}
                  maxLength={profileLimits.dietaryRequirements}
                  disabled={disabled}
                  aria-invalid={errors.dietaryRequirements ? true : undefined}
                  aria-describedby={
                    errors.dietaryRequirements ? "profile-dietaryRequirements-error" : undefined
                  }
                  onChange={(event) => onChange("dietaryRequirements", event.currentTarget.value)}
                />
                <ErrorMessage field="dietaryRequirements" errors={errors} />
              </Field>
              <Field data-invalid={Boolean(errors.accessibilityNeeds)}>
                <FieldLabel htmlFor="profile-accessibility">Accessibility needs</FieldLabel>
                <Textarea
                  ref={fieldRefs.accessibilityNeeds as RefCallback<HTMLTextAreaElement>}
                  id="profile-accessibility"
                  value={draft.accessibilityNeeds}
                  maxLength={profileLimits.accessibilityNeeds}
                  disabled={disabled}
                  aria-invalid={errors.accessibilityNeeds ? true : undefined}
                  aria-describedby={
                    errors.accessibilityNeeds ? "profile-accessibilityNeeds-error" : undefined
                  }
                  onChange={(event) => onChange("accessibilityNeeds", event.currentTarget.value)}
                />
                <ErrorMessage field="accessibilityNeeds" errors={errors} />
              </Field>
            </div>
            <Field data-invalid={Boolean(errors.travelNotes)}>
              <FieldLabel htmlFor="profile-travel-notes">Travel notes</FieldLabel>
              <Textarea
                ref={fieldRefs.travelNotes as RefCallback<HTMLTextAreaElement>}
                id="profile-travel-notes"
                value={draft.travelNotes}
                maxLength={profileLimits.travelNotes}
                disabled={disabled}
                aria-invalid={errors.travelNotes ? true : undefined}
                aria-describedby={errors.travelNotes ? "profile-travelNotes-error" : undefined}
                onChange={(event) => onChange("travelNotes", event.currentTarget.value)}
              />
              <ErrorMessage field="travelNotes" errors={errors} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </section>
  );
}
