import { describe, expect, it } from "vitest";
import { speakerEmailHtmlFromText } from "./email-body";

describe("speaker email body consistency", () => {
  it("generates escaped HTML paragraphs from the canonical plaintext", () => {
    const text = "Hello <Ana> & team.\nLine two.\n\nThe latest agenda is ready.";

    expect(speakerEmailHtmlFromText(text)).toBe(
      "<p>Hello &lt;Ana&gt; &amp; team.<br />Line two.</p>\n<p>The latest agenda is ready.</p>",
    );
    expect(speakerEmailHtmlFromText(text)).not.toContain("<Ana>");
  });
});
