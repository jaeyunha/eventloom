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
    setAuthentication("checking");
    void fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const session = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || !sessionAllowsOrganizerAccess(session)) {
          window.location.replace("/login");
          return;
        }
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
        if (organizationId === null) {
          setAvailableOrganizationIds([]);
          setAuthenticatedOrganizationId(null);
          setAuthentication("denied");
          setVerifiedAccessScopeKey(null);
          return;
        }
        setAvailableOrganizationIds(organizationIds);
        setAuthenticatedOrganizationId(organizationId);
        window.localStorage.setItem(ORGANIZER_ORGANIZATION_STORAGE_KEY, organizationId);
        window.localStorage.removeItem(LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY);
        setVerifiedAccessScopeKey(accessScopeKey);
        setAuthentication("authenticated");
      })
      .catch(() => {
        if (!controller.signal.aborted) window.location.replace("/login");
      });
    return () => controller.abort();
  }, [accessScopeKey, publicMemberSetup, requiredOrganizationId]);

  return {
    authenticatedOrganizationId,
    authentication: effectiveAuthentication,
    availableOrganizationIds,
    setAuthenticatedOrganizationId,
  };
}
