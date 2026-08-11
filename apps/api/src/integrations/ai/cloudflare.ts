import type {
  AgendaSuggestionPlacement,
  AgendaSuggestionProvider,
  AgendaSuggestionProviderRequest,
  AgendaSuggestionProviderResult,
} from "../../features/agenda/types";
import type {
  EvaluationAiSuggestionProvider,
  EvaluationSuggestionProviderCandidate,
  EvaluationSuggestionProviderInput,
  EvaluationSuggestionProviderResult,
  EvaluationSuggestionProvenance,
} from "../../features/evaluations/types";
import type {
  RemixField,
  RemixProvider,
  RemixProviderInput,
  RemixProviderOutput,
} from "../../features/remix/types";

export const DEFAULT_CLOUDFLARE_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const DEFAULT_PROMPT_VERSION = "cloudflare-workers-ai-v1";
const JSON_RESPONSE_FORMAT = { type: "json_object" } as const;
const AGENDA_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "agenda_proposal",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      placements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            sessionId: { type: "string" },
            roomId: { type: "string" },
            startsAtLocal: { type: "string" },
            endsAtLocal: { type: "string" },
          },
          required: ["sessionId", "roomId", "startsAtLocal", "endsAtLocal"],
        },
      },
      removeEntryIds: { type: "array", items: { type: "string" } },
    },
    required: ["placements", "removeEntryIds"],
  },
} as const;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Structural JSON-prompt binding shared by supported advisory AI providers. */
export interface CloudflareAiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}
export type AdvisoryAiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export interface CloudflareAiProviderOptions {
  readonly model?: string;
  readonly agendaModel?: string;
  readonly evaluationModel?: string;
  readonly remixModel?: string;
  readonly agendaReasoningEffort?: AdvisoryAiReasoningEffort;
  readonly evaluationReasoningEffort?: AdvisoryAiReasoningEffort;
  readonly remixReasoningEffort?: AdvisoryAiReasoningEffort;
  readonly providerName?: string;
  readonly promptVersion?: string;
  readonly now?: () => Date;
  readonly requestTimeoutMs?: number;
}

/**
 * The concrete evaluation candidate emitted by this adapter. Its stable id and
 * source revisions let the evaluation service retain the original AI score when
 * a human later accepts or overrides it.
 */
export interface CloudflareEvaluationSuggestionProviderCandidate
  extends EvaluationSuggestionProviderCandidate {
  readonly id: string;
  readonly criterionId: string;
  readonly provenance: EvaluationSuggestionProvenance;
}

/** Complete, explicitly attributed advisory evaluation output. */
export interface CloudflareEvaluationSuggestionProviderResult
  extends EvaluationSuggestionProviderResult {
  readonly candidates: readonly CloudflareEvaluationSuggestionProviderCandidate[];
  readonly provenance: EvaluationSuggestionProvenance;
}

export type CloudflareEvaluationSuggestionProducer = (
  input: EvaluationSuggestionProviderInput,
) => Promise<CloudflareEvaluationSuggestionProviderResult>;

export interface CloudflareEvaluationAiSuggestionProvider extends EvaluationAiSuggestionProvider {
  readonly generate: CloudflareEvaluationSuggestionProducer;
  readonly suggest: CloudflareEvaluationSuggestionProducer;
  readonly produce: CloudflareEvaluationSuggestionProducer;
  readonly generateSuggestions: CloudflareEvaluationSuggestionProducer;
}

export type CloudflareAiProviderErrorCode = "AI_UNAVAILABLE" | "AI_RETRYABLE" | "AI_INVALID_OUTPUT";

export interface CloudflareAiProviderCause {
  readonly name?: string;
  readonly code?: string;
  readonly status?: number;
}

export class CloudflareAiProviderError extends Error {
  readonly retryable: boolean;
  readonly cause: CloudflareAiProviderCause | undefined;

  constructor(
    readonly code: CloudflareAiProviderErrorCode,
    message: string,
    options: {
      readonly retryable?: boolean;
      readonly cause?: CloudflareAiProviderCause;
    } = {},
  ) {
    super(message);
    this.name = "CloudflareAiProviderError";
    this.retryable = options.retryable ?? (code === "AI_RETRYABLE" || code === "AI_UNAVAILABLE");
    this.cause = options.cause;
  }
}

export interface CloudflareAiProviders {
  readonly agenda: AgendaSuggestionProvider;
  readonly evaluations: CloudflareEvaluationAiSuggestionProvider;
  readonly remix: RemixProvider;
}

/**
 * Creates private, advisory AI adapters. The adapters only return typed
 * proposals; they never apply, publish, persist, or otherwise mutate source data.
 */
export function createCloudflareAiProviders(
  ai: CloudflareAiBinding | null | undefined,
  options: CloudflareAiProviderOptions = {},
): CloudflareAiProviders {
  const model = normalizeConfigurationText(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
  const agendaModel =
    model === null ? null : normalizeConfigurationText(options.agendaModel, model);
  const evaluationModel =
    model === null ? null : normalizeConfigurationText(options.evaluationModel, model);
  const remixModel = model === null ? null : normalizeConfigurationText(options.remixModel, model);
  const agendaReasoningEffort = normalizeReasoningEffort(options.agendaReasoningEffort);
  const evaluationReasoningEffort = normalizeReasoningEffort(options.evaluationReasoningEffort);
  const remixReasoningEffort = normalizeReasoningEffort(options.remixReasoningEffort);
  const providerName = normalizeConfigurationText(options.providerName, "cloudflare-workers-ai");
  const promptVersion = normalizeConfigurationText(options.promptVersion, DEFAULT_PROMPT_VERSION);
  const now = options.now ?? (() => new Date());
  const requestTimeoutMs =
    options.requestTimeoutMs === undefined
      ? DEFAULT_REQUEST_TIMEOUT_MS
      : normalizeRequestTimeout(options.requestTimeoutMs);
  const invoke = (
    prompt: string,
    selectedModel: string | null,
    reasoningEffort: AdvisoryAiReasoningEffort | undefined,
    responseFormat: Record<string, unknown> = JSON_RESPONSE_FORMAT,
  ): Promise<unknown> =>
    invokeWorkersAi(ai, selectedModel, prompt, requestTimeoutMs, reasoningEffort, responseFormat);

  const agendaSuggest = async (
    request: AgendaSuggestionProviderRequest,
  ): Promise<AgendaSuggestionProviderResult> => {
    const prompt = agendaPrompt(request);
    try {
      const output = await invoke(
        prompt,
        agendaModel,
        agendaReasoningEffort,
        AGENDA_RESPONSE_FORMAT,
      );
      return parseAgendaOutput(output, request);
    } catch (error) {
      if (error instanceof CloudflareAiProviderError && error.code === "AI_INVALID_OUTPUT") {
        return fallbackAgendaOutput(request);
      }
      throw error;
    }
  };

  const evaluationGenerate: CloudflareEvaluationSuggestionProducer = async (input) => {
    const prompt = evaluationPrompt(input);
    const output = await invoke(
      prompt,
      evaluationModel,
      evaluationReasoningEffort,
      evaluationResponseFormat(input),
    );
    return parseEvaluationOutput(output, input, providerName, evaluationModel, promptVersion, now);
  };

  const remixGenerate = async (input: RemixProviderInput): Promise<RemixProviderOutput> => {
    assertRemixInput(input);
    const prompt = remixPrompt(input);
    const output = await invoke(
      prompt,
      remixModel,
      remixReasoningEffort,
      remixResponseFormat(input),
    );
    return parseRemixOutput(output, input, providerName, remixModel, promptVersion, now);
  };

  return {
    agenda: {
      suggest: agendaSuggest,
      generate: agendaSuggest,
      propose: agendaSuggest,
    },
    evaluations: {
      generate: evaluationGenerate,
      suggest: evaluationGenerate,
      produce: evaluationGenerate,
      generateSuggestions: evaluationGenerate,
    },
    remix: { generate: remixGenerate },
  };
}

function normalizeConfigurationText(value: string | undefined, fallback: string): string | null {
  if (value === undefined) return fallback;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
}

function normalizeReasoningEffort(
  value: AdvisoryAiReasoningEffort | undefined,
): AdvisoryAiReasoningEffort | undefined {
  if (value === undefined) return undefined;
  if (!["none", "low", "medium", "high", "xhigh", "max"].includes(value)) {
    throw new TypeError("AI reasoning effort is invalid.");
  }
  return value;
}

function normalizeRequestTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 120_000) {
    throw new TypeError("Workers AI request timeout must be between 1 and 120000 milliseconds.");
  }
  return value;
}

async function invokeWorkersAi(
  ai: CloudflareAiBinding | null | undefined,
  model: string | null,
  prompt: string,
  requestTimeoutMs: number,
  reasoningEffort: AdvisoryAiReasoningEffort | undefined,
  responseFormat: Record<string, unknown>,
): Promise<unknown> {
  if (ai === null || ai === undefined || typeof ai.run !== "function" || model === null) {
    throw new CloudflareAiProviderError("AI_UNAVAILABLE", "AI provider is unavailable.");
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutFailure = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new CloudflareAiProviderError("AI_RETRYABLE", "AI provider request timed out.", {
          retryable: true,
        }),
      );
    }, requestTimeoutMs);
  });
  let raw: unknown;
  try {
    raw = await Promise.race([
      ai.run(model, {
        prompt,
        response_format: responseFormat,
        ...(reasoningEffort === undefined ? {} : { reasoning: { effort: reasoningEffort } }),
      }),
      timeoutFailure,
    ]);
  } catch (error) {
    throw classifyProviderFailure(error);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }

  if (isResponse(raw)) {
    if (!raw.ok) {
      throw classifyProviderStatus(raw.status);
    }
    let body: string;
    try {
      body = await raw.text();
    } catch (error) {
      throw classifyProviderFailure(error);
    }
    try {
      const parsed = parseJson(body);
      const failure = providerEnvelopeFailure(parsed);
      if (failure !== undefined) throw failure;
      const envelope = parseJsonEnvelope(parsed);
      const nestedFailure = providerEnvelopeFailure(envelope);
      if (nestedFailure !== undefined) throw nestedFailure;
      return envelope;
    } catch (error) {
      if (error instanceof CloudflareAiProviderError) throw error;
      throw invalidOutput(error);
    }
  }
  const envelopeFailure = providerEnvelopeFailure(raw);
  if (envelopeFailure !== undefined) throw envelopeFailure;

  try {
    const envelope = parseJsonEnvelope(raw);
    const nestedFailure = providerEnvelopeFailure(envelope);
    if (nestedFailure !== undefined) throw nestedFailure;
    return envelope;
  } catch (error) {
    if (error instanceof CloudflareAiProviderError) throw error;
    throw invalidOutput(error);
  }
}

function classifyProviderFailure(error: unknown): CloudflareAiProviderError {
  if (error instanceof CloudflareAiProviderError) return error;
  const status = providerStatus(error);
  const retryable = providerRetryable(error) || status === undefined || retryableStatus(status);
  const code: CloudflareAiProviderErrorCode = retryable ? "AI_RETRYABLE" : "AI_UNAVAILABLE";
  const sanitizedCause = sanitizeCause(error, status);
  return new CloudflareAiProviderError(code, providerMessage(code), {
    retryable,
    ...(sanitizedCause === undefined ? {} : { cause: sanitizedCause }),
  });
}

function classifyProviderStatus(status: number): CloudflareAiProviderError {
  const retryable = retryableStatus(status);
  const code: CloudflareAiProviderErrorCode = retryable ? "AI_RETRYABLE" : "AI_UNAVAILABLE";
  return new CloudflareAiProviderError(code, providerMessage(code), {
    retryable,
    cause: { status },
  });
}

function providerEnvelopeFailure(raw: unknown): CloudflareAiProviderError | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.status === "number" && Number.isFinite(raw.status) && raw.status >= 400) {
    return classifyProviderStatus(raw.status);
  }
  if (raw.success === false) return classifyProviderFailure(raw);
  return undefined;
}
function invalidOutput(cause?: unknown): CloudflareAiProviderError {
  const sanitizedCause = sanitizeCause(cause);
  return new CloudflareAiProviderError(
    "AI_INVALID_OUTPUT",
    "AI provider returned invalid advisory output.",
    {
      retryable: false,
      ...(sanitizedCause === undefined ? {} : { cause: sanitizedCause }),
    },
  );
}

function providerMessage(
  code: Exclude<CloudflareAiProviderErrorCode, "AI_INVALID_OUTPUT">,
): string {
  return code === "AI_RETRYABLE"
    ? "AI provider request failed and may be retried."
    : "AI provider is unavailable.";
}

function parseJsonEnvelope(raw: unknown): unknown {
  let value = raw;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof value === "string") return parseJson(value);
    if (!isRecord(value)) throw new Error("Workers AI response was not an object.");
    const envelope = value;
    const aliases = ["response", "result", "output", "data"].filter((key) =>
      Object.hasOwn(envelope, key),
    );
    if (aliases.length === 0) return envelope;
    if (aliases.length > 1) throw new Error("Workers AI response envelope was ambiguous.");
    const alias = aliases[0];
    if (alias === undefined) throw new Error("Workers AI response envelope was empty.");
    value = envelope[alias];
  }
  throw new Error("Workers AI response envelope was too deeply nested.");
}

function parseJson(text: string): unknown {
  const normalized = text.trim();
  if (normalized.length === 0) throw new Error("Workers AI response was empty.");
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new Error("Workers AI response was not valid JSON.");
  }
}

function providerStatus(error: unknown): number | undefined {
  if (!isRecord(error) || typeof error.status !== "number" || !Number.isFinite(error.status)) {
    return undefined;
  }
  return error.status;
}

function providerRetryable(error: unknown): boolean {
  return isRecord(error) && error.retryable === true;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sanitizeCause(
  error: unknown,
  status = providerStatus(error),
): CloudflareAiProviderCause | undefined {
  if (error === undefined || error === null) return status === undefined ? undefined : { status };
  const cause: { name?: string; code?: string; status?: number } = {};
  if (error instanceof Error && error.name.length > 0) cause.name = error.name.slice(0, 80);
  if (isRecord(error) && typeof error.name === "string" && error.name.length > 0) {
    cause.name = error.name.slice(0, 80);
  }
  if (
    isRecord(error) &&
    typeof error.code === "string" &&
    /^[A-Za-z0-9_.-]{1,80}$/.test(error.code)
  ) {
    cause.code = error.code;
  }
  if (status !== undefined) cause.status = status;
  return Object.keys(cause).length === 0 ? undefined : cause;
}

function agendaPrompt(request: AgendaSuggestionProviderRequest): string {
  const input = request as AgendaSuggestionProviderRequest & { readonly tenantId?: unknown };
  const context: Record<string, unknown> = {
    eventId: request.eventId,
    timeZone: request.timeZone,
    baseDraftVersion: request.baseDraftVersion,
    baseRevision: request.baseRevision,
  };
  if (typeof input.tenantId === "string" && input.tenantId.trim().length > 0) {
    context.tenantId = input.tenantId;
  }

  const criteria = request.criteria;
  const payload = {
    criteria: {
      dates: [...criteria.dates],
      eligibleStatuses: [...criteria.eligibleStatuses],
      roomIds: [...criteria.roomIds],
      rooms: criteria.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        capacity: room.capacity,
      })),
      dayWindows: criteria.dayWindows.map((window) => ({
        date: window.date,
        startLocal: window.startLocal,
        endLocal: window.endLocal,
      })),
      orderedRules: criteria.orderedRules.map(promptAgendaRule),
      ignoreExistingTimes: criteria.ignoreExistingTimes,
      ignoreExistingRooms: criteria.ignoreExistingRooms,
      ignoreExistingSchedule: {
        times: criteria.ignoreExistingSchedule.times,
        rooms: criteria.ignoreExistingSchedule.rooms,
      },
    },
    sessions: request.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      status: session.status,
      ...(session.durationMinutes === undefined
        ? {}
        : { durationMinutes: session.durationMinutes }),
    })),
    existingEntries: request.existingEntries.map((entry) => ({
      id: entry.id,
      sessionId: entry.sessionId,
      roomId: entry.roomId,
      trackIds: [...entry.trackIds],
      startsAtLocal: entry.startsAtLocal,
      endsAtLocal: entry.endsAtLocal,
      timeZone: entry.timeZone,
    })),
  };
  return promptText(
    "agenda",
    context,
    payload,
    "Return only {placements:[...],removeEntryIds:[...]} JSON (proposedPlacements and proposedEntries are accepted placement aliases). Placements may use only supplied session and room IDs; removeEntryIds may use only supplied existing entry IDs.",
  );
}

function promptAgendaRule(rule: unknown): unknown {
  if (typeof rule === "string") return rule;
  if (!isRecord(rule)) return null;
  const allowedKeys = new Set([
    "type",
    "kind",
    "field",
    "operator",
    "value",
    "priority",
    "name",
    "description",
    "rule",
  ]);
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rule)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      safe[key] = value;
  }
  return safe;
}

function parseAgendaOutput(
  raw: unknown,
  request: AgendaSuggestionProviderRequest,
): AgendaSuggestionProviderResult {
  if (!isRecord(raw)) throw invalidOutput();
  const placementKeys = ["placements", "proposedPlacements", "proposedEntries"] as const;
  const presentPlacementKeys = placementKeys.filter((key) => Object.hasOwn(raw, key));
  if (presentPlacementKeys.length > 1 || !hasOnlyKeys(raw, [...placementKeys, "removeEntryIds"])) {
    throw invalidOutput();
  }
  const sessionIds = new Set(
    request.sessions
      .filter((session) => request.eligibleStatuses.includes(session.status))
      .map((session) => session.id),
  );
  const selectedRoomIds = new Set(request.roomIds);
  const existingIds = new Set(request.existingEntries.map((entry) => entry.id));
  const knownTrackIds = new Set(request.existingEntries.flatMap((entry) => entry.trackIds));
  const placementKey = presentPlacementKeys[0];
  const rawPlacements = placementKey === undefined ? [] : raw[placementKey];
  if (!Array.isArray(rawPlacements)) throw invalidOutput();
  const placements: AgendaSuggestionPlacement[] = [];
  const seenSessions = new Set<string>();
  for (const value of rawPlacements) {
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, [
        "id",
        "sessionId",
        "roomId",
        "trackIds",
        "startsAtLocal",
        "endsAtLocal",
        "startDisambiguation",
        "endDisambiguation",
        "rationale",
      ])
    )
      throw invalidOutput();
    const sessionId = boundedString(value.sessionId, 200);
    const roomId = boundedString(value.roomId, 200);
    const startsAtLocal = boundedString(value.startsAtLocal, 80);
    const endsAtLocal = boundedString(value.endsAtLocal, 80);
    if (
      sessionId === null ||
      roomId === null ||
      startsAtLocal === null ||
      endsAtLocal === null ||
      !sessionIds.has(sessionId) ||
      !selectedRoomIds.has(roomId) ||
      seenSessions.has(sessionId) ||
      !validAgendaLocalTime(startsAtLocal) ||
      !validAgendaLocalTime(endsAtLocal) ||
      !withinAgendaWindow(startsAtLocal, endsAtLocal, request)
    )
      throw invalidOutput();
    seenSessions.add(sessionId);

    let id: string | undefined;
    if (value.id !== undefined) {
      id = boundedString(value.id, 200) ?? undefined;
      if (id === undefined || !existingIds.has(id)) throw invalidOutput();
    }
    let trackIds: readonly string[] | undefined;
    if (value.trackIds !== undefined) {
      if (!Array.isArray(value.trackIds)) throw invalidOutput();
      const normalized = value.trackIds.map((trackId) => boundedString(trackId, 200));
      if (
        normalized.some((trackId) => trackId === null) ||
        new Set(normalized).size !== normalized.length ||
        normalized.some((trackId) => trackId !== null && !knownTrackIds.has(trackId))
      )
        throw invalidOutput();
      trackIds = normalized as string[];
    }
    const startDisambiguation = parseDisambiguation(value.startDisambiguation);
    const endDisambiguation = parseDisambiguation(value.endDisambiguation);
    if (startDisambiguation === INVALID || endDisambiguation === INVALID) throw invalidOutput();
    let rationale: string | undefined;
    if (value.rationale !== undefined) {
      const normalizedRationale = boundedString(value.rationale, 2_000);
      if (normalizedRationale === null) throw invalidOutput();
      rationale = normalizedRationale;
    }
    placements.push({
      ...(id === undefined ? {} : { id }),
      sessionId,
      roomId,
      ...(trackIds === undefined ? {} : { trackIds }),
      startsAtLocal,
      endsAtLocal,
      ...(startDisambiguation === undefined ? {} : { startDisambiguation }),
      ...(endDisambiguation === undefined ? {} : { endDisambiguation }),
      ...(rationale === undefined ? {} : { rationale }),
    });
  }

  let removeEntryIds: readonly string[] | undefined;
  if (raw.removeEntryIds !== undefined) {
    if (!Array.isArray(raw.removeEntryIds)) throw invalidOutput();
    const normalized = raw.removeEntryIds.map((entryId) => boundedString(entryId, 200));
    if (
      normalized.some((entryId) => entryId === null) ||
      new Set(normalized).size !== normalized.length ||
      normalized.some((entryId) => entryId !== null && !existingIds.has(entryId))
    )
      throw invalidOutput();
    removeEntryIds = normalized as string[];
  }
  if (agendaPlacementsOverlap(placements, request, removeEntryIds)) throw invalidOutput();
  return {
    placements,
    ...(removeEntryIds === undefined ? {} : { removeEntryIds }),
  };
}

interface AgendaReservation {
  readonly date: string;
  readonly roomId: string;
  readonly start: number;
  readonly end: number;
}

interface AgendaSlot {
  readonly date: string;
  readonly roomId: string;
  readonly start: number;
  readonly end: number;
}

function fallbackAgendaOutput(
  request: AgendaSuggestionProviderRequest,
): AgendaSuggestionProviderResult {
  const criteria = request.criteria;
  const eligibleStatuses = new Set(request.eligibleStatuses ?? criteria.eligibleStatuses);
  const selectedRoomIds = [
    ...new Set(
      (request.roomIds ?? criteria.roomIds).filter(
        (roomId): roomId is string => typeof roomId === "string" && roomId.trim().length > 0,
      ),
    ),
  ];
  const dates = new Set(request.dates ?? criteria.dates);
  const windows = [...(request.dayWindows ?? criteria.dayWindows)]
    .filter(
      (window) =>
        typeof window.date === "string" &&
        dates.has(window.date) &&
        validAgendaClock(window.startLocal) &&
        validAgendaClock(window.endLocal) &&
        localClockMinutes(window.endLocal) > localClockMinutes(window.startLocal),
    )
    .sort((left, right) =>
      `${left.date}T${left.startLocal}`.localeCompare(`${right.date}T${right.startLocal}`),
    );
  if (selectedRoomIds.length === 0 || windows.length === 0) return { placements: [] };

  const ignoreExistingTimes = request.ignoreExistingTimes ?? criteria.ignoreExistingTimes;
  const ignoreExistingRooms = request.ignoreExistingRooms ?? criteria.ignoreExistingRooms;
  const eligibleSessions = request.sessions
    .filter((session) => eligibleStatuses.has(session.status))
    .sort((left, right) => left.id.localeCompare(right.id));
  const existingSessionIds = new Set(request.existingEntries.map((entry) => entry.sessionId));
  const sessionsToPlace = eligibleSessions.filter(
    (session) => !existingSessionIds.has(session.id) || ignoreExistingTimes || ignoreExistingRooms,
  );
  const replacedSessionIds = new Set(sessionsToPlace.map((session) => session.id));
  const reservations = request.existingEntries
    .filter((entry) => !replacedSessionIds.has(entry.sessionId))
    .map(agendaReservation)
    .filter((reservation): reservation is AgendaReservation => reservation !== null);
  const placements: AgendaSuggestionPlacement[] = [];

  for (const session of sessionsToPlace) {
    const duration = agendaSessionDuration(session.durationMinutes);
    const slot = findAgendaSlot(selectedRoomIds, windows, reservations, duration);
    if (slot === null) continue;
    placements.push({
      sessionId: session.id,
      roomId: slot.roomId,
      startsAtLocal: `${slot.date}T${formatAgendaMinutes(slot.start)}`,
      endsAtLocal: `${slot.date}T${formatAgendaMinutes(slot.end)}`,
    });
    reservations.push({
      date: slot.date,
      roomId: slot.roomId,
      start: slot.start,
      end: slot.end,
    });
  }

  return { placements };
}

function agendaPlacementsOverlap(
  placements: readonly AgendaSuggestionPlacement[],
  request: AgendaSuggestionProviderRequest,
  removeEntryIds: readonly string[] = [],
): boolean {
  const replacedSessionIds = new Set(placements.map((placement) => placement.sessionId));
  const removedIds = new Set(removeEntryIds);
  const reservations = request.existingEntries
    .filter((entry) => !replacedSessionIds.has(entry.sessionId) && !removedIds.has(entry.id))
    .map(agendaReservation)
    .filter((reservation): reservation is AgendaReservation => reservation !== null);
  for (const placement of placements) {
    const reservation = agendaReservation(placement);
    if (reservation === null) return true;
    if (reservations.some((existing) => agendaReservationsOverlap(reservation, existing))) {
      return true;
    }
    reservations.push(reservation);
  }
  return false;
}

function agendaReservation(value: {
  readonly roomId: string;
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
}): AgendaReservation | null {
  if (
    !validAgendaLocalTime(value.startsAtLocal) ||
    !validAgendaLocalTime(value.endsAtLocal) ||
    value.startsAtLocal.slice(0, 10) !== value.endsAtLocal.slice(0, 10)
  ) {
    return null;
  }
  const start = localMinutes(value.startsAtLocal);
  const end = localMinutes(value.endsAtLocal);
  if (start === null || end === null || end <= start) return null;
  return {
    date: value.startsAtLocal.slice(0, 10),
    roomId: value.roomId,
    start,
    end,
  };
}

function agendaReservationsOverlap(left: AgendaReservation, right: AgendaReservation): boolean {
  return (
    left.date === right.date &&
    left.roomId === right.roomId &&
    left.start < right.end &&
    right.start < left.end
  );
}

function findAgendaSlot(
  roomIds: readonly string[],
  windows: readonly { date: string; startLocal: string; endLocal: string }[],
  reservations: readonly AgendaReservation[],
  duration: number,
): AgendaSlot | null {
  let best: AgendaSlot | null = null;
  for (const window of windows) {
    const windowStart = localClockMinutes(window.startLocal);
    const windowEnd = localClockMinutes(window.endLocal);
    if (
      !validAgendaClock(window.startLocal) ||
      !validAgendaClock(window.endLocal) ||
      windowEnd <= windowStart
    ) {
      continue;
    }
    for (const roomId of roomIds) {
      let start = windowStart;
      const roomReservations = reservations
        .filter((reservation) => reservation.date === window.date && reservation.roomId === roomId)
        .sort((left, right) => left.start - right.start || left.end - right.end);
      for (const reservation of roomReservations) {
        if (reservation.end <= start) continue;
        if (start + duration <= reservation.start) break;
        start = Math.max(start, reservation.end);
      }
      if (start + duration > windowEnd) continue;
      const candidate: AgendaSlot = {
        date: window.date,
        roomId,
        start,
        end: start + duration,
      };
      if (
        best === null ||
        candidate.date < best.date ||
        (candidate.date === best.date && candidate.start < best.start)
      ) {
        best = candidate;
      }
    }
  }
  return best;
}

function agendaSessionDuration(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 60;
  return Math.max(1, Math.min(Math.floor(value), 24 * 60));
}

function formatAgendaMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function evaluationResponseFormat(
  input: EvaluationSuggestionProviderInput,
): Record<string, unknown> {
  const criteria = input.round.rubric.criteria;
  const evidence = [
    "title",
    "abstract",
    ...Object.keys(input.submission.answers).map((id) => `answers.${id}`),
  ];
  return {
    type: "json_schema",
    name: "evaluation_proposal",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        candidates: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              criterionId: { type: "string", enum: criteria.map(({ id }) => id) },
              value: {
                type: "number",
                minimum: Math.min(...criteria.map(({ minimum }) => minimum)),
                maximum: Math.max(...criteria.map(({ maximum }) => maximum)),
              },
              evidence: {
                type: "array",
                minItems: 1,
                items: { type: "string", enum: evidence },
              },
            },
            required: ["criterionId", "value", "evidence"],
          },
        },
      },
      required: ["candidates"],
    },
  };
}

function evaluationPrompt(input: EvaluationSuggestionProviderInput): string {
  const context = {
    tenantId: input.tenantId,
    eventId: input.eventId,
    planId: input.planId,
    roundId: input.roundId,
    assignmentId: input.assignmentId,
    submissionId: input.submissionId,
    rubricRevision: input.rubricRevision,
    submissionRevision: input.submissionRevision,
    ...(input.planRevision === undefined ? {} : { planRevision: input.planRevision }),
    ...(input.rubricId === undefined ? {} : { rubricId: input.rubricId }),
    ...(input.submissionVersion === undefined
      ? {}
      : { submissionVersion: input.submissionVersion }),
  };
  const payload = {
    rubric: {
      id: input.round.rubric.id,
      name: input.round.rubric.name,
      criteria: scoreableEvaluationCriteria(input).map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        description: criterion.description,
        minimum: criterion.minimum,
        maximum: criterion.maximum,
        weight: criterion.weight,
        required: criterion.required,
        inputType: criterion.inputType ?? "numeric",
        ...(criterion.options === undefined
          ? {}
          : {
              options: criterion.options.map((option) => ({
                label: option.label,
                value: option.value,
              })),
            }),
      })),
    },
    submission: {
      abstract: input.submission.abstract,
    },
  };
  return promptText(
    "evaluation",
    context,
    payload,
    "Return only {candidates:[{criterionId,value,evidence}]} JSON with exactly one candidate for every supplied criterion. value must be a numeric score within that criterion's bounds. evidence must contain 1 to 3 concise written rationales that quote or specifically paraphrase the supplied abstract. Do not return source labels such as abstract, title, or answers.<id>; AI output is advisory and must not make a decision.",
  );
}

function scoreableEvaluationCriteria(input: EvaluationSuggestionProviderInput) {
  return input.round.rubric.criteria.filter(
    (criterion) => (criterion.inputType ?? "numeric") !== "free_text",
  );
}

function parseEvaluationOutput(
  raw: unknown,
  input: EvaluationSuggestionProviderInput,
  providerName: string | null,
  model: string | null,
  promptVersion: string | null,
  now: () => Date,
): CloudflareEvaluationSuggestionProviderResult {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["candidates"]) || !Array.isArray(raw.candidates)) {
    throw invalidOutput();
  }
  const criteria = new Map(
    scoreableEvaluationCriteria(input).map((criterion) => [criterion.id, criterion]),
  );
  if (criteria.size === 0 || raw.candidates.length !== criteria.size) throw invalidOutput();

  const provenance: EvaluationSuggestionProvenance = {
    provider: "cloudflare-workers-ai",
    model: model ?? "unavailable",
    generatedAt: safeNow(now),
    sourceReferences: ["abstract"],
    promptVersion: promptVersion ?? DEFAULT_PROMPT_VERSION,
  };
  const seenCriteria = new Set<string>();
  const candidates: CloudflareEvaluationSuggestionProviderCandidate[] = raw.candidates.map(
    (value) => {
      if (!isRecord(value) || !hasOnlyKeys(value, ["criterionId", "value", "evidence"])) {
        throw invalidOutput();
      }
      const criterionId = boundedString(value.criterionId, 200);
      if (criterionId === null || seenCriteria.has(criterionId)) throw invalidOutput();
      const criterion = criteria.get(criterionId);
      if (criterion === undefined) throw invalidOutput();
      seenCriteria.add(criterionId);

      if (
        typeof value.value !== "number" ||
        !Number.isFinite(value.value) ||
        value.value < criterion.minimum ||
        value.value > criterion.maximum
      ) {
        throw invalidOutput();
      }
      if (
        !Array.isArray(value.evidence) ||
        value.evidence.length === 0 ||
        value.evidence.length > 3
      ) {
        throw invalidOutput();
      }
      const evidence = value.evidence.map((entry) => boundedString(entry, 2_000));
      if (
        evidence.some(
          (entry) =>
            entry === null ||
            entry === "abstract" ||
            entry === "title" ||
            entry.startsWith("answers."),
        )
      ) {
        throw invalidOutput();
      }

      return {
        id: `ai:${input.assignmentId}:${criterionId}:${input.rubricRevision}:${input.submissionRevision}`,
        criterionId,
        value: value.value,
        evidence: evidence as string[],
        provenance,
      };
    },
  );
  if (seenCriteria.size !== criteria.size) throw invalidOutput();

  const sourceReferences = [...new Set(candidates.flatMap((candidate) => candidate.evidence))];
  return {
    candidates,
    provenance: {
      provider: providerName ?? "unavailable",
      model: model ?? "unavailable",
      generatedAt: safeNow(now),
      sourceReferences,
      promptVersion: promptVersion ?? DEFAULT_PROMPT_VERSION,
    },
  };
}

function assertRemixInput(input: RemixProviderInput): void {
  if (
    input.source.eventId !== input.eventId ||
    !Array.isArray(input.fields) ||
    input.fields.length === 0 ||
    new Set(input.fields).size !== input.fields.length
  ) {
    throw invalidOutput();
  }
  const allowed =
    input.source.kind === "session"
      ? new Set<RemixField>(["title", "description", "tags", "tracks"])
      : input.source.kind === "speaker"
        ? new Set<RemixField>(["biography"])
        : null;
  if (allowed === null || input.fields.some((field) => !allowed.has(field))) throw invalidOutput();
}
function remixResponseFormat(input: RemixProviderInput): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of input.fields) {
    properties[field] =
      field === "tags" || field === "tracks"
        ? { type: "array", items: { type: "string" } }
        : { type: "string" };
  }
  return {
    type: "json_schema",
    name: "content_remix_proposal",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        content: {
          type: "object",
          additionalProperties: false,
          properties,
          required: [...input.fields],
        },
        changeSummary: { type: "string" },
      },
      required: ["content", "changeSummary"],
    },
  };
}
function remixPrompt(input: RemixProviderInput): string {
  const selected = new Set(input.fields);
  const source = input.source;
  const sourceContent: Record<string, unknown> = {};
  for (const field of input.fields) {
    if (!selected.has(field)) continue;
    if (field === "title" && source.kind === "session") sourceContent[field] = source.title;
    if (field === "description" && source.kind === "session")
      sourceContent[field] = source.description;
    if (field === "tags" && source.kind === "session")
      sourceContent[field] = [...(source.tags ?? [])];
    if (field === "tracks" && source.kind === "session")
      sourceContent[field] = [...(source.tracks ?? [])];
    if (field === "biography" && source.kind === "speaker") sourceContent[field] = source.biography;
  }
  const context = {
    tenantId: input.tenantId,
    eventId: input.eventId,
    sourceType: source.kind,
    sourceId: source.id,
    sourceRevision: source.revision,
    fields: [...input.fields],
    tone: input.tone,
    guidance: input.guidance,
    parentCandidateId: input.parentCandidateId,
    generation: input.generation,
  };
  return promptText(
    "remix",
    context,
    { source: sourceContent },
    "Return only {content:{...},changeSummary?} JSON. content may contain only the requested fields; do not include IDs, revisions, provenance, or unrequested fields.",
  );
}

function parseRemixOutput(
  raw: unknown,
  input: RemixProviderInput,
  providerName: string | null,
  model: string | null,
  promptVersion: string | null,
  now: () => Date,
): RemixProviderOutput {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["content", "changeSummary"]) || !isRecord(raw.content)) {
    throw invalidOutput();
  }
  const allowed =
    input.source.kind === "session"
      ? new Set<RemixField>(["title", "description", "tags", "tracks"])
      : new Set<RemixField>(["biography"]);
  const selected = new Set(input.fields);
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw.content)) {
    if (!allowed.has(key as RemixField) || !selected.has(key as RemixField)) throw invalidOutput();
    if (key === "title" || key === "description" || key === "biography") {
      const maximum = key === "title" ? 300 : 20_000;
      const text = safeContentText(value, maximum, key === "title");
      if (text === null) throw invalidOutput();
      content[key] = text;
    } else {
      if (!Array.isArray(value) || value.length > 50) throw invalidOutput();
      const labels = value.map((label) => boundedString(label, 100));
      if (labels.some((label) => label === null) || new Set(labels).size !== labels.length)
        throw invalidOutput();
      content[key] = labels as string[];
    }
  }
  if (Object.keys(content).length === 0) throw invalidOutput();
  let changeSummary: string | undefined;
  if (raw.changeSummary !== undefined) {
    const normalizedSummary = boundedString(raw.changeSummary, 2_000);
    if (normalizedSummary === null) throw invalidOutput();
    changeSummary = normalizedSummary;
  }
  return {
    content,
    ...(changeSummary === undefined ? {} : { changeSummary }),
    provenance: {
      provider: providerName ?? "unavailable",
      model: model ?? "unavailable",
      promptVersion: promptVersion ?? DEFAULT_PROMPT_VERSION,
      generatedAt: safeNow(now),
    },
  };
}

function promptText(
  task: string,
  context: Record<string, unknown>,
  payload: Record<string, unknown>,
  instruction: string,
): string {
  try {
    return [
      "You are a private advisory assistant for a human operator.",
      `Task: ${task}.`,
      instruction,
      `Context: ${JSON.stringify(context)}`,
      `Input: ${JSON.stringify(payload)}`,
    ].join("\n");
  } catch {
    throw invalidOutput();
  }
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (normalized.length === 0 || normalized.length > maximum || hasUnsafeControl(normalized))
    return null;
  return normalized;
}

function safeContentText(value: unknown, maximum: number, required: boolean): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (
    normalized.length > maximum ||
    hasUnsafeControl(normalized) ||
    (required && normalized.length === 0)
  )
    return null;
  return normalized;
}

function hasUnsafeControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || code === 0x7f) return true;
  }
  return false;
}

function validAgendaLocalTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (match === null) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function withinAgendaWindow(
  startsAtLocal: string,
  endsAtLocal: string,
  request: AgendaSuggestionProviderRequest,
): boolean {
  const date = startsAtLocal.slice(0, 10);
  if (endsAtLocal.slice(0, 10) !== date || !request.dates.includes(date)) return false;
  const start = localMinutes(startsAtLocal);
  const end = localMinutes(endsAtLocal);
  if (start === null || end === null || end <= start) return false;
  return request.dayWindows.some(
    (window) =>
      window.date === date &&
      start >= localClockMinutes(window.startLocal) &&
      end <= localClockMinutes(window.endLocal),
  );
}

function localMinutes(value: string): number | null {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(value);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function localClockMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match === null ? Number.NaN : Number(match[1]) * 60 + Number(match[2]);
}
function validAgendaClock(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const minutes = localClockMinutes(value);
  return Number.isSafeInteger(minutes) && minutes >= 0 && minutes <= 23 * 60 + 59;
}

const INVALID = Symbol("invalid");
function parseDisambiguation(value: unknown): "earlier" | "later" | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  if (value === "earlier" || value === "later") return value;
  return INVALID;
}

function safeNow(now: () => Date): string {
  try {
    const value = now();
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  } catch {
    // Use a stable, valid fallback when an injected clock fails; this is not source data.
  }
  return new Date(0).toISOString();
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}
