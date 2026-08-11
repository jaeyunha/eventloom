import { describe, expect, it } from "vitest";
import type { AgendaState } from "../features/agenda/types";
import type { RemixProviderInput } from "../features/remix/types";
import { FakeAirtableTransport } from "../infrastructure/airtable";
import {
  type CloudflareAiBinding,
  CloudflareAiProviderError,
  createCloudflareAiProviders,
} from "../integrations/ai";
import {
  createCloudflareDependencies,
  inspectProductionRuntime,
  type RuntimeBindings,
} from "./cloudflare";

const BASE_ID = "base-runtime-ai";
const MODEL = "@cf/meta/test-runtime-model";

function database(): NonNullable<RuntimeBindings["DB"]> {
  return {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  } as unknown as NonNullable<RuntimeBindings["DB"]>;
}

function productionBindings(ai: CloudflareAiBinding): RuntimeBindings {
  const coordinator = {
    idFromName(name: string) {
      return name;
    },
    get() {
      return {
        async fetch(request: Request) {
          return request.method === "POST"
            ? Response.json({ admitted: true })
            : Response.json({ revision: 0 });
        },
      };
    },
  } as unknown as NonNullable<RuntimeBindings["AGENDA_COORDINATOR"]>;
  const privateFiles = {
    get: async () => null,
    put: async () => undefined,
  } as unknown as NonNullable<RuntimeBindings["PRIVATE_FILES"]>;
  const outboxQueue = {
    async send() {},
  } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
  return {
    APP_ENV: "production",
    WEB_ORIGIN: "https://open-sessionboard-web-production.ashleyha0317.workers.dev",
    API_ORIGIN: "https://open-sessionboard-api-production.ashleyha0317.workers.dev",
    DB: database(),
    AGENDA_COORDINATOR: coordinator,
    PRIVATE_FILES: privateFiles,
    OUTBOX_QUEUE: outboxQueue,
    AIRTABLE_ACCESS_TOKEN: "airtable-token",
    AIRTABLE_BASE_ID: BASE_ID,
    BETTER_AUTH_SECRET: "runtime-secret-that-is-at-least-32-characters-long",
    OPENSEND_API_URL: "https://opensend.namuh.co",
    OPENSEND_API_KEY: "opensend-api-key",
    AUTH_FROM_EMAIL: "auth@sessionboard.namuh.co",
    ORGANIZER_AUTOJOIN_DOMAINS: "swyx.io,ai.engineer",
    ORGANIZER_AUTOJOIN_ORGANIZATION_ID: "ai-engineer",
    AI: ai,
    AI_MODEL: MODEL,
  };
}

function remixInput(): RemixProviderInput {
  return {
    tenantId: "tenant-1",
    eventId: "event-1",
    source: {
      kind: "session",
      id: "session-1",
      eventId: "event-1",
      revision: 1,
      title: "Original title",
      description: "Original description",
    },
    fields: ["title"],
    tone: "clear",
    guidance: "Keep the audience outcome explicit.",
    parentCandidateId: null,
    generation: 1,
  };
}

function agendaState(): AgendaState {
  return {
    eventId: "event-1",
    stateVersion: 0,
    timeZone: "UTC",
    minimumTravelMinutes: 0,
    sessions: [
      {
        id: "session-1",
        title: "A useful session",
        status: "accepted",
        participantIds: [],
        resourceIds: [],
        capacityRequired: 1,
      },
    ],
    rooms: [{ id: "room-1", name: "Main room", capacity: 100 }],
    tracks: [],
    draft: {
      eventId: "event-1",
      version: 1,
      timeZone: "UTC",
      entries: [],
      warningOverrides: [],
      updatedAt: "2026-08-09T00:00:00.000Z",
      updatedBy: "seed",
    },
    revisions: [],
    currentPublishedRevisionId: null,
    outbox: [],
    audit: [],
    suggestionRuns: [],
  };
}

describe("Cloudflare runtime AI composition", () => {
  it("injects all configured providers into the Airtable runtime and propagates AI_MODEL", async () => {
    const calls: Array<{ model: string; inputs: Record<string, unknown> }> = [];
    const ai: CloudflareAiBinding = {
      async run(model, inputs) {
        calls.push({ model, inputs });
        return { response: JSON.stringify({ placements: [] }) };
      },
    };
    const bindings = productionBindings(ai);
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: BASE_ID,
      table: "Agenda Versions",
      fields: {
        "Application ID": "event-1",
        "Conflicts JSON": JSON.stringify(agendaState()),
      },
    });

    const dependencies = createCloudflareDependencies({
      ...bindings,
      AIRTABLE_TRANSPORT: transport,
    });
    expect(dependencies.authenticator).toBeDefined();
    expect(dependencies.agenda?.engine).toBeDefined();
    expect(dependencies.evaluations?.service).toBeDefined();
    expect(dependencies.remix?.service).toBeDefined();

    const run = await dependencies.agenda?.engine.generateSuggestion({
      eventId: "event-1",
      actorId: "organizer-1",
      baseDraftVersion: 1,
      dates: ["2026-08-09"],
      eligibleStatuses: ["accepted"],
      rooms: [{ id: "room-1", name: "Main room", capacity: 100 }],
      roomIds: ["room-1"],
      dayWindows: [{ date: "2026-08-09", startLocal: "09:00", endLocal: "17:00" }],
      orderedRules: [],
      ignoreExistingTimes: false,
      ignoreExistingRooms: false,
      ignoreExistingSchedule: { times: false, rooms: false },
    });

    expect(run?.eventId).toBe("event-1");
    expect(calls[0]?.model).toBe(MODEL);
    expect(calls[0]?.inputs).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("fails closed for missing AI binding or model outside local", () => {
    const ai: CloudflareAiBinding = {
      async run() {
        return { response: "{}" };
      },
    };
    const bindings = productionBindings(ai);
    const { AI: _ai, ...withoutBinding } = bindings;
    const { AI_MODEL: _model, ...withoutModel } = bindings;

    expect(inspectProductionRuntime(withoutBinding).success).toBe(false);
    expect(inspectProductionRuntime(withoutModel).success).toBe(false);
    expect(() => createCloudflareDependencies(withoutBinding)).toThrow(
      "The production runtime is not configured.",
    );
    expect(() => createCloudflareDependencies(withoutModel)).toThrow(
      "The production runtime is not configured.",
    );
  });

  it("allows local omission and reports unavailable providers without leaking upstream errors", async () => {
    const unavailable = createCloudflareAiProviders(undefined, { model: MODEL });
    await expect(unavailable.remix.generate(remixInput())).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      message: "Cloudflare Workers AI is unavailable.",
    });

    const secret = "upstream-secret-that-must-never-be-returned";
    const failing: CloudflareAiBinding = {
      async run() {
        throw Object.assign(new Error(secret), { status: 503, code: "UPSTREAM" });
      },
    };
    const provider = createCloudflareAiProviders(failing, { model: MODEL });
    const failure = provider.remix.generate(remixInput());
    await expect(failure).rejects.toBeInstanceOf(CloudflareAiProviderError);
    await expect(failure).rejects.toMatchObject({ code: "AI_RETRYABLE", retryable: true });
    await expect(failure).rejects.not.toThrow(secret);
  });
});
