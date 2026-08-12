import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createOrganizerEventsApi, type OrganizerEventRecord } from "../admin/organizer-overview";
import {
  DEFAULT_EMBED_ACCENT,
  EMBED_WIDGETS,
  EmbedWorkspaceView,
  iframeSnippet,
  publicAgendaCalendarUrl,
  publicEmbedUrl,
  scriptSnippet,
  verifyEmbedPublication,
} from "./embed-workspace";

const agenda = EMBED_WIDGETS.find((widget) => widget.id === "agenda");
const gallery = EMBED_WIDGETS.find((widget) => widget.id === "gallery");
const itinerary = EMBED_WIDGETS.find((widget) => widget.id === "itinerary");
if (!agenda || !gallery || !itinerary) {
  throw new Error("Embed widget definitions are incomplete.");
}

const configuration = {
  id: "configuration-1",
  name: "Main schedule",
  widgetId: "agenda" as const,
  enabled: true,
  theme: "dark" as const,
  outputFormat: "json" as const,
  layout: "timeline" as const,
  accent: "#13885f",
  backgroundColor: "#ffffff",
  textColor: "#20232b",
  customCss: ".host { color: red; }",
  displayFields: ["title", "date-time", "room"] as const,
  tracks: ["Track A", "Track B"] as const,
  statuses: ["Approved"] as const,
};

const eventRecord: OrganizerEventRecord = {
  id: "event-1",
  organizationId: "org-1",
  slug: "summit-2026",
  name: "Summit 2026",
  status: "active",
  timeZone: "UTC",
  startsAt: "2026-09-17T00:00:00.000Z",
  endsAt: "2026-09-18T00:00:00.000Z",
  venue: null,
  cfpSettings: { enabled: false, opensAt: null, closesAt: null },
  defaultCalendarSettings: { durationMinutes: 30, timeZone: "UTC", location: null },
  embedConfigurations: [configuration],
  version: 7,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "organizer-1",
  updatedBy: "organizer-1",
};

describe("authoritative embed configuration transport", () => {
  it("replaces the complete event configuration list with expectedVersion", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const api = createOrganizerEventsApi(
      "https://api.example.test/",
      "org-1",
      async (url, init) => {
        requestedUrl = String(url);
        requestedInit = init;
        return new Response(JSON.stringify({ data: { ...eventRecord, version: 8 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(
      api.updateEvent("event-1", {
        expectedVersion: 7,
        embedConfigurations: [configuration],
      }),
    ).resolves.toMatchObject({ version: 8, embedConfigurations: [configuration] });
    expect(requestedUrl).toBe(
      "https://api.example.test/api/admin/organizations/org-1/events/event-1",
    );
    expect(requestedInit?.credentials).toBe("include");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      expectedVersion: 7,
      embedConfigurations: [configuration],
    });
  });
  it("loads the server configuration list rather than browser state", async () => {
    const api = createOrganizerEventsApi(
      "https://api.example.test",
      "org-1",
      async () =>
        new Response(JSON.stringify({ data: eventRecord }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(api.getEvent("event-1")).resolves.toMatchObject({
      version: 7,
      embedConfigurations: [configuration],
    });
  });
});

describe("safe live embed URLs", () => {
  it("encodes every selected safe option and excludes raw custom CSS", () => {
    const url = new URL(
      publicEmbedUrl({
        widget: agenda,
        eventSlug: "summit / 2026",
        publicOrigin: "https://sessionboard.example/",
        theme: configuration.theme,
        outputFormat: configuration.outputFormat,
        layout: configuration.layout,
        displayFields: configuration.displayFields,
        accent: configuration.accent,
        backgroundColor: configuration.backgroundColor,
        textColor: configuration.textColor,
        tracks: configuration.tracks,
        statuses: configuration.statuses,
        customCss: configuration.customCss,
      }),
    );

    expect(url.origin).toBe("https://sessionboard.example");
    expect(url.pathname).toBe("/embed/summit%20%2F%202026/agenda");
    expect(url.searchParams.get("theme")).toBe("dark");
    expect(url.searchParams.get("outputFormat")).toBe("json");
    expect(url.searchParams.get("layout")).toBe("timeline");
    expect(url.searchParams.get("displayFields")).toBe("title,date-time,room");
    expect(url.searchParams.get("accent")).toBe("#13885f");
    expect(url.searchParams.get("backgroundColor")).toBe("#ffffff");
    expect(url.searchParams.get("textColor")).toBe("#20232b");
    expect(url.searchParams.get("tracks")).toBe("Track A,Track B");
    expect(url.searchParams.get("statuses")).toBe("Approved");
    expect(url.searchParams.get("customCss")).toBeNull();
    expect(url.toString()).not.toContain("color%3A");
  });

  it("uses the real same-origin agenda feed for iCal output", () => {
    expect(
      publicAgendaCalendarUrl({
        widget: itinerary,
        eventSlug: "summit / 2026",
        publicOrigin: "https://sessionboard.example/",
        theme: "auto",
      }),
    ).toBe("https://sessionboard.example/api/public/events/summit%20%2F%202026/agenda.ics");
  });

  it("uses the same safe query on copied iframe and script sources", () => {
    const settings = {
      widget: agenda,
      eventSlug: "summit-2026",
      publicOrigin: "https://sessionboard.example",
      theme: "light" as const,
      outputFormat: "styled-html" as const,
      layout: "timeline" as const,
      accent: DEFAULT_EMBED_ACCENT,
      displayFields: ["title", "date-time"] as const,
      tracks: ["Track A"] as const,
      statuses: ["Approved"] as const,
    };
    const iframe = iframeSnippet(settings);
    const script = scriptSnippet(settings);

    expect(iframe).toContain('src="https://sessionboard.example/embed/summit-2026/agenda?');
    expect(iframe).toContain("outputFormat=styled-html");
    expect(script).toContain('src="https://sessionboard.example/embed/summit-2026/script?');
    expect(script).toContain("displayFields=title%2Cdate-time");
  });

  it("grants schedule storage and downloads only to the itinerary iframe", () => {
    const base = {
      eventSlug: "summit-2026",
      publicOrigin: "https://sessionboard.example",
      theme: "light" as const,
      outputFormat: "styled-html" as const,
      accent: DEFAULT_EMBED_ACCENT,
    };

    expect(iframeSnippet({ ...base, widget: itinerary })).toContain(
      'sandbox="allow-downloads allow-same-origin allow-scripts"',
    );
    expect(iframeSnippet({ ...base, widget: itinerary })).toContain("min-height:720px");
    expect(iframeSnippet({ ...base, widget: agenda })).toContain(
      'sandbox="allow-downloads allow-scripts"',
    );
    expect(iframeSnippet({ ...base, widget: gallery })).toContain('sandbox="allow-scripts"');
    expect(iframeSnippet({ ...base, widget: gallery })).toContain("min-height:760px");
  });
  it("keeps the gallery alias on the speakers route and never emits private fields", () => {
    const settings = {
      widget: gallery,
      eventSlug: "summit-2026",
      publicOrigin: "https://sessionboard.example",
      theme: "light" as const,
      outputFormat: "styled-html" as const,
      layout: "grid" as const,
      accent: DEFAULT_EMBED_ACCENT,
    };
    expect(publicEmbedUrl(settings)).toContain("/embed/summit-2026/speakers?");
    expect(scriptSnippet(settings)).toContain('data-view="speakers"');
    expect(scriptSnippet(settings)).not.toContain("private");
  });
});

describe("embed publication refresh verification", () => {
  const projectionResponse = (
    slug = "summit-2026",
    revision: { readonly id: string; readonly number: number; readonly publishedAt: string } = {
      id: "revision-7",
      number: 7,
      publishedAt: "2026-08-12T10:00:00.000Z",
    },
  ) =>
    new Response(
      JSON.stringify({
        data: {
          event: { slug },
          revision,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("reloads both public projections without cache and accepts their expected revision", async () => {
    const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      return projectionResponse();
    };

    await expect(
      verifyEmbedPublication({
        eventSlug: "summit-2026",
        expectedPublishedRevision: { id: "revision-7", number: 7 },
        fetcher,
      }),
    ).resolves.toMatchObject({
      revision: { id: "revision-7", number: 7 },
    });
    expect(requests.map((request) => request.url)).toEqual([
      "/api/public/events/summit-2026/agenda.json",
      "/api/public/events/summit-2026/speakers",
    ]);
    expect(
      requests.every(
        (request) =>
          request.init?.cache === "no-store" && request.init.credentials === "same-origin",
      ),
    ).toBe(true);
  });

  it("rejects agenda and speaker projections from different revisions", async () => {
    let request = 0;
    const fetcher = async (): Promise<Response> => {
      request += 1;
      return projectionResponse("summit-2026", {
        id: `revision-${request}`,
        number: request,
        publishedAt: "2026-08-12T10:00:00.000Z",
      });
    };

    await expect(verifyEmbedPublication({ eventSlug: "summit-2026", fetcher })).rejects.toThrow(
      "different revisions",
    );
  });

  it("rejects projections that do not match the expected published revision", async () => {
    await expect(
      verifyEmbedPublication({
        eventSlug: "summit-2026",
        expectedPublishedRevision: { id: "revision-8", number: 8 },
        fetcher: async () => projectionResponse(),
      }),
    ).rejects.toThrow("expected published revision");
  });

  it("rejects a projection for another event without treating the pair as refreshed", async () => {
    let request = 0;
    const fetcher = async (): Promise<Response> => {
      request += 1;
      return projectionResponse(request === 1 ? "summit-2026" : "other-event");
    };

    await expect(verifyEmbedPublication({ eventSlug: "summit-2026", fetcher })).rejects.toThrow(
      "does not match this embed event",
    );
  });
});

describe("embed workspace view", () => {
  it("renders server configurations with explicit enabled controls and privacy boundary copy", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "summit-2026",
        eventVersion: eventRecord.version,
        initialConfigurations: eventRecord.embedConfigurations ?? [],
        publicOrigin: "https://sessionboard.example",
      }),
    );

    expect(markup).toContain("Widget configurations");
    expect(markup).toContain("Main schedule");
    expect(markup).toContain("Disable Main schedule");
    expect(markup).toContain("Layout");
    expect(markup).toContain("Custom CSS stays in the host markup");
    expect(markup).toContain("Sessions List");
    expect(markup).toContain("Speakers List");
    expect(markup).toContain("Agenda");
    expect(markup).toContain("Schedule Itinerary");
    expect(markup).toContain("Speaker Gallery");
    expect(markup).toContain("Accent color");
    expect(markup).toContain("Live public preview");
    expect(markup).toContain("Copy iframe code");
    expect(markup).toContain("Public and self-updating");
    expect(markup).not.toContain("browser-local");
    expect(markup).not.toContain("privateDraft");
    expect(markup).not.toContain("objectKey");
  });

  it("renders the published calendar feed for saved iCal configurations", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "summit-2026",
        eventVersion: eventRecord.version,
        initialConfigurations: [{ ...configuration, outputFormat: "ical" }],
        publicOrigin: "https://sessionboard.example",
      }),
    );

    expect(markup).toContain(
      "https://sessionboard.example/api/public/events/summit-2026/agenda.ics",
    );
    expect(markup).not.toContain(
      "# Use the published agenda calendar link when that feed is enabled.",
    );
  });
});
