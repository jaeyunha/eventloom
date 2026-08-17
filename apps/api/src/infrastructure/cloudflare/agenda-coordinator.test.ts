import { describe, expect, it, vi } from "vitest";
import { CloudflareAgendaMutationLock } from "../../runtime/airtable";
import { AgendaCoordinator } from "./agenda-coordinator";

class InMemoryDurableObjectStorage {
  readonly values = new Map<string, unknown>();
  #tail = Promise.resolve();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async transaction<T>(
    operation: (transaction: DurableObjectTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.#tail;
    let release: () => void = () => undefined;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation(this as unknown as DurableObjectTransaction);
    } finally {
      release();
    }
  }
}

function coordinator(): AgendaCoordinator {
  const storage = new InMemoryDurableObjectStorage();
  return new AgendaCoordinator({ storage } as unknown as DurableObjectState);
}

function mutationRequest(operationId: string, expectedRevision: number): Request {
  return new Request("https://agenda/mutations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationId, expectedRevision }),
  });
}

function releaseRequest(operationId: string): Request {
  return new Request("https://agenda/mutations", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationId }),
  });
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("AgendaCoordinator", () => {
  it("holds a distributed mutation lease until the admitted operation releases it", async () => {
    const durableObject = coordinator();
    const first = await durableObject.fetch(mutationRequest("operation-a", 0));
    expect(first.status).toBe(201);

    const second = durableObject.fetch(mutationRequest("operation-b", 1));
    const released = await durableObject.fetch(releaseRequest("operation-a"));
    expect(released.status).toBe(204);

    const admitted = await second;
    expect(admitted.status).toBe(201);
    expect(await admitted.json()).toMatchObject({
      operationId: "operation-b",
      previousRevision: 1,
      revision: 2,
    });
  });

  it("serializes two Cloudflare lock instances through the shared coordinator lease", async () => {
    const durableObject = coordinator();
    const secondAdmissionRequested = deferred();
    let admissionRequests = 0;
    const stub = {
      fetch(request: Request) {
        if (request.method === "POST" && new URL(request.url).pathname === "/mutations") {
          admissionRequests += 1;
          if (admissionRequests === 2) secondAdmissionRequested.resolve();
        }
        return durableObject.fetch(request);
      },
    };
    const namespace = {
      idFromName: () => ({}) as DurableObjectId,
      get: () => stub,
    } as unknown as DurableObjectNamespace;
    const firstLock = new CloudflareAgendaMutationLock(namespace);
    const secondLock = new CloudflareAgendaMutationLock(namespace);
    const firstEntered = deferred();
    const allowFirstToFinish = deferred();
    const order: string[] = [];
    const first = firstLock.runExclusive("event-1", async () => {
      order.push("first-start");
      firstEntered.resolve();
      await allowFirstToFinish.promise;
      order.push("first-end");
    });
    await firstEntered.promise;
    const second = secondLock.runExclusive("event-1", async () => {
      order.push("second-start");
    });
    await secondAdmissionRequested.promise;
    expect(order).toEqual(["first-start"]);
    allowFirstToFinish.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("renews a long-running callback before the original lease expires", async () => {
    vi.useFakeTimers();
    try {
      const durableObject = coordinator();
      const secondAdmissionRequested = deferred();
      let admissionRequests = 0;
      const stub = {
        fetch(request: Request) {
          if (request.method === "POST" && new URL(request.url).pathname === "/mutations") {
            admissionRequests += 1;
            if (admissionRequests === 2) secondAdmissionRequested.resolve();
          }
          return durableObject.fetch(request);
        },
      };
      const namespace = {
        idFromName: () => ({}) as DurableObjectId,
        get: () => stub,
      } as unknown as DurableObjectNamespace;
      const firstLock = new CloudflareAgendaMutationLock(namespace);
      const secondLock = new CloudflareAgendaMutationLock(namespace);
      const firstEntered = deferred();
      const allowFirstToFinish = deferred();
      const order: string[] = [];
      const first = firstLock.runExclusive("event-1", async () => {
        order.push("first-start");
        firstEntered.resolve();
        await allowFirstToFinish.promise;
        order.push("first-end");
      });
      await firstEntered.promise;
      await vi.advanceTimersByTimeAsync(130_000);
      const second = secondLock.runExclusive("event-1", async () => {
        order.push("second-start");
      });
      await secondAdmissionRequested.promise;
      expect(order).toEqual(["first-start"]);
      allowFirstToFinish.resolve();
      await Promise.all([first, second]);
      expect(order).toEqual(["first-start", "first-end", "second-start"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
