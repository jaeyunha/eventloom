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
import { allowedContentForApply, RemixWorkspace } from "./remix-workspace";

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
  it("renders source selection, comparison, provenance, and human-authority messaging", () => {
    const markup = renderToStaticMarkup(
      createElement(RemixWorkspace, { organizationId: "org-1", eventId: "event-1" }),
    );

    expect(markup).toContain("Choose event content");
    expect(markup).toContain("Source versus candidate");
    expect(markup).toContain("Provider provenance");
    expect(markup).toContain("Change summary");
    expect(markup).toContain("Candidates are private until a human applies them");
    expect(markup).toContain("cannot affect public content");
    expect(markup).toContain("Only an authorized human organizer can apply");
    expect(markup).toContain("Apply reviewed candidate to event content");
  });

  it("keeps stale source candidates visibly non-applicable", () => {
    const markup = renderToStaticMarkup(
      createElement(RemixWorkspace, { organizationId: "org-1", eventId: "event-1" }),
    );

    expect(markup).toContain("candidate-stale");
    expect(markup).toContain("Stale — regenerate before applying");
    expect(markup).toContain("Stale candidates cannot be applied.");
  });

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
