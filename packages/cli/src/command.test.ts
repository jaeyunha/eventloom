import { cliExitCodes } from "@eventloom/contracts";
import { describe, expect, it } from "vitest";
import { runCommand } from "./command";

const secret = "top-secret-session-cookie";

function memoryIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      writeStdout(value: string) {
        stdout.push(value);
      },
      writeStderr(value: string) {
        stderr.push(value);
      },
    },
  };
}

describe("command shell", () => {
  it("shows help through human and JSON output", async () => {
    const human = memoryIo();
    expect(await runCommand(["--help"], human.io)).toBe(cliExitCodes.success);
    expect(human.stdout.join("")).toContain("auth list");
    expect(human.stderr).toEqual([]);

    const json = memoryIo();
    expect(await runCommand(["--help", "--json"], json.io)).toBe(cliExitCodes.success);
    expect(JSON.parse(json.stdout.join(""))).toEqual({
      success: true,
      exitCode: 0,
      output: { kind: "profiles", profiles: [] },
      warnings: [],
      requestTraceIds: [],
    });
  });

  it("returns exit 2 and a usage envelope for invalid commands", async () => {
    const human = memoryIo();
    expect(await runCommand(["raw", "https://eventloom.example"], human.io)).toBe(
      cliExitCodes.usageError,
    );
    expect(human.stderr.join("")).toContain("Unknown command");

    const json = memoryIo();
    expect(await runCommand(["raw", "--json"], json.io)).toBe(cliExitCodes.usageError);
    expect(JSON.parse(json.stderr.join(""))).toEqual({
      success: false,
      exitCode: 2,
      error: { code: "USAGE_ERROR", message: "Unknown command: raw" },
      requestTraceIds: [],
    });
  });

  it("maps all contract exit codes to JSON envelopes without credentials", async () => {
    const cases = [
      [cliExitCodes.unexpectedFailure, "UNEXPECTED_FAILURE"],
      [cliExitCodes.authenticationFailure, "AUTHENTICATION_FAILED"],
      [cliExitCodes.authorizationFailure, "AUTHORIZATION_FAILED"],
      [cliExitCodes.aggregateFailure, "AGGREGATE_FAILURE"],
    ] as const;

    for (const [exitCode, code] of cases) {
      const output = memoryIo();
      expect(
        await runCommand(["auth", "list", "--json"], output.io, { forcedFailure: exitCode }),
      ).toBe(exitCode);
      const envelope = JSON.parse(output.stderr.join(""));
      expect(envelope).toMatchObject({ success: false, exitCode, error: { code } });
      expect(JSON.stringify(envelope)).not.toContain(secret);
    }
  });

  it("parses only documented flags and never accepts credentials in arguments", async () => {
    for (const arguments_ of [
      ["auth", "list", "--password", secret],
      ["auth", "list", "--email", "agent@example.com"],
      ["auth", "list", "--api-url", "https://eventloom.example"],
      ["auth", "list", "--profile"],
    ]) {
      const output = memoryIo();
      expect(await runCommand(arguments_, output.io)).toBe(cliExitCodes.usageError);
      expect(output.stderr.join("")).not.toContain(secret);
    }
  });

  it("parses the future --api-url option without treating it as a credential", async () => {
    const output = memoryIo();
    expect(
      await runCommand(["auth", "list", "--api-url", "https://eventloom.example"], output.io),
    ).toBe(cliExitCodes.usageError);
    expect(output.stderr.join("")).toContain("--api-url");
    expect(output.stderr.join("")).not.toContain(secret);
  });
});
