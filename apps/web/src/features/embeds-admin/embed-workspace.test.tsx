import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbedWorkspaceView } from "./embed-workspace";
import {
  createEmbedWorkspaceApi,
  DEFAULT_EMBED_ACCENT,
  EMBED_WIDGETS,
  type EmbedEventRecord,
  type EmbedPublicationMetadata,
  iframeSnippet,
  normalizeEmbedSlug,
  parseEmbedPublicationResponse,
  publicAgendaCalendarUrl,
  publicEmbedUrl,
  scriptSnippet,
  verifyEmbedPublication,
} from "./embed-workspace-model";

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
  trackIds: ["track-a", "track-b"] as const,
  statuses: ["Approved"] as const,
  revision: 4,
};
const publication: EmbedPublicationMetadata = {
  state: null,
  status: "served",
  servedRevision: 12,
  pendingRevision: null,
  failedReason: null,
  agendaDraftVersion: 12,
  publicRevision: {
    id: "agenda-revision-12",
    number: 12,
    publishedAt: "2026-08-07T12:00:00.000Z",
  },
  previewAvailability: "available" as const,
  message: "Preview and code use this exact published revision.",
};

const eventRecord: EmbedEventRecord = {
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

describe("embed publication response parsing", () => {
  it("accepts a nullable data envelope for an unpublished event", () => {
    expect(parseEmbedPublicationResponse({ data: null }, "org-1", "event-1")).toBeNull();
  });

  it.each([{}, { data: "unpublished" }, { data: [] }])(
    "rejects an invalid publication envelope: %j",
    (payload) => {
      expect(() => parseEmbedPublicationResponse(payload, "org-1", "event-1")).toThrow(
        "publication response",
      );
    },
  );
});

describe("authoritative embed configuration transport", () => {
  it("replaces the complete event configuration list with expectedVersion", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const api = createEmbedWorkspaceApi("org-1", async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return new Response(JSON.stringify({ data: { ...eventRecord, version: 8 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(
      api.updateEvent("event-1", {
        expectedVersion: 7,
        embedConfigurations: [configuration],
      }),
    ).resolves.toMatchObject({ version: 8, embedConfigurations: [configuration] });
    expect(requestedUrl).toBe("/api/admin/organizations/org-1/events/event-1");
    expect(requestedInit?.credentials).toBe("include");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      expectedVersion: 7,
      embedConfigurations: [configuration],
    });
  });
  it("loads the server configuration list rather than browser state", async () => {
    const api = createEmbedWorkspaceApi(
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
        publicOrigin: "https://eventloom.example/",
        theme: configuration.theme,
        outputFormat: configuration.outputFormat,
        layout: configuration.layout,
        displayFields: configuration.displayFields,
        accent: configuration.accent,
        backgroundColor: configuration.backgroundColor,
        textColor: configuration.textColor,
        trackIds: configuration.trackIds,
        statuses: configuration.statuses,
        customCss: configuration.customCss,
      }),
    );

    expect(url.origin).toBe("https://eventloom.example");
    expect(url.pathname).toBe("/embed/summit%20%2F%202026/agenda");
    expect(url.searchParams.get("theme")).toBe("dark");
    expect(url.searchParams.get("outputFormat")).toBe("json");
    expect(url.searchParams.get("layout")).toBe("timeline");
    expect(url.searchParams.get("displayFields")).toBe("title,date-time,room");
    expect(url.searchParams.get("accent")).toBe("#13885f");
    expect(url.searchParams.get("backgroundColor")).toBe("#ffffff");
    expect(url.searchParams.get("textColor")).toBe("#20232b");
    expect(url.searchParams.get("trackIds")).toBe("track-a,track-b");
    expect(url.searchParams.get("statuses")).toBe("Approved");
    expect(url.searchParams.get("customCss")).toBeNull();
    expect(url.toString()).not.toContain("color%3A");
  });
  it("withholds URLs when the authoritative event slug is absent", () => {
    expect(normalizeEmbedSlug(undefined)).toBeNull();
    expect(
      publicEmbedUrl({
        widget: agenda,
        eventSlug: "",
        publicOrigin: "https://eventloom.example",
        theme: "light",
      }),
    ).toBe("");
    expect(
      publicAgendaCalendarUrl({
        widget: agenda,
        eventSlug: " ",
        publicOrigin: "https://eventloom.example",
        theme: "light",
      }),
    ).toBe("");
    expect(
      scriptSnippet({
        widget: agenda,
        eventSlug: "",
        publicOrigin: "https://eventloom.example",
        theme: "light",
      }),
    ).toBe("");
  });

  it("uses the real same-origin agenda feed for iCal output", () => {
    const url = new URL(
      publicAgendaCalendarUrl({
        widget: itinerary,
        eventSlug: "summit / 2026",
        publicOrigin: "https://eventloom.example/",
        theme: "auto",
      }),
    );
    expect(url.origin).toBe("https://eventloom.example");
    expect(url.pathname).toBe("/api/public/events/summit%20%2F%202026/agenda.ics");
  });

  it("uses the same safe query on copied iframe and script sources", () => {
    const settings = {
      widget: agenda,
      eventSlug: "summit-2026",
      publicOrigin: "https://eventloom.example",
      theme: "light" as const,
      outputFormat: "styled-html" as const,
      layout: "timeline" as const,
      accent: DEFAULT_EMBED_ACCENT,
      displayFields: ["title", "date-time"] as const,
      trackIds: ["track-a"] as const,
      statuses: ["Approved"] as const,
    };
    const iframe = iframeSnippet(settings);
    const script = scriptSnippet(settings);

    expect(iframe).toContain('src="https://eventloom.example/embed/summit-2026/agenda?');
    expect(iframe).toContain("outputFormat=styled-html");
    expect(script).toContain('src="https://eventloom.example/embed/summit-2026/script?');
    expect(script).toContain("displayFields=title%2Cdate-time");
  });

  it("keeps same-origin styling in every iframe and grants extra capabilities narrowly", () => {
    const base = {
      eventSlug: "summit-2026",
      publicOrigin: "https://eventloom.example",
      theme: "light" as const,
      outputFormat: "styled-html" as const,
      accent: DEFAULT_EMBED_ACCENT,
    };

    expect(iframeSnippet({ ...base, widget: itinerary })).toContain(
      'sandbox="allow-downloads allow-same-origin allow-scripts"',
    );
    expect(iframeSnippet({ ...base, widget: itinerary })).toContain("min-height:720px");
    expect(iframeSnippet({ ...base, widget: agenda })).toContain(
      'sandbox="allow-downloads allow-same-origin allow-scripts"',
    );
    expect(iframeSnippet({ ...base, widget: gallery })).toContain(
      'sandbox="allow-same-origin allow-scripts"',
    );
    expect(iframeSnippet({ ...base, widget: gallery })).toContain("min-height:760px");
  });
  it("keeps the gallery alias on the speakers route and never emits private fields", () => {
    const settings = {
      widget: gallery,
      eventSlug: "summit-2026",
      publicOrigin: "https://eventloom.example",
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
  it("renders server configurations with explicit enabled controls and public-data safeguards", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "summit-2026",
        eventVersion: eventRecord.version,
        initialConfigurations: eventRecord.embedConfigurations ?? [],
        publicOrigin: "https://eventloom.example",
        publication,
      }),
    );

    expect(markup).toContain("Main schedule");
    expect(markup).toContain("Disable Main schedule");
    expect(markup).toContain("Layout");
    expect(markup).toContain("Sessions List");
    expect(markup).toContain("Speakers List");
    expect(markup).toContain("Agenda");
    expect(markup).toContain("Schedule Itinerary");
    expect(markup).toContain("Speaker Gallery");
    expect(markup).toContain("Accent color");
    expect(markup).toContain("Copy iframe code");
    expect(markup).toContain("Published data only");
    expect(markup).toContain('aria-label="Widget setup"');
    expect(markup).toContain('aria-label="Widget preview studio"');
    expect(markup).toContain('aria-label="Publication status"');
    expect(markup).toContain("<iframe");
    expect(markup).toContain("Draft event");
    expect(markup).toContain("Served program revision");
    expect(markup).toContain("Publication state");
    expect(markup).not.toContain("browser-local");
    expect(markup).not.toContain("privateDraft");
    expect(markup).not.toContain("objectKey");
  });
  it("withholds distribution while a scoped event snapshot is loading", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "stale-summit-2025",
        eventVersion: eventRecord.version,
        initialConfigurations: eventRecord.embedConfigurations ?? [],
        publicOrigin: "https://eventloom.example",
        publication,
        loading: true,
      }),
    );

    expect(markup).toContain('data-slot="empty"');
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("stale-summit-2025");
  });

  it("renders the published calendar feed for saved iCal configurations", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "summit-2026",
        eventVersion: eventRecord.version,
        initialConfigurations: [{ ...configuration, outputFormat: "ical" }],
        publicOrigin: "https://eventloom.example",
        publication,
      }),
    );

    expect(markup).toContain("https://eventloom.example/api/public/events/summit-2026/agenda.ics");
    expect(markup).not.toContain(
      "# Use the published agenda calendar link when that feed is enabled.",
    );
  });
  it("withholds preview and code when the public projection is absent", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "summit-2026",
        eventVersion: eventRecord.version,
        initialConfigurations: eventRecord.embedConfigurations ?? [],
        publicOrigin: "https://eventloom.example",
      }),
    );

    expect(markup).toContain('data-slot="empty"');
    expect(markup).toContain('href="/admin/organizations/org-1/events/event-1/agenda"');
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("Copy iframe code");
  });

  it("uses one served revision for preview and export outputs", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "summit-2026",
        eventVersion: eventRecord.version,
        initialConfigurations: eventRecord.embedConfigurations ?? [],
        publicOrigin: "https://eventloom.example",
        publication,
      }),
    );

    expect(markup).toContain('aria-label="Publication status"');
    expect(markup).toContain("<iframe");
    expect(markup).toContain("Revision 12");
    expect(markup.match(/Revision 12/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("places one setup surface before the full-width widget studio", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "summit-2026",
        eventVersion: eventRecord.version,
        initialConfigurations: eventRecord.embedConfigurations ?? [],
        publicOrigin: "https://eventloom.example",
        publication,
      }),
    );

    const setupIndex = markup.indexOf('aria-label="Widget setup"');
    const studioIndex = markup.indexOf('aria-label="Widget preview studio"');
    const widgetMenuIndex = markup.indexOf('aria-label="Public widget"');
    const previewIndex = markup.indexOf("<iframe");

    expect(setupIndex).toBeGreaterThanOrEqual(0);
    expect(setupIndex).toBeLessThan(studioIndex);
    expect(studioIndex).toBeLessThan(widgetMenuIndex);
    expect(widgetMenuIndex).toBeLessThan(previewIndex);
    expect(markup).not.toContain('role="tablist"');
    expect(markup).toContain('data-slot="collapsible"');
  });

  it("keeps preview actions and export details inside the widget studio", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        eventSlug: "summit-2026",
        eventVersion: eventRecord.version,
        initialConfigurations: eventRecord.embedConfigurations ?? [],
        publicOrigin: "https://eventloom.example",
        publication,
      }),
    );

    const studioIndex = markup.indexOf('aria-label="Widget preview studio"');
    const actionsIndex = markup.indexOf('aria-label="Preview actions"');
    const previewIndex = markup.indexOf("<iframe");
    const exportIndex = markup.indexOf("Share or embed");

    expect(studioIndex).toBeGreaterThanOrEqual(0);
    expect(studioIndex).toBeLessThan(actionsIndex);
    expect(actionsIndex).toBeLessThan(previewIndex);
    expect(previewIndex).toBeLessThan(exportIndex);
  });
});
