"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import styles from "./cfp-editor.module.css";

type FieldType = "text" | "email" | "url" | "textarea";

export interface CfpFormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  visible: boolean;
  placeholder: string;
}

export interface CfpCondition {
  type: "condition";
  field: string;
  operator: "is" | "is not";
  value: string;
}

export interface CfpConditionGroup {
  type: "group";
  operator: "AND" | "OR";
  conditions: CfpRule[];
}

export type CfpRule = CfpCondition | CfpConditionGroup;

export interface CfpConfiguration {
  eventName: string;
  slug: string;
  timezone: string;
  opensAt: string;
  closesAt: string;
  participantLimit: number;
  formLimit: number;
  reminderEmails: boolean;
  adminNotifications: boolean;
  welcomeTitle: string;
  welcomeBody: string;
  confirmationTitle: string;
  confirmationBody: string;
  successMessage: string;
  redirectUrl: string;
  tracks: string[];
  tags: string[];
  formats: string[];
  levels: string[];
  helpfulLinks: Array<{ label: string; href: string }>;
  fields: CfpFormField[];
  rule: CfpRule;
  ruleAction: string;
}

const DEFAULT_EVENT_ID = "summit-2026";

const SEEDED_CONFIGURATION: CfpConfiguration = {
  eventName: "Open Sessionboard Summit 2026",
  slug: DEFAULT_EVENT_ID,
  timezone: "America/Los_Angeles",
  opensAt: "2026-01-15",
  closesAt: "2026-03-31",
  participantLimit: 3,
  formLimit: 20,
  reminderEmails: true,
  adminNotifications: true,
  welcomeTitle: "Bring your best session to the Summit",
  welcomeBody:
    "We are looking for practical, generous ideas from people shaping the future of programs and communities. Tell us what you have learned and what attendees can take home.",
  confirmationTitle: "Your proposal is in",
  confirmationBody:
    "Thanks for sharing your idea. We will review every proposal and email you when the program moves forward.",
  successMessage: "Thanks — your proposal has been submitted successfully.",
  redirectUrl: "https://open-sessionboard.local/cfp/summit-2026/complete",
  tracks: ["Product craft", "Community systems", "Responsible AI"],
  tags: ["Accessibility", "Leadership", "Open source", "Operations"],
  formats: ["Talk · 30 minutes", "Workshop · 60 minutes", "Panel · 45 minutes"],
  levels: ["Introductory", "Intermediate", "Advanced"],
  helpfulLinks: [
    { label: "Speaker guide", href: "https://open-sessionboard.local/summit-2026/guide" },
    { label: "Code of conduct", href: "https://open-sessionboard.local/code-of-conduct" },
  ],
  fields: [
    {
      id: "first-name",
      label: "First name",
      type: "text",
      required: true,
      visible: true,
      placeholder: "Ada",
    },
    {
      id: "last-name",
      label: "Last name",
      type: "text",
      required: true,
      visible: true,
      placeholder: "Lovelace",
    },
    {
      id: "email",
      label: "Email address",
      type: "email",
      required: true,
      visible: true,
      placeholder: "ada@example.com",
    },
    {
      id: "proposal-title",
      label: "Proposal title",
      type: "text",
      required: true,
      visible: true,
      placeholder: "A clear, attendee-friendly title",
    },
    {
      id: "abstract",
      label: "Proposal abstract",
      type: "textarea",
      required: true,
      visible: true,
      placeholder: "What will attendees learn?",
    },
    {
      id: "accessibility-notes",
      label: "Accessibility notes",
      type: "textarea",
      required: false,
      visible: true,
      placeholder: "Share access needs or presentation requirements",
    },
    {
      id: "website",
      label: "Website or profile URL",
      type: "url",
      required: false,
      visible: false,
      placeholder: "https://",
    },
  ],
  rule: {
    type: "group",
    operator: "AND",
    conditions: [
      { type: "condition", field: "Format", operator: "is", value: "Workshop · 60 minutes" },
      {
        type: "group",
        operator: "OR",
        conditions: [
          { type: "condition", field: "Track", operator: "is", value: "Community systems" },
          { type: "condition", field: "Level", operator: "is", value: "Introductory" },
        ],
      },
    ],
  },
  ruleAction: "show Accessibility notes and require a workshop materials link",
};

const SECTION_LINKS = [
  { id: "event-details", label: "Event details" },
  { id: "messaging", label: "Messaging" },
  { id: "taxonomy", label: "Taxonomy & links" },
  { id: "fields-rules", label: "Fields & rules" },
  { id: "public-preview", label: "Public preview" },
] as const;

const TIMEZONE_OPTIONS = [
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
];

function cloneConfiguration(): CfpConfiguration {
  return {
    ...SEEDED_CONFIGURATION,
    tracks: [...SEEDED_CONFIGURATION.tracks],
    tags: [...SEEDED_CONFIGURATION.tags],
    formats: [...SEEDED_CONFIGURATION.formats],
    levels: [...SEEDED_CONFIGURATION.levels],
    helpfulLinks: SEEDED_CONFIGURATION.helpfulLinks.map((link) => ({ ...link })),
    fields: SEEDED_CONFIGURATION.fields.map((field) => ({ ...field })),
    rule: SEEDED_CONFIGURATION.rule,
  };
}

export function createSeededCfpConfiguration(eventId = DEFAULT_EVENT_ID): CfpConfiguration {
  const configuration = cloneConfiguration();
  configuration.slug = eventId || DEFAULT_EVENT_ID;
  return configuration;
}

export function summarizeRule(rule: CfpRule): string {
  if (rule.type === "condition") {
    return `${rule.field} ${rule.operator} ${rule.value}`;
  }

  const joiner = ` ${rule.operator} `;
  return `(${rule.conditions.map(summarizeRule).join(joiner)})`;
}

function ruleKey(rule: CfpRule): string {
  if (rule.type === "condition") {
    return `condition:${rule.field}:${rule.operator}:${rule.value}`;
  }

  return `group:${rule.operator}:${rule.conditions.map(ruleKey).join("|")}`;
}

function listFromInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateList(
  current: CfpConfiguration,
  key: "tracks" | "tags" | "formats" | "levels",
  value: string,
): CfpConfiguration {
  return { ...current, [key]: listFromInput(value) };
}

function fieldTypeLabel(type: FieldType): string {
  switch (type) {
    case "email":
      return "Email";
    case "url":
      return "URL";
    case "textarea":
      return "Long text";
    default:
      return "Short text";
  }
}

function PreviewField({
  field,
  value,
  onChange,
}: {
  field: CfpFormField;
  value: string;
  onChange: (value: string) => void;
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
    <div className={styles.previewField}>
      <label htmlFor={inputId}>
        {field.label}
        {field.required ? <span className={styles.required}> *</span> : null}
      </label>
      {field.type === "textarea" ? (
        <textarea {...commonProps} rows={4} />
      ) : (
        <input {...commonProps} type={field.type} />
      )}
      <span id={descriptionId} className={styles.srOnly}>
        {field.required ? "Required field" : "Optional field"}
      </span>
    </div>
  );
}

function RuleTree({ rule }: { rule: CfpRule }) {
  if (rule.type === "condition") {
    return (
      <li className={styles.ruleCondition}>
        <span className={styles.ruleToken}>{rule.field}</span>
        <span>{rule.operator}</span>
        <strong>{rule.value}</strong>
      </li>
    );
  }

  return (
    <li className={styles.ruleGroup}>
      <span className={styles.ruleOperator}>{rule.operator}</span>
      <ul>
        {rule.conditions.map((child) => (
          <RuleTree key={ruleKey(child)} rule={child} />
        ))}
      </ul>
    </li>
  );
}

interface CfpEditorProps {
  eventId: string;
}

export function CfpEditor({ eventId }: CfpEditorProps) {
  const [configuration, setConfiguration] = useState<CfpConfiguration>(() =>
    createSeededCfpConfiguration(eventId),
  );
  const [activeSection, setActiveSection] =
    useState<(typeof SECTION_LINKS)[number]["id"]>("event-details");
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [previewResponses, setPreviewResponses] = useState<Record<string, string>>({});
  const [previewSelections, setPreviewSelections] = useState({
    track: "Community systems",
    format: "Workshop · 60 minutes",
    level: "Introductory",
  });
  const [previewMessage, setPreviewMessage] = useState("");

  function updateConfiguration<K extends keyof CfpConfiguration>(
    key: K,
    value: CfpConfiguration[K],
  ): void {
    setConfiguration((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
  }

  function updateField(fieldId: string, patch: Partial<CfpFormField>): void {
    setConfiguration((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field,
      ),
    }));
    setSaveState("idle");
  }

  function updateHelpfulLink(index: number, patch: Partial<{ label: string; href: string }>): void {
    setConfiguration((current) => ({
      ...current,
      helpfulLinks: current.helpfulLinks.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      ),
    }));
    setSaveState("idle");
  }

  function handleSave(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaveState("saved");
  }

  function openSection(id: (typeof SECTION_LINKS)[number]["id"]): void {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePreviewSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPreviewMessage(configuration.successMessage);
  }

  const visibleFields = configuration.fields.filter((field) => field.visible);
  const ruleSummary = summarizeRule(configuration.rule);

  return (
    <div className={styles.viewport}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Organizer workspace / {eventId}</p>
          <h1>Configure your call for proposals</h1>
          <p className={styles.pageIntro}>
            Shape the event details, applicant experience, and rules before publishing a clear,
            accessible public form.
          </p>
        </div>
        <div className={styles.headerActions}>
          <a className={styles.secondaryButton} href={`/cfp/${configuration.slug}`}>
            View public form
          </a>
          <button className={styles.primaryButton} type="submit" form="cfp-editor-form">
            Save changes
          </button>
        </div>
      </header>

      <nav className={styles.sectionNav} aria-label="CFP workspace sections">
        {SECTION_LINKS.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-controls={section.id}
            aria-pressed={activeSection === section.id}
            className={activeSection === section.id ? styles.activeNavButton : undefined}
            onClick={() => openSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className={styles.workspaceGrid}>
        <form
          id="cfp-editor-form"
          className={styles.editorForm}
          aria-label="Event and CFP configuration"
          onSubmit={handleSave}
        >
          <section
            id="event-details"
            className={styles.panel}
            aria-labelledby="event-details-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>01 / foundation</p>
                <h2 id="event-details-heading">Event details</h2>
              </div>
              <span className={styles.statusPill}>Draft</span>
            </div>
            <p className={styles.sectionDescription}>
              Give applicants the context they need and set the dates and limits that protect your
              review team.
            </p>

            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="event-name">Event name</label>
                <input
                  id="event-name"
                  name="eventName"
                  required
                  value={configuration.eventName}
                  onChange={(event) => updateConfiguration("eventName", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="event-slug">Public URL slug</label>
                <input
                  id="event-slug"
                  name="slug"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  title="Use lowercase letters, numbers, and hyphens."
                  value={configuration.slug}
                  onChange={(event) => updateConfiguration("slug", event.target.value)}
                />
                <p className={styles.fieldHint}>/cfp/{configuration.slug || "your-event"}</p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="event-timezone">Event timezone</label>
                <select
                  id="event-timezone"
                  name="timezone"
                  required
                  value={configuration.timezone}
                  onChange={(event) => updateConfiguration("timezone", event.target.value)}
                >
                  {TIMEZONE_OPTIONS.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </select>
                <p className={styles.fieldHint}>Dates shown to applicants use this timezone.</p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="open-date">Open date</label>
                <input
                  id="open-date"
                  name="opensAt"
                  type="date"
                  required
                  min="2026-01-01"
                  max="2026-12-31"
                  value={configuration.opensAt}
                  onChange={(event) => updateConfiguration("opensAt", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="close-date">Close date</label>
                <input
                  id="close-date"
                  name="closesAt"
                  type="date"
                  required
                  min={configuration.opensAt}
                  max="2026-12-31"
                  value={configuration.closesAt}
                  onChange={(event) => updateConfiguration("closesAt", event.target.value)}
                />
                <p className={styles.fieldHint}>
                  The close date cannot be earlier than the open date.
                </p>
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
                  onChange={(event) =>
                    updateConfiguration("participantLimit", Number(event.target.value))
                  }
                  aria-describedby="participant-limit-help"
                />
                <p id="participant-limit-help" className={styles.fieldHint}>
                  Up to 15 participants can collaborate on one submission.
                </p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="form-limit">Submission limit (forms per event)</label>
                <input
                  id="form-limit"
                  name="submissionLimit"
                  type="number"
                  required
                  min={1}
                  max={20}
                  step={1}
                  value={configuration.formLimit}
                  onChange={(event) => updateConfiguration("formLimit", Number(event.target.value))}
                  aria-describedby="form-limit-help"
                />
                <p id="form-limit-help" className={styles.fieldHint}>
                  An event can publish between 1 and 20 forms; this form limit is 20.
                </p>
              </div>
            </div>

            <fieldset className={styles.toggleFieldset}>
              <legend>Notifications</legend>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={configuration.reminderEmails}
                  onChange={(event) => updateConfiguration("reminderEmails", event.target.checked)}
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
                  onChange={(event) =>
                    updateConfiguration("adminNotifications", event.target.checked)
                  }
                />
                <span>
                  <strong>Notify admins of new submissions</strong>
                  <small>Keep the organizer review queue in sync with incoming proposals.</small>
                </span>
              </label>
            </fieldset>
          </section>

          <section id="messaging" className={styles.panel} aria-labelledby="messaging-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>02 / applicant experience</p>
                <h2 id="messaging-heading">Messaging</h2>
              </div>
            </div>
            <p className={styles.sectionDescription}>
              Set the words applicants see at each handoff. Keep instructions specific, welcoming,
              and easy to scan.
            </p>
            <div className={styles.copyStack}>
              <div className={styles.fieldGroup}>
                <label htmlFor="welcome-title">Welcome heading</label>
                <input
                  id="welcome-title"
                  name="welcomeTitle"
                  required
                  value={configuration.welcomeTitle}
                  onChange={(event) => updateConfiguration("welcomeTitle", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="welcome-body">Welcome copy</label>
                <textarea
                  id="welcome-body"
                  name="welcomeBody"
                  required
                  rows={4}
                  value={configuration.welcomeBody}
                  onChange={(event) => updateConfiguration("welcomeBody", event.target.value)}
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
                    onChange={(event) =>
                      updateConfiguration("confirmationTitle", event.target.value)
                    }
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="success-message">Success message</label>
                  <input
                    id="success-message"
                    name="successMessage"
                    required
                    value={configuration.successMessage}
                    onChange={(event) => updateConfiguration("successMessage", event.target.value)}
                  />
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="confirmation-body">Confirmation copy</label>
                <textarea
                  id="confirmation-body"
                  name="confirmationBody"
                  required
                  rows={3}
                  value={configuration.confirmationBody}
                  onChange={(event) => updateConfiguration("confirmationBody", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="redirect-url">After-submit redirect URL</label>
                <input
                  id="redirect-url"
                  name="redirectUrl"
                  type="url"
                  required
                  value={configuration.redirectUrl}
                  onChange={(event) => updateConfiguration("redirectUrl", event.target.value)}
                  aria-describedby="redirect-url-help"
                />
                <p id="redirect-url-help" className={styles.fieldHint}>
                  Applicants see the success message before they continue to this URL.
                </p>
              </div>
            </div>
          </section>

          <section id="taxonomy" className={styles.panel} aria-labelledby="taxonomy-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>03 / organizer vocabulary</p>
                <h2 id="taxonomy-heading">Taxonomy &amp; helpful links</h2>
              </div>
            </div>
            <p className={styles.sectionDescription}>
              Consistent options make routing and review easier. Separate each option with a comma.
            </p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="tracks">Tracks</label>
                <input
                  id="tracks"
                  name="tracks"
                  required
                  value={configuration.tracks.join(", ")}
                  onChange={(event) =>
                    setConfiguration((current) => updateList(current, "tracks", event.target.value))
                  }
                  aria-describedby="tracks-help"
                />
                <p id="tracks-help" className={styles.fieldHint}>
                  Route proposals into a program area.
                </p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="tags">Tags</label>
                <input
                  id="tags"
                  name="tags"
                  required
                  value={configuration.tags.join(", ")}
                  onChange={(event) =>
                    setConfiguration((current) => updateList(current, "tags", event.target.value))
                  }
                  aria-describedby="tags-help"
                />
                <p id="tags-help" className={styles.fieldHint}>
                  Add searchable labels for reviewers.
                </p>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="formats">Formats</label>
                <input
                  id="formats"
                  name="formats"
                  required
                  value={configuration.formats.join(", ")}
                  onChange={(event) =>
                    setConfiguration((current) =>
                      updateList(current, "formats", event.target.value),
                    )
                  }
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="levels">Levels</label>
                <input
                  id="levels"
                  name="levels"
                  required
                  value={configuration.levels.join(", ")}
                  onChange={(event) =>
                    setConfiguration((current) => updateList(current, "levels", event.target.value))
                  }
                />
              </div>
            </div>

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
                      onChange={(event) => updateHelpfulLink(index, { label: event.target.value })}
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label htmlFor={`helpful-link-url-${index}`}>Link URL {index + 1}</label>
                    <input
                      id={`helpful-link-url-${index}`}
                      type="url"
                      required
                      value={link.href}
                      onChange={(event) => updateHelpfulLink(index, { href: event.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            id="fields-rules"
            className={styles.panel}
            aria-labelledby="fields-rules-heading"
          >
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>04 / form logic</p>
                <h2 id="fields-rules-heading">Fields &amp; rules</h2>
              </div>
            </div>
            <p className={styles.sectionDescription}>
              Built-in speaker identity fields stay required by default. Make optional fields
              visible only when they help an applicant complete a thoughtful proposal.
            </p>
            <fieldset className={styles.fieldList}>
              <legend>Applicant fields</legend>
              {configuration.fields.map((field) => (
                <div className={styles.fieldRuleRow} key={field.id}>
                  <div>
                    <strong>{field.label}</strong>
                    <span className={styles.fieldType}>{fieldTypeLabel(field.type)}</span>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) =>
                        updateField(field.id, { required: event.target.checked })
                      }
                    />
                    Required
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={field.visible}
                      onChange={(event) => updateField(field.id, { visible: event.target.checked })}
                    />
                    Visible
                  </label>
                </div>
              ))}
            </fieldset>

            <section className={styles.rulePreview} aria-labelledby="condition-preview-heading">
              <div className={styles.subheadingRow}>
                <div>
                  <p className={styles.sectionKicker}>Nested condition preview</p>
                  <h3 id="condition-preview-heading">When should this field appear?</h3>
                </div>
                <span className={styles.logicBadge}>Preview only</span>
              </div>
              <p className={styles.ruleSummary}>
                If <strong>{ruleSummary}</strong>, then <strong>{configuration.ruleAction}</strong>.
              </p>
              <ul className={styles.ruleTree} aria-label="Nested condition tree">
                <RuleTree rule={configuration.rule} />
              </ul>
              <p className={styles.fieldHint}>
                Rules support nested AND / OR groups and are evaluated before the public form is
                published. Cycles are rejected during validation.
              </p>
            </section>

            <div className={styles.formActions}>
              <button className={styles.primaryButton} type="submit">
                Save CFP configuration
              </button>
              <span className={styles.saveStatus} role="status" aria-live="polite">
                {saveState === "saved" ? "Changes saved. Your draft is ready to publish." : ""}
              </span>
            </div>
          </section>
        </form>

        <aside className={styles.summaryAside} aria-label="Configuration summary">
          <div className={styles.summaryCard}>
            <p className={styles.sectionKicker}>At a glance</p>
            <h2>Ready for review</h2>
            <dl className={styles.summaryList}>
              <div>
                <dt>Event</dt>
                <dd>{configuration.eventName}</dd>
              </div>
              <div>
                <dt>Window</dt>
                <dd>
                  {configuration.opensAt} → {configuration.closesAt}
                </dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{configuration.timezone}</dd>
              </div>
              <div>
                <dt>Visible fields</dt>
                <dd>
                  {visibleFields.length} of {configuration.fields.length}
                </dd>
              </div>
              <div>
                <dt>Notifications</dt>
                <dd>
                  {configuration.reminderEmails && configuration.adminNotifications
                    ? "Reminders + admin alerts"
                    : configuration.reminderEmails
                      ? "Reminders only"
                      : configuration.adminNotifications
                        ? "Admin alerts only"
                        : "Off"}
                </dd>
              </div>
            </dl>
            <a className={styles.textLink} href="#public-preview">
              Jump to public preview <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className={styles.accessibilityNote}>
            <strong>Accessibility check</strong>
            <p>Every public field has a visible label, keyboard focus, and a required state.</p>
          </div>
        </aside>
      </div>

      <section
        id="public-preview"
        className={styles.previewPanel}
        aria-labelledby="public-preview-heading"
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
          <a className={styles.secondaryButton} href={`/cfp/${configuration.slug}`}>
            Open public route
          </a>
        </div>

        <div className={styles.previewGrid}>
          <form
            className={styles.publicForm}
            aria-label="Public CFP form preview"
            onSubmit={handlePreviewSubmit}
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
              {visibleFields.map((field) => (
                <PreviewField
                  key={field.id}
                  field={field}
                  value={previewResponses[field.id] ?? ""}
                  onChange={(value) =>
                    setPreviewResponses((current) => ({ ...current, [field.id]: value }))
                  }
                />
              ))}
              <div className={styles.previewField}>
                <label htmlFor="preview-track">Track</label>
                <select
                  id="preview-track"
                  value={previewSelections.track}
                  onChange={(event) =>
                    setPreviewSelections((current) => ({ ...current, track: event.target.value }))
                  }
                >
                  <option value="">Choose a track</option>
                  {configuration.tracks.map((track) => (
                    <option key={track} value={track}>
                      {track}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.previewField}>
                <label htmlFor="preview-format">Format</label>
                <select
                  id="preview-format"
                  value={previewSelections.format}
                  onChange={(event) =>
                    setPreviewSelections((current) => ({ ...current, format: event.target.value }))
                  }
                >
                  <option value="">Choose a format</option>
                  {configuration.formats.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.previewField}>
                <label htmlFor="preview-level">Level</label>
                <select
                  id="preview-level"
                  value={previewSelections.level}
                  onChange={(event) =>
                    setPreviewSelections((current) => ({ ...current, level: event.target.value }))
                  }
                >
                  <option value="">Choose a level</option>
                  {configuration.levels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>

            <p className={styles.previewRuleNote}>
              Conditional preview: {ruleSummary} → {configuration.ruleAction}.
            </p>
            <button className={styles.primaryButton} type="submit">
              Submit preview response
            </button>
            <p className={styles.previewConfirmation}>
              <strong>{configuration.confirmationTitle}</strong> — {configuration.confirmationBody}
            </p>
            <p className={styles.previewSuccess} role="status" aria-live="polite">
              {previewMessage || configuration.successMessage}
            </p>
          </form>

          <aside className={styles.previewDetails} aria-label="Public form behavior">
            <div>
              <p className={styles.sectionKicker}>After submission</p>
              <h3>{configuration.confirmationTitle}</h3>
              <p>{configuration.confirmationBody}</p>
              <p className={styles.previewSuccessText}>{configuration.successMessage}</p>
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
          </aside>
        </div>
      </section>
    </div>
  );
}
