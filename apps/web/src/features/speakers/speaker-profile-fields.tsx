import { Checkbox } from "../../components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import styles from "./speaker-workspace.module.css";
import type { CreateDraft, EditDraft } from "./speaker-workspace-types";

export function ProfileFields({
  draft,
  onChange,
  disabled,
}: Readonly<{
  draft: CreateDraft | EditDraft;
  onChange: (field: keyof CreateDraft, value: string | boolean) => void;
  disabled: boolean;
}>) {
  return (
    <FieldGroup className={styles.actionsStack}>
      <div className={styles.fieldGrid}>
        <Field>
          <FieldLabel htmlFor="speaker-display-name">Name</FieldLabel>
          <Input
            id="speaker-display-name"
            value={draft.displayName}
            onChange={(event) => onChange("displayName", event.target.value)}
            required
            maxLength={200}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-email">Email</FieldLabel>
          <Input
            id="speaker-email"
            type="email"
            value={draft.email}
            onChange={(event) => onChange("email", event.target.value)}
            required
            maxLength={320}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-title">Title</FieldLabel>
          <Input
            id="speaker-title"
            value={draft.title}
            onChange={(event) => onChange("title", event.target.value)}
            placeholder="Principal Engineer"
            maxLength={160}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-company">Company</FieldLabel>
          <Input
            id="speaker-company"
            value={draft.company}
            onChange={(event) => onChange("company", event.target.value)}
            placeholder="Organization"
            maxLength={200}
            disabled={disabled}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="speaker-biography">Biography</FieldLabel>
        <Textarea
          id="speaker-biography"
          value={draft.biography}
          onChange={(event) => onChange("biography", event.target.value)}
          maxLength={20_000}
          disabled={disabled}
        />
      </Field>
      <div className={styles.fieldGrid}>
        <Field>
          <FieldLabel htmlFor="speaker-twitter">Twitter / X</FieldLabel>
          <Input
            id="speaker-twitter"
            value={draft.twitter}
            onChange={(event) => onChange("twitter", event.target.value)}
            placeholder="https://x.com/…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-linkedin">LinkedIn</FieldLabel>
          <Input
            id="speaker-linkedin"
            value={draft.linkedin}
            onChange={(event) => onChange("linkedin", event.target.value)}
            placeholder="https://linkedin.com/in/…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-website">Website</FieldLabel>
          <Input
            id="speaker-website"
            value={draft.website}
            onChange={(event) => onChange("website", event.target.value)}
            placeholder="https://…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
      </div>
      <FieldSet className={styles.detailBlock}>
        <FieldLegend variant="label">Travel and logistics</FieldLegend>
        <Field orientation="horizontal" className={styles.checkboxField}>
          <Checkbox
            id="speaker-travel-required"
            checked={draft.travelRequired}
            onCheckedChange={(checked) => onChange("travelRequired", checked === true)}
            disabled={disabled}
          />
          <FieldLabel htmlFor="speaker-travel-required">
            Speaker requires travel coordination
          </FieldLabel>
        </Field>
        <div className={styles.fieldGrid}>
          <Field>
            <FieldLabel htmlFor="speaker-arrival">Arrival date</FieldLabel>
            <Input
              id="speaker-arrival"
              type="date"
              value={draft.arrivalAt}
              onChange={(event) => onChange("arrivalAt", event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-departure">Departure date</FieldLabel>
            <Input
              id="speaker-departure"
              type="date"
              value={draft.departureAt}
              onChange={(event) => onChange("departureAt", event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-accommodation">Accommodation</FieldLabel>
            <Input
              id="speaker-accommodation"
              value={draft.accommodation}
              onChange={(event) => onChange("accommodation", event.target.value)}
              maxLength={500}
              disabled={disabled}
            />
          </Field>
        </div>
        <div className={styles.fieldGrid}>
          <Field>
            <FieldLabel htmlFor="speaker-dietary">Dietary requirements</FieldLabel>
            <Input
              id="speaker-dietary"
              value={draft.dietaryRequirements}
              onChange={(event) => onChange("dietaryRequirements", event.target.value)}
              maxLength={2_000}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-accessibility">Accessibility needs</FieldLabel>
            <Input
              id="speaker-accessibility"
              value={draft.accessibilityNeeds}
              onChange={(event) => onChange("accessibilityNeeds", event.target.value)}
              maxLength={2_000}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="speaker-travel-notes">Travel notes</FieldLabel>
          <Textarea
            id="speaker-travel-notes"
            value={draft.travelNotes}
            onChange={(event) => onChange("travelNotes", event.target.value)}
            maxLength={5_000}
            disabled={disabled}
          />
        </Field>
      </FieldSet>
    </FieldGroup>
  );
}
