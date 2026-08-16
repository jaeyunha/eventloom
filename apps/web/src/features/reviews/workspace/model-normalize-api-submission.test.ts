import { describe, expect, it } from "vitest";
import { normalizeApiSubmission } from "./model-normalize-api-submission";

describe("normalizeApiSubmission", () => {
  it("uses No title without changing the route identifier", () => {
    const id = "submission_753f52a9-4872-4700-9b52-d9aef7e30d4a";

    expect(
      normalizeApiSubmission({
        id,
        title: "",
        abstract: "",
      }),
    ).toMatchObject({
      id,
      title: "No title",
    });
  });
});
