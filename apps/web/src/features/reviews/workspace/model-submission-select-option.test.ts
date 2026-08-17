import { describe, expect, it } from "vitest";
import { submissionSelectOption } from "./model-submission-select-option";
import type { AggregateRow } from "./organizer-aggregate-row";

describe("submissionSelectOption", () => {
  it("uses proposal and participant identity without exposing the submission id", () => {
    const row: AggregateRow = {
      id: "submission_27aac547-93f8-44b1-bd07-56d18f17a280",
      reference: "",
      title: "Practical accessibility testing",
      countedScore: "—",
      possibleScore: "—",
      countedReviews: 0,
      expectedReviews: 2,
      conflicts: 0,
      abstentions: 0,
      participants: [
        {
          id: "participant-1",
          displayName: "Ada Lovelace",
        },
        {
          id: "participant-2",
          displayName: "Grace Hopper",
        },
      ],
    };

    const option = submissionSelectOption(row);

    expect(option).toEqual({
      value: row.id,
      label: "Practical accessibility testing",
      description: "Ada Lovelace · Grace Hopper",
    });
    expect(`${option.label} ${option.description}`).not.toContain(row.id);
  });
});
