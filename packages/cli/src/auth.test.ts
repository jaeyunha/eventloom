import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cliExitCodes } from "@eventloom/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "./command";
import { CredentialInputError, readCredentials } from "./credentials";
import { ProfileStore, type StoredProfile } from "./store";

const EMAIL = "agent@example.test";
const PASSWORD = "top-secret-password";
const COOKIE = "top-secret-session-cookie";
const temporaryHomes: string[] = [];
const servers: Server[] = [];

interface SeenRequest {
  method: string;
  path: string;
  cookie: string | undefined;
  origin?: string | undefined;
  body: string;
}
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
async function temporaryHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "eventloom-cli-auth-test-"));
  temporaryHomes.push(home);
  return home;
}
async function requestBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  return body;
}
async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void,
): Promise<{ origin: string }> {
  const server = createServer((request, response) => void handler(request, response));
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Mock server has no TCP address");
  return { origin: `http://127.0.0.1:${address.port}` };
}
function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string | string[]> = {},
) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}
function account(id = "account-1", email = EMAIL): StoredProfile["account"] {
  return { id, email };
}
function profile(
  name: string,
  origin: string,
  sessionValue = COOKIE,
  identity = account(),
): StoredProfile {
  return {
    name,
    origin,
    account: identity,
    session: { name: "better-auth.session_token", value: sessionValue },
  };
}
function contexts() {
  return [
    {
      scope: "organization" as const,
      organization: { id: "org-a", name: "Alpha" },
      roles: ["organizer"] as const,
      capabilities: ["organizer.overview.read"] as const,
    },
    {
      scope: "event" as const,
      organization: { id: "org-a", name: "Alpha" },
      event: { id: "event-a", name: "Alpha event" },
      roles: ["organizer"] as const,
      capabilities: ["organizer.overview.read"] as const,
    },
  ];
}
function reader(email = EMAIL, password = PASSWORD) {
  return { read: async () => ({ email, password }) };
}
async function run(argv: string[], home: string, credentials = reader()) {
  const output = memoryIo();
  const exitCode = await runCommand(argv, output.io, { home, credentialReader: credentials });
  return { exitCode, stdout: output.stdout.join(""), stderr: output.stderr.join("") };
}
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(
    temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

describe("credential reader", () => {
  it("prompts TTY users for email and a hidden password", async () => {
    const prompts: Array<{ label: string; hidden: boolean }> = [];
    await expect(
      readCredentials({
        isTTY: true,
        readAll: async () => {
          throw new Error("TTY input must not read all stdin");
        },
        prompt: async (label, hidden) => {
          prompts.push({ label, hidden });
          return hidden ? PASSWORD : EMAIL;
        },
      }),
    ).resolves.toEqual({ email: EMAIL, password: PASSWORD });
    expect(prompts).toEqual([
      { label: "Email: ", hidden: false },
      { label: "Password: ", hidden: true },
    ]);
  });
  it("accepts exactly two non-TTY stdin values and rejects extras without echoing them", async () => {
    await expect(
      readCredentials({
        isTTY: false,
        readAll: async () => `${EMAIL}\n${PASSWORD}\n`,
        prompt: async () => {
          throw new Error("Non-TTY input must not prompt");
        },
      }),
    ).resolves.toEqual({ email: EMAIL, password: PASSWORD });
    await expect(
      readCredentials({
        isTTY: false,
        readAll: async () => `${EMAIL}\n${PASSWORD}\nextra\n`,
        prompt: async () => "",
      }),
    ).rejects.toBeInstanceOf(CredentialInputError);
  });
});

describe("auth login and access discovery", () => {
  it.each(["better-auth.session_token", "__Secure-better-auth.session_token"] as const)(
    "stores only the %s name and value after session and access validation",
    async (cookieName) => {
      const seen: SeenRequest[] = [];
      const server = await startServer(async (request, response) => {
        const body = await requestBody(request);
        seen.push({
          method: request.method ?? "",
          path: request.url ?? "",
          cookie: request.headers.cookie,
          body,
        });
        if (request.url === "/api/auth/sign-in/email")
          return json(
            response,
            200,
            { token: "body-token-must-not-persist" },
            {
              "set-cookie": ["other=discard; Path=/", `${cookieName}=${COOKIE}; Path=/; HttpOnly`],
            },
          );
        if (request.url === "/api/auth/get-session")
          return json(response, 200, { session: { id: "session-1" }, user: account() });
        if (request.url === "/api/account/access-contexts")
          return json(response, 200, { data: contexts() });
        json(response, 404, {});
      });
      const home = await temporaryHome();
      const result = await run(
        ["auth", "login", "--profile", "primary", "--api-url", server.origin, "--json"],
        home,
      );
      expect(result.exitCode).toBe(cliExitCodes.success);
      expect(JSON.parse(result.stdout)).toMatchObject({
        success: true,
        output: { kind: "access" },
      });
      expect(result.stderr).toBe("");
      expect(JSON.stringify(result)).not.toContain(PASSWORD);
      expect(JSON.stringify(result)).not.toContain(COOKIE);
      expect(await new ProfileStore(home).readProfile("primary")).toEqual({
        ...profile("primary", server.origin),
        session: { name: cookieName, value: COOKIE },
      });
      expect(await new ProfileStore(home).readConfig()).toEqual({
        schemaVersion: 1,
        activeProfile: "primary",
      });
      expect(seen).toEqual([
        expect.objectContaining({
          method: "POST",
          path: "/api/auth/sign-in/email",
          cookie: undefined,
          body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        }),
        expect.objectContaining({
          method: "GET",
          path: "/api/auth/get-session",
          cookie: `${cookieName}=${COOKIE}`,
        }),
        expect.objectContaining({
          method: "GET",
          path: "/api/account/access-contexts",
          cookie: `${cookieName}=${COOKIE}`,
        }),
      ]);
    },
  );
  it("rejects zero or multiple supported cookies without creating a profile", async () => {
    for (const cookies of [
      [],
      [
        `better-auth.session_token=${COOKIE}; Path=/`,
        "__Secure-better-auth.session_token=other; Path=/",
      ],
    ]) {
      const server = await startServer(async (request, response) => {
        await requestBody(request);
        if (request.url === "/api/auth/sign-in/email")
          return json(response, 200, {}, cookies.length === 0 ? {} : { "set-cookie": cookies });
        json(response, 500, {});
      });
      const home = await temporaryHome();
      const result = await run(
        ["auth", "login", "--profile", `profile-${cookies.length}`, "--api-url", server.origin],
        home,
      );
      expect(result.exitCode).toBe(cliExitCodes.authenticationFailure);
      await expect(
        new ProfileStore(home).readProfile(`profile-${cookies.length}`),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(`${result.stdout}${result.stderr}`).not.toContain(COOKIE);
    }
  });
  it("does not create a profile for invalid credentials", async () => {
    const server = await startServer(async (request, response) => {
      await requestBody(request);
      json(response, request.url === "/api/auth/sign-in/email" ? 401 : 500, {
        error: { code: "INVALID_EMAIL_OR_PASSWORD" },
      });
    });
    const home = await temporaryHome();
    const result = await run(
      ["auth", "login", "--profile", "primary", "--api-url", server.origin],
      home,
    );
    expect(result.exitCode).toBe(cliExitCodes.authenticationFailure);
    await expect(new ProfileStore(home).readProfile("primary")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain(PASSWORD);
    expect(`${result.stdout}${result.stderr}`).not.toContain(COOKIE);
  });
  it("rejects missing login arguments before origin validation or credential input", async () => {
    const home = await temporaryHome();
    let reads = 0;
    const output = memoryIo();
    expect(
      await runCommand(["auth", "login", "--api-url", "not-a-url", "--json"], output.io, {
        home,
        credentialReader: {
          read: async () => {
            reads += 1;
            return { email: EMAIL, password: PASSWORD };
          },
        },
      }),
    ).toBe(cliExitCodes.usageError);
    expect(JSON.parse(output.stderr.join(""))).toMatchObject({
      success: false,
      exitCode: cliExitCodes.usageError,
      error: { code: "USAGE_ERROR", message: "auth login requires --profile and --api-url" },
    });
    expect(reads).toBe(0);
  });
  it("rejects unsafe origins, retains HTTPS and loopback support, and never reads credentials before origin validation", async () => {
    let reads = 0;
    let fetches = 0;
    const credentials = {
      read: async () => {
        reads += 1;
        return { email: EMAIL, password: PASSWORD };
      },
    };
    const home = await temporaryHome();
    for (const origin of [
      "http://eventloom.example",
      "https://user:password@eventloom.example",
      "https://eventloom.example?token=secret",
      "https://eventloom.example#fragment",
    ]) {
      const output = memoryIo();
      expect(
        await runCommand(
          ["auth", "login", "--profile", "primary", "--api-url", origin],
          output.io,
          {
            home,
            credentialReader: credentials,
            fetcher: async () => {
              fetches += 1;
              return new Response();
            },
          },
        ),
      ).toBe(cliExitCodes.usageError);
    }
    expect(reads).toBe(0);
    expect(fetches).toBe(0);
    const { canonicalizeOrigin } = await import("./store");
    expect(canonicalizeOrigin("https://EVENTLOOM.example:443/")).toBe("https://eventloom.example");
    expect(canonicalizeOrigin("http://localhost:3000/path")).toBe("http://localhost:3000");
    expect(canonicalizeOrigin("http://[::1]:3000")).toBe("http://[::1]:3000");
  });
  it("rejects redirects manually without forwarding credentials to their target", async () => {
    const seen: SeenRequest[] = [];
    const server = await startServer(async (request, response) => {
      seen.push({
        method: request.method ?? "",
        path: request.url ?? "",
        cookie: request.headers.cookie,
        body: await requestBody(request),
      });
      if (request.url === "/api/auth/sign-in/email") {
        response.writeHead(302, { location: "/attacker" });
        response.end();
        return;
      }
      json(response, 500, {});
    });
    const home = await temporaryHome();
    const result = await run(
      ["auth", "login", "--profile", "primary", "--api-url", server.origin],
      home,
    );
    expect(result.exitCode).toBe(cliExitCodes.authenticationFailure);
    expect(seen).toEqual([expect.objectContaining({ path: "/api/auth/sign-in/email" })]);
    expect(seen[0]?.body).toBe(JSON.stringify({ email: EMAIL, password: PASSWORD }));
    expect(`${result.stdout}${result.stderr}`).not.toContain(PASSWORD);
  });
  it("does not retarget an existing profile or forward new credentials to another origin", async () => {
    const home = await temporaryHome();
    const originalOrigin = "http://127.0.0.1:31337";
    await new ProfileStore(home).saveProfile(profile("primary", originalOrigin));
    let reads = 0;
    let fetches = 0;
    const output = memoryIo();
    expect(
      await runCommand(
        ["auth", "login", "--profile", "primary", "--api-url", "http://127.0.0.1:31338"],
        output.io,
        {
          home,
          credentialReader: {
            read: async () => {
              reads += 1;
              return { email: EMAIL, password: PASSWORD };
            },
          },
          fetcher: async () => {
            fetches += 1;
            return new Response();
          },
        },
      ),
    ).toBe(cliExitCodes.usageError);
    expect(reads).toBe(0);
    expect(fetches).toBe(0);
    expect((await new ProfileStore(home).readProfile("primary")).origin).toBe(originalOrigin);
  });
  it("isolates profiles and reports expired profiles as warnings while successful profiles keep exit 0", async () => {
    const seen: SeenRequest[] = [];
    const server = await startServer(async (request, response) => {
      seen.push({
        method: request.method ?? "",
        path: request.url ?? "",
        cookie: request.headers.cookie,
        body: await requestBody(request),
      });
      const cookie = request.headers.cookie;
      if (request.url === "/api/auth/get-session")
        return json(
          response,
          cookie === "better-auth.session_token=expired" ? 401 : 200,
          cookie === "better-auth.session_token=expired"
            ? null
            : { session: { id: "session-good" }, user: account("account-good") },
        );
      if (request.url === "/api/account/access-contexts")
        return json(response, 200, { data: contexts() });
      json(response, 500, {});
    });
    const home = await temporaryHome();
    const store = new ProfileStore(home);
    await store.saveProfile(
      profile("expired", server.origin, "expired", account("account-expired")),
    );
    await store.saveProfile(profile("good", server.origin, "good", account("account-good")));
    const result = await run(["access", "list", "--all-accounts", "--json"], home);
    expect(result.exitCode).toBe(cliExitCodes.success);
    expect(JSON.parse(result.stdout)).toMatchObject({
      success: true,
      output: { kind: "access", accounts: [{ profile: { name: "good" } }] },
      warnings: [{ code: "PROFILE_EXPIRED", profileName: "expired" }],
    });
    expect(
      seen.filter((entry) => entry.path === "/api/auth/get-session").map((entry) => entry.cookie),
    ).toEqual(["better-auth.session_token=expired", "better-auth.session_token=good"]);
    const allExpired = await temporaryHome();
    await new ProfileStore(allExpired).saveProfile(
      profile("only", server.origin, "expired", account("account-expired")),
    );
    const failure = await run(["access", "list", "--all-accounts", "--json"], allExpired);
    expect(failure.exitCode).toBe(cliExitCodes.aggregateFailure);
    expect(failure.stderr).toContain("AGGREGATE_FAILURE");
  });
  it("uses fresh explicit organization and event contexts, rejects ambiguity, and does not preserve revoked defaults", async () => {
    let revoked = false;
    const server = await startServer(async (request, response) => {
      await requestBody(request);
      if (request.url === "/api/auth/get-session")
        return json(response, 200, { session: { id: "session-1" }, user: account() });
      if (request.url === "/api/account/access-contexts")
        return json(
          response,
          200,
          revoked
            ? { data: [] }
            : {
                data: [
                  ...contexts(),
                  {
                    scope: "organization",
                    organization: { id: "org-b", name: "Bravo" },
                    roles: ["reviewer"],
                    capabilities: ["reviewer.workspace.read"],
                  },
                  {
                    scope: "event",
                    organization: { id: "org-b", name: "Bravo" },
                    event: { id: "event-a", name: "Bravo event" },
                    roles: ["reviewer"],
                    capabilities: ["reviewer.workspace.read"],
                  },
                ],
              },
        );
      json(response, 404, {});
    });
    const home = await temporaryHome();
    const store = new ProfileStore(home);
    await store.saveProfile(profile("primary", server.origin));
    await store.setActiveProfile("primary", { organizationId: "org-a", eventId: "event-a" });
    const ambiguous = await run(
      ["context", "use", "--profile", "primary", "--event", "event-a"],
      home,
    );
    expect(ambiguous.exitCode).toBe(cliExitCodes.authorizationFailure);
    expect(await store.readConfig()).toMatchObject({
      context: { organizationId: "org-a", eventId: "event-a" },
    });
    const explicit = await run(
      [
        "context",
        "use",
        "--profile",
        "primary",
        "--organization",
        "org-b",
        "--event",
        "event-a",
        "--json",
      ],
      home,
    );
    expect(explicit.exitCode).toBe(cliExitCodes.success);
    expect(JSON.parse(explicit.stdout)).toMatchObject({
      output: {
        kind: "access",
        accounts: [{ contexts: [{ organization: { id: "org-b" }, event: { id: "event-a" } }] }],
      },
    });
    expect(await store.readConfig()).toMatchObject({
      context: { organizationId: "org-b", eventId: "event-a" },
    });

    const selected = await run(["context", "show", "--json"], home);
    expect(selected.exitCode).toBe(cliExitCodes.success);
    expect(JSON.parse(selected.stdout)).toEqual({
      success: true,
      exitCode: 0,
      output: {
        kind: "access",
        accounts: [
          {
            profile: {
              name: "primary",
              origin: server.origin,
              account: account(),
            },
            contexts: [
              {
                scope: "event",
                organization: { id: "org-b", name: "Bravo" },
                event: { id: "event-a", name: "Bravo event" },
                roles: ["reviewer"],
                capabilities: ["reviewer.workspace.read"],
              },
            ],
          },
        ],
      },
      warnings: [],
      requestTraceIds: [],
    });
    expect(selected.stderr).toBe("");

    revoked = true;
    const stale = await run(["context", "show", "--json"], home);
    expect(stale.exitCode).toBe(cliExitCodes.authorizationFailure);
    expect(stale.stdout).toBe("");
    expect(JSON.parse(stale.stderr)).toEqual({
      success: false,
      exitCode: 4,
      error: {
        code: "INCOMPATIBLE_CONTEXT",
        message: "The saved context is no longer available",
      },
      requestTraceIds: [],
    });
    expect(await store.readConfig()).toMatchObject({
      context: { organizationId: "org-b", eventId: "event-a" },
    });
  });
  it("requires re-login when the session identity changes", async () => {
    const server = await startServer(async (request, response) => {
      await requestBody(request);
      if (request.url === "/api/auth/get-session")
        return json(response, 200, { session: { id: "session-2" }, user: account("account-2") });
      json(response, 500, {});
    });
    const home = await temporaryHome();
    const store = new ProfileStore(home);
    await store.saveProfile(profile("primary", server.origin));
    await store.setActiveProfile("primary");
    const result = await run(["access", "list", "--json"], home);
    expect(result.exitCode).toBe(cliExitCodes.authenticationFailure);
    expect(result.stderr).toContain("AUTHENTICATION_FAILED");
    expect(`${result.stdout}${result.stderr}`).not.toContain(COOKIE);
  });
  it("removes only the local shared-session profile without remote sign-out, and warns when remote sign-out fails", async () => {
    const remoteCalls: SeenRequest[] = [];
    const server = await startServer(async (request, response) => {
      remoteCalls.push({
        method: request.method ?? "",
        path: request.url ?? "",
        cookie: request.headers.cookie,
        origin: request.headers.origin,
        body: await requestBody(request),
      });
      json(response, 500, {});
    });
    const home = await temporaryHome();
    const shared = new ProfileStore(home);
    await shared.saveProfile(profile("first", server.origin));
    await shared.saveProfile(profile("second", server.origin));
    await shared.setActiveProfile("first");
    const sharedResult = await run(["auth", "logout", "--profile", "first", "--json"], home);
    expect(sharedResult.exitCode).toBe(cliExitCodes.success);
    expect(remoteCalls).toEqual([]);
    await expect(shared.readProfile("first")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(shared.readProfile("second")).resolves.toMatchObject({ name: "second" });
    const singleHome = await temporaryHome();
    const single = new ProfileStore(singleHome);
    await single.saveProfile(profile("only", server.origin));
    const failedRemote = await run(["auth", "logout", "--profile", "only", "--json"], singleHome);
    expect(failedRemote.exitCode).toBe(cliExitCodes.success);
    expect(JSON.parse(failedRemote.stdout)).toMatchObject({
      warnings: [{ code: "REMOTE_LOGOUT_FAILED", profileName: "only" }],
    });
    await expect(single.readProfile("only")).rejects.toMatchObject({ code: "ENOENT" });
    expect(remoteCalls).toEqual([
      expect.objectContaining({
        method: "POST",
        path: "/api/auth/sign-out",
        cookie: `better-auth.session_token=${COOKIE}`,
        origin: server.origin,
      }),
    ]);
    expect(`${failedRemote.stdout}${failedRemote.stderr}`).not.toContain(COOKIE);
  });
  it("rejects malformed non-TTY credential input with exit 2, USAGE_ERROR, and no credential leakage", async () => {
    const seen: SeenRequest[] = [];
    const home = await temporaryHome();
    const server = await startServer(async (request, response) => {
      seen.push({
        method: request.method ?? "",
        path: request.url ?? "",
        cookie: request.headers.cookie,
        body: await requestBody(request),
      });
      json(response, 500, {});
    });
    const malformedEmail = "private-email@example.test";
    const malformedPassword = "private-password";
    const result = await run(
      ["auth", "login", "--profile", "malformed", "--api-url", server.origin, "--json"],
      home,
      {
        read: () =>
          readCredentials({
            isTTY: false,
            readAll: async () => `${malformedEmail}\n${malformedPassword}\nextra-value\n`,
            prompt: async () => {
              throw new Error("Non-TTY input must not prompt");
            },
          }),
      },
    );
    expect(result.exitCode).toBe(cliExitCodes.usageError);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      success: false,
      exitCode: 2,
      error: { code: "USAGE_ERROR" },
    });
    expect(`${result.stdout}${result.stderr}`).not.toContain(malformedEmail);
    expect(`${result.stdout}${result.stderr}`).not.toContain(malformedPassword);
    expect(seen).toEqual([]);
  });
});
