import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  enrichCanonicalSubmission,
  getAcceptedHandoffMetadata,
  getSeededSubmission,
  mapCanonicalSubmission,
  loadOrganizerEventName,
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
      createElement(SubmissionListWorkspace, { eventId: "event-with-no-submissions" }),
    );
    expect(markup).toContain("No submissions yet");
    expect(markup).toContain("Open public CFP");
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
        "/api/admin/organizations/organization-1/events/82b23d61-c2f8-4f6b-a89a-9bba98c3555c",
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
      if (url.includes("/plans?eventId=")) {
        return Response.json({
          data: {
            plans: [
              {
                id: "plan-1",
                rounds: [
                  { id: "round-initial", sequence: 1 },
                  { id: "round-final", sequence: 2 },
                ],
              },
            ],
          },
        });
      }
      if (url.endsWith("/assignments")) {
        return Response.json({
          data: {
            assignments: [
              {
                id: "assignment-1",
                reviewerId: "reviewer-1",
                submissionId: "submission-devflow-1",
                status: "submitted",
              },
            ],
          },
        });
      }

      if (url.endsWith("/decision")) {
        return Response.json({ data: null });
      }
      if (url.endsWith("/aggregate")) {
        return Response.json(
          { error: { code: "INTERNAL_ERROR", message: "Aggregate unavailable" } },
          { status: 500 },
        );
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
      expect(requests).toHaveLength(5);

      expect(requests.every((request) => request.startsWith("/api/admin/evaluations/"))).toBe(true);
      expect(
        requests.some((request) =>
          request.includes(
            "/plans/plan-1/rounds/round-final/submissions/submission-devflow-1/aggregate",
          ),
        ),
      ).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });
  it("projects persisted accepted and rejected decisions into canonical statuses", async () => {
    let decisionStatus: "accepted" | "rejected" = "accepted";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/plans?eventId=")) {
        return Response.json({
          data: {
            plans: [{ id: "plan-1", rounds: [{ id: "round-final", sequence: 1 }] }],
          },
        });
      }
      if (url.endsWith("/assignments")) {
        return Response.json({ data: { assignments: [] } });
      }
      if (url.endsWith("/decision")) {
        return Response.json({
          data: {
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
        });
      }
      if (url.endsWith("/aggregate")) {
        return Response.json({
          data: {
            submittedReviewCount: 0,
            expectedReviewCount: 0,
            averageWeightedTotal: null,
            possibleWeightedTotal: 0,
          },
        });
      }
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
      createElement(SubmissionListWorkspace, { eventId: "summit-2026" }),
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
    expect(markup).toContain("/admin/events/summit-2026/submissions/sub-001");
    expect(markup).not.toContain("maya.chen@example.test");
    expect(markup).not.toContain("Organizer notes");
    expect(markup).not.toContain("Canonical CFP organizer view");
    expect(markup).not.toContain("Authoritative CFP");
  });

  it("renders an action-first empty state without filter or table scaffolding", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionListWorkspace, { eventId: "event-with-no-submissions" }),
    );

    expect(markup).toContain("No submissions yet");
    expect(markup).toContain("Open public CFP");
    expect(markup).toContain("Configure CFP");
    expect(markup).not.toContain('id="submission-search"');
    expect(markup).not.toContain('data-slot="table"');
  });

  it("keeps detail content private to the organizer detail view", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "sub-001",
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
  it("exposes versioned decisions, queued audience notifications, and post-close lock guidance", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "sub-001",
      }),
    );

    expect(markup).toContain("Accept submission");
    expect(markup).toContain("Reject submission");
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
      createElement(SubmissionListWorkspace, { eventId: "forge-2025" }),
    );
    const detailMarkup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "forge-2025",
        submissionId: "sub-101",
      }),
    );

    expect(getSeededSubmission("forge-2025", "sub-101")?.eventId).toBe("forge-2025");
    expect(getSeededSubmission("summit-2026", "sub-101")).toBeUndefined();
    expect(listMarkup).toContain("/admin/events/forge-2025/submissions/sub-101");
    expect(listMarkup).not.toContain("/admin/events/summit-2026/submissions/");
    expect(detailMarkup).toContain("/admin/events/forge-2025/submissions");
    expect(detailMarkup).not.toContain("/admin/events/summit-2026/submissions");
  });
});
