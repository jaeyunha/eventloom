import { describe, expect, it } from "vitest";
import { formatUploadMimeTypes, standardUploadMaximumBytes, uploadMimeTypeLabels } from "./uploads";

describe("upload MIME type labels", () => {
  it("uses friendly names and deduplicates equivalent Office formats", () => {
    const mimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/*",
    ];

    expect(uploadMimeTypeLabels(mimeTypes)).toEqual(["PDF", "Word", "PowerPoint", "Images"]);
    expect(formatUploadMimeTypes(mimeTypes)).toBe("PDF, Word, PowerPoint, Images");
    expect(standardUploadMaximumBytes).toEqual({
      headshot: 5 * 1024 * 1024,
      slides: 100 * 1024 * 1024,
      supporting_file: 25 * 1024 * 1024,
    });
  });
});
