import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CfpProgress } from "./cfp-progress";

describe("CFP progress", () => {
  it("renders one current desktop step and non-color completion text", () => {
    const markup = renderToStaticMarkup(<CfpProgress step="submission" />);

    expect(markup.match(/aria-current="step"/gu)).toHaveLength(1);
    expect(markup).toContain("Get started");
    expect(markup).toContain("Account");
    expect(markup).toContain("Proposal");
    expect(markup).toContain("Speakers");
    expect(markup).toContain("Review");
    expect(markup.match(/Complete/gu)).toHaveLength(2);
  });

  it("renders a compact mobile progress summary without duplicate visible labels", () => {
    const markup = renderToStaticMarkup(<CfpProgress mobile step="participants" />);

    expect(markup).toContain("Step 4 of 5");
    expect(markup).toContain("<strong>Speakers</strong>");
    expect(markup.match(/aria-current="step"/gu)).toHaveLength(1);
  });

  it("keeps the shared progress rail visible after submission", () => {
    const markup = renderToStaticMarkup(<CfpProgress complete />);

    expect(markup).toContain("Submission complete");
    expect(markup).not.toContain('aria-current="step"');
    expect(markup.match(/Complete/gu)).toHaveLength(5);
  });
});
