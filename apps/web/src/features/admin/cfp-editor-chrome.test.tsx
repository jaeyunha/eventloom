import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CfpEditorMasthead, CfpSectionNavigation, CfpStepActions } from "./cfp-editor-chrome";

const sections = [
  { id: "event-details", label: "Event details" },
  { id: "messaging", label: "Messaging" },
  { id: "taxonomy", label: "Taxonomy & links" },
  { id: "fields-rules", label: "Fields & rules" },
  { id: "public-preview", label: "Public preview" },
] as const;

describe("CFP editor chrome", () => {
  it("keeps publication status compact instead of rendering a review sidebar", () => {
    const markup = renderToStaticMarkup(
      <CfpEditorMasthead
        status="Draft"
        metadata={["Test summit", "Asia/Seoul", "8 public fields"]}
        actions={<button type="button">Save changes</button>}
      />,
    );

    expect(markup).toContain("Configure your call for proposals");
    expect(markup).toContain("Draft");
    expect(markup).toContain("8 public fields");
    expect(markup).not.toContain("Ready for review");
  });

  it("renders one section navigator with an accessible mobile equivalent", () => {
    const markup = renderToStaticMarkup(
      <CfpSectionNavigation activeSection="fields-rules" sections={sections} onChange={vi.fn()} />,
    );

    expect(markup.match(/aria-current="step"/gu)).toHaveLength(1);
    expect(markup).toContain("04");
    expect(markup).toContain("Configuration section");
    expect(markup.match(/<nav/gu)).toHaveLength(1);
  });

  it("uses matching Back and Continue actions and turns Continue into Publish on review", () => {
    const middleMarkup = renderToStaticMarkup(
      <CfpStepActions
        activeSection="messaging"
        sections={sections}
        saveStatus="Unsaved changes"
        onBack={vi.fn()}
        onNext={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    const finalMarkup = renderToStaticMarkup(
      <CfpStepActions
        activeSection="public-preview"
        busy
        sections={sections}
        saveStatus="All changes saved"
        onBack={vi.fn()}
        onNext={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    expect(middleMarkup).toContain(">Back<");
    expect(middleMarkup).toContain(">Continue<");
    expect(finalMarkup).toContain(">Publish form<");
    expect(finalMarkup).toContain("disabled");
    expect(finalMarkup).toContain("Section 5 of 5");
  });

  it("keeps the section tracker and action footer in normal document flow", () => {
    const styles = readFileSync(new URL("./cfp-editor-chrome.module.css", import.meta.url), "utf8");

    expect(styles).not.toMatch(/\.sectionNavigation\s*\{[^}]*position:\s*sticky/su);
    expect(styles).not.toMatch(/\.stepActions\s*\{[^}]*position:\s*sticky/su);
    expect(styles).toMatch(/\.stepButtons\s*\{[^}]*grid-template-columns:\s*repeat\(2/su);
  });

  it("keeps the editor guttered and both preview states full width", () => {
    const styles = readFileSync(new URL("./cfp-editor.module.css", import.meta.url), "utf8");

    expect(styles).toMatch(
      /\.viewport\s*\{[^}]*width:\s*min\(calc\(100% - 3rem\),\s*73\.75rem\)/su,
    );
    expect(styles).toMatch(
      /\.fieldGroup input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/su,
    );
    expect(styles).toMatch(
      /\.previewGrid\s*>\s*\.publicForm,\s*\.previewGrid\s*>\s*\.previewDetails\s*\{[^}]*width:\s*100%[^}]*grid-column:\s*1\s*\/\s*-1/su,
    );
  });
});
