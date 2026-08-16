import { once } from "node:events";
import { stdin, stdout } from "node:process";

export interface Credentials {
  email: string;
  password: string;
}

export interface CredentialReader {
  read(): Promise<Credentials>;
}

export interface CredentialInput {
  isTTY: boolean;
  readAll(): Promise<string>;
  prompt(label: string, hidden: boolean): Promise<string>;
}

export type CredentialInputErrorKind = "USAGE_INPUT";

export class CredentialInputError extends Error {
  constructor(
    message: string,
    readonly kind: CredentialInputErrorKind = "USAGE_INPUT",
  ) {
    super(message);
    this.name = "CredentialInputError";
  }
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function normalizeNonTtyLines(input: string): string[] {
  const normalized = input.replace(/\r\n/gu, "\n");
  const withoutSingleTerminalNewline = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;
  return withoutSingleTerminalNewline.split("\n");
}

/** Reads credentials only from an interactive terminal or exact two-line stdin input. */
export async function readCredentials(input: CredentialInput): Promise<Credentials> {
  let email: string;
  let password: string;
  if (input.isTTY) {
    email = await input.prompt("Email: ", false);
    password = await input.prompt("Password: ", true);
  } else {
    const lines = normalizeNonTtyLines(await input.readAll());
    if (lines.length !== 2) {
      throw new CredentialInputError(
        "Non-interactive login requires exactly an email and password on two lines",
      );
    }
    const suppliedEmail = lines[0];
    const suppliedPassword = lines[1];
    if (suppliedEmail === undefined || suppliedPassword === undefined) {
      throw new CredentialInputError(
        "Non-interactive login requires exactly an email and password on two lines",
      );
    }
    email = suppliedEmail;
    password = suppliedPassword;
  }
  if (!nonEmpty(email) || !nonEmpty(password)) {
    throw new CredentialInputError("Email and password are required");
  }
  return { email: email.trim(), password };
}

async function readAllStdin(): Promise<string> {
  let value = "";
  stdin.setEncoding("utf8");
  stdin.resume();
  stdin.on("data", (chunk: string) => {
    value += chunk;
  });
  await once(stdin, "end");
  return value;
}

function terminalPrompt(label: string, hidden: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = stdin.isRaw;
    const onData = (chunk: Buffer | string) => {
      const text = String(chunk);
      for (const character of text) {
        if (character === "\u0003") {
          finish(new CredentialInputError("Credential entry cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          if (!hidden) stdout.write("\b \b");
          continue;
        }
        value += character;
        if (!hidden) stdout.write(character);
      }
    };
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdout.write("\n");
      if (error === undefined) resolve(value);
      else reject(error);
    };

    try {
      stdout.write(label);
      stdin.setEncoding("utf8");
      if (stdin.isTTY) stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
    } catch (error) {
      stdin.off("data", onData);
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      reject(
        error instanceof Error ? error : new CredentialInputError("Unable to read credentials"),
      );
    }
  });
}

export function defaultCredentialReader(): CredentialReader {
  return {
    read: () =>
      readCredentials({
        isTTY: stdin.isTTY === true,
        readAll: readAllStdin,
        prompt: terminalPrompt,
      }),
  };
}
