"use client";

import Link from "next/link";
import type { ChangeEvent, FormEvent, RefObject } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import styles from "./cfp-editor.module.css";
import {
  type CfpCondition,
  type CfpConfiguration,
  type CfpFormField,
  type CfpRule,
  editorFieldType,
  fieldOptionValues,
  fieldReferenceLabel,
  fieldTypeLabel,
  isCfpCloseDatePast,
  ruleKey,
  TIMEZONE_OPTIONS,
} from "./cfp-editor-model";
import { CfpOptionListEditor } from "./cfp-option-list-editor";
import { EventDatePicker, type EventDateSelectionValue } from "./event-date-picker";

type CfpConfigurationUpdater = <K extends keyof CfpConfiguration>(
  key: K,
  value: CfpConfiguration[K],
) => void;

type CfpSaveState = "idle" | "saving" | "saved" | "error";
type CfpTaxonomyKey = "formats" | "levels" | "tags" | "tracks";
type CfpCanonicalTaxonomy = Readonly<Record<CfpTaxonomyKey, readonly string[]>>;
type CfpPreviewSelectionKey = "format" | "track" | "level";

interface CfpPreviewSelections {
  readonly track: string;
  readonly format: string;
  readonly level: string;
}

interface CfpPreviewSubmissionResult {
  readonly confirmationBody: string;
  readonly confirmationTitle: string;
  readonly successMessage: string;
}
export function CfpEventIdentityFields({
  eventName,
  slug,
  timezone,
  organizationId,
}: {
  readonly eventName: string;
  readonly slug: string;
  readonly timezone: string;
  readonly organizationId: string;
}) {
  return (
    <>
      <div className={styles.fieldGroup}>
        <label htmlFor="event-name">Event name</label>
        <input id="event-name" name="eventName" required readOnly value={eventName} />
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="event-slug">Public URL slug</label>
        <input
          id="event-slug"
          name="slug"
          required
          readOnly
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          title="Use lowercase letters, numbers, and hyphens."
          value={slug}
        />
        <p className={styles.fieldHint}>
          {slug
            ? `/cfp/organizations/${organizationId}/events/${slug}`
            : "Public URL unavailable until the authoritative event slug loads."}
        </p>
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="event-timezone">Event timezone</label>
        <select
          id="event-timezone"
          name="timezone"
          required
          value={timezone}
          disabled
          aria-describedby="event-timezone-help"
        >
          {TIMEZONE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p id="event-timezone-help">
          Event identity is authoritative.{" "}
          <Link href="/admin/events">Change it in Event details.</Link>
        </p>
        <p className={styles.fieldHint}>Dates shown to applicants use this timezone.</p>
      </div>
    </>
  );
}

export function CfpPastCloseConfirmation({
  closesAt,
  persistedClosesAt,
  timezone,
  now,
  acknowledged,
  onAcknowledgedChange,
}: {
  readonly closesAt: string;
  readonly persistedClosesAt?: string | undefined;
  readonly timezone: string;
  readonly now: Date;
  readonly acknowledged: boolean;
  readonly onAcknowledgedChange: (acknowledged: boolean) => void;
}) {
  if (!isCfpCloseDatePast(closesAt, now, timezone, persistedClosesAt)) return null;

  return (
    <>
      <p className={styles.fieldHint} role="note">
        Server-authoritative status: Closed. This CFP is closed to new submissions. Public visitors
        see the closed portal and speakers cannot edit until an organizer records an audited reopen.
      </p>
      <label className={styles.toggleRow}>
        <input
          id="confirm-past-close"
          name="confirmPastClose"
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => onAcknowledgedChange(event.target.checked)}
        />
        <span>
          <strong>Confirm past close date</strong>
          <small>I understand this save keeps the CFP closed.</small>
        </span>
      </label>
    </>
  );
}

interface CfpEventDetailsSectionProps {
  readonly active: boolean;
  readonly configuration: CfpConfiguration;
  readonly effectiveClosed: boolean;
  readonly publicRoutePath: string | null;
  readonly minimumCfpDate: string | null;
  readonly maximumCfpDate: string | undefined;
  readonly dateValidationError: string | null;
  readonly historicalCfpDates: readonly string[];
  readonly closeDatePast: boolean;
  readonly pastCloseAcknowledged: boolean;
  readonly saveState: CfpSaveState;
  readonly onConfigurationChange: CfpConfigurationUpdater;
  readonly onDateRangeChange: (selection: EventDateSelectionValue) => void;
  readonly onPastCloseAcknowledgedChange: (checked: boolean) => void;
  readonly onCloseNow: () => void;
}

function renderEventBasics({
  configuration,
  publicRoutePath,
  minimumCfpDate,
  maximumCfpDate,
  historicalCfpDates,
  onDateRangeChange,
}: Pick<
  CfpEventDetailsSectionProps,
  | "configuration"
  | "publicRoutePath"
  | "minimumCfpDate"
  | "maximumCfpDate"
  | "historicalCfpDates"
  | "onDateRangeChange"
>) {
  return (
    <>
      <div className={styles.fieldGroup}>
        <label htmlFor="event-name">Event name</label>
        <input id="event-name" name="eventName" required readOnly value={configuration.eventName} />
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="event-slug">Public URL slug</label>
        <input
          id="event-slug"
          name="slug"
          required
          readOnly
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          title="Use lowercase letters, numbers, and hyphens."
          value={configuration.slug}
        />
        <p className={styles.fieldHint}>
          {configuration.slug
            ? publicRoutePath
            : "Public URL unavailable until the authoritative event slug loads."}
        </p>
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="event-timezone">Event timezone</label>
        <select
          id="event-timezone"
          name="timezone"
          required
          value={configuration.timezone}
          disabled
          aria-describedby="event-timezone-help"
        >
          {TIMEZONE_OPTIONS.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone}
            </option>
          ))}
        </select>
        <p id="event-timezone-help">
          Event identity is authoritative.{" "}
          <Link href="/admin/events">Change it in Event details.</Link>
        </p>
        <p className={styles.fieldHint}>Dates shown to applicants use this timezone.</p>
      </div>
      <div className={styles.dateRangeGroup}>
        <EventDatePicker
          mode="range"
          startsAt={configuration.opensAt}
          endsAt={configuration.closesAt}
          scheduleDates={[]}
          minimumDateTime={minimumCfpDate ? `${minimumCfpDate}T00:00` : undefined}
          maximumDateTime={maximumCfpDate ? `${maximumCfpDate}T23:59` : undefined}
          minimumEndDate={configuration.opensAt}
          unchangedValues={historicalCfpDates}
          dateOnly
          showModeToggle={false}
          showTimeControls={false}
          eyebrow="CFP schedule"
          title="When is the CFP open?"
          description="Choose when applicants can submit proposals."
          startLabel="Open"
          endLabel="Close"
          onChange={onDateRangeChange}
        />
      </div>
    </>
  );
}

function renderEventStatusAndLimits({
  configuration,
  effectiveClosed,
  dateValidationError,
  closeDatePast,
  pastCloseAcknowledged,
  saveState,
  onConfigurationChange,
  onPastCloseAcknowledgedChange,
  onCloseNow,
}: Pick<
  CfpEventDetailsSectionProps,
  | "configuration"
  | "effectiveClosed"
  | "dateValidationError"
  | "closeDatePast"
  | "pastCloseAcknowledged"
  | "saveState"
  | "onConfigurationChange"
  | "onPastCloseAcknowledgedChange"
  | "onCloseNow"
>) {
  return (
    <>
      <div className={`${styles.fieldGroup} ${styles.dateRangeGroup}`}>
        <p className={styles.fieldHint}>
          The close date must be after the open date. Past dates cannot be selected; historical
          closed dates remain visible and require organizer confirmation before saving.
        </p>
        {dateValidationError !== null ? (
          <p className={styles.fieldHint} role="alert">
            {dateValidationError}
          </p>
        ) : null}
        {closeDatePast ? (
          <>
            <p className={styles.fieldHint} role="note">
              Server-authoritative status: Closed. This CFP is closed to new submissions. Public
              visitors see the closed portal and speakers cannot edit until an organizer records an
              audited reopen.
            </p>
            <label className={styles.toggleRow}>
              <input
                id="confirm-past-close"
                name="confirmPastClose"
                type="checkbox"
                checked={pastCloseAcknowledged}
                onChange={(event) => onPastCloseAcknowledgedChange(event.target.checked)}
              />
              <span>
                <strong>Confirm past close date</strong>
                <small>I understand this save keeps the CFP closed.</small>
              </span>
            </label>
          </>
        ) : null}
        {effectiveClosed && !closeDatePast ? (
          <p className={styles.fieldHint} role="note">
            This CFP is marked closed. The public portal is closed and speaker edits remain
            read-only until an organizer records an audited reopen.
          </p>
        ) : null}
        {configuration.status === "published" && !effectiveClosed ? (
          <div>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onCloseNow}
              disabled={saveState === "saving"}
            >
              Close CFP now
            </button>
            <p className={styles.fieldHint}>
              This immediately records a server-authoritative close instant in the event timezone.
              New drafts and proposal edits will be locked; existing submissions remain available.
            </p>
          </div>
        ) : null}
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="participant-limit">
          Speaker limit (maximum participants per submission)
        </label>
        <input
          id="participant-limit"
          name="speakerLimit"
          type="number"
          required
          min={1}
          max={15}
          step={1}
          value={configuration.participantLimit}
          onChange={(event) => {
            const participantLimit = event.currentTarget.valueAsNumber;
            if (Number.isFinite(participantLimit)) {
              onConfigurationChange("participantLimit", participantLimit);
            }
          }}
          aria-describedby="participant-limit-help"
        />
        <p id="participant-limit-help" className={styles.fieldHint}>
          {configuration.participantLimit} participants can collaborate on one submission (maximum
          15).
        </p>
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="proposal-limit">Maximum proposals per account</label>
        <input
          id="proposal-limit"
          name="proposalLimit"
          type="number"
          required
          min={1}
          max={100}
          step={1}
          value={configuration.proposalLimit}
          onChange={(event) => {
            const proposalLimit = event.currentTarget.valueAsNumber;
            if (Number.isFinite(proposalLimit)) {
              onConfigurationChange("proposalLimit", proposalLimit);
            }
          }}
          aria-describedby="proposal-limit-help"
        />
        <p id="proposal-limit-help" className={styles.fieldHint}>
          Each account can create between 1 and 100 distinct proposals for this CFP. Editing an
          existing proposal does not use another slot.
        </p>
      </div>
    </>
  );
}

function renderNotificationToggles({
  configuration,
  onConfigurationChange,
}: Pick<CfpEventDetailsSectionProps, "configuration" | "onConfigurationChange">) {
  return (
    <fieldset className={styles.toggleFieldset}>
      <legend>Notifications</legend>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={configuration.reminderEmails}
          onChange={(event) => onConfigurationChange("reminderEmails", event.target.checked)}
        />
        <span>
          <strong>Send reminder emails</strong>
          <small>Remind invited speakers before the CFP closes.</small>
        </span>
      </label>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={configuration.adminNotifications}
          onChange={(event) => onConfigurationChange("adminNotifications", event.target.checked)}
        />
        <span>
          <strong>Notify admins of new submissions</strong>
          <small>Keep the organizer review queue in sync with incoming proposals.</small>
        </span>
      </label>
    </fieldset>
  );
}

function renderEventDetailsSection({
  active,
  configuration,
  effectiveClosed,
  publicRoutePath,
  minimumCfpDate,
  maximumCfpDate,
  dateValidationError,
  historicalCfpDates,
  closeDatePast,
  pastCloseAcknowledged,
  saveState,
  onConfigurationChange,
  onDateRangeChange,
  onPastCloseAcknowledgedChange,
  onCloseNow,
}: CfpEventDetailsSectionProps) {
  return (
    <section
      id="event-details"
      className={styles.panel}
      aria-labelledby="event-details-heading"
      hidden={!active}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>01 / foundation</p>
          <h2 id="event-details-heading">Event details</h2>
        </div>
        <span className={styles.statusPill}>
          {effectiveClosed
            ? "Closed"
            : configuration.status === "published"
              ? "Published"
              : "Draft"}
        </span>
      </div>
      <p className={styles.sectionDescription}>
        Give applicants the context they need and set the dates and limits that protect your review
        team.
      </p>
      <div className={styles.formGrid}>
        {renderEventBasics({
          configuration,
          minimumCfpDate,
          publicRoutePath,
          maximumCfpDate,
          historicalCfpDates,
          onDateRangeChange,
        })}
        {renderEventStatusAndLimits({
          closeDatePast,
          configuration,
          dateValidationError,
          effectiveClosed,
          pastCloseAcknowledged,
          saveState,
          onCloseNow,
          onConfigurationChange,
          onPastCloseAcknowledgedChange,
        })}
      </div>
      {renderNotificationToggles({
        configuration,
        onConfigurationChange,
      })}
    </section>
  );
}

interface CfpMessagingSectionProps {
  readonly active: boolean;
  readonly configuration: CfpConfiguration;
  readonly onConfigurationChange: CfpConfigurationUpdater;
}

function renderMessagingSection({
  active,
  configuration,
  onConfigurationChange,
}: CfpMessagingSectionProps) {
  return (
    <section
      id="messaging"
      className={styles.panel}
      aria-labelledby="messaging-heading"
      hidden={!active}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>02 / applicant experience</p>
          <h2 id="messaging-heading">Messaging</h2>
        </div>
      </div>
      <p className={styles.sectionDescription}>
        Set the words applicants see at each handoff. Keep instructions specific, welcoming, and
        easy to scan.
      </p>
      <div className={styles.copyStack}>
        <div className={styles.fieldGroup}>
          <label htmlFor="welcome-title">Form label</label>
          <input
            id="welcome-title"
            name="welcomeTitle"
            required
            value={configuration.welcomeTitle}
            onChange={(event) => onConfigurationChange("welcomeTitle", event.target.value)}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="welcome-body">Welcome message</label>
          <textarea
            id="welcome-body"
            name="welcomeBody"
            rows={4}
            value={configuration.welcomeBody}
            onChange={(event) => onConfigurationChange("welcomeBody", event.target.value)}
          />
        </div>
        <div className={styles.copyGrid}>
          <div className={styles.fieldGroup}>
            <label htmlFor="confirmation-title">Confirmation heading</label>
            <input
              id="confirmation-title"
              name="confirmationTitle"
              required
              value={configuration.confirmationTitle}
              onChange={(event) => onConfigurationChange("confirmationTitle", event.target.value)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="success-message">Supporting success message</label>
            <input
              id="success-message"
              name="successMessage"
              required
              value={configuration.successMessage}
              onChange={(event) => onConfigurationChange("successMessage", event.target.value)}
            />
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="confirmation-body">Confirmation message</label>
          <textarea
            id="confirmation-body"
            name="confirmationBody"
            rows={3}
            value={configuration.confirmationBody}
            onChange={(event) => onConfigurationChange("confirmationBody", event.target.value)}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="redirect-url">Next destination URL</label>
          <input
            id="redirect-url"
            name="redirectUrl"
            type="url"
            value={configuration.redirectUrl}
            onChange={(event) => onConfigurationChange("redirectUrl", event.target.value)}
            aria-describedby="redirect-url-help"
          />
          <p id="redirect-url-help" className={styles.fieldHint}>
            Applicants see the success message before they continue to this URL.
          </p>
        </div>
      </div>
    </section>
  );
}

interface CfpTaxonomySectionProps {
  readonly active: boolean;
  readonly configuration: CfpConfiguration;
  readonly canonicalTaxonomy?: CfpCanonicalTaxonomy | null | undefined;
  readonly taxonomyManageHref?: string | undefined;
  readonly onTaxonomyChange: (key: CfpTaxonomyKey, values: string[]) => void;
  readonly onHelpfulLinkChange: (
    index: number,
    patch: Partial<{ label: string; href: string }>,
  ) => void;
}

function renderTaxonomyOptions({
  configuration,
  onTaxonomyChange,
  canonicalTaxonomy,
  taxonomyManageHref,
}: Pick<
  CfpTaxonomySectionProps,
  "configuration" | "onTaxonomyChange" | "canonicalTaxonomy" | "taxonomyManageHref"
>) {
  return (
    <div className={styles.formGrid}>
      <CfpOptionListEditor
        id="tracks"
        label="Tracks"
        description="Route proposals into program areas."
        required
        values={configuration.tracks}
        availableValues={canonicalTaxonomy?.tracks}
        manageHref={taxonomyManageHref}
        onChange={(values) => onTaxonomyChange("tracks", values)}
      />
      <CfpOptionListEditor
        id="formats"
        label="Formats"
        description="Define the session formats applicants can propose."
        required
        values={configuration.formats}
        availableValues={canonicalTaxonomy?.formats}
        manageHref={taxonomyManageHref}
        onChange={(values) => onTaxonomyChange("formats", values)}
      />
      <CfpOptionListEditor
        id="levels"
        label="Levels"
        description="Describe the intended audience experience."
        values={configuration.levels}
        availableValues={canonicalTaxonomy?.levels}
        manageHref={taxonomyManageHref}
        onChange={(values) => onTaxonomyChange("levels", values)}
      />
      <CfpOptionListEditor
        id="tags"
        label="Tags"
        description="Add searchable labels for reviewers."
        values={configuration.tags}
        availableValues={canonicalTaxonomy?.tags}
        manageHref={taxonomyManageHref}
        onChange={(values) => onTaxonomyChange("tags", values)}
      />
    </div>
  );
}

function renderHelpfulLinks({
  configuration,
  onHelpfulLinkChange,
}: Pick<CfpTaxonomySectionProps, "configuration" | "onHelpfulLinkChange">) {
  return (
    <div className={styles.linksBlock}>
      <div className={styles.subheadingRow}>
        <h3>Helpful links</h3>
        <span className={styles.fieldHint}>Shown on the public welcome screen.</span>
      </div>
      {configuration.helpfulLinks.map((link, index) => (
        <div className={styles.linkRow} key={link.label}>
          <div className={styles.fieldGroup}>
            <label htmlFor={`helpful-link-label-${index}`}>Link label {index + 1}</label>
            <input
              id={`helpful-link-label-${index}`}
              required
              value={link.label}
              onChange={(event) => onHelpfulLinkChange(index, { label: event.target.value })}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor={`helpful-link-url-${index}`}>Link URL {index + 1}</label>
            <input
              id={`helpful-link-url-${index}`}
              type="url"
              required
              value={link.href}
              onChange={(event) => onHelpfulLinkChange(index, { href: event.target.value })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function renderTaxonomySection({
  active,
  configuration,
  onTaxonomyChange,
  onHelpfulLinkChange,
  canonicalTaxonomy,
  taxonomyManageHref,
}: CfpTaxonomySectionProps) {
  return (
    <section
      id="taxonomy"
      className={styles.panel}
      aria-labelledby="taxonomy-heading"
      hidden={!active}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>03 / organizer vocabulary</p>
          <h2 id="taxonomy-heading">Taxonomy &amp; helpful links</h2>
        </div>
      </div>
      <p className={styles.sectionDescription}>
        Add the choices applicants use to classify a proposal. Press Enter after each option.
      </p>
      {renderTaxonomyOptions({
        configuration,
        onTaxonomyChange,
        canonicalTaxonomy,
        taxonomyManageHref,
      })}
      {renderHelpfulLinks({ configuration, onHelpfulLinkChange })}
    </section>
  );
}

interface CfpFieldsRulesSectionProps {
  readonly active: boolean;
  readonly configuration: CfpConfiguration;
  readonly ruleFields: readonly CfpFormField[];
  readonly selectedRuleFieldKey: string;
  readonly selectedRuleOptions: readonly string[];
  readonly primaryCondition: CfpCondition;
  readonly ruleSummary: string;
  readonly onFieldChange: (fieldId: string, patch: Partial<CfpFormField>) => void;
  readonly onAddField: () => void;
  readonly onRemoveField: (fieldId: string) => void;
  readonly onParticipantFieldRequiredChange: (fieldId: string, required: boolean) => void;
  readonly onPrimaryConditionChange: (
    patch: Partial<Omit<CfpCondition, "type" | "operator">>,
  ) => void;
  readonly onRuleTargetChange: (target: string) => void;
}

function renderFieldRuleRow({
  field,
  key,
  index,
  onFieldChange,
  onRemoveField,
}: {
  readonly key: string;
  readonly field: CfpFormField;
  readonly index: number;
  readonly onFieldChange: (fieldId: string, patch: Partial<CfpFormField>) => void;
  readonly onRemoveField: (fieldId: string) => void;
}) {
  const keyLocked = field.keyLocked === true || field.key === "title" || field.id === "title";
  const systemOwned = field.system === true || keyLocked;
  return (
    <div key={key} className={styles.fieldRuleRow}>
      <div className={styles.fieldCardHeading}>
        <div>
          <span>
            Question {index + 1}
            {systemOwned ? " · System field" : ""}
          </span>
          <strong>{field.label || "Untitled question"}</strong>
        </div>
        <span>{fieldTypeLabel(field.type)}</span>
      </div>
      <div className={styles.formGrid}>
        <div className={styles.fieldGroup}>
          <label htmlFor={`field-label-${field.id}`}>Field label</label>
          <input
            id={`field-label-${field.id}`}
            value={field.label}
            onChange={(event) => onFieldChange(field.id, { label: event.target.value })}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor={`field-key-${field.id}`}>Field key</label>
          <input
            id={`field-key-${field.id}`}
            pattern="[A-Za-z][A-Za-z0-9_.-]*"
            value={field.key ?? field.id}
            readOnly={keyLocked}
            aria-readonly={keyLocked ? true : undefined}
            title={
              keyLocked
                ? "Required system key: title"
                : "Use lowercase letters, numbers, and hyphens."
            }
            onChange={(event) => {
              if (keyLocked) return;
              onFieldChange(field.id, { key: event.target.value });
            }}
          />
          {keyLocked ? <p className={styles.fieldHint}>Required system key: title</p> : null}
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor={`field-type-${field.id}`}>Field type</label>
          <select
            id={`field-type-${field.id}`}
            value={field.type}
            onChange={(event) => {
              const type = editorFieldType(event.target.value);
              onFieldChange(field.id, {
                type,
                kind: type === "textarea" ? "rich_text" : type,
              });
            }}
          >
            <option value="text">Short text</option>
            <option value="textarea">Long text</option>
            <option value="select">Dropdown</option>
            <option value="multi_select">Multi-select</option>
            <option value="email">Email</option>
            <option value="url">URL</option>
            <option value="boolean">Checkbox</option>
            <option value="number">Number</option>
            <option value="file_request">File request</option>
          </select>
          {field.type === "file_request" ? (
            <p className={styles.fieldHint}>Accepts PDF, JPEG, PNG, or text files up to 25 MB.</p>
          ) : null}
        </div>
        {field.type === "select" || field.type === "multi_select" ? (
          <CfpOptionListEditor
            id={`field-options-${field.id}`}
            label="Answer options"
            description="Applicants choose from these options in the public form."
            required
            values={fieldOptionValues(field)}
            onChange={(values) => onFieldChange(field.id, { options: values })}
          />
        ) : null}
      </div>
      <label>
        <input
          type="checkbox"
          checked={field.required}
          disabled={keyLocked}
          onChange={(event) => {
            if (keyLocked) return;
            onFieldChange(field.id, { required: event.target.checked });
          }}
        />
        {keyLocked ? "Required to submit" : "Required"}
      </label>
      <label>
        <input
          type="checkbox"
          checked={field.visible}
          onChange={(event) => onFieldChange(field.id, { visible: event.target.checked })}
        />
        Visible
      </label>
      {systemOwned ? null : (
        <button className={styles.textButton} type="button" onClick={() => onRemoveField(field.id)}>
          Remove
        </button>
      )}
    </div>
  );
}

function renderSubmissionFields({
  fields,
  onFieldChange,
  onAddField,
  onRemoveField,
}: Pick<CfpFieldsRulesSectionProps, "onFieldChange" | "onAddField" | "onRemoveField"> & {
  readonly fields: readonly CfpFormField[];
}) {
  return (
    <fieldset className={styles.fieldList}>
      <legend>Proposal questions</legend>
      <p className={styles.fieldsetDescription}>
        Configure the questions applicants answer. Technical keys stay stable for integrations and
        conditional logic.
      </p>
      {fields.map((field, index) =>
        renderFieldRuleRow({
          field,
          index,
          key: field.id,
          onFieldChange,
          onRemoveField,
        }),
      )}
      <button className={styles.secondaryButton} type="button" onClick={onAddField}>
        Add custom field
      </button>
    </fieldset>
  );
}

function renderParticipantFields({
  fields,
  onRequiredChange,
}: {
  readonly fields: readonly CfpFormField[];
  readonly onRequiredChange: (fieldId: string, required: boolean) => void;
}) {
  return (
    <fieldset className={`${styles.fieldList} ${styles.identityFields}`}>
      <legend>Applicant identity</legend>
      <p className={styles.fieldsetDescription}>
        Name and email identify each applicant. Profile questions can be required for the submission
        without changing the person’s account identity.
      </p>
      {fields.map((field) => (
        <div className={styles.fieldRuleRow} key={field.id}>
          <div>
            <strong>{field.label}</strong>
            <span className={styles.fieldType}>
              {fieldTypeLabel(field.type)}
              {fieldReferenceLabel(field.fieldRef)
                ? ` · reusable ${fieldReferenceLabel(field.fieldRef)}`
                : ""}
              {field.fieldVersion ? ` · v${field.fieldVersion}` : ""}
            </span>
          </div>
          <label>
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) => onRequiredChange(field.id, event.target.checked)}
            />
            Require for applicants
          </label>
        </div>
      ))}
    </fieldset>
  );
}

function renderConditionControls({
  configuration,
  ruleFields,
  selectedRuleFieldKey,
  selectedRuleOptions,
  primaryCondition,
  onPrimaryConditionChange,
  onRuleTargetChange,
}: Pick<
  CfpFieldsRulesSectionProps,
  | "configuration"
  | "ruleFields"
  | "selectedRuleFieldKey"
  | "selectedRuleOptions"
  | "primaryCondition"
  | "onPrimaryConditionChange"
  | "onRuleTargetChange"
>) {
  return (
    <div className={styles.formGrid}>
      <div className={styles.fieldGroup}>
        <label htmlFor="conditional-field">Show when field</label>
        <select
          id="conditional-field"
          value={selectedRuleFieldKey}
          onChange={(event) =>
            onPrimaryConditionChange({
              field: event.target.value,
              value:
                fieldOptionValues(
                  ruleFields.find((field) => field.key === event.target.value),
                )[0] ?? "",
            })
          }
        >
          {ruleFields.map((field) => (
            <option key={field.key ?? field.id} value={field.key ?? field.id}>
              {field.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="conditional-value">Answer is</label>
        {selectedRuleOptions.length > 0 ? (
          <select
            id="conditional-value"
            value={String(primaryCondition.value ?? "")}
            onChange={(event) => onPrimaryConditionChange({ value: event.target.value })}
          >
            <option value="">Choose an answer</option>
            {selectedRuleOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="conditional-value"
            value={String(primaryCondition.value ?? "")}
            onChange={(event) => onPrimaryConditionChange({ value: event.target.value })}
          />
        )}
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="conditional-target">Then show field</label>
        <select
          id="conditional-target"
          value={configuration.ruleTargetField ?? ""}
          onChange={(event) => onRuleTargetChange(event.target.value)}
        >
          <option value="">Choose a field</option>
          {configuration.fields.map((field) => (
            <option key={field.id} value={field.key ?? field.id}>
              {field.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function renderRuleTree({ rule, key }: { readonly rule: CfpRule; readonly key?: string }) {
  if (rule.type === "condition") {
    return (
      <li key={key} className={styles.ruleCondition}>
        <span className={styles.ruleToken}>{rule.field}</span>
        <span>{rule.operator}</span>
        <strong>{rule.value}</strong>
      </li>
    );
  }
  return (
    <li key={key} className={styles.ruleGroup}>
      <span className={styles.ruleOperator}>{rule.operator}</span>
      <ul>
        {rule.conditions.map((child) => renderRuleTree({ key: ruleKey(child), rule: child }))}
      </ul>
    </li>
  );
}

function renderRulePreview({
  configuration,
  ruleSummary,
}: Pick<CfpFieldsRulesSectionProps, "configuration" | "ruleSummary">) {
  return (
    <section className={styles.rulePreview} aria-labelledby="condition-preview-heading">
      <div className={styles.subheadingRow}>
        <div>
          <p className={styles.sectionKicker}>Conditional visibility</p>
          <h3 id="condition-preview-heading">Show a field based on an answer</h3>
        </div>
        <span className={styles.logicBadge}>Optional</span>
      </div>
      <p className={styles.ruleSummary}>
        Show{" "}
        <strong>
          {configuration.ruleAction.replace(/^show\s+/iu, "") || "the selected field"}
        </strong>{" "}
        when <strong>{ruleSummary}</strong>.
      </p>
      <details className={styles.advancedLogic}>
        <summary>View advanced condition structure</summary>
        <ul className={styles.ruleTree} aria-label="Advanced condition structure">
          {renderRuleTree({ key: "root", rule: configuration.rule })}
        </ul>
        <p className={styles.fieldHint}>
          Existing nested AND/OR groups are preserved when the CFP is saved.
        </p>
      </details>
    </section>
  );
}

function renderFieldsRulesSection({
  active,
  configuration,
  ruleFields,
  selectedRuleFieldKey,
  selectedRuleOptions,
  primaryCondition,
  ruleSummary,
  onFieldChange,
  onAddField,
  onRemoveField,
  onParticipantFieldRequiredChange,
  onPrimaryConditionChange,
  onRuleTargetChange,
}: CfpFieldsRulesSectionProps) {
  return (
    <section
      id="fields-rules"
      className={styles.panel}
      aria-labelledby="fields-rules-heading"
      hidden={!active}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>04 / form logic</p>
          <h2 id="fields-rules-heading">Fields &amp; rules</h2>
        </div>
      </div>
      <p className={styles.sectionDescription}>
        Built-in speaker identity fields stay required by default. Make optional fields visible only
        when they help an applicant complete a thoughtful proposal.
      </p>
      {renderSubmissionFields({
        fields: configuration.fields,
        onAddField,
        onFieldChange,
        onRemoveField,
      })}
      {configuration.participantFields && configuration.participantFields.length > 0
        ? renderParticipantFields({
            fields: configuration.participantFields,
            onRequiredChange: onParticipantFieldRequiredChange,
          })
        : null}
      <p className={styles.fieldHint}>
        {configuration.rules?.length ?? 0} published rule
        {(configuration.rules?.length ?? 0) === 1 ? "" : "s"} will be preserved on save.
      </p>
      {renderConditionControls({
        configuration,
        primaryCondition,
        ruleFields,
        selectedRuleFieldKey,
        selectedRuleOptions,
        onPrimaryConditionChange,
        onRuleTargetChange,
      })}
      {renderRulePreview({ configuration, ruleSummary })}
    </section>
  );
}

function renderPreviewField({
  key,
  field,
  value,
  onChange,
}: {
  readonly key: string;
  readonly field: CfpFormField;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const inputId = `preview-${field.id}`;
  const descriptionId = `${inputId}-description`;
  const commonProps = {
    id: inputId,
    name: field.id,
    value,
    placeholder: field.placeholder,
    required: field.required,
    "aria-describedby": descriptionId,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <div key={key} className={styles.previewField}>
      <label htmlFor={inputId}>
        {field.label}
        {field.required ? <span className={styles.required}> *</span> : null}
      </label>
      {field.type === "textarea" || field.type === "rich_text" ? (
        <textarea {...commonProps} rows={4} />
      ) : field.type === "select" ? (
        <select
          id={inputId}
          name={field.id}
          value={value}
          required={field.required}
          aria-describedby={descriptionId}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose an option</option>
          {(field.options ?? []).map((option) => {
            const optionValue =
              typeof option === "string"
                ? option
                : typeof option === "object" && option !== null && "value" in option
                  ? String(option.value)
                  : "";
            const optionLabel =
              typeof option === "object" && option !== null && "label" in option
                ? String(option.label)
                : optionValue;
            return optionValue ? (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            ) : null;
          })}
        </select>
      ) : field.type === "file_request" ? (
        <input {...commonProps} type="file" />
      ) : (
        <input {...commonProps} type={field.type} />
      )}
      <span id={descriptionId} className={styles.srOnly}>
        {field.required ? "Required field" : "Optional field"}
      </span>
    </div>
  );
}

function renderPreviewTaxonomyField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  readonly id: CfpPreviewSelectionKey;
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className={styles.previewField}>
      <label htmlFor={`preview-${id}`}>{label}</label>
      <select id={`preview-${id}`} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a {label.toLocaleLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function renderPreviewForm({
  configuration,
  visibleFields,
  configuredFieldForKey,
  previewResponses,
  previewSelections,
  ruleSummary,
  previewView,
  onPreviewInput,
  onPreviewResponseChange,
  onPreviewSelectionChange,
  onPreviewSubmit,
}: {
  readonly configuration: CfpConfiguration;
  readonly visibleFields: readonly CfpFormField[];
  readonly configuredFieldForKey: (key: string) => CfpFormField | undefined;
  readonly previewResponses: Readonly<Record<string, string>>;
  readonly previewSelections: CfpPreviewSelections;
  readonly ruleSummary: string;
  readonly previewView: "application" | "confirmation";
  readonly onPreviewInput: () => void;
  readonly onPreviewResponseChange: (fieldId: string, value: string) => void;
  readonly onPreviewSelectionChange: (key: CfpPreviewSelectionKey, value: string) => void;
  readonly onPreviewSubmit: () => void;
}) {
  return (
    <section
      className={styles.publicForm}
      aria-label="Public CFP form preview"
      hidden={previewView !== "application"}
      onInput={onPreviewInput}
    >
      <p className={styles.previewEyebrow}>{configuration.eventName} · Call for proposals</p>
      <h3>{configuration.welcomeTitle}</h3>
      <p className={styles.previewCopy}>{configuration.welcomeBody}</p>
      <div className={styles.previewDeadline}>
        <span>Accepting proposals</span>
        <strong>
          {configuration.opensAt} – {configuration.closesAt} ({configuration.timezone})
        </strong>
      </div>
      <fieldset className={styles.previewFieldset}>
        <legend>Proposal details</legend>
        {visibleFields.map((field) =>
          renderPreviewField({
            key: field.id,
            field,
            value: previewResponses[field.id] ?? "",
            onChange: (value) => onPreviewResponseChange(field.id, value),
          }),
        )}
        {configuredFieldForKey("track") === undefined
          ? renderPreviewTaxonomyField({
              id: "track",
              label: "Track",
              options: configuration.tracks,
              value: previewSelections.track,
              onChange: (value) => onPreviewSelectionChange("track", value),
            })
          : null}
        {configuredFieldForKey("format") === undefined
          ? renderPreviewTaxonomyField({
              id: "format",
              label: "Format",
              options: configuration.formats,
              value: previewSelections.format,
              onChange: (value) => onPreviewSelectionChange("format", value),
            })
          : null}
        {configuredFieldForKey("level") === undefined
          ? renderPreviewTaxonomyField({
              id: "level",
              label: "Level",
              options: configuration.levels,
              value: previewSelections.level,
              onChange: (value) => onPreviewSelectionChange("level", value),
            })
          : null}
      </fieldset>
      <p className={styles.previewRuleNote}>
        Conditional preview: {ruleSummary} → {configuration.ruleAction}.
      </p>
      <button className={styles.primaryButton} onClick={onPreviewSubmit} type="button">
        Submit preview response
      </button>
    </section>
  );
}

function renderPreviewConfirmation({
  configuration,
  submittedPreviewResult,
  previewResultRef,
  previewView,
}: {
  readonly configuration: CfpConfiguration;
  readonly submittedPreviewResult: CfpPreviewSubmissionResult | null;
  readonly previewResultRef: RefObject<HTMLElement | null>;
  readonly previewView: "application" | "confirmation";
}) {
  return (
    <section
      ref={previewResultRef}
      className={styles.previewDetails}
      aria-label="After submission preview"
      aria-live={submittedPreviewResult ? "polite" : "off"}
      hidden={previewView !== "confirmation"}
      tabIndex={-1}
    >
      <div>
        <p className={styles.sectionKicker}>After submission</p>
        <h3>{submittedPreviewResult?.confirmationTitle ?? configuration.confirmationTitle}</h3>
        <p>{submittedPreviewResult?.confirmationBody ?? configuration.confirmationBody}</p>
        <p className={styles.previewSuccessText}>
          {submittedPreviewResult?.successMessage ?? configuration.successMessage}
        </p>
      </div>
      <div>
        <p className={styles.sectionKicker}>Helpful links</p>
        <ul className={styles.helpfulLinks}>
          {configuration.helpfulLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>
      </div>
      <p className={styles.fieldHint}>
        Redirect after submit: <code>{configuration.redirectUrl}</code>
      </p>
    </section>
  );
}

interface CfpPublicPreviewSectionProps {
  readonly active: boolean;
  readonly configuration: CfpConfiguration;
  readonly visibleFields: readonly CfpFormField[];
  readonly configuredFieldForKey: (key: string) => CfpFormField | undefined;
  readonly previewResponses: Readonly<Record<string, string>>;
  readonly previewSelections: CfpPreviewSelections;
  readonly submittedPreviewResult: CfpPreviewSubmissionResult | null;
  readonly previewView: "application" | "confirmation";
  readonly previewResultRef: RefObject<HTMLElement | null>;
  readonly ruleSummary: string;
  readonly publicLinkAvailable: boolean;
  readonly publicRoute: string | null;
  readonly onPreviewInput: () => void;
  readonly onPreviewResponseChange: (fieldId: string, value: string) => void;
  readonly onPreviewSelectionChange: (key: CfpPreviewSelectionKey, value: string) => void;
  readonly onPreviewSubmit: () => void;
  readonly onPreviewViewChange: (view: "application" | "confirmation") => void;
}

function renderPublicPreviewSection({
  active,
  configuration,
  visibleFields,
  configuredFieldForKey,
  previewResponses,
  previewSelections,
  submittedPreviewResult,
  previewView,
  previewResultRef,
  ruleSummary,
  publicLinkAvailable,
  publicRoute,
  onPreviewInput,
  onPreviewResponseChange,
  onPreviewSelectionChange,
  onPreviewSubmit,
  onPreviewViewChange,
}: CfpPublicPreviewSectionProps) {
  return (
    <section
      id="public-preview"
      className={styles.previewPanel}
      aria-labelledby="public-preview-heading"
      hidden={!active}
    >
      <div className={styles.previewPanelHeader}>
        <div>
          <p className={styles.sectionKicker}>05 / applicant view</p>
          <h2 id="public-preview-heading">Public form preview</h2>
          <p className={styles.sectionDescription}>
            This preview uses the current editor state. It is not published and never sends a live
            submission.
          </p>
        </div>
        {publicLinkAvailable && publicRoute ? (
          <a className={styles.secondaryButton} href={publicRoute}>
            Open public route
          </a>
        ) : null}
      </div>
      <div className={styles.previewViewBar}>
        <ToggleGroup
          type="single"
          value={previewView}
          variant="outline"
          spacing={0}
          role="group"
          aria-label="Public preview view"
          className={styles.previewViewToggle}
          onValueChange={(value) => {
            if (value === "application" || value === "confirmation") onPreviewViewChange(value);
          }}
        >
          <ToggleGroupItem value="application">Application form</ToggleGroupItem>
          <ToggleGroupItem value="confirmation">After submission</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className={styles.previewGrid}>
        {renderPreviewForm({
          configuredFieldForKey,
          configuration,
          previewResponses,
          previewSelections,
          ruleSummary,
          previewView,
          visibleFields,
          onPreviewInput,
          onPreviewResponseChange,
          onPreviewSelectionChange,
          onPreviewSubmit,
        })}
        {renderPreviewConfirmation({
          configuration,
          previewResultRef,
          previewView,
          submittedPreviewResult,
        })}
      </div>
    </section>
  );
}

interface CfpEditorSectionsProps {
  readonly activeSection: string;
  readonly configuration: CfpConfiguration;
  readonly canonicalTaxonomy?: CfpCanonicalTaxonomy | null;
  readonly taxonomyManageHref?: string;
  readonly effectiveClosed: boolean;
  readonly publicRoute: string | null;
  readonly publicRoutePath: string | null;
  readonly minimumCfpDate: string | null;
  readonly maximumCfpDate: string | undefined;
  readonly dateValidationError: string | null;
  readonly historicalCfpDates: readonly string[];
  readonly closeDatePast: boolean;
  readonly pastCloseAcknowledged: boolean;
  readonly saveState: CfpSaveState;
  readonly visibleFields: readonly CfpFormField[];
  readonly ruleFields: readonly CfpFormField[];
  readonly selectedRuleFieldKey: string;
  readonly selectedRuleOptions: readonly string[];
  readonly primaryCondition: CfpCondition;
  readonly ruleSummary: string;
  readonly previewResponses: Readonly<Record<string, string>>;
  readonly previewSelections: CfpPreviewSelections;
  readonly submittedPreviewResult: CfpPreviewSubmissionResult | null;
  readonly previewView: "application" | "confirmation";
  readonly previewResultRef: RefObject<HTMLElement | null>;
  readonly publicLinkAvailable: boolean;
  readonly onSave: (event: FormEvent<HTMLFormElement>) => void;
  readonly onConfigurationChange: CfpConfigurationUpdater;
  readonly onDateRangeChange: (selection: EventDateSelectionValue) => void;
  readonly onPastCloseAcknowledgedChange: (checked: boolean) => void;
  readonly onCloseNow: () => void;
  readonly onTaxonomyChange: (key: CfpTaxonomyKey, values: string[]) => void;
  readonly onHelpfulLinkChange: (
    index: number,
    patch: Partial<{ label: string; href: string }>,
  ) => void;
  readonly onFieldChange: (fieldId: string, patch: Partial<CfpFormField>) => void;
  readonly onAddField: () => void;
  readonly onRemoveField: (fieldId: string) => void;
  readonly onParticipantFieldRequiredChange: (fieldId: string, required: boolean) => void;
  readonly onPrimaryConditionChange: (
    patch: Partial<Omit<CfpCondition, "type" | "operator">>,
  ) => void;
  readonly onRuleTargetChange: (target: string) => void;
  readonly configuredFieldForKey: (key: string) => CfpFormField | undefined;
  readonly onPreviewInput: () => void;
  readonly onPreviewResponseChange: (fieldId: string, value: string) => void;
  readonly onPreviewSelectionChange: (key: CfpPreviewSelectionKey, value: string) => void;
  readonly onPreviewSubmit: () => void;
  readonly onPreviewViewChange: (view: "application" | "confirmation") => void;
}

export function CfpEditorSections({
  activeSection,
  configuration,
  effectiveClosed,
  canonicalTaxonomy,
  taxonomyManageHref,
  publicRoute,
  publicRoutePath,
  minimumCfpDate,
  maximumCfpDate,
  dateValidationError,
  closeDatePast,
  historicalCfpDates,
  pastCloseAcknowledged,
  saveState,
  visibleFields,
  ruleFields,
  selectedRuleFieldKey,
  selectedRuleOptions,
  primaryCondition,
  ruleSummary,
  previewResponses,
  previewSelections,
  submittedPreviewResult,
  previewResultRef,
  previewView,
  publicLinkAvailable,
  onSave,
  onConfigurationChange,
  onDateRangeChange,
  onPastCloseAcknowledgedChange,
  onCloseNow,
  onTaxonomyChange,
  onHelpfulLinkChange,
  onFieldChange,
  onAddField,
  onRemoveField,
  onParticipantFieldRequiredChange,
  onPrimaryConditionChange,
  onRuleTargetChange,
  configuredFieldForKey,
  onPreviewInput,
  onPreviewResponseChange,
  onPreviewSelectionChange,
  onPreviewSubmit,
  onPreviewViewChange,
}: CfpEditorSectionsProps) {
  return (
    <div className={styles.workspaceGrid}>
      <form
        id="cfp-editor-form"
        className={styles.editorForm}
        aria-label="Event and CFP configuration"
        noValidate
        onSubmit={onSave}
      >
        {renderEventDetailsSection({
          active: activeSection === "event-details",
          closeDatePast,
          configuration,
          dateValidationError,
          effectiveClosed,
          minimumCfpDate,
          maximumCfpDate,
          pastCloseAcknowledged,
          historicalCfpDates,
          publicRoutePath,
          saveState,
          onCloseNow,
          onConfigurationChange,
          onDateRangeChange,
          onPastCloseAcknowledgedChange,
        })}
        {renderMessagingSection({
          active: activeSection === "messaging",
          configuration,
          onConfigurationChange,
        })}
        {renderTaxonomySection({
          active: activeSection === "taxonomy",
          configuration,
          onHelpfulLinkChange,
          onTaxonomyChange,
          canonicalTaxonomy,
          taxonomyManageHref,
        })}
        {renderFieldsRulesSection({
          active: activeSection === "fields-rules",
          configuration,
          primaryCondition,
          ruleFields,
          ruleSummary,
          selectedRuleFieldKey,
          selectedRuleOptions,
          onAddField,
          onFieldChange,
          onParticipantFieldRequiredChange,
          onPrimaryConditionChange,
          onRemoveField,
          onRuleTargetChange,
        })}
      </form>
      {renderPublicPreviewSection({
        active: activeSection === "public-preview",
        configuredFieldForKey,
        configuration,
        previewResponses,
        previewResultRef,
        previewSelections,
        publicLinkAvailable,
        publicRoute,
        ruleSummary,
        submittedPreviewResult,
        visibleFields,
        onPreviewInput,
        onPreviewResponseChange,
        onPreviewSelectionChange,
        onPreviewSubmit,
        previewView,
        onPreviewViewChange,
      })}
    </div>
  );
}
