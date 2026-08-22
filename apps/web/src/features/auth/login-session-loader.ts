import { LOGIN_REQUEST_TIMEOUT_MS, safeLoginLandingRoute } from "./login-form-model";
import { sessionHasAuthenticatedUser } from "./session";

export type LoginSessionFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export const LOGIN_SESSION_TIMEOUT_MS = LOGIN_REQUEST_TIMEOUT_MS;

type LoginSessionResponse = Readonly<{
  response: Response;
  payload: unknown;
}>;

function loginSessionTimeoutError(): DOMException {
  return new DOMException("The login session check took too long to respond.", "TimeoutError");
}

async function requestLoginSession(
  fetcher: LoginSessionFetcher,
  callerSignal: AbortSignal | undefined,
): Promise<LoginSessionResponse> {
  const controller = new AbortController();
  let timedOut = false;
  let timeout!: ReturnType<typeof setTimeout>;
  let rejectCaller: ((reason?: unknown) => void) | undefined;
  const callerAbortPromise =
    callerSignal === undefined
      ? null
      : new Promise<never>((_, reject) => {
          rejectCaller = reject;
        });
  const abortCaller = (): void => {
    controller.abort(callerSignal?.reason);
    rejectCaller?.(new DOMException("The login session check was aborted.", "AbortError"));
  };

  if (callerSignal?.aborted) {
    abortCaller();
  } else {
    callerSignal?.addEventListener("abort", abortCaller, { once: true });
  }

  const request = Promise.resolve().then(async () => {
    const response = await fetcher("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload: unknown = response.ok ? await response.json() : undefined;
    return { response, payload };
  });
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(loginSessionTimeoutError());
      reject(loginSessionTimeoutError());
    }, LOGIN_SESSION_TIMEOUT_MS);
  });

  try {
    return await Promise.race(
      callerAbortPromise === null ? [request, deadline] : [request, deadline, callerAbortPromise],
    );
  } catch (error) {
    if (timedOut) throw loginSessionTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortCaller);
  }
}

export async function loadAuthenticatedLoginDestination({
  fetcher = globalThis.fetch,
  returnTo,
  signal,
}: Readonly<{
  fetcher?: LoginSessionFetcher;
  returnTo?: string | undefined;
  signal?: AbortSignal | undefined;
}> = {}): Promise<string | null> {
  const { response, payload } = await requestLoginSession(fetcher, signal);
  if (!response.ok) return null;
  if (!sessionHasAuthenticatedUser(payload)) return null;
  return safeLoginLandingRoute(payload, returnTo);
}
