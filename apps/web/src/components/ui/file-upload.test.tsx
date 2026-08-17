import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileUpload, fileUploadBadge, formatFileUploadSize } from "./file-upload";

describe("FileUpload", () => {
  it("renders a drop zone, browse affordance, and selected-file list", () => {
    const markup = renderToStaticMarkup(
      createElement(FileUpload, {
        id: "portal-file",
        accept: "application/pdf",
        title: "Drop your files here or browse",
        hint: "PDF up to 50 MB",
        browseLabel: "Browse file",
        files: [
          {
            id: "ready",
            name: "slides.pdf",
            sizeLabel: "1.2 MB",
            status: "complete",
          },
          {
            id: "busy",
            name: "notes.pdf",
            sizeLabel: "20 MB of 40 MB",
            status: "uploading",
            progress: 50,
          },
        ],
        onFilesSelected: () => undefined,
        onRemove: () => undefined,
      }),
    );

    expect(markup).toContain('data-file-upload=""');
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept="application/pdf"');
    expect(markup).toContain("Drop your files here or browse");
    expect(markup).toContain("Browse file");
    expect(markup).toContain("slides.pdf");
    expect(markup).toContain("Completed");
    expect(markup).toContain("Uploading");
    expect(markup).toContain('aria-label="Remove slides.pdf"');
    expect(markup).toContain('aria-label="Cancel notes.pdf"');
    expect(fileUploadBadge("Product Catalog.pdf")).toBe("PDF");
    expect(formatFileUploadSize(20 * 1024 * 1024)).toBe("20 MB");
  });
});
