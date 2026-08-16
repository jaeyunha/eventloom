import type { SubmissionReviewMaterial } from "../features/evaluations/types";

const REVIEWER_NAMES = [
  "Local Reviewer",
  "Morgan Chen",
  "Priya Shah",
  "Diego Morales",
  "Amina Yusuf",
  "Jordan Kim",
  "Sofia Rossi",
  "Noah Williams",
  "Mei Tanaka",
  "Lucas Ferreira",
  "Fatima Zahra",
  "Ethan Brooks",
  "Nia Okafor",
  "Oliver Jensen",
  "Camila Torres",
  "Samira Haddad",
  "Theo Martin",
  "Anika Patel",
  "Mateo Silva",
  "Grace Liu",
  "Idris Bello",
  "Elena Petrova",
  "Jonas Berg",
  "Rina Sato",
] as const;
const TOPICS = [
  "Reliable community systems",
  "Developer platforms that teams trust",
  "Designing inclusive product rituals",
  "Practical AI governance",
  "Scaling data quality",
  "Leading through organizational change",
  "Accessible interfaces by default",
  "Sustainable open-source communities",
  "Incident learning without blame",
  "Measuring product outcomes",
  "Security for small engineering teams",
  "Building resilient event programs",
] as const;
const TITLE_OUTCOMES = [
  "that scale",
  "under pressure",
  "without slowing delivery",
  "for distributed teams",
  "with measurable outcomes",
  "that earn trust",
] as const;
const TITLE_QUALIFIERS = [
  "in practice",
  "from first principles",
  "for real-world teams",
  "without the hand-waving",
  "with lessons from the field",
] as const;
const TRACKS = [
  "Platform & Infrastructure",
  "Product & Design",
  "Leadership & Teams",
  "Data & AI",
  "Community & Ecosystems",
] as const;
const FORMATS = ["Featured Keynote", "Keynote", "Breakout Session", "Workshop"] as const;
const LEVELS = ["Introductory", "Intermediate", "Advanced", "All levels"] as const;
const FIRST_NAMES = [
  "Alex",
  "Taylor",
  "Mina",
  "Omar",
  "Leila",
  "Jun",
  "Nora",
  "Mateo",
  "Zoe",
  "Ravi",
  "Iris",
  "Kai",
] as const;
const LAST_NAMES = [
  "Rivera",
  "Kim",
  "Patel",
  "Chen",
  "Garcia",
  "Okafor",
  "Haddad",
  "Silva",
  "Nguyen",
  "Martin",
  "Jensen",
  "Shah",
] as const;

export interface LocalReviewScenarioReviewer {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly sessionToken: string;
}

export const LOCAL_REVIEW_SCENARIO_REVIEWERS: readonly LocalReviewScenarioReviewer[] =
  REVIEWER_NAMES.map((name, index) => {
    const ordinal = String(index + 1).padStart(2, "0");
    return {
      id: index === 0 ? "local-reviewer" : `local-reviewer-${ordinal}`,
      email:
        index === 0 ? "reviewer@local.eventloom.test" : `reviewer${ordinal}@local.eventloom.test`,
      name,
      password: "reviewer-local",
      sessionToken: index === 0 ? "local-reviewer-session" : `local-reviewer-session-${ordinal}`,
    };
  });

export interface LocalSubmissionScenario {
  readonly ownerAccountId: string;
  readonly title: string;
  readonly abstract: string;
  readonly answers: Readonly<Record<string, string>>;
  readonly participant: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly biography: string;
  };
}

export function localSubmissionScenario(index: number): LocalSubmissionScenario {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("Local submission scenario index must be a non-negative integer.");
  }
  const number = index + 1;
  const topic = TOPICS[index % TOPICS.length] ?? TOPICS[0];
  const track = TRACKS[index % TRACKS.length] ?? TRACKS[0];
  const format = FORMATS[(index * 3) % FORMATS.length] ?? FORMATS[0];
  const level = LEVELS[(index * 5) % LEVELS.length] ?? LEVELS[0];
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length] ?? FIRST_NAMES[0];
  const lastName = LAST_NAMES[(index * 7) % LAST_NAMES.length] ?? LAST_NAMES[0];
  const outcome =
    TITLE_OUTCOMES[(index + Math.floor(index / TOPICS.length)) % TITLE_OUTCOMES.length] ??
    TITLE_OUTCOMES[0];
  const qualifier =
    TITLE_QUALIFIERS[
      Math.floor(index / (TOPICS.length * TITLE_OUTCOMES.length)) % TITLE_QUALIFIERS.length
    ] ?? TITLE_QUALIFIERS[0];
  const title =
    index === 0 ? "Designing reliable community systems" : `${topic} ${outcome} ${qualifier}`;
  const abstract =
    `${firstName} ${lastName} shares a field-tested approach to ${topic.toLowerCase()}. ` +
    `Attendees leave with concrete decisions, facilitation patterns, and failure signals for ${track}.`;
  return {
    ownerAccountId: `local-applicant-${String(number).padStart(3, "0")}`,
    title,
    abstract,
    answers: { title, abstract, format, level, track },
    participant: {
      id: `local-participant-${String(number).padStart(3, "0")}`,
      firstName,
      lastName,
      email: `speaker${String(number).padStart(3, "0")}@local.eventloom.test`,
      biography: `${firstName} works on ${track.toLowerCase()} and teaches through practical examples.`,
    },
  };
}

export function submissionReviewMaterial(
  id: string,
  scenario: LocalSubmissionScenario,
): SubmissionReviewMaterial {
  return {
    id,
    tenantId: "local-organization",
    eventId: "demo-event",
    status: "submitted",
    title: scenario.title,
    abstract: scenario.abstract,
    answers: scenario.answers,
    identityFieldIds: ["speakerEmail"],
    participants: [
      {
        id: scenario.participant.id,
        displayName: `${scenario.participant.firstName} ${scenario.participant.lastName}`,
        email: scenario.participant.email,
        biography: scenario.participant.biography,
      },
    ],
    trackIds: [String(scenario.answers.track)],
    version: 1,
  };
}
