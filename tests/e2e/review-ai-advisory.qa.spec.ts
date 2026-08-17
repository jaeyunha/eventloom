import { expect, test } from "@playwright/test";

const reviewerUrl = "/review?organizationId=local-organization&eventId=demo-event";

test("reviewer sees a dropdown AI suggestion as advisory until human confirmation", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: "local-reviewer-session",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const criterionByAssignment = new Map<string, string>();
  await page.route("**/api/admin/evaluations/reviewer/workspace*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      data?: { assignments?: unknown[] };
      assignments?: unknown[];
    };
    const workspace = body.data ?? body;
    const assignments = workspace.assignments as
      | Array<{
          assignment: { id: string; status: string };
          round: {
            rubric: {
              criteria: Array<{
                id: string;
                label: string;
                minimum: number;
                maximum: number;
                inputType?: string;
                options?: Array<{ label: string; value: string }>;
              }>;
            };
          };
          suggestions?: unknown[];
        }>
      | undefined;
    if (assignments === undefined || assignments.length === 0) {
      throw new Error("Expected reviewer assignments.");
    }
    for (const entry of assignments) {
      const criterion =
        entry.round.rubric.criteria.find(({ inputType }) => inputType === "dropdown") ??
        entry.round.rubric.criteria[0];
      if (criterion === undefined) throw new Error("Expected a scoreable rubric criterion.");
      criterion.label = "Recommendation";
      criterion.minimum = 1;
      criterion.maximum = 3;
      criterion.inputType = "dropdown";
      criterion.options = [
        { label: "Advance", value: "advance" },
        { label: "Hold", value: "hold" },
        { label: "Reject", value: "reject" },
      ];
      criterionByAssignment.set(entry.assignment.id, criterion.id);
      entry.suggestions = [
        {
          id: `suggestion-dropdown-qa-${entry.assignment.id}`,
          status: "pending",
          version: 1,
          rubricRevision: 1,
          submissionRevision: 1,
          candidates: {
            [criterion.id]: [
              {
                id: `candidate-dropdown-qa-${entry.assignment.id}`,
                criterionId: criterion.id,
                value: 3,
                evidence: ["The submission gives a concrete delivery plan and audience outcome."],
                provenance: {
                  provider: "openai-responses",
                  model: "gpt-test",
                  generatedAt: "2026-08-17T00:00:00.000Z",
                  sourceReferences: ["abstract"],
                  promptVersion: "openai-responses-v1",
                },
              },
            ],
          },
          provenance: {
            provider: "openai-responses",
            model: "gpt-test",
            generatedAt: "2026-08-17T00:00:00.000Z",
            sourceReferences: ["abstract"],
            promptVersion: "openai-responses-v1",
          },
        },
      ];
    }
    await route.fulfill({ response, json: body });
  });
  await page.route(
    "**/api/admin/evaluations/assignments/*/suggestions/*/resolve*",
    async (route) => {
      const segments = new URL(route.request().url()).pathname.split("/");
      const encodedAssignmentId = segments[segments.indexOf("assignments") + 1];
      const encodedSuggestionId = segments[segments.indexOf("suggestions") + 1];
      const assignmentId =
        encodedAssignmentId === undefined ? undefined : decodeURIComponent(encodedAssignmentId);
      const suggestionId =
        encodedSuggestionId === undefined ? undefined : decodeURIComponent(encodedSuggestionId);
      const criterionId =
        assignmentId === undefined ? undefined : criterionByAssignment.get(assignmentId);
      if (assignmentId === undefined || suggestionId === undefined || criterionId === undefined) {
        throw new Error("Expected a mapped assignment, suggestion, and criterion.");
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          data: {
            suggestion: {
              id: suggestionId,
              status: "accepted",
              version: 2,
              rubricRevision: 1,
              submissionRevision: 1,
              candidates: {},
              provenance: {
                provider: "openai-responses",
                model: "gpt-test",
                generatedAt: "2026-08-17T00:00:00.000Z",
                sourceReferences: ["abstract"],
                promptVersion: "openai-responses-v1",
              },
            },
            review: {
              version: 1,
              comment: "",
              submittedAt: null,
              scores: {
                [criterionId]: {
                  value: 3,
                  origin: "human",
                  evidence: ["The submission gives a concrete delivery plan and audience outcome."],
                  humanConfirmedBy: "local-reviewer",
                },
              },
            },
          },
        },
      });
    },
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(reviewerUrl);
  const queue = page.getByRole("region", { name: "Assigned reviews" });
  await queue
    .getByRole("button", { name: /Open scorecard for/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Score this submission" })).toBeVisible();

  const suggestion = page.getByRole("complementary", {
    name: "AI suggestion for Recommendation",
  });
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByText("AI suggestion · pending", { exact: true })).toBeVisible();
  await expect(suggestion.getByText("Reject", { exact: true })).toBeVisible();
  await expect(
    suggestion.getByText("The submission gives a concrete delivery plan and audience outcome.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/AI suggestions never count until you confirm or edit them\./u),
  ).toBeVisible();

  const accept = suggestion.getByRole("button", {
    name: "Accept suggestion — Confirm or edit this suggestion",
  });
  await accept.focus();
  await expect(accept).toBeFocused();
  await page.screenshot({
    path: "test-results/review-ai-advisory-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(suggestion).toBeVisible();
  await suggestion.scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({
    path: "test-results/review-ai-advisory-mobile.png",
    fullPage: true,
  });
  await accept.click();

  await expect(
    page.getByRole("group", { name: "Recommendation" }).getByRole("combobox"),
  ).toHaveValue("reject");
  await expect(page.getByText("Human confirmed · counted", { exact: true })).toBeVisible();
});
