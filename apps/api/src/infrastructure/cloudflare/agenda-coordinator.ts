const revisionStorageKey = "agenda:revision";
const receiptStoragePrefix = "agenda:operation:";
const leaseStorageKey = "agenda:lease";
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const leaseDurationMs = 120_000;

interface AgendaMutationRequest {
  readonly operationId: string;
  readonly expectedRevision: number;
}

interface AgendaMutationReceipt {
  readonly operationId: string;
  readonly previousRevision: number;
  readonly revision: number;
  readonly committedAt: string;
}

interface AgendaMutationResponse extends AgendaMutationReceipt {
  readonly replayed: boolean;
}

interface AgendaMutationLease {
  readonly operationId: string;
  readonly expiresAt: number;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function parseMutationRequest(value: unknown): AgendaMutationRequest | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.operationId !== "string" ||
    !operationIdPattern.test(candidate.operationId) ||
    typeof candidate.expectedRevision !== "number" ||
    !Number.isSafeInteger(candidate.expectedRevision) ||
    candidate.expectedRevision < 0
  ) {
    return null;
  }

  return {
    operationId: candidate.operationId,
    expectedRevision: candidate.expectedRevision,
  };
}

function parseOperationId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const operationId = (value as Record<string, unknown>).operationId;
  return typeof operationId === "string" && operationIdPattern.test(operationId)
    ? operationId
    : null;
}

/**
 * Serializes agenda mutation admission for one event. Callers address this object with
 * `AGENDA_COORDINATOR.idFromName(`${tenantId}:${eventId}`)` and use a stable operation ID.
 * Durable Object storage makes the revision check, lease, and idempotency receipt atomic.
 */
export class AgendaCoordinator implements DurableObject {
  readonly #state: DurableObjectState;
  readonly #leaseWaiters = new Set<() => void>();

  constructor(state: DurableObjectState) {
    this.#state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/revision") {
      const revision = (await this.#state.storage.get<number>(revisionStorageKey)) ?? 0;
      return jsonResponse({ revision }, 200);
    }

    if (url.pathname !== "/mutations") {
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "INVALID_REQUEST" }, 400);
    }

    if (request.method === "DELETE") {
      const operationId = parseOperationId(body);
      if (operationId === null) return jsonResponse({ error: "INVALID_REQUEST" }, 400);
      const released = await this.#state.storage.transaction(async (transaction) => {
        const lease = await transaction.get<AgendaMutationLease>(leaseStorageKey);
        if (lease === undefined) return true;
        if (lease.operationId !== operationId) return false;
        await transaction.delete(leaseStorageKey);
        return true;
      });
      if (!released) return jsonResponse({ error: "LEASE_CONFLICT" }, 409);
      this.#notifyLeaseWaiters();
      return new Response(null, { status: 204 });
    }

    if (request.method === "PATCH") {
      const operationId = parseOperationId(body);
      if (operationId === null) return jsonResponse({ error: "INVALID_REQUEST" }, 400);
      const expiresAt = await this.#state.storage.transaction(async (transaction) => {
        const lease = await transaction.get<AgendaMutationLease>(leaseStorageKey);
        const now = Date.now();
        if (lease === undefined || lease.operationId !== operationId || lease.expiresAt <= now) {
          return null;
        }
        const renewed = now + leaseDurationMs;
        await transaction.put(leaseStorageKey, { operationId, expiresAt: renewed });
        return renewed;
      });
      return expiresAt === null
        ? jsonResponse({ error: "LEASE_CONFLICT" }, 409)
        : jsonResponse({ operationId, expiresAt }, 200);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    }

    const mutation = parseMutationRequest(body);
    if (!mutation) {
      return jsonResponse({ error: "INVALID_REQUEST" }, 400);
    }

    for (;;) {
      const admission = await this.#state.storage.transaction(async (transaction) => {
        const now = Date.now();
        const lease = await transaction.get<AgendaMutationLease>(leaseStorageKey);
        const receiptKey = `${receiptStoragePrefix}${mutation.operationId}`;
        const existing = await transaction.get<AgendaMutationReceipt>(receiptKey);
        if (existing) {
          if (lease?.operationId === mutation.operationId && lease.expiresAt > now) {
            const renewed = { ...lease, expiresAt: now + leaseDurationMs };
            await transaction.put(leaseStorageKey, renewed);
            const response: AgendaMutationResponse = { ...existing, replayed: true };
            return { response: jsonResponse(response, 200), waitFor: null };
          }
          const currentRevision = (await transaction.get<number>(revisionStorageKey)) ?? 0;
          if (
            currentRevision !== existing.revision ||
            (lease !== undefined && lease.expiresAt > now)
          ) {
            return {
              response: jsonResponse(
                {
                  error: "REVISION_CONFLICT",
                  expectedRevision: mutation.expectedRevision,
                  currentRevision,
                },
                409,
              ),
              waitFor: null,
            };
          }
          await transaction.put(leaseStorageKey, {
            operationId: mutation.operationId,
            expiresAt: now + leaseDurationMs,
          } satisfies AgendaMutationLease);
          const response: AgendaMutationResponse = { ...existing, replayed: true };
          return { response: jsonResponse(response, 200), waitFor: null };
        }

        const currentRevision = (await transaction.get<number>(revisionStorageKey)) ?? 0;
        if (mutation.expectedRevision !== currentRevision) {
          return {
            response: jsonResponse(
              {
                error: "REVISION_CONFLICT",
                expectedRevision: mutation.expectedRevision,
                currentRevision,
              },
              409,
            ),
            waitFor: null,
          };
        }
        if (lease !== undefined && lease.expiresAt > now) {
          return { response: null, waitFor: lease };
        }
        if (lease !== undefined) await transaction.delete(leaseStorageKey);

        const receipt: AgendaMutationReceipt = {
          operationId: mutation.operationId,
          previousRevision: currentRevision,
          revision: currentRevision + 1,
          committedAt: new Date(now).toISOString(),
        };

        await transaction.put(revisionStorageKey, receipt.revision);
        await transaction.put(receiptKey, receipt);
        await transaction.put(leaseStorageKey, {
          operationId: mutation.operationId,
          expiresAt: now + leaseDurationMs,
        } satisfies AgendaMutationLease);

        const response: AgendaMutationResponse = { ...receipt, replayed: false };
        return { response: jsonResponse(response, 201), waitFor: null };
      });
      if (admission.response !== null) return admission.response;
      await this.#waitForLease(admission.waitFor);
    }
  }

  async #waitForLease(lease: AgendaMutationLease): Promise<void> {
    let finish: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      let settled = false;
      finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#leaseWaiters.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, Math.max(0, lease.expiresAt - Date.now()));
      this.#leaseWaiters.add(finish);
    });
    const current = await this.#state.storage.get<AgendaMutationLease>(leaseStorageKey);
    if (current?.operationId !== lease.operationId || current.expiresAt !== lease.expiresAt)
      finish();
    await released;
  }

  #notifyLeaseWaiters(): void {
    for (const release of this.#leaseWaiters) release();
  }
}
