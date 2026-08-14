import { describe, expect, it } from "vitest";
import { localSubmissionScenario } from "./local-review-scenario";

describe("local submission scenario", () => {
  it("generates unique submission content for the production-sized local seed", () => {
    const scenarios = Array.from({ length: 300 }, (_, index) => localSubmissionScenario(index));

    expect(new Set(scenarios.map((scenario) => scenario.ownerAccountId)).size).toBe(300);
    expect(new Set(scenarios.map((scenario) => scenario.participant.email)).size).toBe(300);
    expect(new Set(scenarios.map((scenario) => scenario.title)).size).toBe(300);
    expect(scenarios.every((scenario) => scenario.answers.title === scenario.title)).toBe(true);
  });
});
