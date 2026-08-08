const revisionStorageKey = "agenda:revision";
const receiptStoragePrefix = "agenda:operation:";
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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

/**
 * Serializes agenda mutation admission for one event. Callers address this object with
 * `AGENDA_COORDINATOR.idFromName(`${tenantId}:${eventId}`)` and use a stable operation ID.
 * Durable Object storage makes the revision check and idempotency receipt atomic.
 */
export class AgendaCoordinator implements DurableObject {
  readonly #state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.#state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/revision") {
      const revision = (await this.#state.storage.get<number>(revisionStorageKey)) ?? 0;
      return jsonResponse({ revision }, 200);
    }

    if (request.method !== "POST" || url.pathname !== "/mutations") {
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "INVALID_REQUEST" }, 400);
    }

    const mutation = parseMutationRequest(body);
    if (!mutation) {
      return jsonResponse({ error: "INVALID_REQUEST" }, 400);
    }

    return this.#state.storage.transaction(async (transaction) => {
      const receiptKey = `${receiptStoragePrefix}${mutation.operationId}`;
      const existing = await transaction.get<AgendaMutationReceipt>(receiptKey);
      if (existing) {
        const response: AgendaMutationResponse = { ...existing, replayed: true };
        return jsonResponse(response, 200);
      }

      const currentRevision = (await transaction.get<number>(revisionStorageKey)) ?? 0;
      if (mutation.expectedRevision !== currentRevision) {
        return jsonResponse(
          {
            error: "REVISION_CONFLICT",
            expectedRevision: mutation.expectedRevision,
            currentRevision,
          },
          409,
        );
      }

      const receipt: AgendaMutationReceipt = {
        operationId: mutation.operationId,
        previousRevision: currentRevision,
        revision: currentRevision + 1,
        committedAt: new Date().toISOString(),
      };

      await transaction.put(revisionStorageKey, receipt.revision);
      await transaction.put(receiptKey, receipt);

      const response: AgendaMutationResponse = { ...receipt, replayed: false };
      return jsonResponse(response, 201);
    });
  }
}
