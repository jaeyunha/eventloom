"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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

interface FieldProps {
  children: ReactNode;
  errorKey: string;
  errors: ValidationErrors;
  label: string;
  required?: boolean;
}

function Field({ children, errorKey, errors, label, required = false }: FieldProps) {
  const error = errors[errorKey];
  const errorId = error ? `${errorKey.replaceAll(".", "-")}-error` : undefined;

  return (
    <label className={styles.field} data-error-key={errorKey}>
      <span className={styles.label}>
        {label} {required ? <span aria-hidden="true" className={styles.required}>*</span> : null}
      </span>
      {children}
      {error ? (
        <span className={styles.fieldError} id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function ProgressStepper({ currentStep }: { currentStep: CfpStep }) {
  const currentIndex = CFP_STEPS.indexOf(currentStep);

  return (
    <nav aria-label="Submission progress" className={styles.stepper}>
      <ol>
        {CFP_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = step === currentStep;
          return (
            <li aria-current={isCurrent ? "step" : undefined} className={isCurrent ? styles.currentStep : ""} key={step}>
              <span className={isComplete ? styles.completeMarker : styles.stepMarker} aria-hidden="true">
                {isComplete ? "✓" : index + 1}
              </span>
              <span>{STEP_LABELS[step]}</span>
              {index < CFP_STEPS.length - 1 ? <span className={styles.stepArrow} aria-hidden="true">→</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

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

function CharacterCount({ current, maximum }: { current: number; maximum: number }) {
  return <span className={styles.characterCount} aria-live="polite">{current}/{maximum}</span>;
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
      const field = document.querySelector<HTMLElement>(`[data-error-key="${firstKey}"]`);
      field?.focus();
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
        <ProgressStepper currentStep={step} />
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
              <button className={styles.backButton} onClick={goBack} type="button">← Back</button>
            ) : <span />}
            <div className={styles.forwardActions}>
              {step !== "welcome" ? (
                <button className={styles.draftButton} onClick={() => void saveNow()} type="button">Save as draft</button>
              ) : null}
              <button className={styles.primaryButton} type="submit">
                {step === "welcome" ? "Continue →" : null}
                {step === "account" ? "Create account →" : null}
                {step === "submission" ? "Next step →" : null}
                {step === "participants" ? "Continue to review →" : null}
                {step === "review" ? "Submit" : null}
              </button>
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
        <Field errorKey="account.email" errors={errors} label="Your Email Address:" required>
          <input aria-invalid={Boolean(errors["account.email"])} autoComplete="email" onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, email: event.target.value } }))} type="email" value={draft.account.email} />
        </Field>
        <Field errorKey="account.password" errors={errors} label="Create a password:" required>
          <input aria-invalid={Boolean(errors["account.password"])} autoComplete="new-password" onChange={(event) => { setPassword(event.target.value); setPassword(event.target.value); }} type="password" value={password} />
        </Field>
        <ul className={styles.passwordChecks}>
          <PasswordCheck passed={checks.minimumLength}>Password includes at least 8 characters</PasswordCheck>
          <PasswordCheck passed={checks.specialCharacter}>Password includes at least 1 special character</PasswordCheck>
          <PasswordCheck passed={checks.number}>Password includes at least 1 number</PasswordCheck>
          <PasswordCheck passed={checks.capitalLetter}>Password includes at least 1 capital letter</PasswordCheck>
        </ul>
        <div className={styles.twoColumns}>
          <Field errorKey="account.firstName" errors={errors} label="First Name" required>
            <input aria-invalid={Boolean(errors["account.firstName"])} maxLength={255} onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, firstName: event.target.value } }))} value={draft.account.firstName} />
            <CharacterCount current={draft.account.firstName.length} maximum={255} />
          </Field>
          <Field errorKey="account.lastName" errors={errors} label="Last Name" required>
            <input aria-invalid={Boolean(errors["account.lastName"])} maxLength={255} onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, lastName: event.target.value } }))} value={draft.account.lastName} />
            <CharacterCount current={draft.account.lastName.length} maximum={255} />
          </Field>
        </div>
        <label className={styles.consent} data-error-key="account.acceptedTerms">
          <input checked={draft.account.acceptedTerms} onChange={(event) => updateDraft((current) => ({ ...current, account: { ...current.account, acceptedTerms: event.target.checked } }))} type="checkbox" />
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
      <Field errorKey="submission.title" errors={errors} label="Title" required>
        <input aria-invalid={Boolean(errors["submission.title"])} maxLength={255} onChange={(event) => updateDraft((current) => ({ ...current, submission: { ...current.submission, title: event.target.value } }))} value={draft.submission.title} />
        <CharacterCount current={draft.submission.title.length} maximum={255} />
      </Field>
      <Field errorKey="submission.description" errors={errors} label="Description" required>
        <div className={styles.richTextShell}>
          <div aria-label="Text formatting" className={styles.richTextToolbar} role="toolbar">
            <button aria-label="Bold" type="button"><strong>B</strong></button>
            <button aria-label="Italic" type="button"><em>I</em></button>
            <button aria-label="Bulleted list" type="button">☷</button>
            <button aria-label="Insert link" type="button">↗</button>
          </div>
          <textarea aria-invalid={Boolean(errors["submission.description"])} maxLength={5000} onChange={(event) => updateDraft((current) => ({ ...current, submission: { ...current.submission, description: event.target.value } }))} placeholder="Enter text here…" rows={8} value={draft.submission.description} />
          <CharacterCount current={draft.submission.description.length} maximum={5000} />
        </div>
      </Field>
      <SearchableField errorKey="submission.format" errors={errors} label="Format" options={FORMAT_OPTIONS} required value={draft.submission.format} onChange={(value) => updateDraft((current) => ({ ...current, submission: { ...current.submission, format: value } }))} />
      <fieldset className={errors["submission.tags"] ? styles.invalidFieldset : styles.tagFieldset} data-error-key="submission.tags">
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
  const listId = `${errorKey.replaceAll(".", "-")}-options`;
  return (
    <Field errorKey={errorKey} errors={errors} label={label} required={required}>
      <input aria-invalid={Boolean(errors[errorKey])} autoComplete="off" list={listId} onChange={(event) => onChange(event.target.value)} placeholder="Search or select…" value={value} />
      <datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist>
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
        <button className={styles.addButton} disabled={draft.participants.length >= 15} onClick={addParticipant} type="button">＋ Add participant</button>
      </div>
      {errors.participants ? <p className={styles.fieldError} role="alert">{errors.participants}</p> : null}
      {draft.participants.map((participant, index) => (
        <section className={styles.participantCard} key={participant.id}>
          <div className={styles.participantCardHeading}>
            <h2>Participant {index + 1} of {draft.participants.length}</h2>
            {index > 0 ? <button className={styles.removeButton} onClick={() => updateDraft((current) => ({ ...current, participants: current.participants.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Remove</button> : null}
          </div>
          <Field errorKey={`participants.${index}.role`} errors={errors} label="Role for this participant">
            <select onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { role: event.target.value as CfpParticipant["role"] }))} value={participant.role}>
              <option>Speaker</option><option>Co-speaker</option><option>Moderator</option>
            </select>
          </Field>
          <div className={styles.twoColumns}>
            <Field errorKey={`participants.${index}.firstName`} errors={errors} label="First Name" required>
              <input aria-invalid={Boolean(errors[`participants.${index}.firstName`])} maxLength={255} onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { firstName: event.target.value }))} value={participant.firstName} />
            </Field>
            <Field errorKey={`participants.${index}.lastName`} errors={errors} label="Last Name" required>
              <input aria-invalid={Boolean(errors[`participants.${index}.lastName`])} maxLength={255} onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { lastName: event.target.value }))} value={participant.lastName} />
            </Field>
          </div>
          <Field errorKey={`participants.${index}.email`} errors={errors} label="Email" required>
            <input aria-invalid={Boolean(errors[`participants.${index}.email`])} onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { email: event.target.value }))} type="email" value={participant.email} />
          </Field>
          <Field errorKey={`participants.${index}.mobilePhone`} errors={errors} label="Mobile Phone">
            <input autoComplete="tel" onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { mobilePhone: event.target.value }))} placeholder="+1" type="tel" value={participant.mobilePhone} />
          </Field>
          <Field errorKey={`participants.${index}.biography`} errors={errors} label="Biography">
            <div className={styles.richTextShell}>
              <textarea maxLength={5000} onChange={(event) => updateDraft((current) => mergeParticipant(current, index, { biography: event.target.value }))} placeholder="Tell us a bit about yourself" rows={6} value={participant.biography} />
              <CharacterCount current={participant.biography.length} maximum={5000} />
            </div>
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
      <button className={styles.textButton} onClick={addContact} type="button">＋ Add Secondary Contact</button>
      <p>Secondary contacts can assist with tasks and communication.</p>
      {draft.secondaryContacts.map((contact, index) => (
        <div className={styles.contactCard} key={contact.id}>
          <div className={styles.participantCardHeading}><h2>Secondary contact {index + 1}</h2><button className={styles.removeButton} onClick={() => updateDraft((current) => ({ ...current, secondaryContacts: current.secondaryContacts.filter((_, itemIndex) => itemIndex !== index) }))} type="button">Remove</button></div>
          <div className={styles.twoColumns}>
            <Field errorKey={`secondaryContacts.${index}.firstName`} errors={errors} label="First Name" required><input onChange={(event) => updateDraft((current) => mergeSecondaryContact(current, index, { firstName: event.target.value }))} value={contact.firstName} /></Field>
            <Field errorKey={`secondaryContacts.${index}.lastName`} errors={errors} label="Last Name" required><input onChange={(event) => updateDraft((current) => mergeSecondaryContact(current, index, { lastName: event.target.value }))} value={contact.lastName} /></Field>
          </div>
          <Field errorKey={`secondaryContacts.${index}.email`} errors={errors} label="Email" required><input onChange={(event) => updateDraft((current) => mergeSecondaryContact(current, index, { email: event.target.value }))} type="email" value={contact.email} /></Field>
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
        <div className={styles.reviewHeading}><h2>Tell us about your submission</h2><button className={styles.textButton} onClick={() => router.push(getCfpStepRoute(eventSlug, "submission"))} type="button">✎ Edit session</button></div>
        <ReviewValue label="Title" value={draft.submission.title} />
        <ReviewValue label="Description" value={draft.submission.description} />
        <ReviewValue label="Format" value={draft.submission.format} />
        <ReviewValue label="Tags" value={draft.submission.tags.join(", ")} />
        <ReviewValue label="Track" value={draft.submission.track} />
        <ReviewValue label="Level" value={draft.submission.level || "Not specified"} />
        <ReviewValue label="Language" value={draft.submission.language || "Not specified"} />
      </section>
      <section className={styles.reviewCard}>
        <div className={styles.reviewHeading}><h2>Tell us about you</h2><button className={styles.textButton} onClick={() => router.push(getCfpStepRoute(eventSlug, "participants"))} type="button">✎ Edit participants</button></div>
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
  return <div className={styles.reviewValue}><dt>{label}</dt><dd>{value}</dd></div>;
}

export function CfpComplete({ eventSlug }: { eventSlug: string }) {
  const router = useRouter();
  return (
    <main className={styles.viewport}>
      <section className={`${styles.card} ${styles.completeCard}`}>
        <div aria-hidden="true" className={styles.successMarker}>✓</div>
        <h1>Thank you for submitting to present at our event!</h1>
        <p>You will receive a confirmation email shortly with a link to your speaker portal. We will review sessions and notify you when your status changes.</p>
        <p>Your speaker portal shows your submission and any tasks that need to be completed.</p>
        <button className={styles.textButton} onClick={() => router.push(getCfpStepRoute(eventSlug, "welcome"))} type="button">Submit another session</button>
        <button className={styles.primaryButton} onClick={() => router.push("/portal")} type="button">Continue to portal →</button>
      </section>
    </main>
  );
}
