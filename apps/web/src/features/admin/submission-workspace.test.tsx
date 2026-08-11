import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  enrichServerSubmission,
  getAcceptedHandoffMetadata,
  getSeededSubmission,
  mapServerSubmission,
  SubmissionDetailWorkspace,
  SubmissionListWorkspace,
} from "./submission-workspace";

describe("organizer submission workspace", () => {
  it("round-trips official taxonomy, custom answers, co-speakers, and edited abstracts", () => {
    const abstract =
      "Our monorepo CI took 40 minutes on a good day. This talk walks through how we cut it to 6 minutes.";
    const record = {
      id: "submission-devflow-1",
      tenantId: "tenant-devflow",
      eventId: "devflow-conf-2027",
      title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
      abstract,
      answers: {
        title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
        abstract,
        track: "Platform & Infra",
        format: "Talk (30 min)",
        audienceLevel: "Intermediate",
        keyTakeaway: "A decision framework for which incremental-build investments pay off",
      },
      fieldDefinitions: [
        { key: "title", label: "Session title" },
        { key: "abstract", label: "Abstract" },
        { key: "track", label: "Track", options: ["AI Engineering", "Platform & Infra"] },
        {
          key: "format",
          label: "Format",
          options: [{ value: "Talk (30 min)", label: "Talk (30 min)" }],
        },
        {
          key: "audienceLevel",
          label: "Audience level",
          options: ["Beginner", "Intermediate", "Advanced"],
        },
        { key: "keyTakeaway", label: "Key takeaway" },
      ],
      participants: [
        {
          id: "participant-priya",
          displayName: "Priya Raman",
          email: "sbek-speaker@example.com",
          biography: "Priya's fixture biography.",
          role: "primary",
          organization: "Latticework Systems",
          answers: { dietary: "Vegetarian" },
        },
        {
          id: "participant-marcus",
          displayName: "Marcus Okafor",
          email: "sbek-speaker2@example.com",
          biography: "Marcus's fixture biography.",
          role: "co_speaker",
          organization: "Cloudreach Labs",
          answers: { pronouns: "he/him" },
        },
      ],
      status: "submitted",
      version: 1,
      submittedAt: "2027-01-02T12:00:00.000Z",
      updatedAt: "2027-01-02T12:00:00.000Z",
      reopenedAt: null,
    } as const;

    const listRecord = mapServerSubmission(record);
    const detailRecord = mapServerSubmission(record);
    expect(listRecord).toMatchObject({
      track: "Platform & Infra",
      format: "Talk (30 min)",
    });
    expect(detailRecord).toMatchObject({
      track: "Platform & Infra",
      format: "Talk (30 min)",
      abstract,
    });
    expect(detailRecord.answers).toEqual(
      expect.arrayContaining([
        { question: "Audience level", answer: "Intermediate" },
        {
          question: "Key takeaway",
          answer: "A decision framework for which incremental-build investments pay off",
        },
      ]),
    );
    expect(detailRecord.participants).toMatchObject([
      {
        name: "Priya Raman",
        role: "Speaker",
        organization: "Latticework Systems",
        answers: { dietary: "Vegetarian" },
      },
      {
        name: "Marcus Okafor",
        role: "Co-speaker",
        organization: "Cloudreach Labs",
        answers: { pronouns: "he/him" },
      },
    ]);

    const editedAbstract = `${abstract} Updated: now includes 2026 benchmark data.`;
    const editedRecord = mapServerSubmission({
      ...record,
      abstract: editedAbstract,
      answers: { ...record.answers, abstract: editedAbstract },
      version: 2,
      updatedAt: "2027-01-03T12:00:00.000Z",
    });
    expect(editedRecord.abstract).toBe(editedAbstract);
    expect(editedRecord.answers).toContainEqual({
      question: "Abstract",
      answer: editedAbstract,
    });
  });
  it("keeps authoritative submissions visible when optional evaluation aggregates fail", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/plans?eventId=")) {
        return Response.json({
          data: { plans: [{ id: "plan-1", rounds: [{ id: "round-1" }] }] },
        });
      }
      if (url.endsWith("/assignments")) {
        return Response.json({ data: { assignments: [] } });
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
      throw new Error(`Unexpected request: ${url}`);
    });

    try {
      const submission = await enrichServerSubmission("https://api.example.test", {
        id: "submission-1",
        tenantId: "org-1",
        eventId: "event-1",
        title: "Visible submission",
        abstract: "The authoritative abstract.",
        answers: {},
        participants: [],
        status: "submitted",
        version: 1,
        submittedAt: "2027-01-02T12:00:00.000Z",
        updatedAt: "2027-01-02T12:00:00.000Z",
        reopenedAt: null,
      });
      expect(submission).toMatchObject({
        id: "submission-1",
        title: "Visible submission",
        evaluationPlanId: "plan-1",
        reviewSummary: { completed: 0, total: 0, averageScore: null, maxScore: 0 },
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses the stored taxonomy answer and only renders an em dash when it is absent", () => {
    const record = {
      id: "submission-without-format",
      tenantId: "tenant-devflow",
      eventId: "devflow-conf-2027",
      title: "A submission",
      abstract: "An abstract",
      answers: { track: "Platform & Infra" },
      participants: [],
      status: "submitted",
      version: 1,
      submittedAt: null,
      updatedAt: "2027-01-02T12:00:00.000Z",
      reopenedAt: null,
    };
    expect(mapServerSubmission(record)).toMatchObject({
      track: "Platform & Infra",
      format: "—",
    });
  });
  it("renders an accessible event-scoped submission table with filters and progress", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionListWorkspace, { eventId: "summit-2026" }),
    );

    expect(markup).toContain("<table");
    expect(markup).toContain("<caption");
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
    expect(markup).toContain('aria-label="Select all visible submissions"');
    expect(markup).toContain('aria-label="Select Designing for Trust in AI-Assisted Teams"');
    expect(markup).toContain('id="submission-search"');
    expect(markup).toContain('for="submission-status"');
    expect(markup).toContain('for="submission-track"');
    expect(markup).toContain('for="submission-format"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("Under review");
    expect(markup).toContain("Review progress");
    expect(markup).toContain("/admin/events/summit-2026/submissions/sub-001");
    expect(markup).not.toContain("maya.chen@example.test");
    expect(markup).not.toContain("Organizer notes");
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
