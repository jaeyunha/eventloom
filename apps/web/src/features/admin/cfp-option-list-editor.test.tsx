import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CfpOptionListEditor } from "./cfp-option-list-editor";

describe("CFP option list editor", () => {
  it("renders existing options as individually removable values", () => {
    const markup = renderToStaticMarkup(
      <CfpOptionListEditor
        id="tracks"
        label="Tracks"
        description="Route proposals into program areas."
        required
        values={["Accessibility", "Platform"]}
        onChange={vi.fn()}
      />,
    );

    expect(markup).toContain("2 options");
    expect(markup).toContain("Accessibility");
    expect(markup).toContain('aria-label="Remove Accessibility"');
    expect(markup).toContain("Add option");
    expect(markup).not.toContain('required=""');
  });

  it("requires the composer when a required list has no values", () => {
    const markup = renderToStaticMarkup(
      <CfpOptionListEditor
        id="formats"
        label="Formats"
        description="Define session formats."
        required
        values={[]}
        onChange={vi.fn()}
      />,
    );

    expect(markup).toContain('required=""');
    expect(markup).toContain("Type an option and press Enter");
  });
});
