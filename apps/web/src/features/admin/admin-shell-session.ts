import { useEffect, useState } from "react";
import {
  LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY,
  ORGANIZER_ORGANIZATION_STORAGE_KEY,
  organizerOrganizationIdFromSession,
  organizerOrganizationIdsFromSession,
  sessionAllowsOrganizerAccess,
} from "./admin-shell-access";

export type OrganizerAuthentication = "checking" | "authenticated" | "denied";

export interface OrganizerSessionState {
  readonly authenticatedOrganizationId: string | null;
  readonly authentication: OrganizerAuthentication;
  readonly availableOrganizationIds: readonly string[];
  readonly setAuthenticatedOrganizationId: (organizationId: string) => void;
}

type OrganizerSessionLoadResult =
  | { readonly status: "redirect" }
  | { readonly status: "denied" }
  | {
      readonly status: "authenticated";
      readonly organizationIds: readonly string[];
      readonly organizationId: string;
    };

function throwIfOrganizerSessionAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
}

async function resolveOrganizerSessionResponse(
  response: Response,
  requiredOrganizationId: string | null,
  signal: AbortSignal,
): Promise<OrganizerSessionLoadResult> {
  throwIfOrganizerSessionAborted(signal);
  if (!response.ok) return { status: "redirect" };
  const session = await response.json().catch(() => null);
  throwIfOrganizerSessionAborted(signal);
  if (!sessionAllowsOrganizerAccess(session)) return { status: "redirect" };
  const organizationIds = organizerOrganizationIdsFromSession(session);
  const preferredOrganizationId =
    requiredOrganizationId === null
      ? (window.localStorage.getItem(ORGANIZER_ORGANIZATION_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY))
      : null;
  const organizationId = organizerOrganizationIdFromSession(
    session,
    requiredOrganizationId,
    preferredOrganizationId,
  );
  return organizationId === null
    ? { status: "denied" }
    : { status: "authenticated", organizationIds, organizationId };
}

export function useOrganizerSession(
  publicMemberSetup: boolean,
  requiredOrganizationId: string | null,
): OrganizerSessionState {
  const [authenticatedOrganizationId, setAuthenticatedOrganizationId] = useState<string | null>(
    null,
  );
  const [availableOrganizationIds, setAvailableOrganizationIds] = useState<readonly string[]>([]);
  const [authentication, setAuthentication] = useState<OrganizerAuthentication>("checking");
  const accessScopeKey = requiredOrganizationId ?? "__organizer-workspace__";
  const [verifiedAccessScopeKey, setVerifiedAccessScopeKey] = useState<string | null>(null);
  const effectiveAuthentication =
    authentication === "authenticated" && verifiedAccessScopeKey !== accessScopeKey
      ? "checking"
      : authentication;

  useEffect(() => {
    if (publicMemberSetup) {
      setVerifiedAccessScopeKey(accessScopeKey);
      setAuthentication("authenticated");
      return;
    }
    const controller = new AbortController();
    const scope = { active: true };
    const ownsScope = () => scope.active && !controller.signal.aborted;
    setAuthentication("checking");
    void fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) =>
        resolveOrganizerSessionResponse(response, requiredOrganizationId, controller.signal),
      )
      .then((result) => {
        if (!ownsScope()) return;
        if (result.status === "redirect") {
          window.location.replace("/login");
          return;
        }
        if (result.status === "denied") {
          setAvailableOrganizationIds([]);
          setAuthenticatedOrganizationId(null);
          setAuthentication("denied");
          setVerifiedAccessScopeKey(null);
          return;
        }
        setAvailableOrganizationIds(result.organizationIds);
        setAuthenticatedOrganizationId(result.organizationId);
        window.localStorage.setItem(ORGANIZER_ORGANIZATION_STORAGE_KEY, result.organizationId);
        window.localStorage.removeItem(LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY);
        setVerifiedAccessScopeKey(accessScopeKey);
        setAuthentication("authenticated");
      })
      .catch(() => {
        if (ownsScope()) window.location.replace("/login");
      });
    return () => {
      scope.active = false;
      controller.abort();
    };
  }, [accessScopeKey, publicMemberSetup, requiredOrganizationId]);

  return {
    authenticatedOrganizationId,
    authentication: effectiveAuthentication,
    availableOrganizationIds,
    setAuthenticatedOrganizationId,
  };
}
