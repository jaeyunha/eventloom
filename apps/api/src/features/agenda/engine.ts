import { detectAgendaConflicts } from "./conflicts";
import { AgendaRepositoryConflictError } from "./infrastructure";
import { canonicalizeTimeZone, resolveLocalDateTime } from "./timezone";
import type {
  AgendaAuditEntry,
  AgendaCatalog,
  AgendaClock,
  AgendaCustomRule,
  AgendaDraft,
  AgendaEntry,
  AgendaEntryInput,
  AgendaIdGenerator,
  AgendaMutationLock,
  AgendaOutboxEvent,
  AgendaOutboxEventType,
  AgendaPreview,
  AgendaRepository,
  AgendaRoom,
  AgendaSession,
  AgendaState,
  AgendaTrack,
  AgendaValidationReport,
  AgendaWarningOverride,
  PublishedAgendaRevision,
} from "./types";

export type AgendaErrorCode =
  | "AGENDA_ALREADY_EXISTS"
  | "AGENDA_NOT_FOUND"
  | "CONCURRENT_MODIFICATION"
  | "INVALID_AGENDA"
  | "PUBLICATION_BLOCKED"
  | "REVISION_NOT_FOUND"
  | "WARNING_NOT_FOUND";

export class AgendaError extends Error {
  constructor(
    readonly code: AgendaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgendaError";
  }
}

export class AgendaValidationError extends AgendaError {
  constructor(
    message: string,
    readonly report: AgendaValidationReport,
  ) {
    super("PUBLICATION_BLOCKED", message);
    this.name = "AgendaValidationError";
  }
}

export interface CreateAgendaInput extends AgendaCatalog {
  eventId: string;
  timeZone: string;
  minimumTravelMinutes: number;
  actorId: string;
}

export interface UpdateAgendaDraftInput {
  eventId: string;
  expectedVersion: number;
  entries: readonly AgendaEntryInput[];
  actorId: string;
}

export interface UpdateAgendaCatalogInput extends AgendaCatalog {
  eventId: string;
  expectedVersion: number;
  minimumTravelMinutes: number;
  actorId: string;
}

export interface OverrideAgendaWarningInput {
  eventId: string;
  expectedVersion: number;
  warningId: string;
  reason: string;
  actorId: string;
}

export interface PublishAgendaInput {
  eventId: string;
  expectedVersion: number;
  actorId: string;
}

export interface RollbackAgendaInput {
  eventId: string;
  expectedVersion: number;
  revisionId: string;
  actorId: string;
}

export interface AgendaEngineOptions {
  customRules?: readonly AgendaCustomRule[];
  clock?: AgendaClock;
  idGenerator?: AgendaIdGenerator;
}

const outboxTypes: readonly AgendaOutboxEventType[] = [
  "public-agenda.updated",
  "calendar.agenda-updated",
  "embed-cache.invalidate",
  "accelevents.agenda-ready",
];

export class AgendaEngine {
  readonly #customRules: readonly AgendaCustomRule[];
  readonly #clock: AgendaClock;
  readonly #idGenerator: AgendaIdGenerator;

  constructor(
    readonly repository: AgendaRepository,
    readonly mutationLock: AgendaMutationLock,
    options: AgendaEngineOptions = {},
  ) {
    this.#customRules = options.customRules ?? [];
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#idGenerator =
      options.idGenerator ??
      ({ nextId: (prefix) => `${prefix}_${crypto.randomUUID()}` } satisfies AgendaIdGenerator);
  }

  async createAgenda(input: CreateAgendaInput): Promise<AgendaDraft> {
    return this.mutationLock.runExclusive(input.eventId, async () => {
      requireNonEmpty(input.eventId, "eventId");
      requireNonEmpty(input.actorId, "actorId");
      validateMinimumTravelMinutes(input.minimumTravelMinutes);
      const catalog = normalizeCatalog(input);
      const timeZone = canonicalizeTimeZone(input.timeZone);
      const existing = await this.repository.load(input.eventId);
      if (existing !== null) {
        throw new AgendaError(
          "AGENDA_ALREADY_EXISTS",
          `Agenda already exists for event ${input.eventId}`,
        );
      }

      const now = this.now();
      const draft: AgendaDraft = {
        eventId: input.eventId,
        version: 1,
        timeZone,
        entries: [],
        warningOverrides: [],
        updatedAt: now,
        updatedBy: input.actorId,
      };
      const state: AgendaState = {
        eventId: input.eventId,
        stateVersion: 1,
        timeZone,
        minimumTravelMinutes: input.minimumTravelMinutes,
        ...catalog,
        draft,
        revisions: [],
        currentPublishedRevisionId: null,
        outbox: [],
        audit: [this.audit(input.eventId, input.actorId, "agenda.created", now, {})],
      };
      await this.repository.compareAndSwap(input.eventId, null, state);
      return structuredClone(draft);
    });
  }

  async getDraft(eventId: string): Promise<AgendaDraft> {
    return (await this.requireState(eventId)).draft;
  }

  async getPublishedAgenda(eventId: string): Promise<PublishedAgendaRevision | null> {
    const state = await this.requireState(eventId);
    if (state.currentPublishedRevisionId === null) {
      return null;
    }
    return (
      state.revisions.find((revision) => revision.id === state.currentPublishedRevisionId) ?? null
    );
  }

  async getOutbox(eventId: string): Promise<readonly AgendaOutboxEvent[]> {
    return (await this.requireState(eventId)).outbox;
  }

  async getAudit(eventId: string): Promise<readonly AgendaAuditEntry[]> {
    return (await this.requireState(eventId)).audit;
  }

  async validateEntries(
    eventId: string,
    entries: readonly AgendaEntryInput[],
  ): Promise<AgendaValidationReport> {
    const state = await this.requireState(eventId);
    const materialized = materializeEntries(entries, state);
    return this.validationReport(state, materialized);
  }

  async preview(eventId: string): Promise<AgendaPreview> {
    const state = await this.requireState(eventId);
    return this.previewState(state);
  }

  async updateDraft(input: UpdateAgendaDraftInput): Promise<AgendaDraft> {
    return this.mutate(input.eventId, async (state) => {
      assertDraftVersion(state, input.expectedVersion);
      requireNonEmpty(input.actorId, "actorId");
      const entries = materializeEntries(input.entries, state);
      const report = this.validationReport(state, entries);
      if (report.conflicts.length > 0) {
        throw new AgendaValidationError("Hard scheduling conflicts must be resolved", report);
      }

      const activeWarningIds = new Set(report.warnings.map((warning) => warning.id));
      const now = this.now();
      const draft: AgendaDraft = {
        ...state.draft,
        version: state.draft.version + 1,
        entries,
        warningOverrides: state.draft.warningOverrides.filter((override) =>
          activeWarningIds.has(override.warningId),
        ),
        updatedAt: now,
        updatedBy: input.actorId,
      };
      return {
        state: {
          ...state,
          stateVersion: state.stateVersion + 1,
          draft,
          audit: [
            ...state.audit,
            this.audit(state.eventId, input.actorId, "draft.updated", now, {
              draftVersion: draft.version,
            }),
          ],
        },
        result: draft,
      };
    });
  }

  async updateCatalog(input: UpdateAgendaCatalogInput): Promise<AgendaDraft> {
    return this.mutate(input.eventId, async (state) => {
      assertDraftVersion(state, input.expectedVersion);
      requireNonEmpty(input.actorId, "actorId");
      validateMinimumTravelMinutes(input.minimumTravelMinutes);
      const catalog = normalizeCatalog(input);
      validateStoredEntries(state.draft.entries, catalog);
      const candidate = {
        ...state,
        minimumTravelMinutes: input.minimumTravelMinutes,
        ...catalog,
      };
      const report = this.validationReport(candidate, state.draft.entries);
      if (report.conflicts.length > 0) {
        throw new AgendaValidationError("Catalog changes introduce hard conflicts", report);
      }

      const activeWarningIds = new Set(report.warnings.map((warning) => warning.id));
      const now = this.now();
      const draft: AgendaDraft = {
        ...state.draft,
        version: state.draft.version + 1,
        warningOverrides: state.draft.warningOverrides.filter((override) =>
          activeWarningIds.has(override.warningId),
        ),
        updatedAt: now,
        updatedBy: input.actorId,
      };
      return {
        state: {
          ...candidate,
          stateVersion: state.stateVersion + 1,
          draft,
          audit: [
            ...state.audit,
            this.audit(state.eventId, input.actorId, "catalog.updated", now, {
              draftVersion: draft.version,
            }),
          ],
        },
        result: draft,
      };
    });
  }

  async overrideWarning(input: OverrideAgendaWarningInput): Promise<AgendaDraft> {
    return this.mutate(input.eventId, async (state) => {
      assertDraftVersion(state, input.expectedVersion);
      requireNonEmpty(input.actorId, "actorId");
      const reason = input.reason.trim();
      if (reason.length < 3) {
        throw new AgendaError("INVALID_AGENDA", "A warning override requires a reason");
      }

      const report = this.validationReport(state, state.draft.entries);
      if (!report.warnings.some((warning) => warning.id === input.warningId)) {
        throw new AgendaError("WARNING_NOT_FOUND", `Agenda warning not found: ${input.warningId}`);
      }

      const now = this.now();
      const override: AgendaWarningOverride = {
        warningId: input.warningId,
        reason,
        actorId: input.actorId,
        createdAt: now,
      };
      const draft: AgendaDraft = {
        ...state.draft,
        version: state.draft.version + 1,
        warningOverrides: [
          ...state.draft.warningOverrides.filter(
            (existing) => existing.warningId !== input.warningId,
          ),
          override,
        ],
        updatedAt: now,
        updatedBy: input.actorId,
      };
      return {
        state: {
          ...state,
          stateVersion: state.stateVersion + 1,
          draft,
          audit: [
            ...state.audit,
            this.audit(state.eventId, input.actorId, "warning.overridden", now, {
              draftVersion: draft.version,
              warningId: input.warningId,
            }),
          ],
        },
        result: draft,
      };
    });
  }

  async publish(input: PublishAgendaInput): Promise<PublishedAgendaRevision> {
    return this.mutate(input.eventId, async (state) => {
      assertDraftVersion(state, input.expectedVersion);
      requireNonEmpty(input.actorId, "actorId");
      const current = currentRevision(state);
      if (current?.sourceDraftVersion === state.draft.version) {
        return { state, result: current, changed: false };
      }

      const preview = this.previewState(state);
      if (preview.validation.conflicts.length > 0 || preview.unoverriddenWarnings.length > 0) {
        throw new AgendaValidationError(
          "Publication requires all conflicts to be resolved and warnings to be overridden",
          preview.validation,
        );
      }

      const now = this.now();
      const revision = this.revision(state, input.actorId, now, null, state.draft);
      const outbox = this.outbox(state.eventId, revision.id, now);
      return {
        state: {
          ...state,
          stateVersion: state.stateVersion + 1,
          revisions: [...state.revisions, revision],
          currentPublishedRevisionId: revision.id,
          outbox: [...state.outbox, ...outbox],
          audit: [
            ...state.audit,
            this.audit(state.eventId, input.actorId, "agenda.published", now, {
              draftVersion: state.draft.version,
              revisionId: revision.id,
            }),
          ],
        },
        result: revision,
      };
    });
  }

  async rollback(input: RollbackAgendaInput): Promise<PublishedAgendaRevision> {
    return this.mutate(input.eventId, async (state) => {
      assertDraftVersion(state, input.expectedVersion);
      requireNonEmpty(input.actorId, "actorId");
      const target = state.revisions.find((revision) => revision.id === input.revisionId);
      if (target === undefined) {
        throw new AgendaError(
          "REVISION_NOT_FOUND",
          `Agenda revision not found: ${input.revisionId}`,
        );
      }
      if (state.currentPublishedRevisionId === target.id) {
        return { state, result: target, changed: false };
      }

      validateStoredEntries(target.entries, state);
      const report = this.validationReport(state, target.entries);
      if (report.conflicts.length > 0) {
        throw new AgendaValidationError("The requested rollback now has hard conflicts", report);
      }
      const warningIds = new Set(report.warnings.map((warning) => warning.id));
      const targetOverrides = target.warningOverrides.filter((override) =>
        warningIds.has(override.warningId),
      );
      const overriddenIds = new Set(targetOverrides.map((override) => override.warningId));
      if (report.warnings.some((warning) => !overriddenIds.has(warning.id))) {
        throw new AgendaValidationError(
          "The requested rollback has warnings that were not previously overridden",
          report,
        );
      }

      const now = this.now();
      const draft: AgendaDraft = {
        ...state.draft,
        version: state.draft.version + 1,
        entries: target.entries,
        warningOverrides: targetOverrides,
        updatedAt: now,
        updatedBy: input.actorId,
      };
      const revision = this.revision(state, input.actorId, now, target.id, draft);
      const outbox = this.outbox(state.eventId, revision.id, now);
      return {
        state: {
          ...state,
          stateVersion: state.stateVersion + 1,
          draft,
          revisions: [...state.revisions, revision],
          currentPublishedRevisionId: revision.id,
          outbox: [...state.outbox, ...outbox],
          audit: [
            ...state.audit,
            this.audit(state.eventId, input.actorId, "agenda.rolled-back", now, {
              revisionId: revision.id,
              rollbackOfRevisionId: target.id,
            }),
          ],
        },
        result: revision,
      };
    });
  }

  private async mutate<T>(
    eventId: string,
    operation: (
      state: AgendaState,
    ) => Promise<{ state: AgendaState; result: T; changed?: boolean }>,
  ): Promise<T> {
    return this.mutationLock.runExclusive(eventId, async () => {
      const current = await this.requireState(eventId);
      const change = await operation(current);
      if (change.changed === false) {
        return structuredClone(change.result);
      }
      try {
        await this.repository.compareAndSwap(eventId, current.stateVersion, change.state);
      } catch (error) {
        if (error instanceof AgendaRepositoryConflictError) {
          throw new AgendaError(
            "CONCURRENT_MODIFICATION",
            `Agenda changed while updating event ${eventId}`,
          );
        }
        throw error;
      }
      return structuredClone(change.result);
    });
  }

  private async requireState(eventId: string): Promise<AgendaState> {
    const state = await this.repository.load(eventId);
    if (state === null) {
      throw new AgendaError("AGENDA_NOT_FOUND", `Agenda not found for event ${eventId}`);
    }
    return state;
  }

  private validationReport(
    state: Pick<AgendaState, "minimumTravelMinutes" | "rooms" | "sessions" | "tracks">,
    entries: readonly AgendaEntry[],
  ): AgendaValidationReport {
    const base = {
      entries,
      minimumTravelMinutes: state.minimumTravelMinutes,
      rooms: state.rooms,
      sessions: state.sessions,
      tracks: state.tracks,
    };
    return this.#customRules.length === 0
      ? detectAgendaConflicts(base)
      : detectAgendaConflicts({ ...base, customRules: this.#customRules });
  }

  private previewState(state: AgendaState): AgendaPreview {
    const validation = this.validationReport(state, state.draft.entries);
    const overriddenWarningIds = new Set(
      state.draft.warningOverrides.map((override) => override.warningId),
    );
    const publishedEntries = currentRevision(state)?.entries ?? [];
    return {
      draftVersion: state.draft.version,
      validation,
      unoverriddenWarnings: validation.warnings.filter(
        (warning) => !overriddenWarningIds.has(warning.id),
      ),
      diff: diffEntries(publishedEntries, state.draft.entries),
    };
  }

  private revision(
    state: AgendaState,
    actorId: string,
    now: string,
    rollbackOfRevisionId: string | null,
    draft: AgendaDraft,
  ): PublishedAgendaRevision {
    return {
      id: this.#idGenerator.nextId("revision"),
      eventId: state.eventId,
      revisionNumber: state.revisions.length + 1,
      sourceDraftVersion: draft.version,
      timeZone: state.timeZone,
      entries: structuredClone(draft.entries),
      warningOverrides: structuredClone(draft.warningOverrides),
      publishedAt: now,
      publishedBy: actorId,
      rollbackOfRevisionId,
    };
  }

  private outbox(eventId: string, revisionId: string, now: string): AgendaOutboxEvent[] {
    return outboxTypes.map((type) => ({
      id: this.#idGenerator.nextId("outbox"),
      eventId,
      revisionId,
      type,
      idempotencyKey: `${eventId}:${revisionId}:${type}`,
      createdAt: now,
    }));
  }

  private audit(
    eventId: string,
    actorId: string,
    action: AgendaAuditEntry["action"],
    createdAt: string,
    details: Readonly<Record<string, string | number>>,
  ): AgendaAuditEntry {
    return {
      id: this.#idGenerator.nextId("audit"),
      eventId,
      actorId,
      action,
      createdAt,
      details,
    };
  }

  private now(): string {
    return this.#clock.now().toISOString();
  }
}

function normalizeCatalog(catalog: AgendaCatalog): AgendaCatalog {
  validateUniqueIds(catalog.sessions, "session");
  validateUniqueIds(catalog.rooms, "room");
  validateUniqueIds(catalog.tracks, "track");

  const sessions: AgendaSession[] = catalog.sessions.map((session) => {
    requireNonEmpty(session.title, `session ${session.id} title`);
    validateUniqueStrings(session.participantIds, `session ${session.id} participants`);
    validateUniqueStrings(session.resourceIds, `session ${session.id} resources`);
    if (!Number.isInteger(session.capacityRequired) || session.capacityRequired < 0) {
      throw new AgendaError(
        "INVALID_AGENDA",
        `Session ${session.id} capacityRequired must be a non-negative integer`,
      );
    }
    return {
      ...session,
      participantIds: [...session.participantIds],
      resourceIds: [...session.resourceIds],
    };
  });
  const rooms: AgendaRoom[] = catalog.rooms.map((room) => {
    requireNonEmpty(room.name, `room ${room.id} name`);
    if (!Number.isInteger(room.capacity) || room.capacity < 1) {
      throw new AgendaError(
        "INVALID_AGENDA",
        `Room ${room.id} capacity must be a positive integer`,
      );
    }
    return { ...room };
  });
  const tracks: AgendaTrack[] = catalog.tracks.map((track) => {
    requireNonEmpty(track.name, `track ${track.id} name`);
    return { ...track };
  });
  return { sessions, rooms, tracks };
}

function materializeEntries(
  inputs: readonly AgendaEntryInput[],
  state: Pick<AgendaState, "rooms" | "sessions" | "timeZone" | "tracks">,
): AgendaEntry[] {
  validateUniqueIds(inputs, "agenda entry");
  validateUniqueValues(
    inputs.map((entry) => entry.sessionId),
    "A session can only appear once in an agenda draft",
  );
  const sessions = new Set(state.sessions.map((session) => session.id));
  const rooms = new Set(state.rooms.map((room) => room.id));
  const tracks = new Set(state.tracks.map((track) => track.id));

  return inputs.map((input) => {
    requireNonEmpty(input.sessionId, `entry ${input.id} sessionId`);
    requireNonEmpty(input.roomId, `entry ${input.id} roomId`);
    if (!sessions.has(input.sessionId)) {
      throw new AgendaError("INVALID_AGENDA", `Unknown session: ${input.sessionId}`);
    }
    if (!rooms.has(input.roomId)) {
      throw new AgendaError("INVALID_AGENDA", `Unknown room: ${input.roomId}`);
    }
    validateUniqueStrings(input.trackIds, `entry ${input.id} tracks`);
    for (const trackId of input.trackIds) {
      if (!tracks.has(trackId)) {
        throw new AgendaError("INVALID_AGENDA", `Unknown track: ${trackId}`);
      }
    }

    const start = resolveLocalDateTime(
      input.startsAtLocal,
      state.timeZone,
      input.startDisambiguation,
    );
    const end = resolveLocalDateTime(input.endsAtLocal, state.timeZone, input.endDisambiguation);
    if (Date.parse(end.instant) <= Date.parse(start.instant)) {
      throw new AgendaError("INVALID_AGENDA", `Entry ${input.id} must end after it starts`);
    }
    return {
      id: input.id,
      sessionId: input.sessionId,
      roomId: input.roomId,
      trackIds: [...input.trackIds],
      startsAt: start.instant,
      endsAt: end.instant,
      startsAtLocal: start.localDateTime,
      endsAtLocal: end.localDateTime,
      timeZone: state.timeZone,
    };
  });
}

function validateStoredEntries(entries: readonly AgendaEntry[], catalog: AgendaCatalog): void {
  const sessions = new Set(catalog.sessions.map((session) => session.id));
  const rooms = new Set(catalog.rooms.map((room) => room.id));
  const tracks = new Set(catalog.tracks.map((track) => track.id));
  for (const entry of entries) {
    if (!sessions.has(entry.sessionId)) {
      throw new AgendaError("INVALID_AGENDA", `Unknown session: ${entry.sessionId}`);
    }
    if (!rooms.has(entry.roomId)) {
      throw new AgendaError("INVALID_AGENDA", `Unknown room: ${entry.roomId}`);
    }
    if (entry.trackIds.some((trackId) => !tracks.has(trackId))) {
      throw new AgendaError("INVALID_AGENDA", `Entry ${entry.id} references an unknown track`);
    }
  }
}

function validateUniqueIds(values: readonly { id: string }[], label: string): void {
  for (const value of values) {
    requireNonEmpty(value.id, `${label} id`);
  }
  validateUniqueValues(
    values.map((value) => value.id),
    `Duplicate ${label} id`,
  );
}

function validateUniqueStrings(values: readonly string[], label: string): void {
  for (const value of values) {
    requireNonEmpty(value, label);
  }
  validateUniqueValues(values, `Duplicate value in ${label}`);
}

function validateUniqueValues(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new AgendaError("INVALID_AGENDA", message);
  }
}

function validateMinimumTravelMinutes(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new AgendaError("INVALID_AGENDA", "minimumTravelMinutes must be a non-negative integer");
  }
}

function requireNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new AgendaError("INVALID_AGENDA", `${label} must not be empty`);
  }
}

function assertDraftVersion(state: AgendaState, expectedVersion: number): void {
  if (state.draft.version !== expectedVersion) {
    throw new AgendaError(
      "CONCURRENT_MODIFICATION",
      `Expected draft version ${expectedVersion}, current version is ${state.draft.version}`,
    );
  }
}

function currentRevision(state: AgendaState): PublishedAgendaRevision | null {
  if (state.currentPublishedRevisionId === null) {
    return null;
  }
  return (
    state.revisions.find((revision) => revision.id === state.currentPublishedRevisionId) ?? null
  );
}

function diffEntries(
  published: readonly AgendaEntry[],
  draft: readonly AgendaEntry[],
): AgendaPreview["diff"] {
  const publishedById = new Map(published.map((entry) => [entry.id, entry]));
  const draftById = new Map(draft.map((entry) => [entry.id, entry]));
  return {
    addedEntryIds: [...draftById.keys()].filter((id) => !publishedById.has(id)).sort(),
    removedEntryIds: [...publishedById.keys()].filter((id) => !draftById.has(id)).sort(),
    changedEntryIds: [...draftById.entries()]
      .filter(([id, entry]) => {
        const existing = publishedById.get(id);
        return existing !== undefined && !entriesEqual(existing, entry);
      })
      .map(([id]) => id)
      .sort(),
  };
}

function entriesEqual(left: AgendaEntry, right: AgendaEntry): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.roomId === right.roomId &&
    left.startsAt === right.startsAt &&
    left.endsAt === right.endsAt &&
    left.trackIds.join("\u0000") === right.trackIds.join("\u0000")
  );
}
