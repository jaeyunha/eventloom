import { safeLoginLandingRoute } from "./login-form-model";
import { sessionHasAuthenticatedUser } from "./session";

export type LoginSessionFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function loadAuthenticatedLoginDestination({
  fetcher = globalThis.fetch,
  returnTo,
  signal,
}: Readonly<{
  fetcher?: LoginSessionFetcher;
  returnTo?: string | undefined;
  signal?: AbortSignal | undefined;
}> = {}): Promise<string | null> {
  const response = await fetcher("/api/auth/get-session", {
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store",
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) return null;

  const payload: unknown = await response.json();
  if (!sessionHasAuthenticatedUser(payload)) return null;
  return safeLoginLandingRoute(payload, returnTo);
}
