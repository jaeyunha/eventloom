import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cliExitCodes } from "@eventloom/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "./command";
import { ProfileStore, type StoredProfile } from "./store";

const homes: string[] = [];
const origin = "http://127.0.0.1:8787";
const profile: StoredProfile = {
  name: "primary",
  origin,
  account: { id: "account-1", email: "agent@example.test" },
  session: { name: "better-auth.session_token", value: "secret-cookie" },
};
function contexts() {
  return [
    {
      scope: "organization" as const,
      organization: { id: "org-a", name: "Alpha" },
      membershipRole: "owner" as const,
      roles: ["organizer"] as const,
      capabilities: ["organizer.overview.read"] as const,
    },
    {
      scope: "organization" as const,
      organization: { id: "org-b", name: "Beta" },
      membershipRole: "admin" as const,
      roles: ["organizer"] as const,
      capabilities: ["organizer.overview.read"] as const,
    },
    {
      scope: "event" as const,
      organization: { id: "org-a", name: "Alpha" },
      event: { id: "shared-event", name: "Alpha event" },
      roles: ["reviewer", "speaker"] as const,
      capabilities: [
        "reviewer.workspace.read",
        "speaker.portal.read",
        "speaker.tasks.read",
      ] as const,
    },
    {
      scope: "event" as const,
      organization: { id: "org-b", name: "Beta" },
      event: { id: "shared-event", name: "Beta event" },
      roles: ["reviewer", "speaker"] as const,
      capabilities: [
        "reviewer.workspace.read",
        "speaker.portal.read",
        "speaker.tasks.read",
      ] as const,
    },
  ];
}
function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": `trace-${status}` },
  });
}
async function setup(context?: { organizationId: string; eventId?: string }): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "eventloom-workloads-"));
  homes.push(home);
  const store = new ProfileStore(home);
  await store.saveProfile(profile);
  await store.setActiveProfile(profile.name, context);
  return home;
}
function io() {
  const stdout: string[] = [],
    stderr: string[] = [];
  return {
    stdout,
    stderr,
    value: {
      writeStdout(text: string) {
        stdout.push(text);
      },
      writeStderr(text: string) {
        stderr.push(text);
      },
    },
  };
}
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("role workloads", () => {
  it("uses saved context to resolve ambiguity, rejects revoked saved context, and lets explicit flags override it", async () => {
    const selectedHome = await setup({ organizationId: "org-b", eventId: "shared-event" });
    const selectedPaths: string[] = [];
    const selectedFetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      selectedPaths.push(url.pathname + url.search);
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, { data: contexts() });
      if (url.pathname === "/api/account/speaker-tasks")
        return response(200, {
          data: {
            organizationId: url.searchParams.get("organizationId"),
            eventId: "shared-event",
            tasks: [],
          },
        });
      return response(404, {});
    };
    expect(
      await runCommand(["speaker", "tasks", "--json"], io().value, {
        home: selectedHome,
        fetcher: selectedFetcher,
      }),
    ).toBe(0);
    expect(selectedPaths.at(-1)).toBe(
      "/api/account/speaker-tasks?organizationId=org-b&eventId=shared-event",
    );

    const revokedHome = await setup({ organizationId: "org-b", eventId: "shared-event" });
    let revokedWorkloadCalls = 0;
    const revokedFetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, {
          data: contexts().filter((context) => context.organization.id === "org-a"),
        });
      revokedWorkloadCalls += 1;
      return response(200, {});
    };
    expect(
      await runCommand(["speaker", "tasks"], io().value, {
        home: revokedHome,
        fetcher: revokedFetcher,
      }),
    ).toBe(4);
    expect(revokedWorkloadCalls).toBe(0);

    const overrideHome = await setup({ organizationId: "org-b", eventId: "shared-event" });
    const overridePaths: string[] = [];
    const overrideFetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      overridePaths.push(url.pathname + url.search);
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, { data: contexts() });
      if (url.pathname === "/api/account/speaker-tasks")
        return response(200, {
          data: {
            organizationId: url.searchParams.get("organizationId"),
            eventId: "shared-event",
            tasks: [],
          },
        });
      return response(404, {});
    };
    expect(
      await runCommand(
        ["speaker", "tasks", "--organization", "org-a", "--event", "shared-event"],
        io().value,
        { home: overrideHome, fetcher: overrideFetcher },
      ),
    ).toBe(0);
    expect(overridePaths.at(-1)).toBe(
      "/api/account/speaker-tasks?organizationId=org-a&eventId=shared-event",
    );
  });

  it.each(["owner", "admin"] as const)(
    "preserves authoritative organizer membership role %s",
    async (membershipRole) => {
      const home = await setup();
      const fetcher: typeof fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/auth/get-session")
          return response(200, { user: profile.account, session: { id: "session-1" } });
        if (url.pathname === "/api/account/access-contexts")
          return response(200, {
            data: contexts()
              .filter(
                (context) =>
                  context.organization.id === "org-a" && context.scope === "organization",
              )
              .map((context) => ({ ...context, membershipRole })),
          });
        if (url.pathname.endsWith("/overview/core"))
          return response(200, { data: { organizationId: "org-a", metrics: {}, events: [] } });
        if (url.pathname.endsWith("/overview/activity"))
          return response(200, { data: { organizationId: "org-a", metrics: {}, actionItems: [] } });
        return response(404, {});
      };
      const output = io();
      expect(
        await runCommand(["organizer", "status", "--json"], output.value, { home, fetcher }),
      ).toBe(0);
      expect(JSON.parse(output.stdout.join("")).output.status.organizations[0].membershipRole).toBe(
        membershipRole,
      );
    },
  );

  it("emits a reviewer organization warning while preserving successful assignments", async () => {
    const home = await setup();
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, { data: contexts() });
      if (url.pathname === "/api/account/reviewer-workspace")
        return response(200, {
          data: {
            organizations: [{ organization: { id: "org-b", name: "Beta" }, assignments: [] }],
            warnings: [
              {
                code: "WORKSPACE_UNAVAILABLE",
                organization: { id: "org-b", name: "Beta" },
                message: "private provider base failed",
              },
            ],
          },
        });
      return response(404, {});
    };
    const output = io();
    expect(
      await runCommand(
        ["reviewer", "inbox", "--organization", "org-b", "--event", "shared-event", "--json"],
        output.value,
        { home, fetcher },
      ),
    ).toBe(0);
    const envelope = JSON.parse(output.stdout.join(""));
    expect(envelope.output.inbox).toMatchObject({
      assignments: [],
      warnings: [
        { code: "REVIEWER_WORKSPACE_UNAVAILABLE", profileName: "primary", organizationId: "org-b" },
      ],
    });
    expect(envelope.warnings).toEqual(envelope.output.inbox.warnings);
    expect(output.stdout.join("")).not.toContain("private provider base failed");
  });

  it("reads organizer status from organization-qualified core and activity routes", async () => {
    const home = await setup(),
      paths: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname + url.search);
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, { data: contexts() });
      if (url.pathname.endsWith("/overview/core"))
        return response(200, {
          data: { organizationId: "org-a", metrics: { eventCount: 1 }, events: [] },
        });
      if (url.pathname.endsWith("/overview/activity"))
        return response(200, {
          data: {
            organizationId: "org-a",
            metrics: {},
            actionItems: [
              {
                id: "action-1",
                eventId: "shared-event",
                type: "speaker_tasks",
                title: "Collect slides",
                description: "",
                count: 1,
                priority: 90,
                dueAt: null,
                href: "/admin",
              },
            ],
          },
        });
      return response(404, {});
    };
    const output = io();
    expect(
      await runCommand(["organizer", "status", "--organization", "org-a", "--json"], output.value, {
        home,
        fetcher,
      }),
    ).toBe(cliExitCodes.success);
    expect(paths).toEqual([
      "/api/auth/get-session",
      "/api/account/access-contexts",
      "/api/admin/organizations/org-a/overview/core",
      "/api/admin/organizations/org-a/overview/activity",
    ]);
    expect(JSON.parse(output.stdout.join(""))).toMatchObject({
      output: {
        kind: "organizerStatus",
        status: {
          organizations: [
            {
              organization: { id: "org-a", name: "Alpha" },
              membershipRole: "owner",
              actionItems: [{ id: "action-1", priority: 90 }],
            },
          ],
        },
      },
    });
  });

  it("uses the tenant-explicit reviewer route and emits only blind-safe projections", async () => {
    const home = await setup(),
      paths: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname + url.search);
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, { data: contexts() });
      if (url.pathname === "/api/account/reviewer-workspace")
        return response(200, {
          data: {
            organizations: [
              {
                organization: { id: "org-b", name: "Beta" },
                assignments: [
                  {
                    assignment: {
                      id: "assignment-1",
                      eventId: "shared-event",
                      planId: "plan-1",
                      roundId: "round-1",
                    },
                    plan: { id: "plan-1", closesAt: null },
                    round: { id: "round-1", closesAt: "2026-08-20T12:00:00.000Z" },
                    submission: {
                      id: "submission-1",
                      title: "Blind title",
                      abstract: "must not leak",
                      answers: { secret: "must not leak" },
                      participants: [{ email: "must-not-leak@example.test" }],
                      identityRedacted: true,
                    },
                    review: null,
                    suggestions: [],
                  },
                ],
              },
            ],
            warnings: [],
          },
        });
      return response(404, {});
    };
    const output = io();
    expect(
      await runCommand(
        ["reviewer", "inbox", "--organization", "org-b", "--event", "shared-event", "--json"],
        output.value,
        { home, fetcher },
      ),
    ).toBe(0);
    expect(paths.at(-1)).toBe(
      "/api/account/reviewer-workspace?organizationId=org-b&eventId=shared-event",
    );
    const serialized = output.stdout.join("");
    expect(serialized).toContain("Blind title");
    expect(serialized).not.toContain("abstract");
    expect(serialized).not.toContain("answers");
    expect(serialized).not.toContain("must-not-leak@example.test");
  });

  it("reads all speaker contexts only through the organization-qualified account route", async () => {
    const home = await setup(),
      paths: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname + url.search);
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, { data: contexts() });
      if (url.pathname === "/api/account/speaker-tasks") {
        const organizationId = url.searchParams.get("organizationId") ?? "";
        return response(200, {
          data: {
            organizationId,
            eventId: "shared-event",
            tasks: [
              {
                taskId: "task-1",
                title: `${organizationId} slides`,
                dueAt: null,
                status: "not_started",
              },
            ],
          },
        });
      }
      return response(404, {});
    };
    const output = io();
    expect(
      await runCommand(["speaker", "tasks", "--all-contexts", "--json"], output.value, {
        home,
        fetcher,
      }),
    ).toBe(0);
    expect(paths.filter((path) => path.startsWith("/api/account/speaker-tasks"))).toEqual([
      "/api/account/speaker-tasks?organizationId=org-a&eventId=shared-event",
      "/api/account/speaker-tasks?organizationId=org-b&eventId=shared-event",
    ]);
    expect(paths.some((path) => path.startsWith("/api/speaker/events/"))).toBe(false);
  });

  it("requires explicit selection for ambiguous contexts and denies final workload authorization without fallback", async () => {
    const home = await setup();
    let workloadCalls = 0;
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, { data: contexts() });
      workloadCalls += 1;
      return response(403, { error: { code: "ACCESS_DENIED", message: "revoked" } });
    };
    expect(
      await runCommand(["speaker", "tasks", "--event", "shared-event"], io().value, {
        home,
        fetcher,
      }),
    ).toBe(4);
    expect(workloadCalls).toBe(0);
    expect(
      await runCommand(
        ["speaker", "tasks", "--organization", "org-a", "--event", "shared-event"],
        io().value,
        { home, fetcher },
      ),
    ).toBe(4);
    expect(workloadCalls).toBe(1);
  });

  it("denies organizer status for a reviewer-only fresh context", async () => {
    const home = await setup();
    let overviewCalls = 0;
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/auth/get-session")
        return response(200, { user: profile.account, session: { id: "session-1" } });
      if (url.pathname === "/api/account/access-contexts")
        return response(200, {
          data: contexts()
            .filter((context) => context.organization.id === "org-a" && context.scope === "event")
            .map((context) => ({
              ...context,
              roles: ["reviewer"],
              capabilities: ["reviewer.workspace.read"],
            })),
        });
      overviewCalls += 1;
      return response(200, {});
    };
    expect(
      await runCommand(["organizer", "status", "--organization", "org-a"], io().value, {
        home,
        fetcher,
      }),
    ).toBe(4);
    expect(overviewCalls).toBe(0);
  });
});
