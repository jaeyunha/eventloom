function normalizeSemanticText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function speakerEmailHtmlFromText(text: string): string {
  return normalizeSemanticText(text)
    .split(/\n{2,}/u)
    .map(
      (paragraph) =>
        `<p>${paragraph
          .split("\n")
          .map((line) => escapeHtml(line))
          .join("<br />")}</p>`,
    )
    .join("\n");
}
