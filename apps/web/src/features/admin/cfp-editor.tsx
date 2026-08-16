"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type CfpEventConfiguration, type CfpFormConfiguration, createCfpApi } from "../cfp/api";
import { getCfpStepRoute } from "../cfp/routes";
import styles from "./cfp-editor.module.css";
import { CfpEditorMasthead, CfpSectionNavigation, CfpStepActions } from "./cfp-editor-chrome";
import {
  type CfpCondition,
  type CfpConfiguration,
  type CfpEditorProps,
  type CfpFormField,
  type CfpRule,
  cfpMinimumDate,
  closeCfpNowConfiguration,
  configurationFromServer,
  createEmptyCfpConfiguration,
  dateFromInstant,
  editorFieldType,
  fieldKeyForRuleField,
  fieldKeyFromLabel,
  fieldOptionValues,
  fieldReferenceLabel,
  fieldTypeLabel,
  firstRuleCondition,
  isCfpCloseDatePast,
  loadCfpEditorConfiguration,
  ORGANIZER_SCROLL_CONTAINER_ID,
  persistCfpConfiguration,
  resolveCfpEditorStepIndex,
  ruleKey,
  ruleMatches,
  SECTION_LINKS,
  summarizeRule,
  TIMEZONE_OPTIONS,
  updateCfpEditorField,
  updateCfpShowWhenCondition,
  validateCfpDateRange,
} from "./cfp-editor-model";
import { CfpOptionListEditor } from "./cfp-option-list-editor";
import { EventDatePicker, type EventDateSelectionValue } from "./event-date-picker";
import { useOrganizerEventId } from "./organizer-event-workspace";


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

export function CfpEditor({
  eventId: fallbackEventId,
  organizationId,
  formId,
  api: providedApi,
}: CfpEditorProps) {
  const eventId = useOrganizerEventId(fallbackEventId);
  const [configuration, setConfiguration] = useState<CfpConfiguration>(() =>
    createEmptyCfpConfiguration(eventId),
  );
  const api = useMemo(() => providedApi ?? createCfpApi(""), [providedApi]);
  const [activeSection, setActiveSection] =
    useState<(typeof SECTION_LINKS)[number]["id"]>("event-details");
  const previewResultRef = useRef<HTMLDivElement | null>(null);
  const saveInFlightRef = useRef(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [preparedPublishVersion, setPreparedPublishVersion] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pastCloseAcknowledged, setPastCloseAcknowledged] = useState(false);
  const [previewResponses, setPreviewResponses] = useState<Record<string, string>>({});
  const [previewSelections, setPreviewSelections] = useState({
    track: "Community systems",
    format: "Workshop · 60 minutes",
    level: "Introductory",
  });
  const [previewSubmissionKey, setPreviewSubmissionKey] = useState<string | null>(null);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [configurationLoadState, setConfigurationLoadState] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const resolvedOrganizationId = organizationId.trim();
  const requestedFormId = formId?.trim() || undefined;
  const resolvedFormId = requestedFormId ?? configuration.id;
  const cfpNow = new Date();
  const minimumCfpDate = cfpMinimumDate(cfpNow, configuration.timezone);
  const dateValidationError = validateCfpDateRange(
    configuration.opensAt,
    configuration.closesAt,
    configuration.timezone,
  );
  const closeDatePast = isCfpCloseDatePast(configuration.closesAt, cfpNow, configuration.timezone);
  const effectiveClosed = configuration.status === "closed" || closeDatePast;

  useEffect(() => {
    if (!resolvedOrganizationId) {
      setConfigurationLoadState("error");
      setSaveState("error");
      return;
    }
    let active = true;
    setConfigurationLoadState("loading");
    setSaveError(null);
    void loadCfpEditorConfiguration(api, {
      organizationId: resolvedOrganizationId,
      eventId,
      ...(requestedFormId === undefined ? {} : { formId: requestedFormId }),
    })
      .then(({ event: eventConfiguration, form: formConfiguration }) => {
        if (!active) return;
        if (formConfiguration !== undefined) {
          setConfiguration((current) =>
            configurationFromServer(current, eventConfiguration, formConfiguration),
          );
        } else {
          const newFormId = requestedFormId ?? `${eventId}-cfp`;
          setConfiguration((current) => {
            const { formVersion: _formVersion, ...withoutFormVersion } = current;
            return {
              ...withoutFormVersion,
              id: newFormId,
              status: "draft",
              eventVersion: eventConfiguration.version,
              eventName: eventConfiguration.name,
              slug: eventConfiguration.slug,
              timezone: eventConfiguration.timezone,
              opensAt: dateFromInstant(eventConfiguration.opensAt),
              closesAt: dateFromInstant(eventConfiguration.closesAt),
            };
          });
        }
        setConfigurationLoadState("ready");
      })
      .catch((error: unknown) => {
        if (active) {
          setConfigurationLoadState("error");
          setSaveState("error");
          setSaveError(
            error instanceof Error ? error.message : "The CFP configuration could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [api, eventId, requestedFormId, resolvedOrganizationId]);
  function updateConfiguration<K extends keyof CfpConfiguration>(
    key: K,
    value: CfpConfiguration[K],
  ): void {
    setConfiguration((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
    setSaveError(null);
    if (key === "closesAt") setPastCloseAcknowledged(false);
  }
  function updateCfpDateRange(selection: EventDateSelectionValue): void {
    setConfiguration((current) => ({
      ...current,
      opensAt: selection.startsAt.slice(0, 10),
      closesAt: selection.endsAt.slice(0, 10),
    }));
    setSaveState("idle");
    setSaveError(null);
    setPastCloseAcknowledged(false);
  }

  function updateField(fieldId: string, patch: Partial<CfpFormField>): void {
    setConfiguration((current) => updateCfpEditorField(current, fieldId, patch));
    setSaveState("idle");
  }
  function addField(): void {
    const id = `custom-field-${Date.now()}`;
    setConfiguration((current) => {
      const label = "New custom field";
      return {
        ...current,
        fields: [
          ...current.fields,
          {
            id,
            key: `${fieldKeyFromLabel(label)}-${current.fields.length + 1}`,
            label,
            type: "text",
            kind: "text",
            required: false,
            visible: true,
            placeholder: "",
            options: [],
          },
        ],
      };
    });
    setSaveState("idle");
  }

  function removeField(fieldId: string): void {
    setConfiguration((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
    setSaveState("idle");
  }

  function updatePrimaryCondition(patch: Partial<Omit<CfpCondition, "type" | "operator">>): void {
    setConfiguration((current) => updateCfpShowWhenCondition(current, patch));
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

  function replaceTaxonomyOptions(
    key: "formats" | "levels" | "tags" | "tracks",
    values: string[],
  ): void {
    setConfiguration((current) => ({ ...current, [key]: values }));
    setSaveState("idle");
  }

  function focusFirstInvalidControl(): boolean {
    if (typeof document === "undefined") return true;
    const form = document.getElementById("cfp-editor-form");
    if (!(form instanceof HTMLFormElement) || form.checkValidity()) return true;

    const invalidControl = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input, select, textarea",
      ),
    ).find((control) => !control.disabled && !control.checkValidity());
    if (!invalidControl) return false;

    const sectionId = invalidControl.closest("section")?.id;
    const section = SECTION_LINKS.find((candidate) => candidate.id === sectionId);
    if (section) setActiveSection(section.id);
    setSaveState("error");
    setSaveError("Complete the highlighted field before publishing.");
    window.requestAnimationFrame(() => {
      invalidControl.focus();
      invalidControl.reportValidity();
    });
    return false;
  }

  async function saveConfiguration(options?: { readonly validateForPublish?: boolean }): Promise<{
    event: CfpEventConfiguration;
    form: CfpFormConfiguration;
  } | null> {
    if (saveInFlightRef.current) return null;
    setSaveError(null);
    if (options?.validateForPublish === true && !focusFirstInvalidControl()) return null;
    if (!resolvedOrganizationId || !resolvedFormId) {
      setSaveState("error");
      setSaveError("An organizer organization and form are required before saving.");
      return null;
    }
    if (dateValidationError !== null) {
      setSaveState("error");
      setSaveError(dateValidationError);
      return null;
    }
    if (closeDatePast && !pastCloseAcknowledged) {
      setSaveState("error");
      setSaveError("A past close date requires explicit organizer confirmation before saving.");
      return null;
    }
    try {
      saveInFlightRef.current = true;
      setSaveState("saving");
      const saved = await persistCfpConfiguration(api, {
        configuration,
        organizationId: resolvedOrganizationId,
        eventId,
        formId: resolvedFormId,
      });
      setConfiguration((current) => configurationFromServer(current, saved.event, saved.form));
      setSaveState("saved");
      return saved;
    } catch (error) {
      setSaveState("error");
      setSaveError(
        error instanceof Error ? error.message : "The CFP configuration could not be saved.",
      );
      return null;
    } finally {
      saveInFlightRef.current = false;
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await saveConfiguration();
  }

  async function requestPublish(): Promise<void> {
    if (saveInFlightRef.current) return;
    setSaveError(null);
    const saved = await saveConfiguration({ validateForPublish: true });
    if (saved === null) return;
    setPreparedPublishVersion(saved.form.version);
    setPublishDialogOpen(true);
  }
  async function handleCloseNow(): Promise<void> {
    setSaveError(null);
    if (!resolvedOrganizationId || !resolvedFormId || configuration.formVersion === undefined) {
      setSaveState("error");
      setSaveError("Save the published CFP configuration before closing it.");
      return;
    }
    if (configuration.status !== "published") {
      setSaveState("error");
      setSaveError("Publish the CFP form before closing it.");
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Close CFP now? This is destructive: new drafts and edits will be locked immediately. Existing submissions remain visible in the speaker dashboard.",
      )
    ) {
      return;
    }

    let closingConfiguration: CfpConfiguration;
    try {
      closingConfiguration = closeCfpNowConfiguration(configuration);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "The CFP could not be closed.");
      return;
    }

    try {
      setSaveState("saving");
      const { event: savedEvent, form: savedForm } = await persistCfpConfiguration(api, {
        configuration: closingConfiguration,
        organizationId: resolvedOrganizationId,
        eventId,
        formId: resolvedFormId,
      });
      setConfiguration((current) => configurationFromServer(current, savedEvent, savedForm));
      setSaveState("saved");
      setSaveError(null);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "The CFP could not be closed.");
    }
  }

  async function handlePublish(expectedVersion: number | null): Promise<void> {
    setSaveError(null);
    if (!resolvedOrganizationId || !resolvedFormId || expectedVersion === null) {
      setSaveState("error");
      setSaveError("The CFP configuration must be saved before publishing.");
      return;
    }
    try {
      setSaveState("saving");
      const published = await api.publishForm({
        organizationId: resolvedOrganizationId,
        eventId,
        formId: resolvedFormId,
        expectedVersion,
      });
      setConfiguration((current) => ({
        ...current,
        id: published.id,
        status: published.status,
        formVersion: published.version,
      }));
      setPreparedPublishVersion(null);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "The CFP form could not be published.");
    }
  }

  function openSection(id: (typeof SECTION_LINKS)[number]["id"]): void {
    const currentIndex = SECTION_LINKS.findIndex((section) => section.id === activeSection);
    const requestedIndex = SECTION_LINKS.findIndex((section) => section.id === id);
    const currentSection = document.getElementById(activeSection);
    const invalidControl = Array.from(
      currentSection?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input, select, textarea",
      ) ?? [],
    ).find((control) => !control.disabled && !control.checkValidity());
    const currentDateError = activeSection === "event-details" ? dateValidationError : null;
    const nextIndex = resolveCfpEditorStepIndex({
      currentIndex,
      requestedIndex,
      currentStepValid: invalidControl === undefined && currentDateError === null,
    });
    if (nextIndex === currentIndex && requestedIndex > currentIndex) {
      if (invalidControl !== undefined) {
        invalidControl.reportValidity();
      } else if (currentDateError !== null) {
        setSaveState("error");
        setSaveError(currentDateError);
      }
      return;
    }
    setActiveSection(SECTION_LINKS[nextIndex]?.id ?? "event-details");
    const scrollContainer = document.getElementById(ORGANIZER_SCROLL_CONTAINER_ID);
    if (scrollContainer === null) {
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      scrollContainer.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function handlePreviewSubmit(): void {
    setPreviewSubmissionKey(previewStateKey);
    window.requestAnimationFrame(() => previewResultRef.current?.focus());
  }

  const configuredFieldForKey = (key: string) =>
    configuration.fields.find((field) => (field.key ?? field.id).toLocaleLowerCase() === key);
  const previewValueForKey = (key: "format" | "track" | "level"): string => {
    const configuredField = configuredFieldForKey(key);
    return configuredField === undefined
      ? previewSelections[key]
      : (previewResponses[configuredField.id] ?? "");
  };
  const previewRuleMatches = ruleMatches(firstRuleCondition(configuration.rule), {
    format: previewValueForKey("format"),
    track: previewValueForKey("track"),
    level: previewValueForKey("level"),
  });
  const visibleFields = configuration.fields.filter(
    (field) =>
      field.visible &&
      ((field.key ?? field.id) !== configuration.ruleTargetField || previewRuleMatches),
  );
  const ruleSummary = summarizeRule(configuration.rule);
  const primaryCondition = firstRuleCondition(configuration.rule);
  const ruleFields = [
    ...configuration.fields.map((field) =>
      field.key === "format"
        ? { ...field, options: configuration.formats }
        : field.key === "track"
          ? { ...field, options: configuration.tracks }
          : field,
    ),
    ...[
      {
        id: "server-format",
        key: "format",
        label: "Format",
        type: "select" as const,
        kind: "select",
        required: false,
        visible: true,
        placeholder: "",
        options: configuration.formats,
      },
      {
        id: "server-track",
        key: "track",
        label: "Track",
        type: "select" as const,
        kind: "select",
        required: false,
        visible: true,
        placeholder: "",
        options: configuration.tracks,
      },
    ].filter((field) => !configuration.fields.some((candidate) => candidate.key === field.key)),
  ];
  const selectedRuleFieldKey = fieldKeyForRuleField(primaryCondition.field, ruleFields);
  const selectedRuleField = ruleFields.find((field) => field.key === selectedRuleFieldKey);
  const selectedRuleOptions = fieldOptionValues(selectedRuleField);
  const activeSectionIndex = Math.max(
    0,
    SECTION_LINKS.findIndex((section) => section.id === activeSection),
  );
  const previewStateKey = JSON.stringify({ configuration, previewResponses });
  const submittedPreviewResult =
    previewSubmissionKey === previewStateKey
      ? {
          confirmationBody: configuration.confirmationBody,
          confirmationTitle: configuration.confirmationTitle,
          successMessage: configuration.successMessage,
        }
      : null;

  if (!resolvedOrganizationId) {
    return (
      <div className={styles.viewport}>
        <section className={styles.pageHeader} role="alert">
          <div>
            <p className={styles.eyebrow}>Organizer workspace</p>
            <h1>Organization scope required</h1>
            <p className={styles.pageIntro}>
              Open this editor from an organization-qualified event route.
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (configurationLoadState !== "ready") {
    return (
      <div className={styles.viewport}>
        <section
          className={styles.pageHeader}
          role={configurationLoadState === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <div>
            <p className={styles.eyebrow}>Organizer workspace / {eventId}</p>
            <h1>
              {configurationLoadState === "error"
                ? "Unable to load CFP configuration"
                : "Loading CFP configuration"}
            </h1>
            <p className={styles.pageIntro}>
              {configurationLoadState === "error"
                ? (saveError ?? "The event and CFP form could not be loaded.")
                : "Loading the authoritative event and form configuration."}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const publicRoute = configuration.slug
    ? getCfpStepRoute(resolvedOrganizationId, configuration.slug, "welcome")
    : null;
  const publicLinkAvailable = publicRoute !== null && configuration.status === "published";

  async function copyPublicLink(): Promise<void> {
    if (
      !publicLinkAvailable ||
      !publicRoute ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    const publicUrl = new URL(publicRoute, window.location.origin).toString();
    await navigator.clipboard.writeText(publicUrl);
    setPublicLinkCopied(true);
    window.setTimeout(() => setPublicLinkCopied(false), 1800);
  }

  return (
    <div className={styles.viewport}>
      <CfpEditorMasthead
        status={
          configuration.status === "published"
            ? "Published"
            : configuration.status === "closed"
              ? "Closed"
              : "Draft"
        }
        metadata={[
          configuration.eventName,
          `${configuration.opensAt} – ${configuration.closesAt}`,
          configuration.timezone,
          `${visibleFields.length} public fields`,
          configuration.adminNotifications ? "Notifications on" : "Notifications off",
        ]}
        error={saveState === "error" ? saveError : null}
        actions={
          <>
            {publicLinkAvailable && publicRoute ? (
              <>
                <button className={styles.secondaryButton} type="button" onClick={copyPublicLink}>
                  {publicLinkCopied ? "Copied" : "Copy public link"}
                </button>
                <a className={styles.secondaryButton} href={publicRoute}>
                  View public form
                </a>
                <span className="sr-only" aria-live="polite">
                  {publicLinkCopied ? "Public CFP link copied to clipboard." : ""}
                </span>
              </>
            ) : null}
            <button
              className={styles.primaryButton}
              type="submit"
              form="cfp-editor-form"
              disabled={saveState === "saving"}
            >
              {saveState === "saving" ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      />

      <CfpSectionNavigation
        activeSection={activeSection}
        sections={SECTION_LINKS}
        onChange={(sectionId) => openSection(sectionId as (typeof SECTION_LINKS)[number]["id"])}
      />

      <div className={styles.workspaceGrid}>
        <form
          id="cfp-editor-form"
          className={styles.editorForm}
          aria-label="Event and CFP configuration"
          noValidate
          onSubmit={handleSave}
        >
          <section
            id="event-details"
            className={styles.panel}
            aria-labelledby="event-details-heading"
            hidden={activeSection !== "event-details"}
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
                <p className={styles.fieldHint}>
                  {publicRoute
                    ? `/cfp/organizations/${resolvedOrganizationId}/events/${configuration.slug}`
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
              <div className={styles.dateRangeGroup}>
                <EventDatePicker
                  mode="range"
                  startsAt={configuration.opensAt}
                  endsAt={configuration.closesAt}
                  scheduleDates={[]}
                  minimumDateTime={minimumCfpDate ? `${minimumCfpDate}T00:00` : undefined}
                  minimumEndDate={configuration.opensAt}
                  dateOnly
                  showModeToggle={false}
                  showTimeControls={false}
                  eyebrow="CFP schedule"
                  title="When is the CFP open?"
                  description="Choose when applicants can submit proposals."
                  startLabel="Open"
                  endLabel="Close"
                  onChange={updateCfpDateRange}
                />
              </div>
              <div className={`${styles.fieldGroup} ${styles.dateRangeGroup}`}>
                <p className={styles.fieldHint}>
                  The close date must be after the open date. Past dates cannot be selected;
                  historical closed dates remain visible and require organizer confirmation before
                  saving.
                </p>
                {dateValidationError !== null ? (
                  <p className={styles.fieldHint} role="alert">
                    {dateValidationError}
                  </p>
                ) : null}
                {closeDatePast ? (
                  <>
                    <p className={styles.fieldHint} role="note">
                      Server-authoritative status: Closed. This CFP is closed to new submissions.
                      Public visitors see the closed portal and speakers cannot edit until an
                      organizer records an audited reopen.
                    </p>
                    <label className={styles.toggleRow}>
                      <input
                        id="confirm-past-close"
                        name="confirmPastClose"
                        type="checkbox"
                        checked={pastCloseAcknowledged}
                        onChange={(event) => {
                          setPastCloseAcknowledged(event.target.checked);
                          setSaveError(null);
                          setSaveState("idle");
                        }}
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
                      onClick={() => void handleCloseNow()}
                      disabled={saveState === "saving"}
                    >
                      Close CFP now
                    </button>
                    <p className={styles.fieldHint}>
                      This immediately records a server-authoritative close instant in the event
                      timezone. New drafts and proposal edits will be locked; existing submissions
                      remain available.
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
                  onChange={(event) =>
                    updateConfiguration("proposalLimit", Number(event.target.value))
                  }
                  aria-describedby="proposal-limit-help"
                />
                <p id="proposal-limit-help" className={styles.fieldHint}>
                  Each account can create between 1 and 100 distinct proposals for this CFP. Editing
                  an existing proposal does not use another slot.
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

          <section
            id="messaging"
            className={styles.panel}
            aria-labelledby="messaging-heading"
            hidden={activeSection !== "messaging"}
          >
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
                <label htmlFor="welcome-title">Form label</label>
                <input
                  id="welcome-title"
                  name="welcomeTitle"
                  required
                  value={configuration.welcomeTitle}
                  onChange={(event) => updateConfiguration("welcomeTitle", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="welcome-body">Welcome message</label>
                <textarea
                  id="welcome-body"
                  name="welcomeBody"
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
                  <label htmlFor="success-message">Supporting success message</label>
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
                <label htmlFor="confirmation-body">Confirmation message</label>
                <textarea
                  id="confirmation-body"
                  name="confirmationBody"
                  rows={3}
                  value={configuration.confirmationBody}
                  onChange={(event) => updateConfiguration("confirmationBody", event.target.value)}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="redirect-url">Next destination URL</label>
                <input
                  id="redirect-url"
                  name="redirectUrl"
                  type="url"
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

          <section
            id="taxonomy"
            className={styles.panel}
            aria-labelledby="taxonomy-heading"
            hidden={activeSection !== "taxonomy"}
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
            <div className={styles.formGrid}>
              <CfpOptionListEditor
                id="tracks"
                label="Tracks"
                description="Route proposals into program areas."
                required
                values={configuration.tracks}
                onChange={(values) => replaceTaxonomyOptions("tracks", values)}
              />
              <CfpOptionListEditor
                id="formats"
                label="Formats"
                description="Define the session formats applicants can propose."
                required
                values={configuration.formats}
                onChange={(values) => replaceTaxonomyOptions("formats", values)}
              />
              <CfpOptionListEditor
                id="levels"
                label="Levels"
                description="Describe the intended audience experience."
                values={configuration.levels}
                onChange={(values) => replaceTaxonomyOptions("levels", values)}
              />
              <CfpOptionListEditor
                id="tags"
                label="Tags"
                description="Add searchable labels for reviewers."
                values={configuration.tags}
                onChange={(values) => replaceTaxonomyOptions("tags", values)}
              />
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
            hidden={activeSection !== "fields-rules"}
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
              <legend>Proposal questions</legend>
              <p className={styles.fieldsetDescription}>
                Configure the questions applicants answer. Technical keys stay stable for
                integrations and conditional logic.
              </p>
              {configuration.fields.map((field, index) => (
                <div className={styles.fieldRuleRow} key={field.id}>
                  <div className={styles.fieldCardHeading}>
                    <div>
                      <span>Question {index + 1}</span>
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
                        onChange={(event) => updateField(field.id, { label: event.target.value })}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label htmlFor={`field-key-${field.id}`}>Field key</label>
                      <input
                        id={`field-key-${field.id}`}
                        pattern="[A-Za-z][A-Za-z0-9_.-]*"
                        value={field.key ?? field.id}
                        onChange={(event) => updateField(field.id, { key: event.target.value })}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label htmlFor={`field-type-${field.id}`}>Field type</label>
                      <select
                        id={`field-type-${field.id}`}
                        value={field.type}
                        onChange={(event) => {
                          const type = editorFieldType(event.target.value);
                          updateField(field.id, {
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
                        <p className={styles.fieldHint}>
                          Accepts PDF, JPEG, PNG, or text files up to 25 MB.
                        </p>
                      ) : null}
                    </div>
                    {field.type === "select" || field.type === "multi_select" ? (
                      <CfpOptionListEditor
                        id={`field-options-${field.id}`}
                        label="Answer options"
                        description="Applicants choose from these options in the public form."
                        required
                        values={fieldOptionValues(field)}
                        onChange={(values) => updateField(field.id, { options: values })}
                      />
                    ) : null}
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
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => removeField(field.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button className={styles.secondaryButton} type="button" onClick={addField}>
                Add custom field
              </button>
            </fieldset>
            {configuration.participantFields && configuration.participantFields.length > 0 ? (
              <fieldset className={`${styles.fieldList} ${styles.identityFields}`}>
                <legend>Applicant identity</legend>
                <p className={styles.fieldsetDescription}>
                  Name and email identify each applicant. Profile questions can be required for the
                  submission without changing the person’s account identity.
                </p>
                {configuration.participantFields.map((field) => (
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
                        onChange={(event) =>
                          setConfiguration((current) => ({
                            ...current,
                            ...(current.participantFields
                              ? {
                                  participantFields: current.participantFields.map((candidate) =>
                                    candidate.id === field.id
                                      ? { ...candidate, required: event.target.checked }
                                      : candidate,
                                  ),
                                }
                              : {}),
                          }))
                        }
                      />
                      Require for applicants
                    </label>
                  </div>
                ))}
              </fieldset>
            ) : null}

            <p className={styles.fieldHint}>
              {configuration.rules?.length ?? 0} published rule
              {(configuration.rules?.length ?? 0) === 1 ? "" : "s"} will be preserved on save.
            </p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="conditional-field">Show when field</label>
                <select
                  id="conditional-field"
                  value={selectedRuleFieldKey}
                  onChange={(event) =>
                    updatePrimaryCondition({
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
                    onChange={(event) => updatePrimaryCondition({ value: event.target.value })}
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
                    onChange={(event) => updatePrimaryCondition({ value: event.target.value })}
                  />
                )}
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="conditional-target">Then show field</label>
                <select
                  id="conditional-target"
                  value={configuration.ruleTargetField ?? ""}
                  onChange={(event) => {
                    const target = configuration.fields.find(
                      (field) => (field.key ?? field.id) === event.target.value,
                    );
                    setConfiguration((current) => ({
                      ...current,
                      ruleTargetField: event.target.value,
                      ruleAction: target ? `show ${target.label}` : current.ruleAction,
                    }));
                    setSaveState("idle");
                  }}
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
                  <RuleTree rule={configuration.rule} />
                </ul>
                <p className={styles.fieldHint}>
                  Existing nested AND/OR groups are preserved when the CFP is saved.
                </p>
              </details>
            </section>
          </section>
        </form>
      </div>

      <section
        id="public-preview"
        className={styles.previewPanel}
        aria-labelledby="public-preview-heading"
        hidden={activeSection !== "public-preview"}
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

        <div className={styles.previewGrid}>
          <section
            className={styles.publicForm}
            aria-label="Public CFP form preview"
            onInput={() => setPreviewSubmissionKey(null)}
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
              {configuredFieldForKey("track") === undefined ? (
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
              ) : null}
              {configuredFieldForKey("format") === undefined ? (
                <div className={styles.previewField}>
                  <label htmlFor="preview-format">Format</label>
                  <select
                    id="preview-format"
                    value={previewSelections.format}
                    onChange={(event) =>
                      setPreviewSelections((current) => ({
                        ...current,
                        format: event.target.value,
                      }))
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
              ) : null}
              {configuredFieldForKey("level") === undefined ? (
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
              ) : null}
            </fieldset>

            <p className={styles.previewRuleNote}>
              Conditional preview: {ruleSummary} → {configuration.ruleAction}.
            </p>
            <button className={styles.primaryButton} onClick={handlePreviewSubmit} type="button">
              Submit preview response
            </button>
            {submittedPreviewResult ? (
              <div
                ref={previewResultRef}
                className={styles.previewSubmissionResult}
                role="status"
                aria-live="polite"
                tabIndex={-1}
              >
                <p className={styles.previewConfirmation}>
                  <strong>{submittedPreviewResult.confirmationTitle}</strong> —{" "}
                  {submittedPreviewResult.confirmationBody}
                </p>
                <p className={styles.previewSuccess}>{submittedPreviewResult.successMessage}</p>
              </div>
            ) : null}
          </section>

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
      <CfpStepActions
        activeSection={activeSection}
        busy={saveState === "saving"}
        sections={SECTION_LINKS}
        saveStatus={
          saveState === "saved"
            ? "All changes saved"
            : saveState === "saving"
              ? "Saving changes…"
              : saveState === "error"
                ? "Save failed"
                : "Changes save when you choose Save changes"
        }
        onBack={() => openSection(SECTION_LINKS[activeSectionIndex - 1]?.id ?? "event-details")}
        onNext={() => {
          const nextSection = SECTION_LINKS[activeSectionIndex + 1];
          if (nextSection !== undefined) openSection(nextSection.id);
        }}
        onFinish={() => void requestPublish()}
      />
      <AlertDialog
        open={publishDialogOpen}
        onOpenChange={(open) => {
          setPublishDialogOpen(open);
          if (!open) setPreparedPublishVersion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this CFP form?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing makes the saved CFP version available to applicants. Confirm only after
              reviewing the form and its dates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveState === "saving"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saveState === "saving"}
              onClick={() => {
                const expectedVersion = preparedPublishVersion;
                setPublishDialogOpen(false);
                void handlePublish(expectedVersion);
              }}
            >
              Publish form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
