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
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** The structural part of the Workers AI binding used by this adapter. */
export interface CloudflareAiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface CloudflareAiProviderOptions {
  readonly model?: string;
  readonly promptVersion?: string;
  readonly now?: () => Date;
  readonly requestTimeoutMs?: number;
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
  readonly evaluations: EvaluationAiSuggestionProvider;
  readonly remix: RemixProvider;
}

/**
 * Creates private, advisory Workers AI adapters. The adapters only return typed
 * proposals; they never apply, publish, persist, or otherwise mutate source data.
 */
export function createCloudflareAiProviders(
  ai: CloudflareAiBinding | null | undefined,
  options: CloudflareAiProviderOptions = {},
): CloudflareAiProviders {
  const model = normalizeConfigurationText(options.model, DEFAULT_CLOUDFLARE_AI_MODEL);
  const promptVersion = normalizeConfigurationText(options.promptVersion, DEFAULT_PROMPT_VERSION);
  const now = options.now ?? (() => new Date());
  const requestTimeoutMs =
    options.requestTimeoutMs === undefined
      ? DEFAULT_REQUEST_TIMEOUT_MS
      : normalizeRequestTimeout(options.requestTimeoutMs);
  const invoke = (prompt: string): Promise<unknown> =>
    invokeWorkersAi(ai, model, prompt, requestTimeoutMs);

  const agendaSuggest = async (
    request: AgendaSuggestionProviderRequest,
  ): Promise<AgendaSuggestionProviderResult> => {
    const prompt = agendaPrompt(request);
    try {
      const output = await invoke(prompt);
      return parseAgendaOutput(output, request);
    } catch (error) {
      if (error instanceof CloudflareAiProviderError && error.code === "AI_INVALID_OUTPUT") {
        return fallbackAgendaOutput(request);
      }
      throw error;
    }
  };

  const evaluationGenerate = async (
    input: EvaluationSuggestionProviderInput,
  ): Promise<EvaluationSuggestionProviderResult> => {
    const prompt = evaluationPrompt(input);
    const output = await invoke(prompt);
    return parseEvaluationOutput(output, input, model, promptVersion, now);
  };

  const remixGenerate = async (input: RemixProviderInput): Promise<RemixProviderOutput> => {
    assertRemixInput(input);
    const prompt = remixPrompt(input);
    const output = await invoke(prompt);
    return parseRemixOutput(output, input, model, promptVersion, now);
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
): Promise<unknown> {
  if (ai === null || ai === undefined || typeof ai.run !== "function" || model === null) {
    throw new CloudflareAiProviderError("AI_UNAVAILABLE", "Cloudflare Workers AI is unavailable.");
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutFailure = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new CloudflareAiProviderError("AI_RETRYABLE", "Cloudflare Workers AI request timed out.", {
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
        response_format: JSON_RESPONSE_FORMAT,
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
    "Cloudflare Workers AI returned invalid advisory output.",
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
    ? "Cloudflare Workers AI request failed and may be retried."
    : "Cloudflare Workers AI is unavailable.";
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
      criteria: input.round.rubric.criteria.map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        description: criterion.description,
        minimum: criterion.minimum,
        maximum: criterion.maximum,
        weight: criterion.weight,
        required: criterion.required,
      })),
    },
    submission: {
      id: input.submission.id,
      title: input.submission.title,
      abstract: input.submission.abstract,
      answers: input.submission.answers,
      identityRedacted: input.submission.identityRedacted,
    },
  };
  return promptText(
    "evaluation",
    context,
    payload,
    "Return only {candidates:[{criterionId,value,evidence}]} JSON. criterionId must be one supplied rubric criterion ID. Each evidence value must be exactly title, abstract, or answers.<visible-answer-id>.",
  );
}

function parseEvaluationOutput(
  raw: unknown,
  input: EvaluationSuggestionProviderInput,
  model: string | null,
  promptVersion: string | null,
  now: () => Date,
): EvaluationSuggestionProviderResult {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["candidates"])) throw invalidOutput();
  const criteria = new Map(
    input.round.rubric.criteria.map((criterion) => [criterion.id, criterion]),
  );
  const values: Array<{ value: unknown; criterionIdHint?: string }> = [];
  if (Array.isArray(raw.candidates)) {
    values.push(...raw.candidates.map((value) => ({ value })));
  } else if (isRecord(raw.candidates)) {
    for (const [criterionIdHint, candidates] of Object.entries(raw.candidates)) {
      if (!criteria.has(criterionIdHint) || !Array.isArray(candidates)) throw invalidOutput();
      values.push(...candidates.map((value) => ({ value, criterionIdHint })));
    }
  } else {
    throw invalidOutput();
  }
  if (values.length === 0) throw invalidOutput();
  const allowedEvidence = new Set([
    "title",
    "abstract",
    ...Object.keys(input.submission.answers).map((id) => `answers.${id}`),
  ]);
  const candidates: EvaluationSuggestionProviderCandidate[] = values.map(
    ({ value, criterionIdHint }) => {
      if (!isRecord(value) || !hasOnlyKeys(value, ["id", "criterionId", "value", "evidence"]))
        throw invalidOutput();
      const normalizedCriterionId = boundedString(value.criterionId ?? criterionIdHint, 200);
      if (normalizedCriterionId === null) throw invalidOutput();
      if (
        criterionIdHint !== undefined &&
        value.criterionId !== undefined &&
        normalizedCriterionId !== criterionIdHint
      ) {
        throw invalidOutput();
      }
      const criterion = criteria.get(normalizedCriterionId);
      if (criterion === undefined) throw invalidOutput();
      if (
        typeof value.value !== "number" ||
        !Number.isFinite(value.value) ||
        value.value < criterion.minimum ||
        value.value > criterion.maximum
      )
        throw invalidOutput();
      if (
        !Array.isArray(value.evidence) ||
        value.evidence.length === 0 ||
        value.evidence.length > 20
      )
        throw invalidOutput();
      const evidence = value.evidence.map((reference) => boundedString(reference, 300));
      if (evidence.some((reference) => reference === null || !allowedEvidence.has(reference)))
        throw invalidOutput();
      const normalizedEvidence = evidence as string[];
      let candidateId: string | undefined;
      if (value.id !== undefined) {
        const normalizedCandidateId = boundedString(value.id, 200);
        if (normalizedCandidateId === null) throw invalidOutput();
        candidateId = normalizedCandidateId;
      }
      return {
        ...(candidateId === undefined ? {} : { id: candidateId }),
        criterionId: normalizedCriterionId,
        value: value.value,
        evidence: normalizedEvidence,
      };
    },
  );
  const sourceReferences = [...new Set(candidates.flatMap((candidate) => candidate.evidence))];
  return {
    candidates,
    provenance: {
      provider: "cloudflare-workers-ai",
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
      provider: "cloudflare-workers-ai",
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
