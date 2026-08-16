import { describe, expect, it } from "vitest";
import { requestFilePolicyFor } from "./request-file-policy";

describe("request file policy", () => {
  it.each([
    ["headshot", ["image/jpeg", "image/png", "image/webp"], 5 * 1024 * 1024],
    [
      "slides",
      [
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ],
      100 * 1024 * 1024,
    ],
    [
      "supporting_file",
      [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "image/jpeg",
        "image/png",
        "image/webp",
      ],
      25 * 1024 * 1024,
    ],
  ] as const)("uses the effective platform policy for %s requests", (kind, mimeTypes, maxBytes) => {
    const policy = requestFilePolicyFor(kind);

    expect(policy.kind).toBe(kind);
    expect(policy.maxBytes).toBe(maxBytes);
    expect(policy.formats.flatMap((format) => format.mimeTypes)).toEqual(mimeTypes);
  });
});
