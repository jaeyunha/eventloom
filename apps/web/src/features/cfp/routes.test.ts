import { describe, expect, it } from "vitest";
import { cfpStepRequiresAuthentication } from "./routes";

describe("CFP route authentication", () => {
  it("keeps entry and account public while protecting applicant data steps", () => {
    expect(cfpStepRequiresAuthentication("welcome")).toBe(false);
    expect(cfpStepRequiresAuthentication("account")).toBe(false);
    expect(cfpStepRequiresAuthentication("submission")).toBe(true);
    expect(cfpStepRequiresAuthentication("participants")).toBe(true);
    expect(cfpStepRequiresAuthentication("review")).toBe(true);
  });
});
