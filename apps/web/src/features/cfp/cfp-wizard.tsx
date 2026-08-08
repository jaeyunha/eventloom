"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { CharacterCount, Field, Input, Select } from "../../components/ui/field";
import { RichTextArea } from "../../components/ui/rich-text";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { Stepper } from "../../components/ui/stepper";
import { BrowserCfpDraftPersistence, type CfpDraftPersistence } from "./draft-persistence";
import { getCfpStepRoute, getNextCfpStep, getPreviousCfpStep } from "./routes";
import {
  CFP_STEPS,
  type CfpDraft,
  type CfpParticipant,
  type CfpSecondaryContact,
  type CfpStep,
  createEmptyDraft,
  createEmptyParticipant,
  markDraftSubmitted,
  syncPrimaryParticipant,
} from "./types";
import {
  type ValidationErrors,
  getFirstInvalidStep,
  getPasswordChecks,
  validateStep,
} from "./validation";
import styles from "./cfp-wizard.module.css";

const STEP_LABELS: Record<CfpStep, string> = {
  welcome: "Welcome!",
  account: "Account",
  submission: "Submission",
  participants: "Participant",
  review: "Review",
};

const FORMAT_OPTIONS = ["Featured Keynote", "Breakout Session", "Panel", "Workshop"];
const TRACK_OPTIONS = ["Track 1", "Track 2", "Track 3", "Community"];
const LEVEL_OPTIONS = ["Introductory", "Intermediate", "Advanced", "All levels"];
const LANGUAGE_OPTIONS = ["English"];
const TAG_OPTIONS = ["Tag A", "Tag B", "Tag C", "Leadership"];

interface CfpWizardProps {
  eventSlug: string;
  step: CfpStep;
}

const WIZARD_STEPS = CFP_STEPS.map((step) => ({
  id: step,
  label: STEP_LABELS[step],
}));

function ErrorSummary({ errors }: { errors: ValidationErrors }) {
  const messages = [...new Set(Object.values(errors))];
  if (messages.length === 0) return null;

  return (
    <div className={styles.errorSummary} role="alert" tabIndex={-1}>
      <strong>Check the highlighted fields.</strong>
      <ul>
        {messages.map((message) => <li key={message}>{message}</li>)}
      </ul>
    </div>
  );
}


function newId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function mergeParticipant(draft: CfpDraft, index: number, patch: Partial<CfpParticipant>): CfpDraft {
  return {
    ...draft,
    participants: draft.participants.map((participant, participantIndex) =>
      participantIndex === index ? { ...participant, ...patch } : participant,
    ),
  };
}

function mergeSecondaryContact(draft: CfpDraft, index: number, patch: Partial<CfpSecondaryContact>): CfpDraft {
  return {
    ...draft,
    secondaryContacts: draft.secondaryContacts.map((contact, contactIndex) =>
      contactIndex === index ? { ...contact, ...patch } : contact,
    ),
  };
}

export function CfpWizard({ eventSlug, step }: CfpWizardProps) {
  const router = useRouter();
  const initialDraft = useMemo(() => createEmptyDraft(eventSlug), [eventSlug]);
  const [draft, setDraft] = useState<CfpDraft>(initialDraft);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const persistenceRef = useRef<CfpDraftPersistence | null>(null);

  useEffect(() => {
    let active = true;
    const persistence = new BrowserCfpDraftPersistence(window.localStorage);
    persistenceRef.current = persistence;
    void persistence.load(eventSlug).then((savedDraft) => {
      if (!active) return;
      setDraft(savedDraft ?? initialDraft);
      setHydrated(true);
    }).catch(() => {
      if (!active) return;
      setSaveState("error");
      setHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [eventSlug, initialDraft]);

  useEffect(() => {
    if (!hydrated || !persistenceRef.current) return;
    const persistence = persistenceRef.current;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void persistence.save(draft).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated]);

  function updateDraft(update: (current: CfpDraft) => CfpDraft): void {
    setDraft((current) => ({ ...update(current), updatedAt: new Date().toISOString() }));
    setErrors({});
    setSaveState("idle");
  }

  async function saveAndNavigate(nextDraft: CfpDraft, targetStep: CfpStep | "complete"): Promise<void> {
    setDraft(nextDraft);
    try {
      setSaveState("saving");
      await persistenceRef.current?.save(nextDraft);
      setSaveState("saved");
      router.push(getCfpStepRoute(eventSlug, targetStep));
    } catch {
      setSaveState("error");
    }
  }

  function focusFirstError(nextErrors: ValidationErrors): void {
    const firstKey = Object.keys(nextErrors)[0];
    if (!firstKey) return;
    window.setTimeout(() => {
      document.getElementById(firstKey)?.focus();
    });
  }

  async function continueFlow(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nextErrors = validateStep(step, draft, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }

    let nextDraft = draft;
    if (step === "account") nextDraft = syncPrimaryParticipant(draft);
    if (step === "review") {
      const invalidStep = getFirstInvalidStep(draft);
      if (invalidStep) {
        router.push(getCfpStepRoute(eventSlug, invalidStep));
        return;
      }
      nextDraft = markDraftSubmitted(draft, newId("submission"));
    }

    await saveAndNavigate(nextDraft, getNextCfpStep(step));
  }

  async function saveNow(): Promise<void> {
    try {
      setSaveState("saving");
      await persistenceRef.current?.save(draft);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function goBack(): void {
    const previous = getPreviousCfpStep(step);
    if (previous) router.push(getCfpStepRoute(eventSlug, previous));
  }

  if (!hydrated) {
    return (
      <main className={styles.viewport}>
        <section aria-busy="true" aria-live="polite" className={styles.card}>
          <p className={styles.loading}>Loading your submission draft…</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.viewport}>
      <section className={styles.card}>
        <Stepper currentStep={step} label="Submission progress" steps={WIZARD_STEPS} />
        <div className={styles.limitBanner}>Submission Limit: 3 submissions per user</div>
        <ErrorSummary errors={errors} />
        <form noValidate onSubmit={(event) => void continueFlow(event)}>
          {step === "welcome" ? <WelcomeStep /> : null}
          {step === "account" ? (
            <AccountStep draft={draft} errors={errors} password={password} setPassword={setPassword} updateDraft={updateDraft} />
          ) : null}
          {step === "submission" ? (
            <SubmissionStep draft={draft} errors={errors} updateDraft={updateDraft} />
          ) : null}
          {step === "participants" ? (
            <ParticipantsStep draft={draft} errors={errors} updateDraft={updateDraft} />
          ) : null}
          {step === "review" ? (
            <ReviewStep draft={draft} eventSlug={eventSlug} />
          ) : null}

          <div className={styles.actions}>
            {step !== "welcome" ? (
              <Button className={styles.backButton} onClick={goBack} variant="accent">← Back</Button>
            ) : <span />}
            <div className={styles.forwardActions}>
              {step !== "welcome" ? (
                <Button className={styles.draftButton} onClick={() => void saveNow()} variant="secondary">Save as draft</Button>
              ) : null}
              <Button className={styles.primaryButton} type="submit">
                {step === "welcome" ? "Continue →" : null}
                {step === "account" ? "Create account →" : null}
                {step === "submission" ? "Next step →" : null}
                {step === "participants" ? "Continue to review →" : null}
                {step === "review" ? "Submit" : null}
              </Button>
            </div>
          </div>
        </form>
        {step !== "welcome" ? (
          <div className={styles.sessionFooter}>
            You are logged in as {draft.account.firstName || "Speaker"} {draft.account.lastName} ({draft.account.email || "email pending"}).
          </div>
        ) : null}
        <p aria-live="polite" className={saveState === "error" ? styles.saveError : styles.saveStatus}>
          {saveState === "saving" ? "Saving draft…" : null}
          {saveState === "saved" ? "Draft saved" : null}
          {saveState === "error" ? "Draft could not be saved. Check browser storage and try again." : null}
        </p>
      </section>
    </main>
  );
}

function WelcomeStep() {
  return (
    <div className={styles.welcomeContent}>
      <h1>Welcome to our event!</h1>
      <h2>Call for Speakers</h2>
      <p>Our event welcomes leaders, practitioners, and change-makers from around the world to collaborate and learn from one another. Sessions for our agenda will be selected from these submissions.</p>
      <p>Use this form to propose a topic. Your speaker portal will show the status of your submission and any tasks assigned after acceptance.</p>
      <h2>Helpful Tips and Important Information</h2>
      <ul>
        <li><a href="#speaker-agreement">Speaker Agreement Terms and Conditions</a></li>
        <li><a href="#application-faq">FAQs for the Speaker Application Process</a></li>
        <li><a href="#speaker-resources">Speaker Tips and Resources Guide</a></li>
      </ul>
      <h2>Dates and Deadlines</h2>
      <ul>
        <li>Call for Speakers opens August 10, 2026.</li>
        <li>Presentation submissions are due September 15, 2026 at 11:59 PM ET.</li>
        <li>Late submissions cannot be accepted.</li>
      </ul>
    </div>
  );
}

interface StepFormProps {
  draft: CfpDraft;
  errors: ValidationErrors;
  updateDraft: (update: (current: CfpDraft) => CfpDraft) => void;
}

function AccountStep({ draft, errors, password, setPassword, updateDraft }: StepFormProps & { password: string; setPassword: (value: string) => void }) {
  const checks = getPasswordChecks(password);
  return (
    <div>
      <h1>Create account</h1>
      <div className={styles.sectionPanel}>
        <Field error={errors["account.email"]} label="Your Email Address:" name="account.email" required>
          {(controlProps) => (
            <Input {...controlProps} autoComplete="email" onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, email: event.target.value } }))} type="email" value={draft.account.email} />
          )}
        </Field>
        <Field error={errors["account.password"]} label="Create a password:" name="account.password" required>
          {(controlProps) => (
            <Input {...controlProps} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          )}
        </Field>
        <ul className={styles.passwordChecks}>
          <PasswordCheck passed={checks.minimumLength}>Password includes at least 8 characters</PasswordCheck>
          <PasswordCheck passed={checks.specialCharacter}>Password includes at least 1 special character</PasswordCheck>
          <PasswordCheck passed={checks.number}>Password includes at least 1 number</PasswordCheck>
          <PasswordCheck passed={checks.capitalLetter}>Password includes at least 1 capital letter</PasswordCheck>
        </ul>
        <div className={styles.twoColumns}>
          <Field error={errors["account.firstName"]} label="First Name" name="account.firstName" required>
            {(controlProps) => (
              <>
                <Input {...controlProps} maxLength={255} onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, firstName: event.target.value } }))} value={draft.account.firstName} />
                <CharacterCount current={draft.account.firstName.length} maximum={255} />
              </>
            )}
          </Field>
          <Field error={errors["account.lastName"]} label="Last Name" name="account.lastName" required>
            {(controlProps) => (
              <>
                <Input {...controlProps} maxLength={255} onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, lastName: event.target.value } }))} value={draft.account.lastName} />
                <CharacterCount current={draft.account.lastName.length} maximum={255} />
              </>
            )}
          </Field>
        </div>
        <label className={styles.consent} data-error-key="account.acceptedTerms">
          <input aria-invalid={Boolean(errors["account.acceptedTerms"])} checked={draft.account.acceptedTerms} id="account.acceptedTerms" onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, acceptedTerms: event.target.checked } }))} type="checkbox" />
          <span>I agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>. <span aria-hidden="true" className={styles.required}>*</span></span>
        </label>
        {errors["account.acceptedTerms"] ? <span className={styles.fieldError} role="alert">{errors["account.acceptedTerms"]}</span> : null}
      </div>
    </div>
  );
}

function PasswordCheck({ children, passed }: { children: ReactNode; passed: boolean }) {
  return <li className={passed ? styles.checkPassed : styles.checkPending}><span aria-hidden="true">{passed ? "✓" : "×"}</span> {children}</li>;
}

function SubmissionStep({ draft, errors, updateDraft }: StepFormProps) {
  function toggleTag(tag: string): void {
    updateDraft((current) => ({
      ...current,
      submission: {
        ...current.submission,
        tags: current.submission.tags.includes(tag)
          ? current.submission.tags.filter((item) => item !== tag)
          : [...current.submission.tags, tag],
      },
    }));
  }

  return (
    <div>
      <h1>Tell us about your submission</h1>
      <p>What do you want to present? Fill out the following information to tell us more.</p>
      <Field error={errors["submission.title"]} label="Title" name="submission.title" required>
        {(controlProps) => (
          <>
            <Input {...controlProps} maxLength={255} onChange={(event) => updateDraft((current) => ({ ...current, submission: { ...current.submission, title: event.target.value } }))} value={draft.submission.title} />
            <CharacterCount current={draft.submission.title.length} maximum={255} />
          </>
        )}
      </Field>
      <Field error={errors["submission.description"]} label="Description" name="submission.description" required>
        {(controlProps) => (
          <RichTextArea
            {...controlProps}
            maxLength={5000}
            onValueChange={(value) => updateDraft((current) => ({ ...current, submission: { ...current.submission, description: value } }))}
            placeholder="Enter text here…"
            rows={8}
            value={draft.submission.description}
          />
        )}
      </Field>
      <SearchableField errorKey="submission.format" errors={errors} label="Format" options={FORMAT_OPTIONS} required value={draft.submission.format} onChange={(value) => updateDraft((current) => ({ ...current, submission: { ...current.submission, format: value } }))} />
      <fieldset className={errors["submission.tags"] ? styles.invalidFieldset : styles.tagFieldset} id="submission.tags" tabIndex={-1}>
        <legend>Tags <span aria-hidden="true" className={styles.required}>*</span></legend>
        <div className={styles.tagOptions}>
          {TAG_OPTIONS.map((tag) => <label key={tag}><input checked={draft.submission.tags.includes(tag)} onChange={() => toggleTag(tag)} type="checkbox" /> {tag}</label>)}
        </div>
        {errors["submission.tags"] ? <span className={styles.fieldError} role="alert">{errors["submission.tags"]}</span> : null}
      </fieldset>
      <SearchableField errorKey="submission.track" errors={errors} label="Track" options={TRACK_OPTIONS} required value={draft.submission.track} onChange={(value) => updateDraft((current) => ({ ...current, submission: { ...current.submission, track: value } }))} />
      <SearchableField errorKey="submission.level" errors={errors} label="Level" options={LEVEL_OPTIONS} value={draft.submission.level} onChange={(value) => updateDraft((current) => ({ ...current, submission: { ...current.submission, level: value } }))} />
      <SearchableField errorKey="submission.language" errors={errors} label="Language" options={LANGUAGE_OPTIONS} value={draft.submission.language} onChange={(value) => updateDraft((current) => ({ ...current, submission: { ...current.submission, language: value } }))} />
    </div>
  );
}

function SearchableField({ errorKey, errors, label, onChange, options, required = false, value }: { errorKey: string; errors: ValidationErrors; label: string; onChange: (value: string) => void; options: string[]; required?: boolean; value: string }) {
  return (
    <Field error={errors[errorKey]} label={label} name={errorKey} required={required}>
      {(controlProps) => (
        <SearchableSelect
          {...(controlProps["aria-describedby"] ? { describedBy: controlProps["aria-describedby"] } : {})}
          id={controlProps.id}
          invalid={Boolean(controlProps["aria-invalid"])}
          onValueChange={onChange}
          options={options.map((option) => ({ label: option, value: option }))}
          placeholder="Search or select…"
          required={required}
          value={value}
        />
      )}
    </Field>
  );
}

function ParticipantsStep({ draft, errors, updateDraft }: StepFormProps) {
  function addParticipant(): void {
    if (draft.participants.length >= 15) return;
    updateDraft((current) => ({ ...current, participants: [...current.participants, createEmptyParticipant(newId("participant"), "Co-speaker")] }));
  }

  return (
    <div>
      <div className={styles.participantHeading}>
        <div><h1>Tell us about you</h1><p>Give us information about yourself and your credentials for presenting at our event.</p></div>
        <Button className={styles.addButton} disabled={draft.participants.length >= 15} onClick={addParticipant} size="small" variant="secondary">＋ Add participant</Button>
      </div>
      {errors.participants ? <p className={styles.fieldError} id="participants" role="alert" tabIndex={-1}>{errors.participants}</p> : null}
      {draft.participants.map((participant, index) => (
        <section className={styles.participantCard} key={participant.id}>
          <div className={styles.participantCardHeading}>
            <h2>Participant {index + 1} of {draft.participants.length}</h2>
            {index > 0 ? <Button className={styles.removeButton} onClick={() => updateDraft((current) => ({ ...current, participants: current.participants.filter((_, itemIndex) => itemIndex !== index) }))} size="small" variant="ghost">Remove</Button> : null}
          </div>
          <Field label="Role for this participant" name={`participants.${index}.role`}>
            {(controlProps) => (
              <Select {...controlProps} onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { role: event.target.value as CfpParticipant["role"] }))} value={participant.role}>
                <option>Speaker</option><option>Co-speaker</option><option>Moderator</option>
              </Select>
            )}
          </Field>
          <div className={styles.twoColumns}>
            <Field error={errors[`participants.${index}.firstName`]} label="First Name" name={`participants.${index}.firstName`} required>
              {(controlProps) => (
                <Input {...controlProps} maxLength={255} onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { firstName: event.target.value }))} value={participant.firstName} />
              )}
            </Field>
            <Field error={errors[`participants.${index}.lastName`]} label="Last Name" name={`participants.${index}.lastName`} required>
              {(controlProps) => (
                <Input {...controlProps} maxLength={255} onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { lastName: event.target.value }))} value={participant.lastName} />
              )}
            </Field>
          </div>
          <Field error={errors[`participants.${index}.email`]} label="Email" name={`participants.${index}.email`} required>
            {(controlProps) => (
              <Input {...controlProps} onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { email: event.target.value }))} type="email" value={participant.email} />
            )}
          </Field>
          <Field label="Mobile Phone" name={`participants.${index}.mobilePhone`}>
            {(controlProps) => (
              <Input {...controlProps} autoComplete="tel" onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { mobilePhone: event.target.value }))} placeholder="+1" type="tel" value={participant.mobilePhone} />
            )}
          </Field>
          <Field error={errors[`participants.${index}.biography`]} label="Biography" name={`participants.${index}.biography`}>
            {(controlProps) => (
              <RichTextArea
                {...controlProps}
                maxLength={5000}
                onValueChange={(value) => updateDraft((current) => mergeParticipant(current, index, { biography: value }))}
                placeholder="Tell us a bit about yourself"
                rows={6}
                value={participant.biography}
              />
            )}
          </Field>
        </section>
      ))}
      <SecondaryContacts draft={draft} errors={errors} updateDraft={updateDraft} />
    </div>
  );
}

function SecondaryContacts({ draft, errors, updateDraft }: StepFormProps) {
  function addContact(): void {
    const contact: CfpSecondaryContact = { id: newId("contact"), firstName: "", lastName: "", email: "" };
    updateDraft((current) => ({ ...current, secondaryContacts: [...current.secondaryContacts, contact] }));
  }

  return (
    <section className={styles.secondaryContacts}>
      <Button className={styles.textButton} onClick={addContact} size="small" variant="ghost">＋ Add Secondary Contact</Button>
      <p>Secondary contacts can assist with tasks and communication.</p>
      {draft.secondaryContacts.map((contact, index) => (
        <div className={styles.contactCard} key={contact.id}>
          <div className={styles.participantCardHeading}><h2>Secondary contact {index + 1}</h2><Button className={styles.removeButton} onClick={() => updateDraft((current) => ({ ...current, secondaryContacts: current.secondaryContacts.filter((_, itemIndex) => itemIndex !== index) }))} size="small" variant="ghost">Remove</Button></div>
          <div className={styles.twoColumns}>
            <Field error={errors[`secondaryContacts.${index}.firstName`]} label="First Name" name={`secondaryContacts.${index}.firstName`} required>{(controlProps) => <Input {...controlProps} onChange={(event) => updateDraft((current) => mergeSecondaryContact(current, index, { firstName: event.target.value }))} value={contact.firstName} />}</Field>
            <Field error={errors[`secondaryContacts.${index}.lastName`]} label="Last Name" name={`secondaryContacts.${index}.lastName`} required>{(controlProps) => <Input {...controlProps} onChange={(event) => updateDraft((current) => mergeSecondaryContact(current, index, { lastName: event.target.value }))} value={contact.lastName} />}</Field>
          </div>
          <Field error={errors[`secondaryContacts.${index}.email`]} label="Email" name={`secondaryContacts.${index}.email`} required>{(controlProps) => <Input {...controlProps} onChange={(event) => updateDraft((current) => mergeSecondaryContact(current, index, { email: event.target.value }))} type="email" value={contact.email} />}</Field>
        </div>
      ))}
    </section>
  );
}

function ReviewStep({ draft, eventSlug }: { draft: CfpDraft; eventSlug: string }) {
  const router = useRouter();
  return (
    <div>
      <h1>Review your submission</h1>
      <p>Check that everything looks correct. You can go back to make changes before submitting.</p>
      <section className={styles.reviewCard}>
        <div className={styles.reviewHeading}><h2>Tell us about your submission</h2><Button className={styles.textButton} onClick={() => router.push(getCfpStepRoute(eventSlug, "submission"))} size="small" variant="ghost">✎ Edit session</Button></div>
        <ReviewValue label="Title" value={draft.submission.title} />
        <ReviewValue label="Description" value={draft.submission.description} />
        <ReviewValue label="Format" value={draft.submission.format} />
        <ReviewValue label="Tags" value={draft.submission.tags.join(", ")} />
        <ReviewValue label="Track" value={draft.submission.track} />
        <ReviewValue label="Level" value={draft.submission.level || "Not specified"} />
        <ReviewValue label="Language" value={draft.submission.language || "Not specified"} />
      </section>
      <section className={styles.reviewCard}>
        <div className={styles.reviewHeading}><h2>Tell us about you</h2><Button className={styles.textButton} onClick={() => router.push(getCfpStepRoute(eventSlug, "participants"))} size="small" variant="ghost">✎ Edit participants</Button></div>
        {draft.participants.map((participant) => (
          <div className={styles.reviewParticipant} key={participant.id}>
            <h3>{participant.firstName} {participant.lastName} <span>{participant.role}</span></h3>
            <ReviewValue label="Email" value={participant.email} />
            <ReviewValue label="Mobile Phone" value={participant.mobilePhone || "Not provided"} />
            <ReviewValue label="Biography" value={participant.biography || "Not provided"} />
          </div>
        ))}
      </section>
    </div>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return <dl className={styles.reviewValue}><dt>{label}</dt><dd>{value}</dd></dl>;
}

export function CfpComplete({ eventSlug }: { eventSlug: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    const persistence = new BrowserCfpDraftPersistence(window.localStorage);
    void persistence.load(eventSlug).then((draft) => {
      if (!active) return;
      if (!draft?.receipt) {
        router.replace(getCfpStepRoute(eventSlug, "review"));
        return;
      }
      setConfirmed(true);
    }).catch(() => router.replace(getCfpStepRoute(eventSlug, "review")));

    return () => {
      active = false;
    };
  }, [eventSlug, router]);

  if (!confirmed) {
    return (
      <main className={styles.viewport}>
        <section aria-busy="true" aria-live="polite" className={styles.card}>
          <p className={styles.loading}>Confirming your submission…</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.viewport}>
      <section className={`${styles.card} ${styles.completeCard}`}>
        <div aria-hidden="true" className={styles.successMarker}>✓</div>
        <h1>Thank you for submitting to present at our event!</h1>
        <p>You will receive a confirmation email shortly with a link to your speaker portal. We will review sessions and notify you when your status changes.</p>
        <p>Your speaker portal shows your submission and any tasks that need to be completed.</p>
        <Button className={styles.textButton} onClick={() => router.push(getCfpStepRoute(eventSlug, "welcome"))} variant="ghost">Submit another session</Button>
        <Button className={styles.primaryButton} onClick={() => router.push("/portal")}>Continue to portal →</Button>
      </section>
    </main>
  );
}
