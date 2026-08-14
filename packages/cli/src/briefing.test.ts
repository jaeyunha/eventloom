import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BriefingItem, cliExitCodes } from "@eventloom/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { classifyBriefingItem, compareBriefingItems } from "./briefing";
import { runCommand } from "./command";
import { ProfileStore, type StoredProfile } from "./store";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const ORIGIN = "http://127.0.0.1:8787";
const homes: string[] = [];

function storedProfile(name: string): StoredProfile {
  return {
    name,
    origin: ORIGIN,
    account: { id: `account-${name}`, email: `${name}@example.test` },
    session: { name: "better-auth.session_token", value: `cookie-${name}` },
  };
}

async function setup(...names: string[]): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "eventloom-briefing-"));
  homes.push(home);
  const store = new ProfileStore(home);
  for (const name of names) await store.saveProfile(storedProfile(name));
  if (names[0] !== undefined) await store.setActiveProfile(names[0]);
  return home;
}

function response(status: number, body: unknown, traceId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(traceId === undefined ? {} : { "x-request-id": traceId }),
    },
  });
}

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    value: {
      writeStdout(value: string) {
        stdout.push(value);
      },
      writeStderr(value: string) {
        stderr.push(value);
      },
    },
  };
}

function contexts(profile: string) {
  if (profile === "empty") return [];
  return [
    {
      scope: "organization" as const,
      organization: { id: "org-a", name: "Alpha" },
      membershipRole: "owner" as const,
      roles: ["organizer"] as const,
      capabilities: ["organizer.overview.read"] as const,
    },
    {
      scope: "event" as const,
      organization: { id: "org-a", name: "Alpha" },
      event: { id: "event-a", name: "AlphaConf" },
      membershipRole: "owner" as const,
      roles: ["organizer", "reviewer", "speaker"] as const,
      capabilities: [
        "organizer.overview.read",
        "reviewer.workspace.read",
        "speaker.portal.read",
        "speaker.tasks.read",
      ] as const,
    },
  ];
}

function profileFromCookie(init?: RequestInit): string {
  const cookie = new Headers(init?.headers).get("cookie") ?? "";
  return cookie.slice(cookie.lastIndexOf("cookie-") + "cookie-".length);
}

function fixtureFetcher(
  options: {
    failReviewerFor?: string;
    warnReviewerFor?: string;
    failProfiles?: readonly string[];
    delayGate?: { active: number; max: number };
  } = {},
): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const profile = profileFromCookie(init);
    if (options.failProfiles?.includes(profile))
      return response(401, null, `trace-${profile}-expired`);
    if (url.pathname === "/api/auth/get-session") {
      return response(200, {
        user: storedProfile(profile).account,
        session: { id: `session-${profile}` },
      });
    }
    if (url.pathname === "/api/account/access-contexts")
      return response(200, { data: contexts(profile) });

    if (options.delayGate !== undefined) {
      options.delayGate.active += 1;
      options.delayGate.max = Math.max(options.delayGate.max, options.delayGate.active);
      await Promise.resolve();
      options.delayGate.active -= 1;
    }

    if (url.pathname.endsWith("/overview/core")) {
      return response(
        200,
        { data: { organizationId: "org-a", metrics: {}, events: [] } },
        `trace-${profile}-organizer-core`,
      );
    }
    if (url.pathname.endsWith("/overview/activity")) {
      return response(
        200,
        {
          data: {
            organizationId: "org-a",
            metrics: {},
            actionItems: [
              {
                id: "same-id",
                eventId: "event-a",
                title: "Organizer critical",
                dueAt: "2026-08-14T12:00:00.000Z",
                priority: 90,
                privatePayload: "must-not-leak",
              },
              {
                id: "organizer-high",
                eventId: "event-a",
                title: "Organizer high",
                dueAt: "2026-08-14T12:00:00.001Z",
                priority: 70,
              },
              {
                id: "organizer-normal",
                eventId: "event-a",
                title: "Organizer normal",
                dueAt: "2026-08-13T11:59:59.999Z",
                priority: 69,
              },
              {
                id: "organizer-later",
                eventId: "event-a",
                title: "Organizer later",
                dueAt: "2026-08-20T12:00:00.001Z",
                priority: 10,
              },
            ],
          },
        },
        `trace-${profile}-organizer-activity`,
      );
    }
    if (url.pathname === "/api/account/reviewer-workspace") {
      if (options.failReviewerFor === profile)
        return response(503, { error: { message: "failed" } }, `trace-${profile}-reviewer-failed`);
      return response(
        200,
        {
          data: {
            organizations: [
              {
                organization: { id: "org-a", name: "Alpha" },
                assignments: [
                  {
                    assignment: { id: "same-id", planId: "plan-a", roundId: "round-a" },
                    plan: { id: "plan-a", closesAt: "2026-08-15T12:00:00.000Z" },
                    round: { id: "round-a", closesAt: "2026-08-13T12:00:00.000Z" },
                    submission: {
                      id: "submission-private",
                      title: "Reviewer due now",
                      abstract: "must-not-leak",
                      answers: { secret: true },
                      participants: [{ email: "private@example.test" }],
                    },
                  },
                  {
                    assignment: { id: "review-undated", planId: "plan-b", roundId: "round-b" },
                    plan: { id: "plan-b", closesAt: null },
                    round: { id: "round-b", closesAt: null },
                    submission: {
                      id: "submission-private-2",
                      title: "Reviewer later",
                      answers: { secret: true },
                    },
                  },
                ],
              },
            ],
            warnings:
              options.warnReviewerFor === profile
                ? [
                    {
                      code: "WORKSPACE_UNAVAILABLE",
                      organization: { id: "org-a", name: "Alpha" },
                      message: "private provider base failed",
                    },
                  ]
                : [],
          },
        },
        `trace-${profile}-reviewer`,
      );
    }
    if (url.pathname === "/api/account/speaker-tasks") {
      return response(
        200,
        {
          data: {
            organizationId: "org-a",
            eventId: "event-a",
            tasks: [
              {
                taskId: "same-id",
                title: "Speaker upcoming",
                dueAt: "2026-08-20T12:00:00.000Z",
                status: "not_started",
                submission: { private: "must-not-leak" },
              },
              {
                taskId: "speaker-undated",
                title: "Speaker later",
                dueAt: null,
                status: "in_progress",
                upload: "must-not-leak",
              },
              {
                taskId: "speaker-undated",
                title: "Speaker duplicate",
                dueAt: null,
                status: "in_progress",
              },
            ],
          },
        },
        `trace-${profile}-speaker`,
      );
    }
    return response(404, {});
  };
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("briefing normalization", () => {
  it("uses exact urgency windows, severity thresholds, null placement, and comparator order", () => {
    expect(classifyBriefingItem(NOW, "2026-08-13T11:59:59.999Z", "normal")).toBe("Urgent");
    expect(classifyBriefingItem(NOW, "2026-08-14T12:00:00.000Z", "high")).toBe("Urgent");
    expect(classifyBriefingItem(NOW, "2026-08-14T12:00:00.001Z", "high")).toBe("Upcoming");
    expect(classifyBriefingItem(NOW, "2026-08-20T12:00:00.000Z", "normal")).toBe("Upcoming");
    expect(classifyBriefingItem(NOW, "2026-08-20T12:00:00.001Z", "normal")).toBe("Later");
    expect(classifyBriefingItem(NOW, null, "critical")).toBe("Later");

    const base = {
      profileName: "p",
      organization: { id: "org", name: "Org" },
      event: { id: "event", name: "Event" },
      title: "Work",
      urgency: "Urgent" as const,
    };
    const items = [
      { ...base, sourceId: "null", role: "speaker", severity: "normal", deadline: null },
      {
        ...base,
        sourceId: "normal",
        role: "speaker",
        severity: "normal",
        deadline: "2026-08-13T13:00:00.000Z",
      },
      {
        ...base,
        sourceId: "high",
        role: "reviewer",
        severity: "high",
        deadline: "2026-08-13T13:00:00.000Z",
      },
      {
        ...base,
        sourceId: "critical",
        role: "organizer",
        severity: "critical",
        deadline: "2026-08-13T13:00:00.000Z",
      },
      {
        ...base,
        sourceId: "overdue",
        role: "speaker",
        severity: "normal",
        deadline: "2026-08-13T11:59:59.999Z",
      },
    ] satisfies BriefingItem[];
    expect(
      [...items]
        .sort((left, right) => compareBriefingItems(left, right, NOW))
        .map((item) => item.sourceId),
    ).toEqual(["overdue", "critical", "high", "normal", "null"]);
  });
});

describe("briefing command", () => {
  it("aggregates all roles and two accounts deterministically without private fields", async () => {
    const home = await setup("alpha", "beta");
    const first = io();
    const firstExit = await runCommand(["briefing", "--all-accounts", "--json"], first.value, {
      home,
      fetcher: fixtureFetcher(),
      clock: () => NOW,
      briefingConcurrency: 2,
    });
    const second = io();
    const secondExit = await runCommand(["briefing", "--all-accounts", "--json"], second.value, {
      home,
      fetcher: fixtureFetcher(),
      clock: () => NOW,
      briefingConcurrency: 2,
    });

    expect(firstExit).toBe(cliExitCodes.success);
    expect(secondExit).toBe(cliExitCodes.success);
    expect(first.stdout.join("")).toBe(second.stdout.join(""));
    const envelope = JSON.parse(first.stdout.join(""));
    expect(envelope.output.briefing).toMatchObject({
      generatedAt: NOW.toISOString(),
      profiles: { requested: 2, succeeded: 2, failed: 0 },
      warnings: [],
    });
    expect(envelope.output.briefing.items).toHaveLength(16);
    expect(
      envelope.output.briefing.items.filter(
        (item: { sourceId: string }) => item.sourceId === "same-id",
      ),
    ).toHaveLength(6);
    expect(
      envelope.output.briefing.items.filter(
        (item: { sourceId: string }) => item.sourceId === "speaker-undated",
      ),
    ).toHaveLength(2);
    expect(envelope.output.briefing.requestTraceIds).toEqual([
      "trace-alpha-organizer-activity",
      "trace-alpha-organizer-core",
      "trace-alpha-reviewer",
      "trace-alpha-speaker",
      "trace-beta-organizer-activity",
      "trace-beta-organizer-core",
      "trace-beta-reviewer",
      "trace-beta-speaker",
    ]);
    const serialized = first.stdout.join("");
    for (const privateValue of [
      "abstract",
      "answers",
      "participants",
      "private@example.test",
      "privatePayload",
      "submission-private",
      "upload",
      "must-not-leak",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("bounds source fanout and groups human output as Urgent, Upcoming, Later", async () => {
    const home = await setup("alpha", "beta");
    const gate = { active: 0, max: 0 };
    const output = io();
    expect(
      await runCommand(["briefing", "--all-accounts"], output.value, {
        home,
        fetcher: fixtureFetcher({ delayGate: gate }),
        clock: () => NOW,
        briefingConcurrency: 1,
      }),
    ).toBe(0);
    expect(gate.max).toBeLessThanOrEqual(1);
    expect(output.stdout.join("")).toMatch(/^Urgent\n[\s\S]*\nUpcoming\n[\s\S]*\nLater\n/);
  });

  it("propagates reviewer organization warnings without turning successful data into a failed source", async () => {
    const home = await setup("alpha");
    const output = io();
    expect(
      await runCommand(["briefing", "--profile", "alpha", "--json"], output.value, {
        home,
        fetcher: fixtureFetcher({ warnReviewerFor: "alpha" }),
        clock: () => NOW,
      }),
    ).toBe(0);
    const envelope = JSON.parse(output.stdout.join(""));
    expect(envelope.output.briefing).toMatchObject({
      profiles: { requested: 1, succeeded: 1, failed: 0 },
      warnings: [
        {
          code: "REVIEWER_WORKSPACE_UNAVAILABLE",
          profileName: "alpha",
          organizationId: "org-a",
        },
      ],
    });
    expect(
      envelope.output.briefing.items.some((item: { role: string }) => item.role === "reviewer"),
    ).toBe(true);
    expect(output.stdout.join("")).not.toContain("private provider base failed");
  });

  it("keeps partial source and profile success, succeeds for zero work, and fails only when all profiles fail", async () => {
    const partialHome = await setup("alpha", "expired");
    const partial = io();
    expect(
      await runCommand(["briefing", "--all-accounts", "--json"], partial.value, {
        home: partialHome,
        fetcher: fixtureFetcher({ failReviewerFor: "alpha", failProfiles: ["expired"] }),
        clock: () => NOW,
      }),
    ).toBe(0);
    expect(JSON.parse(partial.stdout.join("")).output.briefing).toMatchObject({
      profiles: { requested: 2, succeeded: 1, failed: 1 },
      warnings: [
        {
          code: "CONTEXT_FAILED",
          profileName: "alpha",
          organizationId: "org-a",
          eventId: "event-a",
        },
        { code: "PROFILE_EXPIRED", profileName: "expired" },
      ],
    });

    const emptyHome = await setup("empty");
    const empty = io();
    expect(
      await runCommand(["briefing", "--profile", "empty", "--json"], empty.value, {
        home: emptyHome,
        fetcher: fixtureFetcher(),
        clock: () => NOW,
      }),
    ).toBe(0);
    expect(JSON.parse(empty.stdout.join("")).output.briefing).toMatchObject({
      profiles: { requested: 1, succeeded: 1, failed: 0 },
      items: [],
    });

    const failedHome = await setup("expired", "failed");
    const failed = io();
    expect(
      await runCommand(["briefing", "--all-accounts", "--json"], failed.value, {
        home: failedHome,
        fetcher: fixtureFetcher({ failProfiles: ["expired", "failed"] }),
        clock: () => NOW,
      }),
    ).toBe(cliExitCodes.aggregateFailure);
    expect(failed.stderr.join("")).toContain("AGGREGATE_FAILURE");
  });

  it("applies organization and event filters to fresh contexts and validates account selection", async () => {
    const home = await setup("alpha", "beta");
    const selected = io();
    expect(
      await runCommand(
        [
          "briefing",
          "--profile",
          "beta",
          "--organization",
          "org-a",
          "--event",
          "event-a",
          "--json",
        ],
        selected.value,
        {
          home,
          fetcher: fixtureFetcher(),
          clock: () => NOW,
        },
      ),
    ).toBe(0);
    const items = JSON.parse(selected.stdout.join("")).output.briefing.items;
    expect(
      items.every(
        (item: {
          profileName: string;
          organization: { id: string };
          event: { id: string } | null;
        }) =>
          item.profileName === "beta" &&
          item.organization.id === "org-a" &&
          item.event?.id === "event-a",
      ),
    ).toBe(true);

    const invalid = io();
    expect(
      await runCommand(["briefing", "--all-accounts", "--profile", "alpha"], invalid.value, {
        home,
      }),
    ).toBe(2);
  });
});
