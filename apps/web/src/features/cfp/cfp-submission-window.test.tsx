import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CfpSubmissionWindow } from "./cfp-submission-window";

describe("CFP submission window", () => {
  it("formats authoritative instants into non-breaking date and clock groups", () => {
    const markup = renderToStaticMarkup(
      <CfpSubmissionWindow
        opensAt="2026-08-15T23:00:00.000Z"
        closesAt="2026-08-18T00:00:00.000Z"
        limit={3}
        status="open"
        timeZone="America/Los_Angeles"
      />,
    );

    expect(markup).toContain("Open for submissions");
    expect(markup).toContain("<dt>Opens</dt>");
    expect(markup).toContain("<dt>Closes</dt>");
    expect(markup).toContain("Up to 3 proposals per account");
    expect(markup).toContain("America/Los_Angeles");
    expect(markup).toContain('dateTime="2026-08-15T23:00:00.000Z"');
    expect(markup).toContain('dateTime="2026-08-18T00:00:00.000Z"');
    expect(markup).toContain('data-cfp-submission-window="true"');
    expect(markup.match(/data-cfp-window-value="true"/gu)).toHaveLength(2);
    expect(markup.match(/data-cfp-window-date-group="true"/gu)).toHaveLength(2);
    expect(markup.match(/data-cfp-window-clock-group="true"/gu)).toHaveLength(2);
    expect(markup).toMatch(/data-cfp-window-date-group="true"[^>]*>Aug 15, 2026<\/span>/u);
    expect(markup).toMatch(/data-cfp-window-clock-group="true"[^>]*>4:00 PM PDT<\/span>/u);
  });

  it.each([
    ["upcoming", "Submissions open soon"],
    ["closed", "Submissions closed"],
  ] as const)("renders %s guidance with a long IANA timezone", (status, heading) => {
    const markup = renderToStaticMarkup(
      <CfpSubmissionWindow
        opensAt="2026-08-10T00:00:00.000Z"
        closesAt="2026-08-11T00:00:00.000Z"
        limit={1}
        status={status}
        timeZone="America/Argentina/Buenos_Aires"
      />,
    );

    expect(markup).toContain(heading);
    expect(markup).toContain("America/Argentina/Buenos_Aires");
    expect(markup).toContain("Up to 1 proposal per account");
  });
});
