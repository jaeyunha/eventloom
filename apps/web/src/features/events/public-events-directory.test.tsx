import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicEventsDirectory } from "./public-events-directory";

const organizations = [
  {
    organization: { id: "source-org", name: "Source Organization" },
    events: [
      {
        slug: "source-event",
        name: "Source Event",
        timeZone: "America/Los_Angeles",
        startsOn: "2026-09-18",
        endsOn: "2026-09-19",
        venueName: "Pier 27",
        cfpOpen: true,
      },
    ],
  },
] as const;

describe("public events directory", () => {
  it("groups public destinations under the event they belong to", () => {
    const markup = renderToStaticMarkup(<PublicEventsDirectory organizations={organizations} />);

    expect(markup).toContain("Source Organization");
    expect(markup).toContain("Source Event");
    expect(markup).toContain('href="/events/source-event"');
    expect(markup).toContain('href="/cfp/organizations/source-org/events/source-event"');
    expect(markup).toContain("September 18–19, 2026 · America/Los_Angeles");
    expect(markup).toContain("View event");
    expect(markup).toContain("Submit a proposal");
    expect(markup).not.toContain("1 public event");
    expect(markup).not.toContain("Public link");
    expect(markup).not.toContain("CFP link");
  });

  it("renders a source-backed empty state without fake events", () => {
    const markup = renderToStaticMarkup(<PublicEventsDirectory organizations={[]} />);

    expect(markup).toContain("No public events yet.");
    expect(markup).not.toContain("demo-event");
  });
});
