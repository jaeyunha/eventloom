import { describe, expect, it } from "vitest";
import { PublicEmbedApiError } from "../api";
import {
  createLocalDemoAgenda,
  createLocalDemoSpeakerGallery,
  getPublishedProgramOrLocalDemo,
  isLocalEmbedDemoEnvironment,
  shouldUseLocalEmbedDemoForError,
} from "./projections";

describe("local public embed demo projections", () => {
  it("projects a coherent published event across the agenda and speaker gallery", () => {
    const agenda = createLocalDemoAgenda("open-sessionboard-conf");
    const gallery = createLocalDemoSpeakerGallery("open-sessionboard-conf");

    expect(agenda.event).toEqual(gallery.event);
    expect(agenda.revision).toEqual(gallery.revision);
    expect(agenda.event.slug).toBe("open-sessionboard-conf");
    expect(agenda.entries).toHaveLength(4);
    expect(gallery.speakers).toHaveLength(3);

    const publishedSpeakerNames = new Set(agenda.entries.flatMap((entry) => entry.speakerNames));
    expect(gallery.speakers.map((speaker) => speaker.displayName)).toEqual(
      expect.arrayContaining([...publishedSpeakerNames]),
    );
    expect(new Set(agenda.entries.map((entry) => entry.startsAt.slice(0, 10))).size).toBe(2);
  });

  it("requires the explicit local environment", () => {
    expect(isLocalEmbedDemoEnvironment("local")).toBe(true);
    expect(isLocalEmbedDemoEnvironment("staging")).toBe(false);
    expect(isLocalEmbedDemoEnvironment("production")).toBe(false);
    expect(isLocalEmbedDemoEnvironment(undefined)).toBe(false);
  });

  it("falls back only for local not-found or unavailable API responses", () => {
    const notFound = new PublicEmbedApiError("NOT_FOUND", "Not published", 404);
    const unavailable = new PublicEmbedApiError(
      "INTEGRATION_UNAVAILABLE",
      "Projection unavailable",
      503,
    );
    const unauthorized = new PublicEmbedApiError("UNAUTHORIZED", "Sign in", 401);

    expect(shouldUseLocalEmbedDemoForError("local", notFound)).toBe(true);
    expect(shouldUseLocalEmbedDemoForError("local", unavailable)).toBe(true);
    expect(shouldUseLocalEmbedDemoForError("local", unauthorized)).toBe(false);
    expect(shouldUseLocalEmbedDemoForError("local", new TypeError("Network failed"))).toBe(false);
    expect(shouldUseLocalEmbedDemoForError("production", notFound)).toBe(false);
  });

  it("uses only the original projection pair for local 404 and 503 demo fallback", async () => {
    for (const status of [404, 503] as const) {
      const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
      const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, ...(init === undefined ? {} : { init }) });
        return Response.json(
          { error: { code: "PUBLICATION_UNAVAILABLE", message: "No published event." } },
          { status },
        );
      };

      const program = await getPublishedProgramOrLocalDemo(
        "http://localhost:8787",
        "open-sessionboard-conf",
        "local",
        fetcher,
      );

      expect(program.agenda.event.slug).toBe("open-sessionboard-conf");
      expect(program.speakers.event.slug).toBe("open-sessionboard-conf");
      expect(calls).toHaveLength(2);
      expect(calls.map(({ init }) => init?.cache)).toEqual(["no-store", "no-store"]);
    }
  });

  it.each([
    [401, "UNAUTHORIZED"],
    [500, "INTERNAL_ERROR"],
  ] as const)(
    "does not let a fast local 404 mask a slower %i paired failure",
    async (status, code) => {
      const calls: Array<RequestInfo | URL> = [];
      const fetcher = async (input: RequestInfo | URL) => {
        calls.push(input);
        if (String(input).endsWith("/agenda")) {
          return Response.json(
            { error: { code: "PUBLICATION_NOT_FOUND", message: "No published agenda." } },
            { status: 404 },
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        return Response.json(
          { error: { code, message: "The speaker projection failed." } },
          { status },
        );
      };

      await expect(
        getPublishedProgramOrLocalDemo(
          "http://localhost:8787",
          "open-sessionboard-conf",
          "local",
          fetcher,
        ),
      ).rejects.toMatchObject({ code, status });
      expect(calls).toHaveLength(2);
    },
  );

  it("does not replace a successful real projection when its pair permits local fallback", async () => {
    const publishedAgenda = createLocalDemoAgenda("published-event");
    publishedAgenda.event.name = "Published by the API";
    const calls: Array<RequestInfo | URL> = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(input);
      if (String(input).endsWith("/agenda")) {
        return Response.json({ data: publishedAgenda });
      }
      return Response.json(
        { error: { code: "INTEGRATION_UNAVAILABLE", message: "Projection unavailable." } },
        { status: 503 },
      );
    };

    await expect(
      getPublishedProgramOrLocalDemo("http://localhost:8787", "published-event", "local", fetcher),
    ).rejects.toMatchObject({
      code: "INTEGRATION_UNAVAILABLE",
      status: 503,
      agendaError: undefined,
    });
    expect(calls).toHaveLength(2);
  });

  it("does not mask a publication mismatch with the local demo", async () => {
    const agenda = createLocalDemoAgenda("open-sessionboard-conf");
    const staleSpeakers = {
      ...createLocalDemoSpeakerGallery("open-sessionboard-conf"),
      revision: { id: "revision_2", number: 2, publishedAt: agenda.revision.publishedAt },
    };
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      return Response.json({
        data: String(input).endsWith("/agenda") ? agenda : staleSpeakers,
      });
    };

    await expect(
      getPublishedProgramOrLocalDemo(
        "http://localhost:8787",
        "open-sessionboard-conf",
        "local",
        fetcher,
      ),
    ).rejects.toMatchObject({
      code: "PUBLICATION_REVISION_MISMATCH",
      status: 409,
    });
    expect(calls).toHaveLength(3);
    expect(calls.map(({ init }) => init?.cache)).toEqual([
      "no-store",
      "no-store",
      "no-store",
    ]);
    expect(String(calls[2]?.input)).toMatch(/\/speakers$/u);
  });

  it("propagates non-local errors without a demo retry", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      return Response.json(
        { error: { code: "PUBLICATION_NOT_FOUND", message: "No published event." } },
        { status: 404 },
      );
    };

    await expect(
      getPublishedProgramOrLocalDemo(
        "https://open-sessionboard-api-production.ashleyha0317.workers.dev",
        "open-sessionboard-conf",
        "production",
        fetcher,
      ),
    ).rejects.toMatchObject({
      code: "PUBLICATION_NOT_FOUND",
      status: 404,
    });
    expect(calls).toHaveLength(2);
    expect(calls.map(({ init }) => init?.cache)).toEqual(["no-store", "no-store"]);
  });

  it("preserves a real published program in local", async () => {
    const agenda = createLocalDemoAgenda("published-event");
    const speakers = createLocalDemoSpeakerGallery("published-event");
    agenda.event.name = "Published by the API";
    speakers.event.name = "Published by the API";
    const fetchPublished = async (input: RequestInfo | URL) =>
      Response.json({ data: String(input).endsWith("/agenda") ? agenda : speakers });

    const program = await getPublishedProgramOrLocalDemo(
      "http://localhost:8787",
      "published-event",
      "local",
      fetchPublished,
    );

    expect(program.agenda.event.name).toBe("Published by the API");
    expect(program.speakers.event.slug).toBe("published-event");
  });

  it("fails closed for unexpected local failures", async () => {
    const calls: Array<RequestInfo | URL> = [];
    const internalError = async (input: RequestInfo | URL) => {
      calls.push(input);
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Unexpected failure." } },
        { status: 500 },
      );
    };

    await expect(
      getPublishedProgramOrLocalDemo(
        "http://localhost:8787",
        "open-sessionboard-conf",
        "local",
        internalError,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(calls).toHaveLength(2);
  });
});
