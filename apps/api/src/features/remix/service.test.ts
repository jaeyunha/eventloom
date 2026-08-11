import { describe, expect, it } from "vitest";
import { RemixService } from "./service";
import type {
  ContentRemixCandidate,
  ContentRevision,
  RemixActor,
  RemixAuditEntry,
  RemixContent,
  RemixContentGateway,
  RemixProvider,
  RemixProviderInput,
  RemixProviderOutput,
  RemixRepository,
  RemixSessionRecord,
  RemixSpeakerRecord,
} from "./types";

const now = new Date("2026-08-09T12:00:00.000Z");
const organizer: RemixActor = {
  tenantId: "tenant-1",
  userId: "organizer-1",
  kind: "human",
  grants: [{ eventId: "event-1", role: "organizer" }],
};
const otherOrganizer: RemixActor = {
  tenantId: "tenant-1",
  userId: "organizer-2",
  kind: "human",
  grants: [{ eventId: "event-2", role: "organizer" }],
};
const automation: RemixActor = {
  tenantId: "tenant-1",
  userId: "automation-1",
  kind: "automation",
  grants: [{ eventId: "event-1", role: "organizer" }],
};

class MemoryRepository implements RemixRepository {
  readonly candidates = new Map<string, ContentRemixCandidate>();
  readonly audit: RemixAuditEntry[] = [];

  async getCandidateById(
    tenantId: string,
    candidateId: string,
  ): Promise<ContentRemixCandidate | null> {
    const candidate = this.candidates.get(candidateId);
    return candidate?.tenantId === tenantId ? structuredClone(candidate) : null;
  }

  async getCandidate(
    tenantId: string,
    eventId: string,
    candidateId: string,
  ): Promise<ContentRemixCandidate | null> {
    const candidate = this.candidates.get(candidateId);
    return candidate?.tenantId === tenantId && candidate.eventId === eventId
      ? structuredClone(candidate)
      : null;
  }

  async listCandidates(
    tenantId: string,
    eventId: string,
    filter?: {
      status?: ContentRemixCandidate["status"];
      sourceType?: "session" | "speaker";
      sourceId?: string;
    },
  ): Promise<readonly ContentRemixCandidate[]> {
    return [...this.candidates.values()]
      .filter(
        (candidate) =>
          candidate.tenantId === tenantId &&
          candidate.eventId === eventId &&
          (filter?.status === undefined || candidate.status === filter.status) &&
          (filter?.sourceType === undefined || candidate.sourceType === filter.sourceType) &&
          (filter?.sourceId === undefined || candidate.sourceId === filter.sourceId),
      )
      .map((candidate) => structuredClone(candidate));
  }

  async saveCandidate(
    candidate: ContentRemixCandidate,
    expectedVersion: number | null,
  ): Promise<void> {
    const existing = this.candidates.get(candidate.id);
    if ((existing?.version ?? null) !== expectedVersion) {
      throw new Error("candidate version conflict");
    }
    this.candidates.set(candidate.id, structuredClone(candidate));
  }

  async appendAudit(entry: RemixAuditEntry): Promise<void> {
    this.audit.push(structuredClone(entry));
  }

  async listAudit(tenantId: string, eventId: string): Promise<readonly RemixAuditEntry[]> {
    return this.audit.filter((entry) => entry.tenantId === tenantId && entry.eventId === eventId);
  }
}

class MemoryGateway implements RemixContentGateway {
  sessions = new Map<string, RemixSessionRecord>([
    [
      "session-1",
      {
        kind: "session",
        id: "session-1",
        eventId: "event-1",
        revision: 4,
        title: "Original title",
        description: "Original description",
        tags: ["web"],
        tracks: ["platform"],
      },
    ],
  ]);
  speakers = new Map<string, RemixSpeakerRecord>([
    [
      "speaker-1",
      {
        kind: "speaker",
        id: "speaker-1",
        eventId: "event-1",
        revision: 2,
        biography: "Original biography",
      },
    ],
  ]);
  readonly revisions: ContentRevision[] = [];

  async listSessions(input: {
    tenantId: string;
    eventId: string;
    filter?: {
      ids?: readonly string[];
      query?: string;
      tags?: readonly string[];
      tracks?: readonly string[];
    };
  }): Promise<readonly RemixSessionRecord[]> {
    return this.filter([...this.sessions.values()], input.eventId, input.filter);
  }

  async listSpeakers(input: {
    tenantId: string;
    eventId: string;
    filter?: { ids?: readonly string[]; query?: string };
  }): Promise<readonly RemixSpeakerRecord[]> {
    return this.filter([...this.speakers.values()], input.eventId, input.filter);
  }

  async getSession(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSessionRecord | null> {
    const source = this.sessions.get(input.sourceId);
    return source?.eventId === input.eventId ? structuredClone(source) : null;
  }

  async getSpeaker(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSpeakerRecord | null> {
    const source = this.speakers.get(input.sourceId);
    return source?.eventId === input.eventId ? structuredClone(source) : null;
  }

  async applyRevision(input: {
    tenantId: string;
    eventId: string;
    sourceType: "session" | "speaker";
    sourceId: string;
    expectedSourceRevision: number;
    fields: readonly ("title" | "description" | "tags" | "tracks" | "biography")[];
    content: RemixContent;
    candidateId: string;
    actorId: string;
    appliedAt: string;
  }): Promise<ContentRevision> {
    const source =
      input.sourceType === "session"
        ? this.sessions.get(input.sourceId)
        : this.speakers.get(input.sourceId);
    if (
      source === undefined ||
      source.eventId !== input.eventId ||
      source.revision !== input.expectedSourceRevision
    ) {
      throw new Error("source revision conflict");
    }
    const nextRevision = source.revision + 1;
    if (source.kind === "session" && input.content !== undefined && "title" in input.content) {
      this.sessions.set(input.sourceId, {
        ...source,
        ...input.content,
        revision: nextRevision,
      });
    } else if (
      source.kind === "speaker" &&
      input.content !== undefined &&
      "biography" in input.content
    ) {
      this.speakers.set(input.sourceId, {
        ...source,
        ...input.content,
        revision: nextRevision,
      });
    }
    const revision: ContentRevision = {
      id: `revision-${this.revisions.length + 1}`,
      tenantId: input.tenantId,
      eventId: input.eventId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceRevision: nextRevision,
      fields: [...input.fields],
      content: structuredClone(input.content),
      candidateId: input.candidateId,
      appliedBy: input.actorId,
      appliedAt: input.appliedAt,
    };
    this.revisions.push(revision);
    return structuredClone(revision);
  }

  private filter<T extends RemixSessionRecord | RemixSpeakerRecord>(
    records: readonly T[],
    eventId: string,
    filter?: {
      ids?: readonly string[];
      query?: string;
      tags?: readonly string[];
      tracks?: readonly string[];
    },
  ): readonly T[] {
    return records.filter(
      (record) =>
        record.eventId === eventId &&
        (filter?.ids === undefined || filter.ids.includes(record.id)) &&
        (filter?.query === undefined ||
          JSON.stringify(record).toLowerCase().includes(filter.query.toLowerCase())) &&
        (filter?.tags === undefined ||
          (record.kind === "session" && filter.tags.every((tag) => record.tags?.includes(tag)))) &&
        (filter?.tracks === undefined ||
          (record.kind === "session" &&
            filter.tracks.every((track) => record.tracks?.includes(track)))),
    );
  }
}

class DeterministicProvider implements RemixProvider {
  calls: RemixProviderInput[] = [];
  async generate(input: RemixProviderInput): Promise<RemixProviderOutput> {
    this.calls.push(structuredClone(input));
    if (input.source.kind === "session") {
      return {
        content: {
          title: `${input.source.title} (${input.generation})`,
          description: `${input.source.description} — ${input.tone}`,
        },
        changeSummary: "Improved event copy.",
        provenance: { provider: "deterministic", model: "test-model", promptVersion: "v1" },
      };
    }
    return {
      content: { biography: `${input.source.biography} — ${input.tone}` },
      changeSummary: "Clarified biography.",
      provenance: { provider: "deterministic", model: "test-model", promptVersion: "v1" },
    };
  }
}

function createFixture() {
  const repository = new MemoryRepository();
  const gateway = new MemoryGateway();
  const provider = new DeterministicProvider();
  const service = new RemixService(repository, gateway, provider, {
    clock: { now: () => now },
    idGenerator: {
      nextId: (() => {
        const counts = new Map<string, number>();
        return (prefix: "candidate" | "audit") => {
          const next = (counts.get(prefix) ?? 0) + 1;
          counts.set(prefix, next);
          return `${prefix}-${next}`;
        };
      })(),
    },
  });
  return { repository, gateway, provider, service };
}

async function generateSession(service: RemixService) {
  const [candidate] = await service.generate(organizer, {
    eventId: "event-1",
    sourceType: "session",
    sourceIds: ["session-1"],
    fields: ["title", "description"],
    tone: "clear and welcoming",
    guidance: "Stay concise.",
  });
  if (candidate === undefined) throw new Error("candidate not generated");
  return candidate;
}

describe("RemixService", () => {
  it("requires a human organizer and keeps candidates private until apply", async () => {
    const { service, gateway } = createFixture();
    expect(
      await service.listRecords(organizer, "event-1", {
        sourceType: "session",
        filter: { tags: ["web"], tracks: ["platform"] },
      }),
    ).toHaveLength(1);
    await expect(
      service.generate(otherOrganizer, {
        eventId: "event-1",
        sourceType: "session",
        sourceIds: ["session-1"],
        fields: ["title"],
        tone: "clear",
      }),
    ).rejects.toMatchObject({ code: "REMIX_FORBIDDEN" });
    await expect(
      service.generate(automation, {
        eventId: "event-1",
        sourceType: "session",
        sourceIds: ["session-1"],
        fields: ["title"],
        tone: "clear",
      }),
    ).rejects.toMatchObject({ code: "REMIX_FORBIDDEN" });

    const candidate = await generateSession(service);
    expect(candidate.status).toBe("pending");
    expect(gateway.revisions).toHaveLength(0);
    expect("title" in candidate.candidate && "title" in candidate.original).toBe(true);
    if ("title" in candidate.candidate && "title" in candidate.original) {
      expect(candidate.candidate.title).not.toBe(candidate.original.title);
    }
  });

  it("marks a candidate stale when its source revision changes and enforces the field allowlist", async () => {
    const { service, gateway } = createFixture();
    await expect(
      service.generate(organizer, {
        eventId: "event-1",
        sourceType: "speaker",
        sourceIds: ["speaker-1"],
        fields: ["biography", "title"],
        tone: "clear",
      }),
    ).rejects.toMatchObject({ code: "REMIX_INVALID_INPUT" });

    const candidate = await generateSession(service);
    const existingSession = gateway.sessions.get("session-1");
    if (existingSession === undefined) throw new Error("session fixture missing");
    gateway.sessions.set("session-1", {
      ...existingSession,
      revision: 5,
      title: "Organizer changed title",
    });
    const stale = await service.getCandidate(organizer, "event-1", candidate.id);
    expect(stale.status).toBe("stale");
    expect(
      (await service.listAudit(organizer, "event-1")).some(
        (entry) => entry.action === "candidate.stale",
      ),
    ).toBe(true);
    await expect(service.apply(organizer, { candidateId: candidate.id })).rejects.toMatchObject({
      code: "REMIX_CONFLICT",
    });
    expect(gateway.revisions).toHaveLength(0);
  });

  it("creates a new regeneration candidate with lineage and keeps the original rejected", async () => {
    const { service, repository, provider } = createFixture();
    const original = await generateSession(service);
    const regenerated = await service.regenerate(organizer, {
      candidateId: original.id,
      tone: "more direct",
    });
    expect(regenerated.id).not.toBe(original.id);
    expect(regenerated.parentCandidateId).toBe(original.id);
    expect(regenerated.generation).toBe(2);
    expect(regenerated.status).toBe("pending");
    expect((await repository.getCandidateById("tenant-1", original.id))?.status).toBe("rejected");
    expect(provider.calls.at(-1)?.parentCandidateId).toBe(original.id);
  });

  it("allows only an explicit human apply, records provenance and an auditable revision", async () => {
    const { service, gateway } = createFixture();
    const [candidate] = await service.generate(organizer, {
      eventId: "event-1",
      sourceType: "speaker",
      sourceIds: ["speaker-1"],
      fields: ["biography"],
      tone: "credible",
    });
    if (candidate === undefined) throw new Error("candidate not generated");
    expect(candidate.provenance).toMatchObject({
      provider: "deterministic",
      model: "test-model",
      promptVersion: "v1",
    });
    await expect(service.apply(automation, { candidateId: candidate.id })).rejects.toMatchObject({
      code: "REMIX_FORBIDDEN",
    });
    const revision = await service.apply(organizer, {
      candidateId: candidate.id,
      expectedVersion: candidate.version,
      content: { biography: "Human-edited biography" },
    });
    expect(revision.appliedBy).toBe("organizer-1");
    expect(gateway.revisions).toHaveLength(1);
    const applied = await service.getCandidate(organizer, "event-1", candidate.id);
    expect(applied.status).toBe("applied");
    expect(applied.candidate).toEqual({ biography: "Human-edited biography" });
    const audits = await service.listAudit(organizer, "event-1");
    expect(audits[0]?.details).toMatchObject({
      provider: "deterministic",
      sourceRevision: 2,
    });
    expect((await service.listAudit(organizer, "event-1")).map((entry) => entry.action)).toEqual([
      "candidate.generated",
      "candidate.applied",
    ]);
  });
});
