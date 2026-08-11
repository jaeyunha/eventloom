import { describe, expect, it } from "vitest";
import type { AgendaSuggestionProviderRequest } from "../../features/agenda/types";
import type {
  EvaluationSuggestionProviderInput,
  ReviewRound,
} from "../../features/evaluations/types";
import type { RemixProviderInput } from "../../features/remix/types";
import {
  type CloudflareAiBinding,
  CloudflareAiProviderError,
  createCloudflareAiProviders,
} from "./cloudflare";
import { createOpenAiResponsesBinding } from "./openai";

class FakeAi implements CloudflareAiBinding {
  readonly calls: Array<{ model: string; inputs: Record<string, unknown> }> = [];
  #responses: unknown[] = [];
  #failure: unknown;

  enqueue(value: unknown): void {
    this.#responses.push(value);
  }

  fail(error: unknown): void {
    this.#failure = error;
  }

  async run(model: string, inputs: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ model, inputs: structuredClone(inputs) });
    if (this.#failure !== undefined) throw this.#failure;
    return this.#responses.shift() ?? { response: "{}" };
  }
}

const agendaRequest: AgendaSuggestionProviderRequest = {
  eventId: "event-1",
  timeZone: "America/New_York",
  baseDraftVersion: 3,
  baseRevision: 7,
  criteria: {
    dates: ["2026-08-10"],
    eligibleStatuses: ["accepted"],
    roomIds: ["room-1"],
    rooms: [{ id: "room-1", name: "Main room", capacity: 100 }],
    dayWindows: [{ date: "2026-08-10", startLocal: "09:00", endLocal: "17:00" }],
    orderedRules: ["prefer larger rooms"],
    ignoreExistingTimes: false,
    ignoreExistingRooms: false,
    ignoreExistingSchedule: { times: false, rooms: false },
  },
  sessions: [
    {
      id: "session-1",
      title: "A useful session",
      status: "accepted",
      participantIds: ["private-participant-id"],
      resourceIds: ["private-resource-id"],
      capacityRequired: 1,
      durationMinutes: 60,
    },
  ],
  existingEntries: [],
  dates: ["2026-08-10"],
  eligibleStatuses: ["accepted"],
  rooms: [{ id: "room-1", name: "Main room", capacity: 100 }],
  roomIds: ["room-1"],
  dayWindows: [{ date: "2026-08-10", startLocal: "09:00", endLocal: "17:00" }],
  orderedRules: ["prefer larger rooms"],
  ignoreExistingTimes: false,
  ignoreExistingRooms: false,
  ignoreExistingSchedule: { times: false, rooms: false },
};

const evaluationInput: EvaluationSuggestionProviderInput = {
  tenantId: "tenant-1",
  eventId: "event-1",
  planId: "plan-1",
  roundId: "round-1",
  assignmentId: "assignment-1",
  submissionId: "submission-1",
  rubricRevision: 11,
  submissionRevision: 23,
  planRevision: 11,
  rubricId: "rubric-1",
  submissionVersion: 23,
  round: {
    id: "round-1",
    name: "First review",
    sequence: 1,
    closesAt: null,
    rubric: {
      id: "rubric-1",
      name: "Quality rubric",
      criteria: [
        {
          id: "quality",
          label: "Quality",
          description: "How useful is the proposal?",
          minimum: 1,
          maximum: 5,
          weight: 1,
          required: true,
        },
      ],
    },
  } satisfies ReviewRound,
  submission: {
    id: "submission-1",
    title: "Submission title",
    abstract: "A concrete audience outcome.",
    answers: { topic: "Accessible design" },
    participants: [
      {
        id: "participant-1",
        displayName: "Private Person",
        email: "private@example.test",
        biography: "Private biography",
      },
    ],
    identityRedacted: false,
  },
};

const remixInput: RemixProviderInput = {
  tenantId: "tenant-1",
  eventId: "event-1",
  source: {
    kind: "session",
    id: "session-1",
    eventId: "event-1",
    revision: 19,
    title: "Original title",
    description: "Original description",
    tags: ["design"],
    tracks: ["product"],
    // This models an accidental private property on an upstream record. It must not reach the prompt.
    privateNote: "do not send this to a provider",
  } as RemixProviderInput["source"],
  fields: ["title", "description"],
  tone: "clear",
  guidance: "Keep the audience outcome explicit.",
  parentCandidateId: null,
  generation: 2,
};

function json(value: unknown): { response: string } {
  return { response: JSON.stringify(value) };
}

function promptOf(ai: FakeAi): string {
  const prompt = ai.calls.at(-1)?.inputs.prompt;
  expect(typeof prompt).toBe("string");
  return prompt as string;
}

describe("Cloudflare Workers AI advisory providers", () => {
  it("uses JSON mode and keeps the agenda contract scoped to supplied IDs and revisions", async () => {
    const ai = new FakeAi();
    ai.enqueue(
      json({
        placements: [
          {
            sessionId: "session-1",
            roomId: "room-1",
            startsAtLocal: "2026-08-10T09:00",
            endsAtLocal: "2026-08-10T10:00",
          },
        ],
      }),
    );
    const providers = createCloudflareAiProviders(ai, { model: "test-model" });

    await expect(providers.agenda.suggest?.(agendaRequest)).resolves.toEqual({
      placements: [
        {
          sessionId: "session-1",
          roomId: "room-1",
          startsAtLocal: "2026-08-10T09:00",
          endsAtLocal: "2026-08-10T10:00",
        },
      ],
    });
    expect(ai.calls[0]).toMatchObject({
      model: "test-model",
      inputs: { response_format: { type: "json_schema", name: "agenda_proposal" } },
    });
    const prompt = promptOf(ai);
    expect(prompt).toContain('"eventId":"event-1"');
    expect(prompt).toContain('"baseRevision":7');
    expect(prompt).toContain('"baseDraftVersion":3');
    expect(prompt).not.toContain("private-participant-id");
    expect(prompt).not.toContain("private-resource-id");
  });

  it("accepts documented placement aliases through nested Workers AI envelopes", async () => {
    const ai = new FakeAi();
    ai.enqueue({
      result: {
        output: JSON.stringify({
          proposedEntries: [
            {
              sessionId: "session-1",
              roomId: "room-1",
              startsAtLocal: "2026-08-10T10:00",
              endsAtLocal: "2026-08-10T11:00",
            },
          ],
        }),
      },
    });
    const providers = createCloudflareAiProviders(ai);

    await expect(providers.agenda.suggest?.(agendaRequest)).resolves.toEqual({
      placements: [
        {
          sessionId: "session-1",
          roomId: "room-1",
          startsAtLocal: "2026-08-10T10:00",
          endsAtLocal: "2026-08-10T11:00",
        },
      ],
    });
  });

  it("falls back to bounded scheduling for hallucinated IDs and malformed JSON", async () => {
    const ai = new FakeAi();
    ai.enqueue(
      json({
        placements: [
          {
            sessionId: "other-session",
            roomId: "room-1",
            startsAtLocal: "2026-08-10T09:00",
            endsAtLocal: "2026-08-10T10:00",
          },
        ],
      }),
    );
    const providers = createCloudflareAiProviders(ai);
    await expect(providers.agenda.suggest?.(agendaRequest)).resolves.toEqual({
      placements: [
        {
          sessionId: "session-1",
          roomId: "room-1",
          startsAtLocal: "2026-08-10T09:00",
          endsAtLocal: "2026-08-10T10:00",
        },
      ],
    });

    ai.enqueue({ response: "not-json-with-a-secret" });
    await expect(providers.agenda.suggest?.(agendaRequest)).resolves.toEqual({
      placements: [
        {
          sessionId: "session-1",
          roomId: "room-1",
          startsAtLocal: "2026-08-10T09:00",
          endsAtLocal: "2026-08-10T10:00",
        },
      ],
    });
  });

  it("avoids existing room conflicts while placing multiple fallback sessions", async () => {
    const rooms = [
      { id: "room-1", name: "Main room", capacity: 100 },
      { id: "room-2", name: "Second room", capacity: 100 },
    ];
    const request: AgendaSuggestionProviderRequest = {
      ...agendaRequest,
      criteria: {
        ...agendaRequest.criteria,
        roomIds: rooms.map((room) => room.id),
        rooms,
      },
      sessions: [
        ...agendaRequest.sessions,
        {
          id: "session-2",
          title: "Another useful session",
          status: "accepted",
          participantIds: [],
          resourceIds: [],
          capacityRequired: 1,
          durationMinutes: 60,
        },
      ],
      existingEntries: [
        {
          id: "entry-1",
          sessionId: "already-scheduled",
          roomId: "room-1",
          trackIds: [],
          startsAt: "2026-08-10T13:00:00.000Z",
          endsAt: "2026-08-10T14:00:00.000Z",
          startsAtLocal: "2026-08-10T09:00",
          endsAtLocal: "2026-08-10T10:00",
          timeZone: "America/New_York",
        },
      ],
      rooms,
      roomIds: rooms.map((room) => room.id),
    };
    const ai = new FakeAi();
    ai.enqueue({ response: "not-json" });
    const providers = createCloudflareAiProviders(ai);

    await expect(providers.agenda.suggest?.(request)).resolves.toEqual({
      placements: [
        {
          sessionId: "session-1",
          roomId: "room-2",
          startsAtLocal: "2026-08-10T09:00",
          endsAtLocal: "2026-08-10T10:00",
        },
        {
          sessionId: "session-2",
          roomId: "room-1",
          startsAtLocal: "2026-08-10T10:00",
          endsAtLocal: "2026-08-10T11:00",
        },
      ],
    });
  });

  it("returns no fallback placements when the request has no schedulable inputs", async () => {
    const emptyCriteria = {
      ...agendaRequest.criteria,
      dates: [],
      roomIds: [],
      rooms: [],
      dayWindows: [],
    };
    const request: AgendaSuggestionProviderRequest = {
      ...agendaRequest,
      criteria: emptyCriteria,
      sessions: [],
      existingEntries: [],
      dates: [],
      rooms: [],
      roomIds: [],
      dayWindows: [],
    };
    const ai = new FakeAi();
    ai.enqueue({ response: "not-json" });
    const providers = createCloudflareAiProviders(ai);

    await expect(providers.agenda.suggest?.(request)).resolves.toEqual({ placements: [] });
  });

  it("returns evaluation candidates with exact rubric/submission revisions and validates evidence references", async () => {
    const ai = new FakeAi();
    ai.enqueue(
      json({
        candidates: [
          {
            criterionId: "quality",
            value: 4,
            evidence: ["abstract", "answers.topic"],
          },
        ],
      }),
    );
    const providers = createCloudflareAiProviders(ai, {
      model: "evaluation-model",
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });

    await expect(providers.evaluations.generate?.(evaluationInput)).resolves.toMatchObject({
      candidates: [{ criterionId: "quality", value: 4, evidence: ["abstract", "answers.topic"] }],
      provenance: {
        provider: "cloudflare-workers-ai",
        model: "evaluation-model",
        generatedAt: "2026-08-09T12:00:00.000Z",
      },
    });
    const prompt = promptOf(ai);
    expect(prompt).toContain('"tenantId":"tenant-1"');
    expect(prompt).toContain('"rubricRevision":11');
    expect(prompt).toContain('"submissionRevision":23');
    expect(prompt).not.toContain("private@example.test");
    expect(prompt).not.toContain("Private biography");

    ai.enqueue(
      json({ candidates: [{ criterionId: "unknown", value: 4, evidence: ["abstract"] }] }),
    );
    await expect(providers.evaluations.generate?.(evaluationInput)).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
    });
    ai.enqueue(
      json({ candidates: [{ criterionId: "quality", value: 4, evidence: ["answers.private"] }] }),
    );
    await expect(providers.evaluations.generate?.(evaluationInput)).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
    });
  });

  it("keeps remix output limited to selected content fields and source revision context", async () => {
    const ai = new FakeAi();
    ai.enqueue(
      json({
        content: { title: "A clearer title", description: "A clearer description." },
        changeSummary: "Clarified the audience outcome.",
      }),
    );
    const providers = createCloudflareAiProviders(ai, {
      model: "remix-model",
      now: () => new Date("2026-08-09T12:00:00.000Z"),
    });

    await expect(providers.remix.generate(remixInput)).resolves.toMatchObject({
      content: { title: "A clearer title", description: "A clearer description." },
      provenance: {
        provider: "cloudflare-workers-ai",
        model: "remix-model",
        promptVersion: "cloudflare-workers-ai-v1",
        generatedAt: "2026-08-09T12:00:00.000Z",
      },
    });
    const prompt = promptOf(ai);
    expect(prompt).toContain('"tenantId":"tenant-1"');
    expect(prompt).toContain('"sourceRevision":19');
    expect(prompt).not.toContain("design");
    expect(prompt).not.toContain("product");
    expect(prompt).not.toContain("do not send this to a provider");

    ai.enqueue(json({ content: { tags: ["hallucinated"] } }));
    await expect(providers.remix.generate(remixInput)).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
    });
  });

  it("routes each feature to its configured model and reasoning effort", async () => {
    const ai = new FakeAi();
    ai.enqueue(json({ placements: [], removeEntryIds: [] }));
    ai.enqueue(
      json({
        candidates: [
          {
            criterionId: "quality",
            value: 4,
            evidence: ["abstract"],
          },
        ],
      }),
    );
    ai.enqueue(json({ content: { title: "A clearer title" } }));

    const providers = createCloudflareAiProviders(ai, {
      model: "fallback-model",
      agendaModel: "gpt-5.6-sol",
      evaluationModel: "gpt-5.6-sol",
      remixModel: "gpt-5.6-terra",
      agendaReasoningEffort: "medium",
      evaluationReasoningEffort: "medium",
      remixReasoningEffort: "low",
      providerName: "openai-responses",
    });

    await providers.agenda.suggest?.(agendaRequest);
    await providers.evaluations.generate?.(evaluationInput);
    await providers.remix.generate(remixInput);

    expect(ai.calls.map(({ model }) => model)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
    ]);
    expect(ai.calls.map(({ inputs }) => inputs.reasoning)).toEqual([
      { effort: "medium" },
      { effort: "medium" },
      { effort: "low" },
    ]);
  });

  it("surfaces unavailable and retryable failures as safe typed errors", async () => {
    const unavailable = createCloudflareAiProviders(undefined);
    await expect(unavailable.remix.generate(remixInput)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      retryable: true,
      message: "AI provider is unavailable.",
    });

    const authFailure = new FakeAi();
    authFailure.fail(Object.assign(new Error("auth-secret"), { status: 401 }));
    const authProviders = createCloudflareAiProviders(authFailure);
    await expect(authProviders.agenda.suggest?.(agendaRequest)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      retryable: false,
    });

    const ai = new FakeAi();
    const providerSecret = "provider-secret-not-for-errors";
    ai.fail(Object.assign(new Error(providerSecret), { status: 503, code: "UPSTREAM" }));
    const providers = createCloudflareAiProviders(ai);
    const failure = providers.remix.generate(remixInput);
    await expect(failure).rejects.toBeInstanceOf(CloudflareAiProviderError);
    await expect(failure).rejects.toMatchObject({ code: "AI_RETRYABLE", retryable: true });
    await expect(failure).rejects.not.toThrow(providerSecret);
  });

  it("bounds stalled provider requests without exposing provider state", async () => {
    const stalled: CloudflareAiBinding = {
      run: () => new Promise<unknown>(() => undefined),
    };
    const providers = createCloudflareAiProviders(stalled, { requestTimeoutMs: 5 });

    await expect(providers.remix.generate(remixInput)).rejects.toMatchObject({
      code: "AI_RETRYABLE",
      retryable: true,
      message: "AI provider request timed out.",
    });
    expect(() => createCloudflareAiProviders(stalled, { requestTimeoutMs: 0 })).toThrow(
      "between 1 and 120000 milliseconds",
    );
  });
});

const liveProviderTest = process.env.RUN_OPENAI_LIVE === "1" ? it : it.skip;
liveProviderTest(
  "returns valid agenda, evaluation, and remix proposals from the selected GPT-5.6 models",
  async () => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when RUN_OPENAI_LIVE=1.");
    const providers = createCloudflareAiProviders(createOpenAiResponsesBinding({ apiKey }), {
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra",
      agendaModel: process.env.OPENAI_AGENDA_MODEL?.trim() || "gpt-5.6-sol",
      evaluationModel: process.env.OPENAI_EVALUATION_MODEL?.trim() || "gpt-5.6-sol",
      remixModel: process.env.OPENAI_REMIX_MODEL?.trim() || "gpt-5.6-terra",
      agendaReasoningEffort: "medium",
      evaluationReasoningEffort: "medium",
      remixReasoningEffort: "low",
      providerName: "openai-responses",
      promptVersion: "openai-responses-v1",
    });

    await expect(providers.agenda.suggest?.(agendaRequest)).resolves.toBeDefined();
    await expect(providers.evaluations.generate?.(evaluationInput)).resolves.toMatchObject({
      provenance: {
        provider: "openai-responses",
        model: process.env.OPENAI_EVALUATION_MODEL?.trim() || "gpt-5.6-sol",
      },
    });
    await expect(providers.remix.generate(remixInput)).resolves.toMatchObject({
      provenance: {
        provider: "openai-responses",
        model: process.env.OPENAI_REMIX_MODEL?.trim() || "gpt-5.6-terra",
      },
    });
  },
  90_000,
);
