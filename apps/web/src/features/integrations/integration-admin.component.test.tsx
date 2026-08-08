import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntegrationAdmin } from "./integration-admin";
import { OneTimeSecretPanel } from "./integration-sections";
import type { AcceleventsAdminPreview, IntegrationAdminSnapshot } from "./types";

const snapshot: IntegrationAdminSnapshot = {
  event: {
    id: "event-a",
    name: "Open Web Summit",
    timeZone: "America/Los_Angeles",
    publishedAgendaRevisionId: "agenda-revision-7",
  },
  accelevents: {
    state: "connected",
    accountLabel: "Open Web Summit 2026",
    credentialLastFour: "2048",
    lastPublication: {
      publicationId: "publication-1",
      status: "succeeded",
      completedAt: "2026-08-08T18:00:00.000Z",
      errorCount: 0,
    },
  },
  delivery: {
    openSend: {
      state: "connected",
      credentialLastFour: "2468",
      senderChecks: [
        { address: "auth@foreverbrowsing.com", status: "verified" },
        { address: "speakers@foreverbrowsing.com", status: "verified" },
        { address: "calendar@foreverbrowsing.com", status: "verified" },
      ],
      deliveredLast24Hours: 42,
      failedLast24Hours: 0,
      lastDeliveryAt: "2026-08-08T18:30:00.000Z",
    },
    calendar: {
      state: "degraded",
      sentLast24Hours: 8,
      failedLast24Hours: 1,
      lastInvitationAt: "2026-08-08T17:30:00.000Z",
      lastFailure: {
        deliveryId: "delivery-1",
        summary: "Recipient mailbox unavailable",
        occurredAt: "2026-08-08T17:35:00.000Z",
        retryable: true,
      },
    },
  },
  apiKeys: [
    {
      id: "key-1",
      label: "Agenda export",
      prefix: "osb_live_42",
      scopes: ["events:read", "publications:read"],
      createdAt: "2026-08-01T00:00:00.000Z",
      lastUsedAt: "2026-08-08T18:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
    },
  ],
  webhooks: [
    {
      id: "webhook-1",
      endpointUrl: "https://hooks.example.test/<img src=x onerror=alert(1)>",
      events: ["agenda.published", "agenda.rolled_back"],
      active: true,
      signingSecretLastFour: "9876",
      createdAt: "2026-08-01T00:00:00.000Z",
      lastDelivery: {
        status: "succeeded",
        attemptedAt: "2026-08-08T18:00:00.000Z",
        responseStatus: 204,
      },
    },
  ],
};

const preview: AcceleventsAdminPreview = {
  publicationId: "publication-2",
  agendaRevisionId: "agenda-revision-7",
  snapshotHash: "a".repeat(64),
  confirmationToken: "must-not-be-rendered",
  createdAt: "2026-08-08T19:00:00.000Z",
  speakers: [{ externalId: "speaker-1", name: "Ada Lovelace", email: "ada@example.test" }],
  sessions: [
    {
      externalId: "session-1",
      title: "Accessible systems",
      startsAt: "2026-09-01T17:00:00.000Z",
      room: "Main hall",
      track: "Engineering",
    },
  ],
  diff: {
    summary: { create: 1, update: 1, unchanged: 0 },
    records: [
      {
        kind: "speaker",
        externalId: "speaker-1",
        label: "Ada Lovelace",
        operation: "update",
        changedFields: ["biography"],
      },
      {
        kind: "session",
        externalId: "session-1",
        label: "Accessible systems",
        operation: "create",
        changedFields: ["title", "room"],
      },
    ],
  },
  validationErrors: [],
};

describe("integration admin UI", () => {
  it("renders event-scoped navigation and status labels without relying on color", () => {
    const markup = renderToStaticMarkup(
      createElement(IntegrationAdmin, {
        eventId: "event-a",
        section: "overview",
        initialSnapshot: snapshot,
      }),
    );

    expect(markup).toContain("Open Web Summit");
    expect(markup).toContain('aria-label="Integration settings"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Connected");
    expect(markup).toContain("Needs attention");
    expect(markup).toContain("Source-of-truth boundary");
  });

  it("requires explicit confirmation after rendering an immutable Accelevents diff", () => {
    const markup = renderToStaticMarkup(
      createElement(IntegrationAdmin, {
        eventId: "event-a",
        section: "accelevents",
        initialSnapshot: snapshot,
        initialPreview: preview,
      }),
    );

    expect(markup).toContain("Review outbound changes");
    expect(markup).toContain("I reviewed this immutable preview");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Confirm and publish<\/button>/);
    expect(markup).not.toContain("must-not-be-rendered");
    expect(markup).toContain("Airtable records will not be changed");
  });

  it("uses non-prefilled password controls for replacement credentials", () => {
    const markup = renderToStaticMarkup(
      createElement(IntegrationAdmin, {
        eventId: "event-a",
        section: "delivery",
        initialSnapshot: snapshot,
      }),
    );

    expect(markup).toContain('type="password"');
    expect(markup).toMatch(/autocomplete="off"/i);
    expect(markup).not.toContain("os_sending_secret");
    expect(markup).not.toContain('2468" value=');
    expect(markup).toContain("Google or Microsoft Calendar OAuth is not required");
  });

  it("escapes endpoint content and exposes delivery state as text", () => {
    const markup = renderToStaticMarkup(
      createElement(IntegrationAdmin, {
        eventId: "event-a",
        section: "webhooks",
        initialSnapshot: snapshot,
      }),
    );

    expect(markup).not.toContain("<img src=x");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markup).toContain("Delivered");
    expect(markup).toContain("Rotate secret");
    expect(markup).toContain("HTTP 204");
    expect(markup).toContain("Remove endpoint");
  });

  it("marks generated credentials as one-time values", () => {
    const markup = renderToStaticMarkup(
      createElement(OneTimeSecretPanel, {
        secret: { id: "key-2", secret: "osb_live_one_time_secret" },
        label: "API key",
        onDismiss() {},
      }),
    );

    expect(markup).toContain("Shown once");
    expect(markup).toContain("will not display this value again");
    expect(markup).toContain("osb_live_one_time_secret");
    expect(markup).toContain("I saved it");
  });
});
