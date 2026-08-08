import type { AgendaMutationLock, AgendaRepository, AgendaState } from "./types";

export class AgendaRepositoryConflictError extends Error {
  constructor(readonly eventId: string) {
    super(`Agenda state changed concurrently for event ${eventId}`);
    this.name = "AgendaRepositoryConflictError";
  }
}

export class InMemoryAgendaRepository implements AgendaRepository {
  readonly #states = new Map<string, AgendaState>();

  async load(eventId: string): Promise<AgendaState | null> {
    const state = this.#states.get(eventId);
    return state === undefined ? null : structuredClone(state);
  }

  async compareAndSwap(
    eventId: string,
    expectedStateVersion: number | null,
    nextState: AgendaState,
  ): Promise<void> {
    const current = this.#states.get(eventId);
    const currentVersion = current?.stateVersion ?? null;
    if (currentVersion !== expectedStateVersion) {
      throw new AgendaRepositoryConflictError(eventId);
    }
    if (nextState.eventId !== eventId) {
      throw new Error(`Cannot save agenda ${nextState.eventId} under event ${eventId}`);
    }
    this.#states.set(eventId, structuredClone(nextState));
  }
}

export class InMemoryAgendaMutationLock implements AgendaMutationLock {
  readonly #tails = new Map<string, Promise<void>>();

  async runExclusive<T>(eventId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(eventId) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#tails.set(eventId, current);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#tails.get(eventId) === current) {
        this.#tails.delete(eventId);
      }
    }
  }
}

/**
 * Runtime adapters execute this contract inside the event's Durable Object. Keeping
 * the engine callback inside the coordinator avoids unsafe distributed lock leases.
 */
export interface DurableObjectAgendaCoordinator extends AgendaMutationLock {}
