import type { AgendaCatalogReader } from "../sessions/types";
import {
  type AgendaEngine,
  AgendaError,
  type CreateAgendaInput,
  type UpdateAgendaCatalogInput,
} from "./engine";
import type {
  AgendaCatalog,
  AgendaDraft,
  AgendaEntry,
  AgendaRoom,
  AgendaSession,
  AgendaTrack,
} from "./types";

export type AgendaCatalogSyncValue<T> = T | PromiseLike<T>;

export interface AgendaCatalogSyncInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly actorId?: string;
  readonly timeZone?: string;
  readonly minimumTravelMinutes?: number;
}

export interface AgendaCatalogSynchronizerContract {
  ensureInitialized(input: AgendaCatalogSyncInput): Promise<AgendaDraft | undefined>;
  synchronize(input: AgendaCatalogSyncInput): Promise<AgendaDraft | undefined>;
}

export interface AgendaCatalogEngine {
  createAgenda(input: CreateAgendaInput): Promise<AgendaDraft>;
  getDraft(eventId: string): Promise<AgendaDraft>;
  updateCatalog(input: UpdateAgendaCatalogInput): Promise<AgendaDraft>;
}

export type AgendaEventTimeZone =
  | string
  | ((eventId: string) => AgendaCatalogSyncValue<string>)
  | ((tenantId: string, eventId: string) => AgendaCatalogSyncValue<string>);
export type AgendaActorId = string | ((input: AgendaCatalogSyncInput) => string);

export interface AgendaCatalogSynchronizerOptions {
  readonly engine?: AgendaCatalogEngine;
  readonly agendaEngine?: AgendaCatalogEngine;
  readonly catalogReader?: AgendaCatalogReader;
  readonly sessionService?: AgendaCatalogReader;
  readonly eventTimeZone?: AgendaEventTimeZone;
  readonly timeZone?: AgendaEventTimeZone;
  readonly timeZoneForEvent?: AgendaEventTimeZone;
  readonly getEventTimeZone?: AgendaEventTimeZone;
  readonly minimumTravelMinutes?: number;
  readonly actorId?: AgendaActorId;
  readonly maxRetries?: number;
}

export type AgendaCatalogRemovalResource = "room" | "track";

export class AgendaCatalogSynchronizationError extends AgendaError {
  constructor(
    readonly resource: AgendaCatalogRemovalResource,
    readonly resourceId: string,
    readonly entryId: string,
  ) {
    super(
      "INVALID_AGENDA",
      `Cannot remove ${resource} ${resourceId} from the agenda catalog because scheduled entry ${entryId} uses it.`,
    );
    this.name = "AgendaCatalogSynchronizationError";
  }
}

const DEFAULT_ACTOR_ID = "agenda-catalog-sync";
const DEFAULT_MINIMUM_TRAVEL_MINUTES = 0;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Projects the first-party session catalog into AgendaEngine state. The session domain remains
 * the authority for sessions, rooms, tracks, and eligibility; this class only creates or updates
 * the scheduling catalog and never calls publication methods.
 */
export class AgendaCatalogSynchronizer implements AgendaCatalogSynchronizerContract {
  readonly #engine: AgendaCatalogEngine;
  readonly #catalogReader: AgendaCatalogReader;
  readonly #eventTimeZone: AgendaEventTimeZone | undefined;
  readonly #minimumTravelMinutes: number;
  readonly #actorId: AgendaActorId | undefined;
  readonly #maxRetries: number;

  constructor(options: AgendaCatalogSynchronizerOptions);
  constructor(
    engine: AgendaCatalogEngine | AgendaEngine,
    catalogReader: AgendaCatalogReader,
    options?: Omit<
      AgendaCatalogSynchronizerOptions,
      "engine" | "agendaEngine" | "catalogReader" | "sessionService"
    >,
  );
  constructor(
    optionsOrEngine: AgendaCatalogSynchronizerOptions | AgendaCatalogEngine | AgendaEngine,
    positionalCatalogReader?: AgendaCatalogReader,
    positionalOptions: Omit<
      AgendaCatalogSynchronizerOptions,
      "engine" | "agendaEngine" | "catalogReader" | "sessionService"
    > = {},
  ) {
    const options: AgendaCatalogSynchronizerOptions =
      "createAgenda" in optionsOrEngine
        ? {
            ...positionalOptions,
            engine: optionsOrEngine,
            ...(positionalCatalogReader === undefined
              ? {}
              : { catalogReader: positionalCatalogReader }),
          }
        : optionsOrEngine;
    const engine = options.engine ?? options.agendaEngine;
    const catalogReader = options.catalogReader ?? options.sessionService;
    if (engine === undefined) {
      throw new Error("AgendaCatalogSynchronizer requires an AgendaEngine.");
    }
    if (catalogReader === undefined) {
      throw new Error("AgendaCatalogSynchronizer requires a SessionService catalog reader.");
    }
    if (
      options.minimumTravelMinutes !== undefined &&
      (!Number.isSafeInteger(options.minimumTravelMinutes) || options.minimumTravelMinutes < 0)
    ) {
      throw new Error("minimumTravelMinutes must be a non-negative integer.");
    }
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
      throw new Error("maxRetries must be a non-negative integer.");
    }
    this.#engine = engine;
    this.#catalogReader = catalogReader;
    this.#eventTimeZone =
      options.eventTimeZone ??
      options.timeZone ??
      options.timeZoneForEvent ??
      options.getEventTimeZone;
    this.#minimumTravelMinutes = options.minimumTravelMinutes ?? DEFAULT_MINIMUM_TRAVEL_MINUTES;
    this.#actorId = options.actorId;
    this.#maxRetries = maxRetries;
  }

  async ensureInitialized(input: AgendaCatalogSyncInput): Promise<AgendaDraft>;
  async ensureInitialized(
    tenantId: string,
    eventId: string,
    actorId?: string,
    timeZone?: string,
  ): Promise<AgendaDraft>;
  async ensureInitialized(
    inputOrTenantId: AgendaCatalogSyncInput | string,
    positionalEventId?: string,
    positionalActorId?: string,
    positionalTimeZone?: string,
  ): Promise<AgendaDraft> {
    const input = normalizeInput(
      inputOrTenantId,
      positionalEventId,
      positionalActorId,
      positionalTimeZone,
    );
    return (await this.initialize(input)).draft;
  }

  async synchronize(input: AgendaCatalogSyncInput): Promise<AgendaDraft>;
  async synchronize(
    tenantId: string,
    eventId: string,
    actorId?: string,
    timeZone?: string,
  ): Promise<AgendaDraft>;
  async synchronize(
    inputOrTenantId: AgendaCatalogSyncInput | string,
    positionalEventId?: string,
    positionalActorId?: string,
    positionalTimeZone?: string,
  ): Promise<AgendaDraft> {
    const input = normalizeInput(
      inputOrTenantId,
      positionalEventId,
      positionalActorId,
      positionalTimeZone,
    );
    const initialized = await this.initialize(input);
    if (initialized.created) return initialized.draft;
    let draft = initialized.draft;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      const catalog = await this.readCatalog(input);
      assertScheduledReferencesRemain(draft.entries, catalog);
      try {
        return await this.#engine.updateCatalog({
          eventId: input.eventId,
          expectedVersion: draft.version,
          minimumTravelMinutes: this.resolveMinimumTravelMinutes(input),
          actorId: this.resolveActorId(input),
          ...catalog,
        });
      } catch (error) {
        if (!isAgendaCode(error, "CONCURRENT_MODIFICATION") || attempt >= this.#maxRetries) {
          throw error;
        }
        draft = await this.#engine.getDraft(input.eventId);
      }
    }
    // The loop always returns or throws; retaining this guard keeps the contract total if it is
    // changed later and avoids a silent undefined result.
    throw new AgendaError(
      "CONCURRENT_MODIFICATION",
      `Agenda changed while synchronizing event ${input.eventId}`,
    );
  }
  private async initialize(
    input: AgendaCatalogSyncInput,
  ): Promise<{ draft: AgendaDraft; created: boolean }> {
    try {
      return { draft: await this.#engine.getDraft(input.eventId), created: false };
    } catch (error) {
      if (!isAgendaCode(error, "AGENDA_NOT_FOUND")) throw error;
    }

    const catalog = await this.readCatalog(input);
    const timeZone = await this.resolveTimeZone(input);
    const createInput: CreateAgendaInput = {
      eventId: input.eventId,
      timeZone,
      minimumTravelMinutes: this.resolveMinimumTravelMinutes(input),
      actorId: this.resolveActorId(input),
      ...catalog,
    };
    try {
      return { draft: await this.#engine.createAgenda(createInput), created: true };
    } catch (error) {
      // Another initializer may have won the race between getDraft and createAgenda.
      if (!isAgendaCode(error, "AGENDA_ALREADY_EXISTS")) throw error;
      return { draft: await this.#engine.getDraft(input.eventId), created: false };
    }
  }

  private async readCatalog(input: AgendaCatalogSyncInput): Promise<AgendaCatalog> {
    return structuredClone(
      await this.#catalogReader.getAgendaCatalog(input.tenantId, input.eventId),
    );
  }

  private async resolveTimeZone(input: AgendaCatalogSyncInput): Promise<string> {
    if (input.timeZone !== undefined) return input.timeZone;
    const source = this.#eventTimeZone;
    if (typeof source === "string") return source;
    if (typeof source === "function") {
      const resolver = source as (...args: string[]) => AgendaCatalogSyncValue<string>;
      return await (source.length < 2
        ? resolver(input.eventId)
        : resolver(input.tenantId, input.eventId));
    }
    throw new Error(
      `An event time zone is required to initialize the agenda for event ${input.eventId}.`,
    );
  }

  private resolveMinimumTravelMinutes(input: AgendaCatalogSyncInput): number {
    return input.minimumTravelMinutes ?? this.#minimumTravelMinutes;
  }

  private resolveActorId(input: AgendaCatalogSyncInput): string {
    const actor = input.actorId ?? this.#actorId;
    if (typeof actor === "function") return actor(input);
    return actor ?? DEFAULT_ACTOR_ID;
  }
}

function normalizeInput(
  inputOrTenantId: AgendaCatalogSyncInput | string,
  positionalEventId?: string,
  positionalActorId?: string,
  positionalTimeZone?: string,
): AgendaCatalogSyncInput {
  if (typeof inputOrTenantId !== "string") return inputOrTenantId;
  if (positionalEventId === undefined) {
    throw new Error("eventId is required to synchronize an agenda catalog.");
  }
  return {
    tenantId: inputOrTenantId,
    eventId: positionalEventId,
    ...(positionalActorId === undefined ? {} : { actorId: positionalActorId }),
    ...(positionalTimeZone === undefined ? {} : { timeZone: positionalTimeZone }),
  };
}

function isAgendaCode(error: unknown, code: string): boolean {
  return (
    (error instanceof AgendaError && error.code === code) ||
    (typeof error === "object" && error !== null && "code" in error && error.code === code)
  );
}

function assertScheduledReferencesRemain(
  entries: readonly AgendaEntry[],
  catalog: AgendaCatalog,
): void {
  const roomIds = new Set(catalog.rooms.map((room) => room.id));
  const trackIds = new Set(catalog.tracks.map((track) => track.id));
  for (const entry of entries) {
    if (!roomIds.has(entry.roomId)) {
      throw new AgendaCatalogSynchronizationError("room", entry.roomId, entry.id);
    }
    for (const trackId of entry.trackIds) {
      if (!trackIds.has(trackId)) {
        throw new AgendaCatalogSynchronizationError("track", trackId, entry.id);
      }
    }
  }
}

export type { AgendaCatalog, AgendaDraft, AgendaRoom, AgendaSession, AgendaTrack };
