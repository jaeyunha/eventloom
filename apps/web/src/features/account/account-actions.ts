export type AccountActionFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function signOutAccount({
  fetcher = globalThis.fetch,
  navigate = (path) => window.location.assign(path),
}: Readonly<{
  fetcher?: AccountActionFetcher;
  navigate?: (path: string) => void;
}> = {}): Promise<boolean> {
  const response = await fetcher("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).catch(() => null);
  if (response === null || !response.ok) return false;
  navigate("/login");
  return true;
}
