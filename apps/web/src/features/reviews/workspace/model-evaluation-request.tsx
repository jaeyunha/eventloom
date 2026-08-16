"use client";

import type { ApiEnvelope } from "./api-api-envelope";
import { EvaluationRequestError } from "./api-evaluation-request-error";
import type { Fetcher } from "./api-fetcher";

export async function evaluationRequest<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  fetcher: Fetcher = fetch,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetcher(`${baseUrl}/api/admin/evaluations${path}`, {
    ...init,
    credentials: "include",
    headers,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => undefined)) as
    | ApiEnvelope<T>
    | T
    | { error?: { message?: string } }
    | undefined;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      typeof body.error.message === "string"
        ? body.error.message
        : "The evaluation request could not be completed.";
    throw new EvaluationRequestError(message, response.status);
  }
  if (typeof body === "object" && body !== null && "data" in body) {
    return body.data as T;
  }
  return body as T;
}
