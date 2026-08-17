import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";
import type { ReviewerAssignmentController } from "./assignment-reviewer-assignment-controller";
import { ReviewerAssignmentEditor } from "./assignment-reviewer-assignment-editor";
import { ReviewerAssignmentTable } from "./assignment-reviewer-assignment-table";
import { OrganizerAssignmentCoverage } from "./organizer-authoring-assignment-coverage";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";
import { DecisionEditor } from "./organizer-decision-editor";
import { participantDisplayLabel } from "./model-participant-display-label";
import { reviewerDisplayLabel } from "./model-reviewer-display-label";
import { roundDisplayLabel } from "./model-round-display-label";
import type { AggregateRow } from "./organizer-aggregate-row";
import { OrganizerDecisionTable } from "./organizer-view-decision-table";
import type { OrganizerWorkspaceViewController } from "./organizer-view-controller";

const aggregate: AggregateRow = {
  id: "submission-internal-42",
  reference: "SUB-SECRET-42",
  title: "",
  countedScore: "4.0",
  possibleScore: "5.0",
  countedReviews: 1,
  expectedReviews: 1,
  conflicts: 0,
  abstentions: 0,
};

const assignment: ReviewPlanAssignment = {
  id: "assignment-internal-current",
  eventId: "event-internal",
  planId: "plan-internal",
  roundId: "round-internal",
  submissionId: aggregate.id,
  reviewerId: "reviewer-internal",
  status: "assigned",
  version: 7,
  predecessorAssignmentId: "assignment-internal-previous",
  successorAssignmentId: "assignment-internal-next",
};

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]+>/gu, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replace(/\s+/gu, " ")
    .trim();
}

describe("organizer identifier presentation", () => {
  it("keeps assignment selectors, editors, and lineage human-facing", () => {
    const assignmentCoverage = renderToStaticMarkup(
      createElement(OrganizerAssignmentCoverage, {
        controller: {
          seed: { aggregates: [aggregate] },
          rounds: [{ id: "round-internal", name: "Main review" }],
          busy: false,
          status: "open",
          maxAssignmentsPerReviewer: 4,
          assignmentRoundId: "round-internal",
          setAssignmentRoundId: vi.fn(),
          assignmentSubmissionId: aggregate.id,
          setAssignmentSubmissionId: vi.fn(),
          assignmentReviewerQuery: "",
          setAssignmentReviewerQuery: vi.fn(),
          assignmentReviewerIds: [],
          setAssignmentReviewerIds: vi.fn(),
          assignmentReviewerSelectionDisabled: false,
          reviewerMembersLoading: false,
          reviewerMembersError: null,
          reviewerMembers: [],
          matchingAssignmentReviewerMembers: [],
          reviewerDirectoryReady: true,
          assignmentPreview: null,
          previewAssignments: vi.fn(),
          assignReviewers: vi.fn(),
          reviewerPool: {
            pool: null,
            draft: {},
            loading: true,
            saving: false,
            error: null,
            message: null,
            changeReviewer: vi.fn(),
            changeMaxAssignments: vi.fn(),
            save: vi.fn(),
            reload: vi.fn(),
          },
          organizationId: "organization-internal",
        } as unknown as OrganizerAuthoringController,
      }),
    );
    const assignmentController = {
      seed: { assignments: [assignment] },
      reviewerMembers: [],
      submissionById: new Map([[aggregate.id, aggregate]]),
      roundById: new Map([["round-internal", { name: "Main review" }]]),
      visibleAssignments: [assignment],
      selectedAssignmentId: assignment.id,
      setSelectedAssignmentId: vi.fn(),
      busyAssignmentId: null,
      replacementReviewerByAssignment: {},
      setReplacementReviewerByAssignment: vi.fn(),
      replacementReasonByAssignment: {},
      setReplacementReasonByAssignment: vi.fn(),
      assignmentEditorRef: { current: null },
      selectedAssignment: assignment,
      selectedAggregate: aggregate,
      selectedRound: { name: "Main review" },
      selectedReviewer: "Casey Reviewer",
      selectedProtectedHistory: false,
      replaceAssignment: vi.fn(),
    } as unknown as ReviewerAssignmentController;
    const assignmentTable = renderToStaticMarkup(
      createElement(ReviewerAssignmentTable, { controller: assignmentController }),
    );
    const assignmentEditor = renderToStaticMarkup(
      createElement(ReviewerAssignmentEditor, { controller: assignmentController }),
    );
    const text = visibleText(`${assignmentCoverage} ${assignmentTable} ${assignmentEditor}`);

    expect(text).toContain("No title");
    expect(text).not.toContain(aggregate.reference);
    expect(text).not.toContain(aggregate.id);
    expect(text).not.toContain(assignment.reviewerId);
    expect(text).not.toContain(assignment.predecessorAssignmentId);
    expect(text).not.toContain(assignment.successorAssignmentId);
  });

  it("keeps decision tables and editors free of references and revision counters", () => {
    const decisionTable = renderToStaticMarkup(
      createElement(OrganizerDecisionTable, {
        controller: {
          seed: { decisionBySubmission: {} },
          aggregateSort: "descending",
          visibleDecisionRows: [aggregate],
          selectedDecisionId: aggregate.id,
          setSelectedDecisionId: vi.fn(),
          selectedRound: {
            id: "round-internal",
            name: "Main review",
            roundRevision: 11,
            rubricRevision: 13,
          },
          selectedRoundId: "round-internal",
        } as unknown as OrganizerWorkspaceViewController,
      }),
    );
    const decisionEditor = renderToStaticMarkup(
      createElement(DecisionEditor, {
        aggregate,
        baseUrl: "/api/events/event-internal/evaluation",
        planId: "plan-internal",
        decision: undefined,
      }),
    );
    const text = visibleText(`${decisionTable} ${decisionEditor}`);

    expect(text).toContain("No title");
    expect(text).not.toContain(aggregate.reference);
    expect(text).not.toContain(aggregate.id);
    expect(text).not.toMatch(/\b(?:round|rubric) revision\b/iu);
    expect(text).not.toMatch(/\bversion\s+\d+\b/iu);
    expect(text).toContain("Proposal");
    expect(text).not.toMatch(/\bSubmission\b/u);
  });

  it("uses neutral reviewer, replacement, and round fallbacks", () => {
    expect(reviewerDisplayLabel("reviewer-internal", [], 2)).toBe("Reviewer 2");
    expect(
      participantDisplayLabel([
        { id: "participant-internal-a", displayName: "" },
        { id: "participant-internal-b", displayName: " " },
      ]),
    ).toBe("Participant 1 · Participant 2");
    expect(roundDisplayLabel(undefined)).toBe("Selected round");
    expect(roundDisplayLabel("")).toBe("Selected round");
  });
});
