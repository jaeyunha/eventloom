import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CfpSubmissionWindow } from "./cfp-submission-window";

describe("CFP submission window", () => {
  it("groups status, dates, and account limit in one labelled region", () => {
    const markup = renderToStaticMarkup(
      <CfpSubmissionWindow
        opensAt="2026-08-15T23:00:00.000Z"
        opensLabel="Aug 15, 2026, 11:00 PM"
        closesAt="2026-08-18T00:00:00.000Z"
        closesLabel="Aug 18, 2026, 12:00 AM"
        limit={3}
        status="open"
      />,
    );

    expect(markup).toContain("Open for submissions");
    expect(markup).toContain("<dt>Opens</dt>");
    expect(markup).toContain("<dt>Closes</dt>");
    expect(markup).toContain("Up to 3 proposals per account");
    expect(markup).toContain('dateTime="2026-08-18T00:00:00.000Z"');
    expect(markup).toContain('data-cfp-submission-window="true"');
    expect(markup.match(/data-cfp-window-value="true"/gu)).toHaveLength(2);
  });

  it("uses explicit closed language without relying only on color", () => {
    const markup = renderToStaticMarkup(
      <CfpSubmissionWindow
        opensAt="2026-08-10T00:00:00.000Z"
        opensLabel="Aug 10, 2026"
        closesAt="2026-08-11T00:00:00.000Z"
        closesLabel="Aug 11, 2026"
        status="closed"
      />,
    );

    expect(markup).toContain("Submissions closed");
    expect(markup).toContain("New drafts and proposal edits are no longer accepted.");
  });
});
