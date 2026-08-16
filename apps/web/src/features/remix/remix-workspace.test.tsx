import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createRemixApi,
  type RemixAuditEntry,
  type RemixCandidate,
  type RemixContentRevision,
  type RemixFetcher,
} from "./api";
import {
  allowedContentForApply,
  candidateIsStale,
  RemixWorkspace,
  remixNavigationCacheKey,
  remixNavigationCacheTags,
} from "./remix-workspace";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function candidate(overrides: Partial<RemixCandidate> = {}): RemixCandidate {
  return {
    id: "candidate-1",
    tenantId: "tenant-1",
    eventId: "event-1",
    sourceType: "session",
    sourceId: "session-1",
    sourceRevision: 4,
    fields: ["title", "description"],
    tone: "Clear",
    guidance: "Keep the meaning.",
    original: {
      title: "Original title",
      description: "Original description",
      tags: ["one"],
      tracks: ["Track"],
    },
    candidate: {
      title: "Candidate title",
      description: "Candidate description",
      tags: ["one"],
      tracks: ["Track"],
    },
    changedFields: ["title", "description"],
    changeSummary: "Clarifies the audience outcome.",
    provenance: {
      provider: "provider-1",
      model: "model-1",
      promptVersion: "prompt-1",
      generatedAt: "2026-08-09T12:00:00.000Z",
      requestId: "request-1",
    },
    status: "pending",
    version: 1,
    generation: 1,
    parentCandidateId: null,
    createdAt: "2026-08-09T12:00:00.000Z",
    createdBy: "organizer-1",
    ...overrides,
  };
}

describe("remix API", () => {
  it("generates candidates through the organization- and event-qualified endpoint", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const generated = candidate();
    const fetcher: RemixFetcher = async (input, init) => {
      calls.push({ url: String(input), init });
      return response({ candidates: [generated] }, 201);
    };
    const api = createRemixApi("https://api.example/", "org/1", fetcher);

    const result = await api.generate({
      eventId: "event/1",
      sourceType: "session",
      sourceIds: ["session-1"],
      fields: ["title", "description"],
      tone: "Clear",
      guidance: "Keep the meaning.",
    });

    expect(result).toEqual([generated]);
    expect(calls[0]?.url).toBe(
      "https://api.example/api/admin/organizations/org%2F1/events/event%2F1/remix/candidates",
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      sourceType: "session",
      sourceIds: ["session-1"],
      fields: ["title", "description"],
      tone: "Clear",
      guidance: "Keep the meaning.",
    });
    expect(calls[0]?.init?.credentials).toBe("include");
  });

  it("uses a same-origin API path when the base URL is empty", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const generated = candidate();
    const fetcher: RemixFetcher = async (input, init) => {
      calls.push({ url: String(input), init });
      return response({ candidates: [generated] });
    };
    const api = createRemixApi("", "org-1", fetcher);

    await expect(api.listCandidates({ eventId: "event-1" })).resolves.toEqual([generated]);

    expect(calls[0]?.url).toBe("/api/admin/organizations/org-1/events/event-1/remix/candidates");
    expect(calls[0]?.init?.credentials).toBe("include");
  });

  it("preserves regeneration lineage and sends optional guidance", async () => {
    const child = candidate({
      id: "candidate-2",
      generation: 2,
      parentCandidateId: "candidate-1",
    });
    const fetcher: RemixFetcher = async (input, init) => {
      expect(String(input)).toContain("/remix/candidates/candidate-1/regenerate");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ tone: "Warm", guidance: "Use examples." });
      return response(child, 201);
    };
    const api = createRemixApi("https://api.example", "org-1", fetcher);
    const result = await api.regenerate({
      eventId: "event-1",
      candidateId: "candidate-1",
      tone: "Warm",
      guidance: "Use examples.",
    });

    expect(result.parentCandidateId).toBe("candidate-1");
    expect(result.generation).toBe(2);
  });

  it("sends reject and apply mutations with optimistic version and allowlisted content", async () => {
    const calls: string[] = [];
    const revision: RemixContentRevision = {
      id: "revision-1",
      tenantId: "tenant-1",
      eventId: "event-1",
      sourceType: "session",
      sourceId: "session-1",
      sourceRevision: 4,
      fields: ["title"],
      content: { title: "Human title", description: "Original", tags: [], tracks: [] },
      candidateId: "candidate-1",
      appliedBy: "organizer-1",
      appliedAt: "2026-08-09T12:01:00.000Z",
    };
    const auditEntries: readonly RemixAuditEntry[] = [
      {
        id: "audit-rejected",
        tenantId: "tenant-1",
        eventId: "event-1",
        candidateId: "candidate-1",
        actorId: "organizer-1",
        action: "candidate.rejected",
        createdAt: "2026-08-09T12:00:00.000Z",
        details: { reason: "Not suitable." },
      },
      {
        id: "audit-applied",
        tenantId: "tenant-1",
        eventId: "event-1",
        candidateId: "candidate-1",
        actorId: "organizer-1",
        action: "candidate.applied",
        createdAt: revision.appliedAt,
        details: { contentRevisionId: revision.id, humanEdited: true },
      },
    ];
    const fetcher: RemixFetcher = async (input, _init) => {
      calls.push(String(input));
      if (calls.length === 1) return response(candidate({ status: "rejected" }));
      if (calls.length === 2) return response(revision);
      return response({ audit: auditEntries });
    };
    const api = createRemixApi("https://api.example", "org-1", fetcher);

    await api.reject({ eventId: "event-1", candidateId: "candidate-1", reason: "Not suitable." });
    await api.apply({
      eventId: "event-1",
      candidateId: "candidate-1",
      expectedVersion: 1,
      content: { title: "Human title" },
    });
    const entries = await api.listAudit("event-1");

    expect(entries.map((entry) => entry.action)).toEqual([
      "candidate.rejected",
      "candidate.applied",
    ]);
    expect(calls).toEqual([
      "https://api.example/api/admin/organizations/org-1/events/event-1/remix/candidates/candidate-1/reject",
      "https://api.example/api/admin/organizations/org-1/events/event-1/remix/candidates/candidate-1/apply",
      "https://api.example/api/admin/organizations/org-1/events/event-1/remix/audit",
    ]);
  });

  it("surfaces an unavailable provider without pretending a candidate was generated", async () => {
    const fetcher: RemixFetcher = async () =>
      response(
        { error: { code: "REMIX_PROVIDER_FAILURE", message: "The remix provider failed." } },
        502,
      );
    const api = createRemixApi("https://api.example", "org-1", fetcher);

    await expect(
      api.generate({
        eventId: "event-1",
        sourceType: "session",
        sourceIds: ["session-1"],
        fields: ["title"],
        tone: "Clear",
      }),
    ).rejects.toMatchObject({ code: "REMIX_PROVIDER_FAILURE", status: 502 });
  });
});

describe("remix workspace", () => {
  it("renders an honest unavailable state without fake candidates or audit", () => {
    const markup = renderToStaticMarkup(
      createElement(RemixWorkspace, { organizationId: "org-1", eventId: "event-1" }),
    );

    expect(markup).toContain('data-state="remix-unavailable"');
    expect(markup).not.toContain('data-workflow="remix-composer"');
    expect(markup).not.toContain("candidate-local");
  });
  it("normalizes remix cache scope keys and isolates resource tags", () => {
    expect(remixNavigationCacheKey(" org-1 ", " event-1 ", "session")).toBe(
      "organization:org-1:event:event-1:remix:workspace:session",
    );
    expect(remixNavigationCacheKey("org-1", "event-2", "session")).not.toBe(
      remixNavigationCacheKey("org-1", "event-1", "session"),
    );
    expect(remixNavigationCacheTags(" org-1 ", " event-1 ")).toEqual([
      "organization:org-1",
      "event:event-1",
      "remix:event-1",
    ]);
  });

  it("keeps an injected API workspace available without using local demo state", () => {
    const api = {
      listRecords: async () => [],
      listCandidates: async () => [],
      getCandidate: async () => candidate(),
      listAudit: async () => [],
      generate: async () => [candidate()],
      regenerate: async () => candidate({ id: "candidate-2", generation: 2 }),
      reject: async () => candidate({ status: "rejected" }),
      apply: async () => ({
        id: "revision-1",
        tenantId: "tenant-1",
        eventId: "event-1",
        sourceType: "session" as const,
        sourceId: "session-1",
        sourceRevision: 4,
        fields: ["title"] as const,
        content: candidate().candidate,
        candidateId: "candidate-1",
        appliedBy: "organizer-1",
        appliedAt: "2026-08-09T12:01:00.000Z",
      }),
    };
    const markup = renderToStaticMarkup(
      createElement(RemixWorkspace, { organizationId: "org-1", eventId: "event-1", api }),
    );

    expect(markup).toContain('data-workflow="remix-composer"');
    expect(markup).toContain('data-section="remix-review"');
    expect(markup).toContain('data-section="remix-activity"');
    expect(markup).not.toContain('data-state="remix-unavailable"');
    expect(markup).not.toContain("org-1");
    expect(markup).not.toContain("event-1");
  });

  it("does not infer stale state from a source hidden by browse filters", () => {
    expect(candidateIsStale(candidate(), undefined)).toBe(false);
    expect(candidateIsStale(candidate(), { revision: 4 })).toBe(false);
    expect(candidateIsStale(candidate(), { revision: 5 })).toBe(true);
    expect(candidateIsStale(candidate({ status: "stale" }), undefined)).toBe(true);
  });
});

describe("apply allowlist", () => {
  it("enforces the source-type field allowlist when preparing human apply content", () => {
    const session = candidate({ fields: ["title"] });
    expect(
      allowedContentForApply(session, {
        title: "Human title",
        biography: "Must never be sent",
        arbitrary: "Must never be sent",
      }),
    ).toEqual({ title: "Human title" });

    const speaker = candidate({
      sourceType: "speaker",
      fields: ["biography", "title"],
      original: { biography: "Original biography" },
      candidate: { biography: "Candidate biography" },
    });
    expect(allowedContentForApply(speaker, { biography: "Human biography", title: "No" })).toEqual({
      biography: "Human biography",
    });
  });
});
