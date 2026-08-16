import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbedUnavailable } from "../../features/embed/embed-frame";
import PublicEventAgendaPage from "../events/[eventSlug]/agenda/page";
import PublicEventPage from "../events/[eventSlug]/page";
import PublicWidgetPage from "./[eventSlug]/[view]/page";
import EmbedAgendaPage from "./[eventSlug]/agenda/page";
import SpeakerGalleryPage from "./[eventSlug]/speakers/page";

const missingEventSlug = "missing-program";
const emptyEmbedQuery = Promise.resolve({});

type PublicProgramPageLoader = () => Promise<ReactElement>;

const publicProgramPageLoaders: readonly (readonly [string, PublicProgramPageLoader])[] = [
  [
    "event sessions",
    () =>
      PublicEventPage({
        params: Promise.resolve({ eventSlug: missingEventSlug }),
        searchParams: emptyEmbedQuery,
      }),
  ],
  [
    "event agenda",
    () =>
      PublicEventAgendaPage({
        params: Promise.resolve({ eventSlug: missingEventSlug }),
        searchParams: emptyEmbedQuery,
      }),
  ],
  [
    "embed agenda",
    () =>
      EmbedAgendaPage({
        params: Promise.resolve({ eventSlug: missingEventSlug }),
        searchParams: emptyEmbedQuery,
      }),
  ],
  [
    "embed speakers",
    () =>
      SpeakerGalleryPage({
        params: Promise.resolve({ eventSlug: missingEventSlug }),
        searchParams: emptyEmbedQuery,
      }),
  ],
  [
    "embed sessions",
    () =>
      PublicWidgetPage({
        params: Promise.resolve({ eventSlug: missingEventSlug, view: "sessions" }),
        searchParams: emptyEmbedQuery,
      }),
  ],
];

function unavailablePublicProgramResponse(status: 404 | 503): Response {
  return Response.json(
    {
      error: {
        code: "PUBLICATION_UNAVAILABLE",
        message: "No published program is available.",
      },
    },
    { status },
  );
}

describe("public program route loaders", () => {
  beforeEach(() => {
    vi.stubEnv("API_UPSTREAM_ORIGIN", "http://localhost:8787");
    vi.stubEnv("APP_ENV", "local");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  for (const status of [404, 503] as const) {
    for (const [route, load] of publicProgramPageLoaders) {
      it(`renders the unavailable state for ${route} when the program API returns ${status}`, async () => {
        const publicFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
          unavailablePublicProgramResponse(status),
        );
        vi.stubGlobal("fetch", publicFetch);

        const page = await load();

        expect(page.type).toBe(EmbedUnavailable);
        expect(publicFetch).toHaveBeenCalledTimes(2);
        expect(publicFetch.mock.calls.map(([input]) => String(input))).toEqual(
          expect.arrayContaining([
            "http://localhost:8787/api/public/events/missing-program/agenda",
            "http://localhost:8787/api/public/events/missing-program/speakers",
          ]),
        );
      });
    }
  }
});
