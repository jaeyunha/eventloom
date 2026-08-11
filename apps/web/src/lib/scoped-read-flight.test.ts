import { describe, expect, it } from "vitest";
import { createScopedReadFlightCoordinator } from "./scoped-read-flight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("scoped read-flight coordinator", () => {
  it("starts one same-key read and shares its resolution", async () => {
    const coordinator = createScopedReadFlightCoordinator<string, string>();
    const result = deferred<string>();
    let starts = 0;

    const first = coordinator.acquire("scope", () => {
      starts += 1;
      return result.promise;
    });
    const second = coordinator.acquire("scope", () => {
      starts += 1;
      return result.promise;
    });

    expect(starts).toBe(1);
    expect(second.promise).toBe(first.promise);
    result.resolve("loaded");
    await expect(first.promise).resolves.toBe("loaded");
    await expect(second.promise).resolves.toBe("loaded");

    first.release();
    second.release();
  });

  it("defers abort across StrictMode-style release and immediate reacquire", async () => {
    const coordinator = createScopedReadFlightCoordinator<string, string>();
    const result = deferred<string>();
    let starts = 0;
    let signal: AbortSignal | undefined;

    const first = coordinator.acquire("scope", (requestSignal) => {
      starts += 1;
      signal = requestSignal;
      return result.promise;
    });
    first.release();
    const second = coordinator.acquire("scope", () => {
      starts += 1;
      return result.promise;
    });

    await Promise.resolve();
    expect(starts).toBe(1);
    expect(signal?.aborted).toBe(false);

    result.resolve("loaded");
    await expect(second.promise).resolves.toBe("loaded");
    second.release();
  });

  it("aborts a pending read after the final release", async () => {
    const coordinator = createScopedReadFlightCoordinator<string, string>();
    let signal: AbortSignal | undefined;
    const lease = coordinator.acquire("scope", (requestSignal) => {
      signal = requestSignal;
      return new Promise<string>(() => undefined);
    });

    lease.release();
    expect(signal?.aborted).toBe(false);
    await Promise.resolve();
    expect(signal?.aborted).toBe(true);
  });

  it("keeps different keys independent", async () => {
    const coordinator = createScopedReadFlightCoordinator<string, string>();
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;

    const first = coordinator.acquire("first", (requestSignal) => {
      firstSignal = requestSignal;
      return new Promise<string>(() => undefined);
    });
    const second = coordinator.acquire("second", (requestSignal) => {
      secondSignal = requestSignal;
      return new Promise<string>(() => undefined);
    });

    first.release();
    await Promise.resolve();
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);

    second.release();
  });
});
