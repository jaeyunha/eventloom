import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AirtableIntegration, type AirtableIntegrationProps } from "./airtable-integration";
import {
  type AirtableConflictResolution,
  type AirtableConnectionState,
  type AirtableIntegrationApi,
  type AirtableIntegrationSnapshot,
  type AirtableProjectionHealth,
  type AirtableProjectionStatus,
  type AirtableSyncDirection,
  createAirtableIntegrationApi,
} from "./api";

const baseProjection: AirtableProjectionStatus = {
  health: "healthy",
  lastProjectedAt: "2026-08-13T18:30:00.000Z",
  projectedLast24Hours: 42,
  failedLast24Hours: 0,
  lastFailure: null,
};

function makeSnapshot(
  overrides: Partial<AirtableIntegrationSnapshot> = {},
): AirtableIntegrationSnapshot {
  return {
    state: "disconnected",
    baseMapping: null,
    projection: baseProjection,
    conflicts: [],
    ...overrides,
  };
}

const noopApi: AirtableIntegrationApi = {
  async getSnapshot() {
    throw new Error("getSnapshot should not be called during render");
  },
  async startOAuth() {
    throw new Error("startOAuth should not be called during render");
  },
  async pause() {
    throw new Error("pause should not be called during render");
  },
  async resume() {
    throw new Error("resume should not be called during render");
  },
  async disconnect() {
    throw new Error("disconnect should not be called during render");
  },
  async retry() {
    throw new Error("retry should not be called during render");
  },
  async resolveConflict() {
    throw new Error("resolveConflict should not be called during render");
  },
};

function render(props: Partial<AirtableIntegrationProps> = {}): string {
  return renderToStaticMarkup(
    createElement(AirtableIntegration, {
      organizationId: "org-a",
      api: noopApi,
      ...props,
    } as AirtableIntegrationProps),
  );
}

describe("airtable integration UI", () => {
  it("renders the disconnected state with a Connect control and never asks for secrets", () => {
    const markup = render({ initialSnapshot: makeSnapshot() });

    expect(markup).toContain("Disconnected");
    expect(markup).toContain("Airtable is not linked to this organization");
    expect(markup).toContain(">Connect Airtable<");
    expect(markup).toContain('aria-label="Connect Airtable for this organization"');
    expect(markup).toContain('href="#airtable-content"');
    expect(markup).toContain("Skip to Airtable settings");
    expect(markup).not.toContain('type="password"');
    expect(markup).not.toContain('name="token"');
    expect(markup).not.toContain('name="clientSecret"');
    expect(markup).not.toContain(">Pause<");
    expect(markup).not.toContain(">Disconnect<");
  });

  it("renders the authorizing state without action buttons", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({ state: "authorizing" }),
    });

    expect(markup).toContain("Authorizing");
    expect(markup).toContain("OAuth handshake in a separate tab");
    expect(markup).not.toContain(">Connect Airtable<");
    expect(markup).not.toContain(">Pause<");
    expect(markup).not.toContain(">Resume<");
    expect(markup).not.toContain(">Reauthorize<");
    expect(markup).not.toContain(">Disconnect<");
  });

  it("renders the connected state with Pause and a confirmed Disconnect control", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({ state: "connected" }),
    });

    expect(markup).toContain(">Pause<");
    expect(markup).toContain(">Disconnect<");
    expect(markup).toContain("projection will stop");
    expect(markup).toContain('aria-label="Pause Airtable projection"');
    expect(markup).toContain('aria-label="Disconnect Airtable from this organization"');
    expect(markup).toContain('for="airtable-confirm-disconnect"');
    expect(markup).toContain('id="airtable-confirm-disconnect"');
    expect(markup).not.toContain(">Resume<");
    expect(markup).not.toContain(">Reauthorize<");
  });

  it("renders the paused state with Resume and a confirmed Disconnect control", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({ state: "paused" }),
    });

    expect(markup).toContain(">Resume<");
    expect(markup).toContain(">Disconnect<");
    expect(markup).toContain('aria-label="Resume Airtable projection"');
    expect(markup).not.toContain(">Pause<");
    expect(markup).not.toContain(">Reauthorize<");
  });

  it("renders the reauthorization_required state with a Reauthorize control", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({ state: "reauthorization_required" }),
    });

    expect(markup).toContain("Reauthorization required");
    expect(markup).toContain("access expired or was revoked");
    expect(markup).toContain(">Reauthorize<");
    expect(markup).toContain(">Disconnect<");
    expect(markup).toContain('aria-label="Reauthorize Airtable for this organization"');
    expect(markup).not.toContain(">Connect Airtable<");
    expect(markup).not.toContain(">Pause<");
    expect(markup).not.toContain(">Resume<");
  });

  it("renders the mapped Airtable base and table projections", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({
        state: "connected",
        baseMapping: {
          baseId: "appXXYYZZ",
          baseName: "Conference operations",
          tableMappings: [
            {
              tableId: "tblSessions",
              tableName: "Sessions",
              localResource: "sessions",
              keyField: "uid",
              syncDirection: "bidirectional",
            },
            {
              tableId: "tblSpeakers",
              tableName: "Speakers",
              localResource: "speakers",
              keyField: "email",
              syncDirection: "to_airtable",
            },
          ],
        },
      }),
    });

    expect(markup).toContain("Base mapping");
    expect(markup).toContain("Conference operations");
    expect(markup).toContain("appXXYYZZ");
    expect(markup).toContain("Sessions");
    expect(markup).toContain("Speakers");
    expect(markup).toContain("Two-way");
    expect(markup).toContain("To Airtable");
    expect(markup).toContain("<caption>Mapped Airtable tables</caption>");
  });

  it("renders projection health, the latest failure, and a retry control when the failure is retryable", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({
        state: "connected",
        projection: {
          health: "degraded",
          lastProjectedAt: "2026-08-13T18:30:00.000Z",
          projectedLast24Hours: 41,
          failedLast24Hours: 3,
          lastFailure: {
            projectionId: "projection-7",
            summary: "Airtable rate limit",
            occurredAt: "2026-08-13T18:28:00.000Z",
            retryable: true,
          },
        },
      }),
    });

    expect(markup).toContain("Degraded");
    expect(markup).toContain("Failed (24h)");
    expect(markup).toContain(">3<");
    expect(markup).toContain("Airtable rate limit");
    expect(markup).toContain(">Retry projection<");
    expect(markup).toContain('aria-label="Retry the latest Airtable projection"');
  });

  it("does not offer a retry control when the projection is healthy", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({ state: "connected" }),
    });

    expect(markup).toContain("Healthy");
    expect(markup).not.toContain(">Retry projection<");
  });

  it("renders conflicts with use_d1, use_airtable, and manual resolution options", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({
        state: "connected",
        conflicts: [
          {
            id: "conflict-1",
            resource: "sessions",
            recordId: "recAAAA",
            localUpdatedAt: "2026-08-13T18:00:00.000Z",
            remoteUpdatedAt: "2026-08-13T17:55:00.000Z",
            summary: "Title differs between D1 and Airtable.",
            resolution: null,
          },
        ],
      }),
    });

    expect(markup).toContain("1 record needs resolution.");
    expect(markup).toContain("<caption>Unresolved Airtable projection conflicts</caption>");
    expect(markup).toContain("sessions");
    expect(markup).toContain("recAAAA");
    expect(markup).toContain('value="use_d1"');
    expect(markup).toContain('value="use_airtable"');
    expect(markup).toContain('value="manual"');
    expect(markup).toContain("Keep D1 value");
    expect(markup).toContain("Keep Airtable value");
    expect(markup).toContain("Resolve manually");
    expect(markup).toContain(">Apply<");
    expect(markup).toContain('aria-label="Apply resolution for sessions conflict"');
  });

  it("renders an empty conflict state", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({ state: "connected", conflicts: [] }),
    });

    expect(markup).toContain("No conflicting records. Projection is in sync.");
    expect(markup).not.toContain('value="use_d1"');
    expect(markup).not.toContain(">Apply<");
  });

  it("renders a loading state before the first snapshot loads", () => {
    const markup = render({});

    expect(markup).toContain("Loading Airtable settings");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain(">Connect Airtable<");
  });

  it("escapes remote content and never renders raw markup from conflict fields", () => {
    const markup = render({
      initialSnapshot: makeSnapshot({
        state: "connected",
        conflicts: [
          {
            id: "conflict-evil",
            resource: "sessions",
            recordId: "recEVIL",
            localUpdatedAt: "2026-08-13T18:00:00.000Z",
            remoteUpdatedAt: "2026-08-13T17:55:00.000Z",
            summary: "<script>alert(1)</script>",
            resolution: null,
          },
        ],
      }),
    });

    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>alert(1)</script>");
  });

  it("factory builds an api that implements the typed interface", () => {
    const api = createAirtableIntegrationApi("");
    expect(typeof api.getSnapshot).toBe("function");
    expect(typeof api.startOAuth).toBe("function");
    expect(typeof api.pause).toBe("function");
    expect(typeof api.resume).toBe("function");
    expect(typeof api.disconnect).toBe("function");
    expect(typeof api.retry).toBe("function");
    expect(typeof api.resolveConflict).toBe("function");
  });
  it("normalizes the deployed disconnected status payload before rendering", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { state: "disconnected", baseId: null } }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createAirtableIntegrationApi("https://api.example.test", fetcher);

    const snapshot = await api.getSnapshot("org-a");

    expect(snapshot).toEqual({
      state: "disconnected",
      baseMapping: null,
      projection: {
        health: "healthy",
        lastProjectedAt: null,
        projectedLast24Hours: 0,
        failedLast24Hours: 0,
        lastFailure: null,
      },
      conflicts: [],
    });
    const markup = render({ initialSnapshot: snapshot });
    expect(markup).toContain("Disconnected");
    expect(markup).toContain(">Connect Airtable<");
  });

  it("rejects malformed connected status payloads with an integration API error", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              state: "connected",
              baseMapping: null,
              conflicts: [],
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    const api = createAirtableIntegrationApi("https://api.example.test", fetcher);

    await expect(api.getSnapshot("org-a")).rejects.toMatchObject({
      name: "AirtableIntegrationApiError",
      code: "AIRTABLE_INVALID_RESPONSE",
      status: 502,
      message: "The Airtable integration API returned an invalid status response.",
    });
  });

  it("factory uses the canonical backend paths, methods, JSON, and idempotency headers", async () => {
    const responses = [
      { data: makeSnapshot() },
      { data: { authorizationUrl: "https://airtable.test/oauth" } },
      { data: undefined },
      { data: undefined },
      { data: undefined },
      { data: undefined },
      { data: undefined },
    ];
    const requests: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push([input, init]);
      return new Response(JSON.stringify(responses.shift()), {
        headers: { "content-type": "application/json" },
      });
    });
    const api = createAirtableIntegrationApi("https://api.example.test/", fetcher);

    await api.getSnapshot("org/a");
    await api.startOAuth("org/a");
    await api.pause("org/a");
    await api.resume("org/a");
    await api.disconnect("org/a");
    await api.retry("org/a");
    await api.resolveConflict("org/a", "conflict/1", {
      resolution: "manual",
      manualValue: { valueJson: '{"title":"Chosen"}' },
    });

    expect(requests.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      [
        "https://api.example.test/api/admin/organizations/org%2Fa/integrations/airtable/status",
        "GET",
      ],
      [
        "https://api.example.test/api/admin/organizations/org%2Fa/integrations/airtable/oauth/start",
        "POST",
      ],
      [
        "https://api.example.test/api/admin/organizations/org%2Fa/integrations/airtable/pause",
        "POST",
      ],
      [
        "https://api.example.test/api/admin/organizations/org%2Fa/integrations/airtable/resume",
        "POST",
      ],
      [
        "https://api.example.test/api/admin/organizations/org%2Fa/integrations/airtable/connection",
        "DELETE",
      ],
      [
        "https://api.example.test/api/admin/organizations/org%2Fa/integrations/airtable/retry",
        "POST",
      ],
      [
        "https://api.example.test/api/admin/organizations/org%2Fa/integrations/airtable/conflicts/conflict%2F1/resolve",
        "POST",
      ],
    ]);
    for (const [, init] of requests.slice(1)) {
      expect(new Headers(init?.headers).get("idempotency-key")).toMatch(/^web-/);
    }
    expect(requests[4]?.[1]?.body).toBeUndefined();
    expect(requests[6]?.[1]?.body).toBe(
      JSON.stringify({
        resolution: "manual",
        manualValue: { valueJson: '{"title":"Chosen"}' },
      }),
    );
  });

  it("exports conflict-resolution tokens as machine-consumed values", () => {
    const tokens: AirtableConflictResolution[] = ["use_d1", "use_airtable", "manual"];
    const states: AirtableConnectionState[] = [
      "disconnected",
      "authorizing",
      "connected",
      "paused",
      "reauthorization_required",
    ];
    const health: AirtableProjectionHealth[] = ["healthy", "degraded", "failed"];
    const directions: AirtableSyncDirection[] = ["to_airtable", "from_airtable", "bidirectional"];
    expect(tokens).toHaveLength(3);
    expect(states).toHaveLength(5);
    expect(health).toHaveLength(3);
    expect(directions).toHaveLength(3);
  });
});
