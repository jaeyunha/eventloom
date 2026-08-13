import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  enrichCanonicalSubmission,
  getAcceptedHandoffMetadata,
  getSeededSubmission,
  indexOrganizerEvaluationWorkspace,
  loadCanonicalSubmissionList,
  loadOrganizerEvaluationWorkspace,
  loadOrganizerEventIdentity,
  loadOrganizerEventName,
  mapCanonicalSubmission,
  mergeCanonicalSubmissionEvaluation,
  SubmissionDetailWorkspace,
  SubmissionListWorkspace,
  submissionListState,
} from "./submission-workspace";

const canonicalEnvelope = {
  submission: {
    id: "submission-devflow-1",
    tenantId: "tenant-devflow",
    eventId: "devflow-conf-2027",
    formId: "main-cfp",
    ownerAccountId: "speaker-account",
    formVersion: 4,
    version: 1,
    status: "submitted" as const,
    completedSteps: ["welcome", "account", "submission", "participant", "review"],
    answers: {
      title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
      abstract:
        "Our monorepo CI took 40 minutes on a good day. This talk walks through how we cut it to 6 minutes.",
      format: "workshop",
      track: "platform",
      topics: ["accessibility", "reliability"],
      workshopAudience: "Staff engineers and platform teams.",
    },
    participants: [
      {
        id: "participant-priya",
        firstName: "Priya",
        lastName: "Raman",
        email: "sbek-speaker@example.com",
        role: "primary" as const,
        biography: "Priya's canonical biography.",
        answers: {
          participantType: "company",
          participantCompany: "Latticework Systems",
        },
      },
      {
        id: "participant-marcus",
        firstName: "Marcus",
        lastName: "Okafor",
        email: "sbek-speaker2@example.com",
        role: "co_speaker" as const,
        biography: "Marcus's canonical biography.",
        answers: { participantType: "individual" },
      },
    ],
    secondaryContacts: [],
    createdAt: "2027-01-02T11:00:00.000Z",
    updatedAt: "2027-01-02T12:00:00.000Z",
    submittedAt: "2027-01-02T12:00:00.000Z",
    reopenedAt: null,
  },
  submissionFields: [
    { key: "title", label: "Session title" },
    { key: "abstract", label: "Abstract" },
    {
      key: "format",
      label: "Session format",
      options: [{ value: "workshop", label: "Workshop" }],
    },
    {
      key: "track",
      label: "Track",
      options: [{ value: "platform", label: "Platform & Infra" }],
    },
    {
      key: "topics",
      label: "Topics",
      options: [
        { value: "accessibility", label: "Accessibility" },
        { value: "reliability", label: "Reliability" },
      ],
    },
    { key: "workshopAudience", label: "Workshop audience" },
  ],
  participantFields: [
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Last name" },
    { key: "email", label: "Email" },
    {
      key: "participantType",
      label: "Participant type",
      options: [
        { value: "company", label: "Company" },
        { value: "individual", label: "Individual" },
      ],
    },
    { key: "participantCompany", label: "Company" },
    { key: "biography", label: "Biography" },
  ],
} as const;

describe("organizer submission workspace", () => {
  it("distinguishes loading, failure, empty, and filtered submission list states", () => {
    expect(
      submissionListState({
        loading: true,
        loadError: null,
        submissionCount: 0,
        visibleCount: 0,
      }),
    ).toBe("loading");
    expect(
      submissionListState({
        loading: false,
        loadError: "Gateway unavailable",
        submissionCount: 0,
        visibleCount: 0,
      }),
    ).toBe("failure");
    expect(
      submissionListState({
        loading: false,
        loadError: null,
        submissionCount: 0,
        visibleCount: 0,
      }),
    ).toBe("empty");
    expect(
      submissionListState({
        loading: false,
        loadError: null,
        submissionCount: 2,
        visibleCount: 0,
      }),
    ).toBe("filtered_empty");

    const markup = renderToStaticMarkup(
      createElement(SubmissionListWorkspace, {
        eventId: "event-with-no-submissions",
        organizationId: "org-1",
      }),
    );
    expect(markup).toContain("No submissions yet");
    expect(markup).not.toContain("Open public CFP");
    expect(markup).toContain("Configure CFP");
    expect(markup).not.toContain("No matching submissions");
    expect(markup).not.toContain('id="submission-search"');
    expect(markup).not.toContain("<table");
  });
  it("maps the exact canonical fields, edited values, and every co-speaker", () => {
    const record = mapCanonicalSubmission(canonicalEnvelope);

    expect(record).toMatchObject({
      id: "submission-devflow-1",
      title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
      track: "Platform & Infra",
      format: "Workshop",
      abstract:
        "Our monorepo CI took 40 minutes on a good day. This talk walks through how we cut it to 6 minutes.",
    });
    expect(record.reviewData).toEqual({ status: "pending" });
    expect(record.answers).toEqual([
      {
        question: "Session title",
        answer: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
      },
      {
        question: "Abstract",
        answer:
          "Our monorepo CI took 40 minutes on a good day. This talk walks through how we cut it to 6 minutes.",
      },
      { question: "Session format", answer: "Workshop" },
      { question: "Track", answer: "Platform & Infra" },
      { question: "Topics", answer: "Accessibility, Reliability" },
      { question: "Workshop audience", answer: "Staff engineers and platform teams." },
    ]);
    expect(record.participants).toMatchObject([
      {
        name: "Priya Raman",
        role: "Speaker",
        organization: "Latticework Systems",
        biography: "Priya's canonical biography.",
        answers: {
          "First name": "Priya",
          "Last name": "Raman",
          Email: "sbek-speaker@example.com",
          "Participant type": "Company",
          Company: "Latticework Systems",
          Biography: "Priya's canonical biography.",
        },
      },
      {
        name: "Marcus Okafor",
        role: "Co-speaker",
        organization: "",
        biography: "Marcus's canonical biography.",
        answers: {
          "First name": "Marcus",
          "Last name": "Okafor",
          Email: "sbek-speaker2@example.com",
          "Participant type": "Individual",
          Company: "—",
          Biography: "Marcus's canonical biography.",
        },
      },
    ]);

    const editedAbstract = "Updated: the session now includes the canonical 2027 benchmark data.";
    const editedRecord = mapCanonicalSubmission({
      ...canonicalEnvelope,
      submission: {
        ...canonicalEnvelope.submission,
        version: 2,
        updatedAt: "2027-01-03T12:00:00.000Z",
        answers: { ...canonicalEnvelope.submission.answers, abstract: editedAbstract },
      },
    });
    expect(editedRecord.abstract).toBe(editedAbstract);
    expect(editedRecord.answers).toContainEqual({
      question: "Abstract",
      answer: editedAbstract,
    });
  });
  it("reads canonical answers stored under immutable field ids after form revisions", () => {
    const submissionFields = canonicalEnvelope.submissionFields.map((definition) => ({
      ...definition,
      id: `field-${definition.key}`,
    }));
    const participantFields = canonicalEnvelope.participantFields.map((definition) => ({
      ...definition,
      id: `field-${definition.key}`,
    }));
    const answers = Object.fromEntries(
      Object.entries(canonicalEnvelope.submission.answers).map(([key, value]) => [
        `field-${key}`,
        value,
      ]),
    );
    const participants = canonicalEnvelope.submission.participants.map((participant) => ({
      ...participant,
      answers: Object.fromEntries(
        Object.entries(participant.answers).map(([key, value]) => [`field-${key}`, value]),
      ),
    }));

    const record = mapCanonicalSubmission({
      ...canonicalEnvelope,
      submission: {
        ...canonicalEnvelope.submission,
        answers,
        participants,
      },
      submissionFields,
      participantFields,
    });

    expect(record).toMatchObject({
      title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
      abstract:
        "Our monorepo CI took 40 minutes on a good day. This talk walks through how we cut it to 6 minutes.",
      track: "Platform & Infra",
      format: "Workshop",
    });
    expect(record.participants[0]?.organization).toBe("Latticework Systems");
  });
  it("loads the authoritative event name instead of presenting a raw event UUID", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: { name: "Forward Summit 2028" } }));

    try {
      await expect(
        loadOrganizerEventName("", "organization-1", "82b23d61-c2f8-4f6b-a89a-9bba98c3555c"),
      ).resolves.toBe("Forward Summit 2028");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cfp/organizations/organization-1/events/82b23d61-c2f8-4f6b-a89a-9bba98c3555c/config",
        expect.objectContaining({ credentials: "include", cache: "no-store" }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("keeps an authoritative public slug separate from the event id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: {
          id: "evt_01JXYZ",
          name: "DevFlow Conference",
          slug: "devflow-conf-2027",
        },
      }),
    );
    try {
      await expect(loadOrganizerEventIdentity("", "organization-1", "evt_01JXYZ")).resolves.toEqual(
        {
          name: "DevFlow Conference",
          slug: "devflow-conf-2027",
        },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cfp/organizations/organization-1/events/evt_01JXYZ/config",
        expect.objectContaining({ credentials: "include", cache: "no-store" }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("uses the same-origin gateway and keeps canonical submissions visible when aggregates fail", async () => {
    const requests: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/organizer/workspace?eventId=")) {
        return Response.json({
          data: {
            plan: {
              id: "plan-1",
              rounds: [
                { id: "round-initial", sequence: 1 },
                { id: "round-final", sequence: 2 },
              ],
            },
            assignments: [
              {
                id: "assignment-1",
                reviewerId: "reviewer-1",
                submissionId: "submission-devflow-1",
                status: "submitted",
              },
            ],
            decisions: {},
            aggregates: [
              {
                submissionId: "submission-devflow-1",
                roundId: "round-final",
                submittedReviewCount: 0,
                expectedReviewCount: 1,
                averageWeightedTotal: null,
                possibleWeightedTotal: 0,
              },
            ],
          },
        });
      }
      if (url.endsWith("/reviews")) {
        return Response.json({
          data: {
            reviews: [
              {
                assignmentId: "assignment-1",
                submissionId: "submission-devflow-1",
                comment: "Ready for the committee.",
                scores: {
                  overall_rating: { value: 4 },
                  recommendation: { value: "accept" },
                },
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      const submission = await enrichCanonicalSubmission("", canonicalEnvelope);
      expect(submission).toMatchObject({
        id: "submission-devflow-1",
        title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
        evaluationPlanId: "plan-1",
        reviewSummary: { completed: 0, total: 1, averageScore: null, maxScore: 0 },
        reviewAssignments: [
          {
            reviewer: "reviewer-1",
            status: "complete",
            criterionScores: [
              { criterion: "Overall Rating", value: 4 },
              { criterion: "Recommendation", value: "accept" },
            ],
            comment: "Ready for the committee.",
          },
        ],
      });
      expect(requests).toHaveLength(2);

      expect(requests.every((request) => request.startsWith("/api/admin/evaluations/"))).toBe(true);
      expect(requests.filter((request) => request.includes("/organizer/workspace"))).toHaveLength(
        1,
      );
      expect(requests.some((request) => request.includes("/plans?eventId="))).toBe(false);
      expect(requests.some((request) => request.endsWith("/assignments"))).toBe(false);
      expect(requests.some((request) => request.endsWith("/aggregate"))).toBe(false);
      expect(requests.some((request) => request.endsWith("/decision"))).toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("loads canonical titles independently of the event-wide evaluation batch", async () => {
    let releaseWorkspace: ((response: Response) => void) | undefined;
    const workspaceGate = new Promise<Response>((resolve) => {
      releaseWorkspace = resolve;
    });
    const requests: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/cfp/organizations/org-1/events/event-1/submissions") {
        return Response.json({ data: [canonicalEnvelope] });
      }
      if (url === "/api/admin/evaluations/organizer/workspace?eventId=event-1") {
        return workspaceGate;
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      const workspacePromise = loadOrganizerEvaluationWorkspace("", "event-1");
      const envelopes = await loadCanonicalSubmissionList("", "org-1", "event-1");
      const rows = envelopes.map(mapCanonicalSubmission);
      expect(rows.map((row) => row.title)).toEqual([
        "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
      ]);
      expect(requests).toEqual([
        "/api/admin/evaluations/organizer/workspace?eventId=event-1",
        "/api/cfp/organizations/org-1/events/event-1/submissions",
      ]);

      releaseWorkspace?.(
        Response.json({
          data: {
            plan: { id: "plan-1", rounds: [{ id: "round-1", sequence: 1 }] },
            assignments: [],
            aggregates: [],
            decisions: {},
          },
        }),
      );
      const workspace = await workspacePromise;
      expect(
        envelopes.map((envelope) =>
          mergeCanonicalSubmissionEvaluation(
            envelope,
            indexOrganizerEvaluationWorkspace(workspace),
          ),
        ),
      ).toHaveLength(1);
      expect(requests.some((request) => request.includes("/plans?eventId="))).toBe(false);
      expect(requests.some((request) => request.endsWith("/reviews"))).toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("keeps canonical rows when the evaluation batch fails", async () => {
    const requests: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/cfp/organizations/org-1/events/event-1/submissions") {
        return Response.json({ data: [canonicalEnvelope] });
      }
      if (url === "/api/admin/evaluations/organizer/workspace?eventId=event-1") {
        return Response.json({ error: { message: "Evaluation unavailable." } }, { status: 503 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      const [envelopes, workspace] = await Promise.all([
        loadCanonicalSubmissionList("", "org-1", "event-1"),
        loadOrganizerEvaluationWorkspace("", "event-1").catch(() => null),
      ]);
      const rows =
        workspace === null
          ? envelopes.map(mapCanonicalSubmission)
          : envelopes.map((envelope) =>
              mergeCanonicalSubmissionEvaluation(
                envelope,
                indexOrganizerEvaluationWorkspace(workspace),
              ),
            );
      expect(rows[0]?.title).toBe("Taming 40-Minute CI: Incremental Builds at Monorepo Scale");
      expect(
        submissionListState({
          loading: false,
          loadError: null,
          submissionCount: rows.length,
          visibleCount: rows.length,
        }),
      ).toBe("ready");
      expect(requests).toHaveLength(2);
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("distinguishes submitted-review failures from an authoritative zero result", async () => {
    let reviewsFail = true;
    const reviewRequests: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/organizer/workspace?eventId=")) {
        return Response.json({
          data: {
            plan: { id: "plan-1", rounds: [{ id: "round-final", sequence: 2 }] },
            assignments: [
              {
                id: "assignment-1",
                reviewerId: "reviewer-1",
                submissionId: canonicalEnvelope.submission.id,
                status: "submitted",
              },
            ],
            decisions: {},
            aggregates: [
              {
                roundId: "round-final",
                submissionId: canonicalEnvelope.submission.id,
                submittedReviewCount: 1,
                expectedReviewCount: 1,
                averageWeightedTotal: 4,
                possibleWeightedTotal: 5,
              },
            ],
          },
        });
      }
      if (url.endsWith("/reviews")) {
        reviewRequests.push(url);
        return reviewsFail
          ? Response.json(
              { error: { message: "Submitted review read unavailable." } },
              { status: 503 },
            )
          : Response.json({ data: { reviews: [] } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      const failed = await enrichCanonicalSubmission("", canonicalEnvelope);
      expect(failed.submittedReviewRead).toEqual({
        status: "error",
        message: "Submitted review read unavailable.",
      });
      expect(failed.reviewAssignments[0]).not.toHaveProperty("criterionScores");
      expect(failed.reviewAssignments[0]).not.toHaveProperty("comment");

      reviewsFail = false;
      const empty = await enrichCanonicalSubmission("", canonicalEnvelope);
      expect(empty.submittedReviewRead).toEqual({ status: "ready", count: 0 });
      expect(reviewRequests).toEqual([
        "/api/admin/evaluations/plans/plan-1/rounds/round-final/submissions/submission-devflow-1/reviews",
        "/api/admin/evaluations/plans/plan-1/rounds/round-final/submissions/submission-devflow-1/reviews",
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("keeps canonical detail content when optional evaluation data has no plan or is unavailable", async () => {
    let evaluationStatus = 404;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/organizer/workspace?eventId=")) {
        return Response.json(
          {
            error: {
              message: evaluationStatus === 404 ? "No evaluation plan." : "Evaluation unavailable.",
            },
          },
          { status: evaluationStatus },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      const noPlan = await enrichCanonicalSubmission("", canonicalEnvelope);
      expect(noPlan).toMatchObject({
        id: canonicalEnvelope.submission.id,
        title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
        abstract:
          "Our monorepo CI took 40 minutes on a good day. This talk walks through how we cut it to 6 minutes.",
        participants: [{ name: "Priya Raman" }, { name: "Marcus Okafor" }],
        reviewSummary: { completed: 0, total: 0 },
        reviewData: {
          status: "no_plan",
          message: "No evaluation plan is configured for this event.",
        },
      });
      expect(noPlan.evaluationPlanId).toBeUndefined();

      evaluationStatus = 503;
      const unavailable = await enrichCanonicalSubmission("", canonicalEnvelope);
      expect(unavailable).toMatchObject({
        id: canonicalEnvelope.submission.id,
        title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
        answers: expect.arrayContaining([
          {
            question: "Session title",
            answer: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
          },
        ]),
        reviewData: {
          status: "unavailable",
          message: "Review data is unavailable: Evaluation unavailable.",
        },
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("reserves not-found for a missing canonical submission", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "missing-submission",
        organizationId: "organization-1",
      }),
    );

    expect(markup).toContain("Submission not found");
    expect(markup).not.toContain("Unable to load submission");
  });

  it("projects persisted accepted and rejected decisions into canonical statuses", async () => {
    let decisionStatus: "accepted" | "rejected" = "accepted";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/organizer/workspace?eventId=")) {
        return Response.json({
          data: {
            plan: { id: "plan-1", rounds: [{ id: "round-final", sequence: 1 }] },
            assignments: [],
            aggregates: [
              {
                roundId: "round-final",
                submissionId: canonicalEnvelope.submission.id,
                submittedReviewCount: 0,
                expectedReviewCount: 0,
                averageWeightedTotal: null,
                possibleWeightedTotal: 0,
              },
            ],
            decisions: {
              [canonicalEnvelope.submission.id]: {
                id: "decision-1",
                tenantId: canonicalEnvelope.submission.tenantId,
                eventId: canonicalEnvelope.submission.eventId,
                planId: "plan-1",
                submissionId: canonicalEnvelope.submission.id,
                status: decisionStatus,
                version: 2,
                history: [
                  {
                    from: null,
                    to: decisionStatus,
                    reason: `Organizer decision: ${decisionStatus}.`,
                    decidedBy: "organizer-1",
                    decidedAt: "2027-01-03T12:00:00.000Z",
                    idempotencyKey: `decision-${decisionStatus}`,
                  },
                ],
                updatedAt: "2027-01-03T12:00:00.000Z",
              },
            },
          },
        });
      }
      if (url.endsWith("/reviews")) return Response.json({ data: { reviews: [] } });
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      for (const [status, expectedStatus, timelineLabel] of [
        ["accepted", "accepted", "Accepted"],
        ["rejected", "declined", "Rejected"],
      ] as const) {
        decisionStatus = status;
        const submission = await enrichCanonicalSubmission("", canonicalEnvelope);
        expect(submission.status).toBe(expectedStatus);
        expect(submission.decision?.status).toBe(status);
        expect(submission.timeline.at(-1)?.label).toBe(timelineLabel);
      }
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses stored taxonomy answers and an em dash only when a canonical field is absent", () => {
    const record = mapCanonicalSubmission({
      ...canonicalEnvelope,
      submission: {
        ...canonicalEnvelope.submission,
        answers: { ...canonicalEnvelope.submission.answers, format: undefined },
      },
    });
    expect(record).toMatchObject({
      track: "Platform & Infra",
      format: "—",
    });
  });
  it("renders the compact shadcn submission workspace with filters and progress", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionListWorkspace, {
        eventId: "summit-2026",
        organizationId: "organization-1",
      }),
    );

    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain('data-slot="table"');
    expect(markup).toContain('data-slot="select-trigger"');
    expect(markup).toContain('data-slot="input"');
    expect(markup).toContain("<caption");
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
    expect(markup).toContain('aria-label="Select all visible submissions"');
    expect(markup).toContain('aria-label="Select Designing for Trust in AI-Assisted Teams"');
    expect(markup).toContain('id="submission-search"');
    expect(markup).toContain('id="submission-status"');
    expect(markup).toContain('id="submission-track"');
    expect(markup).toContain('id="submission-format"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("Under review");
    expect(markup).toContain("Review progress");
    expect(markup.indexOf("Total submissions")).toBeLessThan(markup.indexOf("All submissions"));
    expect(markup).toContain(
      "/admin/organizations/organization-1/events/summit-2026/submissions/sub-001",
    );
    expect(markup).not.toContain("maya.chen@example.test");
    expect(markup).not.toContain("Organizer notes");
    expect(markup).not.toContain("Canonical CFP organizer view");
    expect(markup).not.toContain("Authoritative CFP");
  });

  it("renders an action-first empty state without filter or table scaffolding", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionListWorkspace, {
        eventId: "event-with-no-submissions",
        organizationId: "org-1",
      }),
    );

    expect(markup).toContain("No submissions yet");
    expect(markup).not.toContain("Open public CFP");
    expect(markup).toContain("Configure CFP");
    expect(markup).not.toContain('id="submission-search"');
    expect(markup).not.toContain('data-slot="table"');
  });

  it("keeps detail content private to the organizer detail view", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "sub-001",
        organizationId: "organization-1",
      }),
    );

    expect(markup).toContain("Designing for Trust in AI-Assisted Teams");
    expect(markup).toContain("Version 3");
    expect(markup).toContain("maya.chen@example.test");
    expect(markup).toContain("Structured answers");
    expect(markup).toContain("Lifecycle timeline");
    expect(markup).toContain("Review score summary");
    expect(markup).toContain("Assignment &amp; conflicts");
    expect(markup).toContain("Organizer notes");
    expect(markup).toContain("Human-authored reason");
    expect(markup).toContain("Overall rating: 5");
    expect(markup).toContain("Reviewer comment: Strong evidence and a clear audience fit.");
  });
  it("renders an explicit submitted-review failure retry instead of the zero state", () => {
    const seeded = getSeededSubmission("summit-2026", "sub-001");
    expect(seeded).toBeDefined();
    if (seeded === undefined) return;
    const previous = seeded.submittedReviewRead;

    try {
      seeded.submittedReviewRead = {
        status: "error",
        message: "Submitted review read unavailable.",
      };
      const errorMarkup = renderToStaticMarkup(
        createElement(SubmissionDetailWorkspace, {
          eventId: "summit-2026",
          submissionId: "sub-001",
          organizationId: "organization-1",
        }),
      );
      expect(errorMarkup).toContain('role="alert"');
      expect(errorMarkup).toContain("Submitted reviews could not be loaded");
      expect(errorMarkup).toContain("Retry submitted reviews");
      expect(errorMarkup).not.toContain("No submitted reviews yet.");

      seeded.submittedReviewRead = { status: "ready", count: 0 };
      const emptyMarkup = renderToStaticMarkup(
        createElement(SubmissionDetailWorkspace, {
          eventId: "summit-2026",
          submissionId: "sub-001",
          organizationId: "organization-1",
        }),
      );
      expect(emptyMarkup).toContain("No submitted reviews yet.");
      expect(emptyMarkup).not.toContain("Retry submitted reviews");
    } finally {
      if (previous === undefined) delete seeded.submittedReviewRead;
      else seeded.submittedReviewRead = previous;
    }
  });
  it("exposes versioned decisions, queued audience notifications, and post-close lock guidance", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "sub-001",
        organizationId: "organization-1",
      }),
    );

    expect(markup).toContain("Decision outcome");
    expect(markup).toContain("Save accept");
    expect(markup).not.toContain("Accept submission");
    expect(markup).not.toContain("Reject submission");
    expect(markup).toContain("Decision and notification history");
    expect(markup).toContain("speaker edits are");
    expect(markup).toContain("read-only");
    expect(markup).toContain("server evaluation plan");
    expect(markup).toContain("submitter notification queue");
    expect(markup).toContain("idempotent background handoff");
  });

  it("summarizes accepted handoff metadata from server participant identities", () => {
    const accepted = getSeededSubmission("summit-2026", "sub-003");
    expect(accepted).toBeDefined();
    if (!accepted) return;

    const metadata = getAcceptedHandoffMetadata(accepted);
    expect(metadata).toMatchObject({
      title: "Building Resilient Teams Through Small Experiments",
      track: "People & Culture",
      primarySpeaker: { name: "Elena Garcia", role: "Lead speaker" },
      coSpeakers: [{ name: "Noah Kim", role: "Co-speaker" }],
      version: 2,
    });

    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "sub-003",
        organizationId: "organization-1",
      }),
    );
    expect(markup).toContain("Accepted session handoff");
    expect(markup).toContain("Elena Garcia");
    expect(markup).toContain("Noah Kim");
    expect(markup).toContain("People &amp; Culture");
  });

  it("requires an authored reason and explicit confirmation before reopening", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "sub-001",
        organizationId: "organization-1",
      }),
    );

    expect(markup).toContain('name="reopenReason"');
    expect(markup).toContain('minLength="10"');
    expect(markup).toContain('required=""');
    expect(markup).toContain("I confirm that reopening is necessary and authorized");
    expect(markup).toContain("Reopen and write audit event");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain("Every reopen is recorded in the audit log");
    expect(markup).toContain("automated tools cannot reopen a submission or make a final decision");
  });

  it("uses the requested event in every seeded list/detail lookup and link", () => {
    const listMarkup = renderToStaticMarkup(
      createElement(SubmissionListWorkspace, {
        eventId: "forge-2025",
        organizationId: "organization-1",
      }),
    );
    const detailMarkup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "forge-2025",
        submissionId: "sub-101",
        organizationId: "organization-1",
      }),
    );

    expect(getSeededSubmission("forge-2025", "sub-101")?.eventId).toBe("forge-2025");
    expect(getSeededSubmission("summit-2026", "sub-101")).toBeUndefined();
    expect(listMarkup).toContain(
      "/admin/organizations/organization-1/events/forge-2025/submissions/sub-101",
    );
    expect(listMarkup).not.toContain("/admin/events/");
    expect(detailMarkup).toContain(
      "/admin/organizations/organization-1/events/forge-2025/submissions",
    );
    expect(detailMarkup).not.toContain("/admin/events/");
  });

  it("serves the canonical fixture event from the seeded demo workspace", () => {
    expect(getSeededSubmission("demo-event", "submission_local_1")).toBeDefined();
  });
});
