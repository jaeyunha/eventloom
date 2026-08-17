import { describe, expect, it } from "vitest";
import { playwrightCommand } from "./run-playwright";

describe("Playwright launcher", () => {
  it("runs the local CLI through Node and preserves test arguments", () => {
    expect(playwrightCommand(["tests/e2e/environment-isolation.spec.ts", "--workers=1"])).toEqual({
      command: "node",
      cwd: process.cwd(),
      args: [
        expect.stringMatching(/\/node_modules\/@playwright\/test\/cli\.js$/u),
        "test",
        "tests/e2e/environment-isolation.spec.ts",
        "--workers=1",
      ],
    });
  });
});
