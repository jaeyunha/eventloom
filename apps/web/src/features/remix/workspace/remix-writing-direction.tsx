import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { RemixField } from "../api";
import styles from "../remix-workspace.module.css";
import { fieldLabels } from "./remix-workspace-model";

interface RemixWritingDirectionProps {
  readonly availableFields: readonly RemixField[];
  readonly fields: readonly RemixField[];
  readonly onToggleField: (field: RemixField) => void;
  readonly tone: string;
  readonly onToneChange: (value: string) => void;
  readonly guidance: string;
  readonly onGuidanceChange: (value: string) => void;
}

export function RemixWritingDirection({
  availableFields,
  fields,
  onToggleField,
  tone,
  onToneChange,
  guidance,
  onGuidanceChange,
}: RemixWritingDirectionProps) {
  const fieldSet = new Set(fields);
  return (
    <section className={styles.composerSection} aria-labelledby="remix-direction-heading">
      <header className={styles.sectionHeading}>
        <span className={styles.stepLabel}>2 · Direction</span>
        <h3 id="remix-direction-heading">How should it improve?</h3>
        <p>Choose the editable fields, then describe the voice and outcome you want.</p>
      </header>
      <FieldSet>
        <FieldLegend variant="label">Fields to rewrite</FieldLegend>
        <FieldDescription>Unselected fields remain unchanged.</FieldDescription>
        <div className={styles.checkboxGroup}>
          {availableFields.map((field) => (
            <FieldLabel className={styles.fieldOption} htmlFor={`remix-field-${field}`} key={field}>
              <Checkbox
                id={`remix-field-${field}`}
                checked={fieldSet.has(field)}
                onCheckedChange={(checked) => {
                  if (checked === true || checked === false) onToggleField(field);
                }}
              />
              {fieldLabels[field]}
            </FieldLabel>
          ))}
        </div>
      </FieldSet>
      <div className={styles.instructionGrid}>
        <Field>
          <FieldLabel htmlFor="remix-tone">Tone</FieldLabel>
          <Textarea
            id="remix-tone"
            className={styles.instructionTextarea}
            required
            maxLength={120}
            rows={4}
            value={tone}
            onChange={(event) => onToneChange(event.currentTarget.value)}
            placeholder="Clear, practical, and welcoming"
          />
          <FieldDescription>Short voice description, up to 120 characters.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="remix-guidance">Guidance</FieldLabel>
          <Textarea
            id="remix-guidance"
            className={styles.instructionTextarea}
            maxLength={2000}
            rows={4}
            value={guidance}
            onChange={(event) => onGuidanceChange(event.currentTarget.value)}
            placeholder="Keep the speaker's meaning and make the audience outcome concrete."
          />
          <FieldDescription>
            Optional context, constraints, or details to preserve.
          </FieldDescription>
        </Field>
      </div>
    </section>
  );
}
