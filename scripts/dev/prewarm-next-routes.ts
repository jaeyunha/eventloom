import { setTimeout as waitForDelay } from "node:timers/promises";

type Fetcher = typeof globalThis.fetch;

export const DEV_PREWARM_PATHS = [
  "/",
  "/work",
  "/admin/organizations/__prewarm__",
  "/admin/organizations/__prewarm__/events",
  "/admin/organizations/__prewarm__/members",
  "/admin/organizations/__prewarm__/events/__prewarm__/settings",
  "/portal",
  "/review",
] as const;

export interface DevPrewarmFailure {
  readonly path: string;
  readonly status: number | null;
}

interface WaitForWebOptions {
  readonly attempts?: number;
  readonly baseUrl: string;
  readonly fetcher?: Fetcher;
  readonly wait?: () => Promise<unknown>;
}

interface PrewarmRoutesOptions {
  readonly baseUrl: string;
  readonly fetcher?: Fetcher;
  readonly paths?: readonly string[];
}

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, "");
}

export async function waitForWeb({
  attempts = 240,
  baseUrl,
  fetcher = globalThis.fetch,
  wait = () => waitForDelay(500),
}: WaitForWebOptions): Promise<void> {
  const healthUrl = `${normalizedBaseUrl(baseUrl)}/health`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(healthUrl, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // The web process may not be listening yet.
    }
    if (attempt + 1 < attempts) await wait();
  }
  throw new Error(`Next dev server did not become healthy at ${healthUrl}.`);
}

export async function prewarmRoutes({
  baseUrl,
  fetcher = globalThis.fetch,
  paths = DEV_PREWARM_PATHS,
}: PrewarmRoutesOptions): Promise<{ readonly failures: readonly DevPrewarmFailure[] }> {
  const origin = normalizedBaseUrl(baseUrl);
  const results = await Promise.all(
    paths.map(async (path): Promise<DevPrewarmFailure | null> => {
      try {
        const response = await fetcher(`${origin}${path}`, { cache: "no-store" });
        return response.ok ? null : { path, status: response.status };
      } catch {
        return { path, status: null };
      }
    }),
  );
  return { failures: results.filter((result) => result !== null) };
}

async function main(): Promise<void> {
  const baseUrl = process.env.DEV_WEB_ORIGIN?.trim() || "http://127.0.0.1:3015";
  await waitForWeb({ baseUrl });
  const startedAt = performance.now();
  const result = await prewarmRoutes({ baseUrl });
  const durationMs = Math.round(performance.now() - startedAt);

  process.stdout.write(
    `${JSON.stringify({
      event: "next_dev_routes_prewarmed",
      durationMs,
      failures: result.failures.length,
      routes: DEV_PREWARM_PATHS.length,
    })}\n`,
  );
  if (result.failures.length > 0) {
    process.stderr.write(
      `${JSON.stringify({
        event: "next_dev_route_prewarm_failed",
        failures: result.failures,
      })}\n`,
    );
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ event: "next_dev_prewarm_unavailable", message })}\n`);
    process.exitCode = 1;
  });
}
