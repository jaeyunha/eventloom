import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ReviewerPage from "../../app/review/page";
import {
  buildEvaluationPlanCreateDto,
  createEvaluationPlan,
  type EvaluatorAssignment,
  loadEvaluatorQueue,
  loadOrganizerData,
  parseNumericAuthoringValue,
  type ReviewPlanSeed,
  type ReviewRound,
  ReviewWorkspace,
  type RubricCriterion,
  validateCreateEvaluationPlanForm,
} from "./review-workspace";

const testCriteria: readonly RubricCriterion[] = [
  {
    id: "audience-impact",
    label: "Audience impact",
    description: "A clear, useful outcome for the event audience.",
    minimum: 1,
    maximum: 5,
    weight: 35,
    required: true,
  },
  {
    id: "clarity",
    label: "Clarity and structure",
    description: "A focused proposal with an understandable arc.",
    minimum: 1,
    maximum: 5,
    weight: 25,
    required: true,
  },
  {
    id: "originality",
    label: "Originality",
    description: "A distinctive point of view.",
    minimum: 1,
    maximum: 5,
    weight: 20,
    required: true,
  },
  {
    id: "feasibility",
    label: "Delivery feasibility",
    description: "The scope can be delivered in the available session.",
    minimum: 1,
    maximum: 5,
    weight: 20,
    required: true,
  },
  {
    id: "recommendation",
    label: "Recommendation",
    description: "Committee recommendation for disposition.",
    minimum: 1,
    maximum: 3,
    weight: 15,
    required: true,
    inputType: "dropdown",
    options: [
      { id: "accept", label: "Accept", value: "accept" },
      { id: "maybe", label: "Maybe", value: "maybe" },
      { id: "reject", label: "Reject", value: "reject" },
    ],
  },
  {
    id: "reviewer-comments",
    label: "Comments",
    description: "Evidence and context for the organizing committee.",
    minimum: 0,
    maximum: 1,
    weight: 1,
    required: false,
    inputType: "free_text",
  },
];

function testPlan(eventId: string): ReviewPlanSeed {
  const round: ReviewRound = {
    id: "round-initial",
    name: "Initial committee review",
    status: "open",
    opensAt: "Aug 10, 2026",
    closesAt: "Aug 18, 2026",
    completionPercent: 67,
    blindReview: true,
    anonymization: "double",
    reviewerPool: { reviewerIds: ["sam-whitfield"], name: "Initial review committee" },
    rubric: { name: "Summit proposal rubric", criteria: testCriteria },
  };
  return {
    planId: "plan-test",
    version: 3,
    decisionBySubmission: {},
    eventId,
    eventName: "Summit 2026",
    planName: "Summit 2026 program committee",
    status: "open",
    opensAt: "Aug 10, 2026",
    closesAt: "Aug 24, 2026",
    blindReview: true,
    assignmentRule: { reviewsPerSubmission: 3, maxAssignmentsPerReviewer: 8 },
    rounds: [
      round,
      {
        ...round,
        id: "round-calibration",
        name: "Calibration and final review",
        status: "scheduled",
        opensAt: "Aug 19, 2026",
        closesAt: "Aug 24, 2026",
        completionPercent: 0,
        reviewerPool: { reviewerIds: [], name: "Final review committee" },
      },
    ],
    aggregates: [
      {
        id: "submission-042",
        reference: "SUB-042",
        title: "Designing resilient public services",
        countedScore: "87.4",
        possibleScore: "100",
        countedReviews: 3,
        expectedReviews: 3,
        conflicts: 0,
        abstentions: 0,
        participants: [
          { id: "priya", displayName: "Priya Raman", role: "Author" },
          { id: "marcus", displayName: "Marcus Okafor", role: "Co-author" },
        ],
      },
      {
        id: "submission-017",
        reference: "SUB-017",
        title: "A practical guide to calm incident response",
        countedScore: "81.2",
        possibleScore: "100",
        countedReviews: 2,
        expectedReviews: 3,
        conflicts: 1,
        abstentions: 1,
        participants: [{ id: "riley", displayName: "Riley Chen", role: "Author" }],
      },
    ],
    progress: {
      totalAssignments: 18,
      assigned: 18,
      inProgress: 4,
      submitted: 12,
      abstained: 1,
      conflicts: 2,
      completionPercent: 67,
      reviewers: [
        {
          reviewerId: "sam-whitfield",
          roundId: "round-initial",
          assigned: 2,
          inProgress: 1,
          submitted: 1,
          abstained: 0,
          outstanding: 1,
          completionPercent: 50,
        },
      ],
    },
  };
}

function testAssignment(eventId: string): EvaluatorAssignment {
  const seed = testPlan(eventId);
  const round = seed.rounds[0];
  if (round === undefined) throw new Error("Test fixture round is missing.");
  return {
    eventId,
    eventName: seed.eventName,
    planId: seed.planId,
    planName: seed.planName,
    reviewVersion: undefined,
    initialScores: {},
    initialResponses: {},
    initialConfirmed: [],
    initialComment: "",
    submittedAt: null,
    id: "assignment-test",
    reference: "SUB-042",
    title: "Designing resilient public services",
    participants: [{ id: "priya", displayName: "Priya Raman", role: "Speaker" }],
    track: "Public services",
    abstract: "A practical session for resilient public services.",
    round,
    aiSuggestions: Object.fromEntries(
      testCriteria
        .filter((criterion) => criterion.inputType !== "free_text")
        .map((criterion, index) => [
          criterion.id,
          { value: 3 + (index % 3), evidence: ["Cited proposal evidence."] },
        ]),
    ),
    suggestions: [],
  };
}

const organizerState = { organizer: testPlan("summit-2026") };
const evaluatorState = { assignment: testAssignment("summit-2026") };
const reviewerQueueState = { queue: [{ assignment: testAssignment("summit-2026") }] };

type MockStateSlot = { value: unknown };
type ResolvedHost = { element: ReactElement; children: unknown };

function hostElements(node: unknown): readonly ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => hostElements(child));
  if (node === null || typeof node !== "object" || !("element" in node)) return [];
  const host = node as ResolvedHost;
  return [host.element, ...hostElements(host.children)];
}
describe("review workspace", () => {
  it("keeps numeric authoring edits finite during intermediate input", () => {
    expect(parseNumericAuthoringValue(2, "2.5")).toBe(2.5);
    expect(parseNumericAuthoringValue(2, "")).toBe(2);
    expect(parseNumericAuthoringValue(2, "not-a-number")).toBe(2);

    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "organizer",
        initialState: organizerState,
      }),
    );
    expect(markup).not.toContain("NaN");
  });
  it("renders an accessible first-plan form for an organizer event with no plans", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "event-empty",
        mode: "organizer",
        initialState: { organizerPlanMissing: true },
      }),
    );

    expect(markup).toContain("Create the first evaluation plan");
    expect(markup).toContain('id="create-plan-name"');
    expect(markup).toContain('id="create-plan-event-id"');
    expect(markup).toContain('id="create-plan-rounds"');
    expect(markup).toContain('id="create-plan-first-rubric"');
    expect(markup).toContain('id="create-plan-first-criterion"');
    expect(markup).toContain('id="create-plan-blind-review"');
    expect(markup).toContain(
      "You can add rounds, reviewer pools, and criteria after the plan is created.",
    );
  });

  it("builds the exact canonical DTO for a multi-round blind draft", () => {
    expect(
      buildEvaluationPlanCreateDto({
        eventId: "event-99",
        name: "  Program committee  ",
        roundCount: 2,
        firstRoundTitle: "First pass",
        firstRubricTitle: "Proposal rubric",
        firstCriterionTitle: "Quality",
        blindReview: true,
      }),
    ).toEqual({
      id: "plan-event-99-program-committee",
      eventId: "event-99",
      name: "Program committee",
      blindReview: true,
      closesAt: null,
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 5 },
      rounds: [
        {
          id: "round-1",
          name: "First pass",
          sequence: 1,
          opensAt: null,
          closesAt: null,
          blindReview: true,
          anonymization: "double",
          rubric: {
            id: "rubric-1",
            name: "Proposal rubric",
            criteria: [
              {
                id: "criterion-1-1",
                label: "Quality",
                description: "Describe the evidence reviewers should consider.",
                minimum: 1,
                maximum: 5,
                weight: 1,
                required: true,
              },
            ],
          },
        },
        {
          id: "round-2",
          name: "First pass 2",
          sequence: 2,
          opensAt: null,
          closesAt: null,
          blindReview: true,
          anonymization: "double",
          rubric: {
            id: "rubric-2",
            name: "Proposal rubric 2",
            criteria: [
              {
                id: "criterion-2-1",
                label: "Quality 2",
                description: "Describe the evidence reviewers should consider.",
                minimum: 1,
                maximum: 5,
                weight: 1,
                required: true,
              },
            ],
          },
        },
      ],
    });
  });

  it("posts the canonical DTO and returns the created plan", async () => {
    const input = {
      eventId: "event-empty",
      name: "Program committee",
      roundCount: 1,
      firstRoundTitle: "Initial review",
      firstRubricTitle: "Evaluation rubric",
      firstCriterionTitle: "Overall quality",
      blindReview: false,
    };
    const requests: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const responsePlan = { id: "plan-created" };
    const created = await createEvaluationPlan(
      "https://api.example",
      input,
      async (request, init) => {
        requests.push({ input: request, init });
        return new Response(JSON.stringify(responsePlan), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    );

    expect(created).toEqual(responsePlan);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request?.input).toBe("https://api.example/api/admin/evaluations/plans");
    expect(request?.init?.method).toBe("POST");
    expect(JSON.parse(String(request?.init?.body))).toEqual(buildEvaluationPlanCreateDto(input));
  });

  it("surfaces canonical API errors when the first plan cannot be created", async () => {
    const input = {
      eventId: "event-empty",
      name: "Program committee",
      roundCount: 1,
      firstRoundTitle: "Initial review",
      firstRubricTitle: "Evaluation rubric",
      firstCriterionTitle: "Overall quality",
      blindReview: false,
    };

    await expect(
      createEvaluationPlan(
        "https://api.example",
        input,
        async () =>
          new Response(JSON.stringify({ error: { message: "Plan creation is forbidden." } }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    ).rejects.toThrow("Plan creation is forbidden.");
  });

  it("reports client validation errors before a create request", () => {
    expect(
      validateCreateEvaluationPlanForm({
        eventId: "event-1",
        name: " ",
        roundCount: 1,
        firstRoundTitle: "Initial review",
        firstRubricTitle: "Rubric",
        firstCriterionTitle: "Quality",
        blindReview: false,
      }),
    ).toBe("Plan name is required.");
    expect(
      validateCreateEvaluationPlanForm({
        eventId: "event-1",
        name: "Plan",
        roundCount: 11,
        firstRoundTitle: "Initial review",
        firstRubricTitle: "Rubric",
        firstCriterionTitle: "Quality",
        blindReview: false,
      }),
    ).toBe("Rounds must be a whole number between 1 and 10.");
  });

  it("does not render demo seed content when no initial state is supplied", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, { eventId: "event-empty", mode: "organizer" }),
    );

    expect(markup).toContain("Loading authoritative evaluation data");
    expect(markup).not.toContain("Summit 2026 program committee");
    expect(markup).not.toContain("Initial committee review");
  });

  it("tolerates legacy reviewer projections without field arrays", () => {
    const plan = {
      ...testPlan("summit-2026"),
      reviewerProjection: {} as NonNullable<ReviewPlanSeed["reviewerProjection"]>,
    };
    expect(() =>
      renderToStaticMarkup(
        createElement(ReviewWorkspace, {
          eventId: "summit-2026",
          mode: "organizer",
          initialState: { organizer: plan },
        }),
      ),
    ).not.toThrow();
  });
  it("renders plan status, round dates, and blind-review semantics for organizers", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "organizer",
        initialState: organizerState,
      }),
    );

    expect(markup).toContain("Evaluation plan status");
    expect(markup).toContain("Open for review");
    expect(markup).toContain("Initial committee review");
    expect(markup).toContain("Calibration and final review");
    expect(markup).toContain("Aug 10, 2026");
    expect(markup).toContain("Aug 24, 2026");
    expect(markup).toContain("Blind review");
    expect(markup).toContain("Reviewer views hide participant identity fields.");
  });
  it("keeps organizer review navigation scoped to the selected organization", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "organizer",
        organizationId: "org-selected",
        initialState: organizerState,
      }),
    );

    expect(markup).toContain('href="/admin/organizations/org-selected/events/summit-2026/reviews"');
    expect(markup).toContain(
      'href="/admin/organizations/org-selected/events/summit-2026/reviews/evaluate"',
    );
    expect(markup).not.toContain('href="/admin/events/summit-2026/reviews"');
  });

  it("renders the authoring controls after a plan is created", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "event-empty",
        mode: "organizer",
        initialState: { organizer: testPlan("event-empty") },
      }),
    );

    expect(markup).toContain("Author and lock the evaluation plan");
    expect(markup).toContain("Add round");
    expect(markup).toContain("Add criterion");
    expect(markup).toContain("Round reviewer pool");
  });

  it("exposes assignment progress, conflicts, abstentions, and counted aggregates", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "organizer",
        initialState: organizerState,
      }),
    );

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("Reviewer assignment progress");
    expect(markup).toContain("2 conflicts declared");
    expect(markup).toContain("1 abstention");
    expect(markup).toContain("Counted aggregate scores");
    expect(markup).toContain("Human-confirmed scores only");
  });

  it("renders bounded rubric controls and human-authority decision safeguards", () => {
    const organizerMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "organizer",
        initialState: organizerState,
      }),
    );
    const evaluatorMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: evaluatorState,
      }),
    );

    expect(organizerMarkup).toContain("Criteria and weights");
    expect(organizerMarkup).toContain("1–5");
    expect(organizerMarkup).toContain("Written reason");
    expect(organizerMarkup).toContain("required");
    expect(organizerMarkup).toContain("Confirm human decision");
    expect(organizerMarkup).toContain(
      "AI suggestions cannot accept, waitlist, reject, or publish a decision.",
    );
    expect(organizerMarkup).toContain("AI suggestions never count and never decide an outcome");
    expect(organizerMarkup).toContain("until a human");
    expect(evaluatorMarkup).toContain('type="number"');
    expect(evaluatorMarkup).toContain('min="1"');
    expect(evaluatorMarkup).toContain('max="5"');
  });

  it("keeps evaluator content blind and limited to one assignment", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: evaluatorState,
      }),
    );

    expect(markup).toContain("Only your assigned submission is available");
    expect(markup).toContain("Blind review is on");
    expect(markup).toContain("Author identity is hidden from reviewers");
    expect(markup).toContain("Redacted for blind review");
    expect(markup).not.toContain("Riley");
    expect(markup).not.toContain("review plan status");
    expect(markup).not.toContain("Create evaluation plan");
  });
  it("does not render account identity fields from blind submission answers", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: {
          assignment: {
            ...testAssignment("summit-2026"),
            submissionFields: [
              { id: "email", label: "Email", value: "ada@example.com" },
              { id: "firstName", label: "First name", value: "Ada" },
              { id: "lastName", label: "Last name", value: "Lovelace" },
              { id: "fullName", label: "Full name", value: "Ada Lovelace" },
              { id: "topic", label: "Topic", value: "Accessible systems" },
            ],
          },
        },
      }),
    );

    expect(markup).toContain("Accessible systems");
    expect(markup).not.toContain("ada@example.com");
    expect(markup).not.toContain("<dt>Email</dt>");
    expect(markup).not.toContain("<dt>First name</dt>");
    expect(markup).not.toContain("<dt>Last name</dt>");
    expect(markup).not.toContain("<dt>Full name</dt>");
  });
  it("filters generic reviewer answers to the blind evaluator projection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                assignments: [
                  {
                    plan: {
                      id: "plan-blind",
                      eventId: "summit-2026",
                      name: "Blind review",
                      status: "open",
                      blindReview: true,
                      createdAt: "2026-08-10T00:00:00.000Z",
                      updatedAt: "2026-08-10T01:00:00.000Z",
                    },
                    assignment: {
                      id: "assignment-blind",
                      eventId: "summit-2026",
                      planId: "plan-blind",
                      submissionId: "submission-blind",
                      roundId: "round-blind",
                      reviewerId: "reviewer-1",
                      status: "assigned",
                      version: 1,
                    },
                    round: {
                      id: "round-blind",
                      name: "Blind round",
                      sequence: 1,
                      opensAt: null,
                      closesAt: "2026-08-18T00:00:00.000Z",
                      rubric: {
                        id: "rubric-blind",
                        name: "Blind rubric",
                        criteria: testCriteria,
                      },
                    },
                    submission: {
                      id: "submission-blind",
                      title: "Blind submission",
                      abstract: "Blind abstract",
                      identityRedacted: true,
                      answers: {
                        email: "ada@example.com",
                        firstName: "Ada",
                        lastName: "Lovelace",
                        fullName: "Ada Lovelace",
                        topic: "Accessible systems",
                      },
                    },
                    review: null,
                    suggestions: [],
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    try {
      const queue = await loadEvaluatorQueue(undefined, "https://api.example");
      const assignment = queue[0]?.assignment;
      if (assignment === undefined) throw new Error("Expected a blind evaluator assignment.");
      const markup = renderToStaticMarkup(
        createElement(ReviewWorkspace, {
          eventId: "summit-2026",
          mode: "evaluator",
          initialState: { assignment },
        }),
      );

      expect(markup).toContain("Accessible systems");
      expect(markup).not.toContain("ada@example.com");
      expect(markup).not.toContain("<dt>First name</dt>");
      expect(markup).not.toContain("<dt>Last name</dt>");
      expect(markup).not.toContain("<dt>Full name</dt>");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("marks AI evidence uncounted and requires a written abstention reason", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: evaluatorState,
      }),
    );

    expect(markup).toContain("AI suggestion · uncounted");
    expect(markup).toContain("Cited evidence");
    expect(markup).toContain("Confirm or edit this suggestion");
    expect(markup).toContain("A confirmation is required before this review is submitted");
    expect(markup).toContain("Review and submit");
    expect(markup).not.toContain("Confirm review submission");
    expect(markup).toContain("Conflict of interest");
    expect(markup).toContain('id="abstention-reason"');
    expect(markup).toContain("required");
    expect(markup).toContain("immediately removes your access");
  });

  it("exposes explicit draft state text and per-criterion validation hooks", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: evaluatorState,
      }),
    );

    expect(markup).toContain("Autosave ready");
    expect(markup).toContain("Save draft");
    expect(markup).toContain("aria-invalid");
    expect(markup).toContain("score-help");
  });
  it("renders a structured, keyboard-ready evaluator workflow", () => {
    const evaluatorMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: evaluatorState,
      }),
    );
    const organizerMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "organizer",
        initialState: organizerState,
      }),
    );
    const queueMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        mode: "evaluator",
        initialState: reviewerQueueState,
      }),
    );

    expect(evaluatorMarkup).toContain("<h1>Designing resilient public services</h1>");
    expect(evaluatorMarkup).toContain("Speaker / participants");
    expect(evaluatorMarkup).toContain("Participant identities are hidden for this blind review.");
    expect(evaluatorMarkup).toContain("Public services");
    expect(evaluatorMarkup).toContain("Rubric progress");
    expect(queueMarkup).toContain("Queue position");
    expect(evaluatorMarkup).toContain("Previous");
    expect(evaluatorMarkup).toContain("Next");
    expect(evaluatorMarkup).toContain("Evaluation actions");
    expect(evaluatorMarkup).toContain("Save draft");
    expect(evaluatorMarkup).toContain("Submit evaluation");
    expect(evaluatorMarkup).toContain("rating choices");
    expect(evaluatorMarkup).toContain("<fieldset");
    expect(evaluatorMarkup).toContain('aria-live="polite"');
    expect(evaluatorMarkup).toContain("Autosave ready");
    expect(organizerMarkup).toContain("criteriaList");
    expect(organizerMarkup).toContain("criterionEditor");
    expect(organizerMarkup).not.toContain("criteria authoring</caption>");
  });
  it("renders per-round pools, scorecard field types, sortable aggregates, and export/reminder actions", () => {
    const organizerMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "organizer",
        initialState: organizerState,
      }),
    );
    const evaluatorMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: evaluatorState,
      }),
    );

    expect(organizerMarkup).toContain("Round reviewer pool");
    expect(organizerMarkup).toContain("Anonymization / blind review");
    expect(organizerMarkup).toContain("Dropdown options");
    expect(organizerMarkup).toContain("Free text");
    expect(organizerMarkup).toContain("Sort aggregate score");
    expect(organizerMarkup).toContain("Export review results CSV");
    expect(organizerMarkup).toContain("Send reminder to selected reviewers");
    expect(organizerMarkup).toContain("Marcus Okafor (Co-author)");
    expect(evaluatorMarkup).toContain("Choose an option");
    expect(evaluatorMarkup).toContain(
      "Written responses are stored with this scorecard criterion.",
    );
    expect(evaluatorMarkup).toContain("Declare conflict and abstain");
  });

  it("loads organizer aggregates once per round and joins them by submission", async () => {
    const requests: string[] = [];
    const plan = {
      id: "plan-batch",
      eventId: "summit-2026",
      name: "Batch review",
      status: "open",
      blindReview: false,
      closesAt: "2099-08-20T00:00:00.000Z",
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 5 },
      version: 1,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T01:00:00.000Z",
      rounds: [
        {
          id: "round-batch",
          name: "Batch round",
          sequence: 1,
          opensAt: null,
          closesAt: "2099-08-18T00:00:00.000Z",
          rubric: { id: "rubric-batch", name: "Batch rubric", criteria: testCriteria },
        },
      ],
    };
    const assignments = [
      {
        id: "assignment-a",
        eventId: "summit-2026",
        planId: plan.id,
        roundId: "round-batch",
        submissionId: "submission-a",
        reviewerId: "reviewer-1",
        status: "submitted",
        version: 1,
      },
      {
        id: "assignment-b",
        eventId: "summit-2026",
        planId: plan.id,
        roundId: "round-batch",
        submissionId: "submission-b",
        reviewerId: "reviewer-2",
        status: "in_progress",
        version: 1,
      },
      {
        id: "assignment-c",
        eventId: "summit-2026",
        planId: plan.id,
        roundId: "round-batch",
        submissionId: "submission-c",
        reviewerId: "reviewer-3",
        status: "assigned",
        version: 1,
      },
    ];
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        requests.push(url.toString());
        const path = url.pathname.replace("/api/admin/evaluations", "");
        if (path === "/plans") return json({ plans: [plan] });
        if (path === `/plans/${plan.id}/progress`) {
          return json({
            total: 3,
            assigned: 3,
            inProgress: 1,
            submitted: 1,
            abstained: 0,
            completionPercent: 33,
            reviewers: [],
          });
        }
        if (path === "/events/summit-2026/submissions") {
          return json([
            { id: "submission-a", title: "Submission A", abstract: "A" },
            { id: "submission-b", title: "Submission B", abstract: "B" },
            { id: "submission-c", title: "Submission C", abstract: "C" },
          ]);
        }
        if (path === `/plans/${plan.id}/assignments`) return json({ assignments });
        if (path === `/plans/${plan.id}/rounds/round-batch/aggregates`) {
          return json({
            aggregates: [
              {
                submissionId: "submission-b",
                submittedReviewCount: 2,
                expectedReviewCount: 3,
                averageWeightedTotal: 3,
                possibleWeightedTotal: 5,
              },
              {
                submissionId: "submission-a",
                submittedReviewCount: 1,
                expectedReviewCount: 1,
                averageWeightedTotal: 4.5,
                possibleWeightedTotal: 5,
              },
            ],
          });
        }
        if (/^\/plans\/plan-batch\/submissions\/[^/]+\/decision$/u.test(path)) {
          return json(null);
        }
        throw new Error(`Unexpected evaluation request: ${url.toString()}`);
      }),
    );

    try {
      const seed = await loadOrganizerData("summit-2026", "https://api.example");
      const aggregateRequests = requests.filter((request) =>
        new URL(request).pathname.endsWith("/aggregates"),
      );
      const singularAggregateRequests = requests.filter((request) =>
        /\/submissions\/[^/]+\/aggregate$/u.test(new URL(request).pathname),
      );

      expect(aggregateRequests).toHaveLength(1);
      expect(singularAggregateRequests).toHaveLength(0);
      expect(seed.aggregates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "submission-a",
            countedScore: "4.5",
            possibleScore: "5.0",
            countedReviews: 1,
            expectedReviews: 1,
          }),
          expect.objectContaining({
            id: "submission-b",
            countedScore: "3.0",
            possibleScore: "5.0",
            countedReviews: 2,
            expectedReviews: 3,
          }),
          expect.objectContaining({
            id: "submission-c",
            countedScore: "—",
            possibleScore: "—",
            countedReviews: 0,
            expectedReviews: 1,
          }),
        ]),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("hydrates the reviewer queue from one batch context request with canonical titles and statuses", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        requests.push(String(input));
        return new Response(
          JSON.stringify({
            data: {
              assignments: [
                {
                  plan: {
                    id: "plan-canonical",
                    eventId: "summit-2026",
                    name: "Canonical review plan",
                    status: "open",
                    blindReview: true,
                    createdAt: "2026-08-10T00:00:00.000Z",
                    updatedAt: "2026-08-10T01:00:00.000Z",
                  },
                  assignment: {
                    id: "assignment-canonical",
                    eventId: "summit-2026",
                    planId: "plan-canonical",
                    submissionId: "submission-canonical",
                    roundId: "round-canonical",
                    reviewerId: "reviewer-1",
                    status: "submitted",
                    version: 2,
                    updatedAt: "2026-08-10T12:00:00.000Z",
                  },
                  round: {
                    id: "round-canonical",
                    name: "Canonical round",
                    sequence: 1,
                    opensAt: null,
                    closesAt: "2026-08-18T00:00:00.000Z",
                    rubric: {
                      id: "rubric-canonical",
                      name: "Canonical rubric",
                      criteria: testCriteria,
                    },
                  },
                  submission: {
                    id: "submission-canonical",
                    title: "Canonical submission title",
                    abstract: "Canonical abstract",
                  },
                  review: {
                    version: 1,
                    comment: "Submitted comment",
                    submittedAt: "2026-08-10T12:00:00.000Z",
                    scores: {},
                  },
                  rubricRevision: 3,
                  submissionRevision: 1,
                  suggestions: [],
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    try {
      const queue = await loadEvaluatorQueue(undefined, "https://api.example");
      const markup = renderToStaticMarkup(
        createElement(ReviewWorkspace, {
          mode: "evaluator",
          initialState: { queue },
        }),
      );

      expect(requests).toEqual(["https://api.example/api/admin/evaluations/reviewer/workspace"]);
      expect(requests.some((request) => request.includes("/assignments/"))).toBe(false);
      expect(markup).toContain("Canonical submission title");
      expect(markup).toContain("Canonical review plan");
      expect(markup).toContain("Submitted");
      expect(markup).not.toContain("Needs review");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps reviewer root queue mode free of organizer creation controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        mode: "evaluator",
        initialState: reviewerQueueState,
      }),
    );
    const pageMarkup = renderToStaticMarkup(createElement(ReviewerPage));

    expect(markup).toContain("Reviewer queue");
    expect(markup).toContain("Submissions to review");
    expect(markup).toContain("Designing resilient public services");
    expect(markup).toContain("Open scorecard");
    expect(markup).not.toContain("Create evaluation plan");
    expect(markup).not.toContain("/admin/");
    expect(pageMarkup).toContain("Reviewer queue");
    expect(pageMarkup).not.toContain("Create evaluation plan");
  });
  it("locks a scorecard and labels its queue entry from authoritative submitted state", () => {
    const submittedAssignment = {
      ...testAssignment("summit-2026"),
      submittedAt: "2026-08-10T12:00:00.000Z",
    };
    const evaluatorMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: { assignment: submittedAssignment },
      }),
    );
    const queueMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        mode: "evaluator",
        initialState: { queue: [{ assignment: submittedAssignment }] },
      }),
    );

    expect(evaluatorMarkup).toContain("Review submitted to the committee.");
    expect(evaluatorMarkup).toMatch(/disabled=""/u);
    expect(queueMarkup).toContain("Submitted");
    expect(queueMarkup).not.toContain("Needs review");
  });
  it("does not reopen persisted abstained assignments after reload", () => {
    const abstainedAssignment = {
      ...testAssignment("summit-2026"),
      assignmentStatus: "abstained" as const,
    };
    const scorecardMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "summit-2026",
        mode: "evaluator",
        initialState: { assignment: abstainedAssignment },
      }),
    );
    const queueMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        mode: "evaluator",
        initialState: { queue: [{ assignment: abstainedAssignment }] },
      }),
    );

    expect(scorecardMarkup).toContain("Assignment abstained");
    expect(scorecardMarkup).not.toContain("Score this submission");
    expect(queueMarkup).toContain("No review assignments are currently available.");
    expect(queueMarkup).not.toContain("Open scorecard");
  });
  it("keeps organizer authoring controls safe when React defers event updaters", async () => {
    vi.resetModules();
    const actualReact = await vi.importActual<typeof import("react")>("react");
    const stateSlots: Array<MockStateSlot | undefined> = [];
    const refSlots: Array<{ current: unknown } | undefined> = [];
    const pendingUpdates: Array<() => void> = [];
    let stateCursor = 0;
    let refCursor = 0;

    const useStateMock = <T,>(initialState: T | (() => T)) => {
      const index = stateCursor;
      stateCursor += 1;
      let slot = stateSlots[index];
      if (slot === undefined) {
        slot = {
          value: typeof initialState === "function" ? (initialState as () => T)() : initialState,
        };
        stateSlots[index] = slot;
      }
      const currentSlot = slot;
      const setState = (next: T | ((current: T) => T)) => {
        pendingUpdates.push(() => {
          const current = currentSlot.value as T;
          currentSlot.value =
            typeof next === "function" ? (next as (current: T) => T)(current) : next;
        });
      };
      return [currentSlot.value as T, setState] as const;
    };
    const useRefMock = <T,>(initialValue: T) => {
      const index = refCursor;
      refCursor += 1;
      let ref = refSlots[index];
      if (ref === undefined) {
        ref = { current: initialValue };
        refSlots[index] = ref;
      }
      return ref as { current: T };
    };
    const useEffectMock = () => undefined;

    try {
      vi.doMock("react", () => ({
        ...actualReact,
        useEffect: useEffectMock,
        useRef: useRefMock,
        useState: useStateMock,
      }));
      const reviewModule = await import("./review-workspace");
      const reviewProps = {
        mode: "organizer" as const,
        initialState: { organizer: testPlan("event-empty") },
      };

      function resolveNode(node: unknown): unknown {
        if (Array.isArray(node)) return node.map((child) => resolveNode(child));
        if (!isValidElement(node)) return node;
        const props = node.props as Record<string, unknown>;
        if (typeof node.type === "function") {
          const component = node.type as (props: Record<string, unknown>) => unknown;
          if (component.name.includes("Link")) return resolveNode(props.children);
          return resolveNode(component(props));
        }
        return {
          element: node,
          children: resolveNode(props.children),
        } satisfies ResolvedHost;
      }

      function renderTree(): unknown {
        stateCursor = 0;
        refCursor = 0;
        return resolveNode(reviewModule.ReviewWorkspace(reviewProps));
      }

      function findHost(
        tree: unknown,
        predicate: (props: Record<string, unknown>) => boolean,
      ): ReactElement {
        const element = hostElements(tree).find((candidate) =>
          predicate(candidate.props as Record<string, unknown>),
        );
        if (element === undefined) throw new Error("Expected organizer authoring control.");
        return element;
      }

      function fireChange(
        element: ReactElement,
        target: {
          readonly value: string;
          readonly checked?: boolean;
          readonly selectedOptions?: readonly { readonly value: string }[];
        },
      ): void {
        const onChange = (element.props as Record<string, unknown>).onChange;
        if (typeof onChange !== "function") throw new Error("Expected an onChange handler.");
        const event: { currentTarget: unknown | null } = { currentTarget: target };
        (onChange as (event: unknown) => void)(event);
        event.currentTarget = null;
        for (const apply of pendingUpdates.splice(0)) apply();
      }

      let tree = renderTree();
      const reviewerMembersSlot = stateSlots[6];
      if (reviewerMembersSlot === undefined) {
        throw new Error("Expected reviewer member state.");
      }
      reviewerMembersSlot.value = [
        {
          organizationId: "org-1",
          userId: "reviewer-a",
          email: "reviewer-a@example.com",
          name: "Reviewer A",
          emailVerified: true,
          status: "active",
          role: "reviewer",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          organizationId: "org-1",
          userId: "reviewer-b",
          email: "reviewer-b@example.com",
          name: "Reviewer B",
          emailVerified: true,
          status: "active",
          role: "reviewer",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ];
      tree = renderTree();

      const roundName = findHost(tree, (props) => props.id === "round-initial-name");
      fireChange(roundName, { value: "Final review" });
      tree = renderTree();
      expect(
        (
          findHost(tree, (props) => props.id === "round-initial-name").props as Record<
            string,
            unknown
          >
        ).value,
      ).toBe("Final review");

      const anonymization = findHost(tree, (props) => props.id === "round-initial-anonymization");
      fireChange(anonymization, { value: "single" });
      tree = renderTree();
      expect(
        (
          findHost(tree, (props) => props.id === "round-initial-anonymization").props as Record<
            string,
            unknown
          >
        ).value,
      ).toBe("single");

      const reviewerPool = findHost(tree, (props) => props.id === "round-initial-reviewer-pool");
      fireChange(reviewerPool, {
        value: "",
        selectedOptions: [{ value: "reviewer-a" }, { value: "reviewer-b" }],
      });
      tree = renderTree();
      expect(
        (
          findHost(tree, (props) => props.id === "round-initial-reviewer-pool").props as Record<
            string,
            unknown
          >
        ).value,
      ).toEqual(["reviewer-a", "reviewer-b"]);

      const minimum = findHost(tree, (props) => props["aria-label"] === "Audience impact minimum");
      fireChange(minimum, { value: "2.5" });
      tree = renderTree();
      expect(
        (
          findHost(tree, (props) => props["aria-label"] === "Audience impact minimum")
            .props as Record<string, unknown>
        ).value,
      ).toBe(2.5);

      const required = findHost(
        tree,
        (props) => props["aria-label"] === "Audience impact required",
      );
      fireChange(required, { value: "on", checked: false });
      tree = renderTree();
      expect(
        (
          findHost(tree, (props) => props["aria-label"] === "Audience impact required")
            .props as Record<string, unknown>
        ).checked,
      ).toBe(false);
    } finally {
      vi.doUnmock("react");
      vi.resetModules();
    }
  });
});
