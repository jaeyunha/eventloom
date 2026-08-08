import { type PortalApi, PortalApiError } from "../api";
import type { PortalView } from "../types";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type LocalEnvironmentCheck = (apiBaseUrl: string, signal?: AbortSignal) => Promise<boolean>;

export interface PortalLoadResult {
  source: "api" | "demo";
  view: PortalView;
}

function removeTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

export function isPortalDemoFallbackError(error: unknown): error is PortalApiError {
  return error instanceof PortalApiError && (error.status === 404 || error.status === 503);
}

export async function isLocalApiEnvironment(
  apiBaseUrl: string,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetcher(`${removeTrailingSlash(apiBaseUrl)}/api/health`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      ...(signal === undefined ? {} : { signal }),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return false;
  }

  if (!response.ok) {
    return false;
  }
  const body = (await response.json().catch(() => undefined)) as unknown;
  return isRecord(body) && body.environment === "local";
}

export async function loadPortalWithLocalDemo(input: {
  api: PortalApi;
  demoApi: PortalApi;
  apiBaseUrl: string;
  eventId: string;
  signal?: AbortSignal;
  checkEnvironment?: LocalEnvironmentCheck;
}): Promise<PortalLoadResult> {
  try {
    return {
      source: "api",
      view: await input.api.getPortal(input.eventId, input.signal),
    };
  } catch (error) {
    if (!isPortalDemoFallbackError(error)) {
      throw error;
    }
    const checkEnvironment = input.checkEnvironment ?? isLocalApiEnvironment;
    if (!(await checkEnvironment(input.apiBaseUrl, input.signal))) {
      throw error;
    }
    return {
      source: "demo",
      view: await input.demoApi.getPortal(input.eventId, input.signal),
    };
  }
}
