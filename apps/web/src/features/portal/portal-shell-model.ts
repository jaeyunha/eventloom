import type { PortalCapability } from "./types";

export async function signOutAndRedirect(
  navigate: (path: string) => void = (path) => window.location.assign(path),
): Promise<void> {
  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
  navigate("/login");
}

export function portalRouteAuthorized(input: {
  readonly pathname: string;
  readonly workspace: string | null;
  readonly submissionCount: number;
  readonly can: (capability: PortalCapability) => boolean;
}): boolean {
  const { pathname, workspace, can } = input;
  if (pathname === "/portal" && workspace === null) return true;
  if (pathname.startsWith("/portal/submissions")) return true;
  if (pathname === "/portal/tasks" || workspace === "tasks") return can("task-response");
  if (pathname === "/portal/profile") return can("profile-self");
  if (workspace === "co-speakers") return can("roster-manage");
  if (workspace === "files") return can("asset-read");
  if (workspace === "resources" || workspace === "wiki") return can("resource-read");
  return true;
}

export function portalContentMode(input: {
  readonly loading: boolean;
  readonly error: string | null;
  readonly hasView: boolean;
  readonly routeAuthorized: boolean;
}): "children" | "no-access" {
  if (input.loading || (input.error !== null && !input.hasView)) return "children";
  return input.routeAuthorized ? "children" : "no-access";
}
