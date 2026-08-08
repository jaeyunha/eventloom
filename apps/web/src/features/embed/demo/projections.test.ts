import { describe, expect, it } from "vitest";
import { PublicEmbedApiError } from "../api";
import {
  createLocalDemoAgenda,
  createLocalDemoSpeakerGallery,
  getPublishedAgendaOrLocalDemo,
  getPublishedSpeakersOrLocalDemo,
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

    const publishedSpeakerNames = new Set(
      agenda.entries.flatMap((entry) => entry.speakerNames),
    );
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

  it("loads demo projections only for eligible local API responses", async () => {
    const notFound = async () =>
      Response.json(
        { error: { code: "NOT_FOUND", message: "No published event." } },
        { status: 404 },
      );
    const unavailable = async () =>
      Response.json(
        { error: { code: "INTEGRATION_UNAVAILABLE", message: "Projection unavailable." } },
        { status: 503 },
      );

    const agenda = await getPublishedAgendaOrLocalDemo(
      "http://localhost:8787",
      "open-sessionboard-conf",
      "local",
      notFound,
    );
    const gallery = await getPublishedSpeakersOrLocalDemo(
      "http://localhost:8787",
      "open-sessionboard-conf",
      "local",
      unavailable,
    );

    expect(agenda.entries.map((entry) => entry.title)).toContain(
      "Systems that stay understandable",
    );
    expect(gallery.speakers.map((speaker) => speaker.displayName)).toContain("Morgan Lee");
  });

  it("preserves a real published projection in local", async () => {
    const published = createLocalDemoAgenda("published-event");
    published.event.name = "Published by the API";
    const fetchPublished = async () => Response.json({ data: published });

    const agenda = await getPublishedAgendaOrLocalDemo(
      "http://localhost:8787",
      "published-event",
      "local",
      fetchPublished,
    );

    expect(agenda.event.name).toBe("Published by the API");
    expect(agenda.event.slug).toBe("published-event");
  });

  it("fails closed outside local and for unexpected local failures", async () => {
    const notFound = async () =>
      Response.json(
        { error: { code: "NOT_FOUND", message: "No published event." } },
        { status: 404 },
      );
    const internalError = async () =>
      Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Unexpected failure." } },
        { status: 500 },
      );

    await expect(
      getPublishedAgendaOrLocalDemo(
        "https://api.example.test",
        "open-sessionboard-conf",
        "production",
        notFound,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(
      getPublishedSpeakersOrLocalDemo(
        "http://localhost:8787",
        "open-sessionboard-conf",
        "local",
        internalError,
      ),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
  });
});
