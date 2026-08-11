export interface ScopedReadFlightLease<T> {
  readonly promise: Promise<T>;
  readonly signal: AbortSignal;
  release(): void;
}

export interface ScopedReadFlightCoordinator<Key, Value> {
  acquire(key: Key, read: (signal: AbortSignal) => Promise<Value>): ScopedReadFlightLease<Value>;
}

type Flight<Value> = {
  readonly controller: AbortController;
  readonly promise: Promise<Value>;
  observers: number;
};

export function createScopedReadFlightCoordinator<Key, Value>(): ScopedReadFlightCoordinator<
  Key,
  Value
> {
  const flights = new Map<Key, Flight<Value>>();

  return {
    acquire(key, read) {
      const existing = flights.get(key);
      const flight = existing ?? createFlight(key, read);
      flight.observers += 1;

      let released = false;
      return {
        promise: flight.promise,
        signal: flight.controller.signal,
        release() {
          if (released) return;
          released = true;
          flight.observers -= 1;
          if (flight.observers !== 0) return;

          queueMicrotask(() => {
            if (flights.get(key) !== flight || flight.observers !== 0) return;
            flight.controller.abort();
            flights.delete(key);
          });
        },
      };
    },
  };

  function createFlight(key: Key, read: (signal: AbortSignal) => Promise<Value>): Flight<Value> {
    const controller = new AbortController();
    let resolvePromise!: (value: Value | PromiseLike<Value>) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<Value>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const flight: Flight<Value> = {
      controller,
      promise,
      observers: 0,
    };
    flights.set(key, flight);

    try {
      void Promise.resolve(read(controller.signal)).then(resolvePromise, rejectPromise);
    } catch (error) {
      rejectPromise(error);
    }

    void promise.then(
      () => {
        settleFlight(key, flight);
      },
      () => {
        settleFlight(key, flight);
      },
    );
    return flight;
  }

  function settleFlight(key: Key, flight: Flight<Value>): void {
    if (flights.get(key) === flight) flights.delete(key);
  }
}
