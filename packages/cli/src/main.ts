#!/usr/bin/env bun
import { runCommand } from "./command";

const exitCode = await runCommand(process.argv.slice(2), {
  writeStdout(value) {
    process.stdout.write(value);
  },
  writeStderr(value) {
    process.stderr.write(value);
  },
});

process.exitCode = exitCode;
