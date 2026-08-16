import type { OrganizerAuthentication } from "./admin-shell-session";

export function shouldRenderAdminShell(
  authentication: OrganizerAuthentication,
  publicMemberSetup: boolean,
): boolean {
  return publicMemberSetup || authentication === "authenticated";
}
