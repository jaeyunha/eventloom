import { describe, expect, it } from "vitest";
import { scorecardPrimaryAction } from "./scorecard-action";

describe("scorecard primary action", () => {
  it("uses one submit action and blocks it while autosave is pending", () => {
    expect(
      scorecardPrimaryAction({
        submitted: false,
        hasNext: true,
        submitBusy: false,
        autosavePending: true,
      }),
    ).toEqual({ kind: "submit", label: "Submit review", disabled: true });
  });

  it("progresses to the next review only after submission", () => {
    expect(
      scorecardPrimaryAction({
        submitted: true,
        hasNext: true,
        submitBusy: false,
        autosavePending: false,
      }),
    ).toEqual({ kind: "open-next", label: "Open next review", disabled: false });
  });

  it("ends with a submitted status when no next review exists", () => {
    expect(
      scorecardPrimaryAction({
        submitted: true,
        hasNext: false,
        submitBusy: false,
        autosavePending: false,
      }),
    ).toEqual({ kind: "submitted", label: "Review submitted", disabled: true });
  });
});
