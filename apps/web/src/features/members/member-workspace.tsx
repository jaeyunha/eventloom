"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMemberApi,
  type MemberApi,
  MemberApiError,
  type MemberRole,
  type OrganizationMember,
} from "./api";
import { inviteRolesForOrganization } from "./member-workspace-model";
import { MemberWorkspaceLayout } from "./member-workspace-sections";

export interface MemberWorkspaceProps {
  readonly organizationId: string;
  readonly baseUrl?: string;
  readonly api?: MemberApi;
  readonly view?: "members" | "settings";
  readonly initialTab?: "people" | "invite";
}

type MemberFilter = "all" | MemberRole;
type MemberStatusFilter = "all" | "pending" | "active";
type WorkspaceTab = "people" | "invite" | "settings";

interface InviteDraft {
  readonly email: string;
  readonly name: string;
  readonly role: MemberRole;
}
interface InviteRoleOverride {
  readonly ownerKey: string;
  readonly value: MemberRole;
}

interface WorkspaceOrganization {
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly role: MemberRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function organizationRoute(baseUrl: string, organizationId: string): string {
  return `${baseUrl}/api/admin/organizations/${encodeURIComponent(organizationId)}/members/organizations`;
}

function parseWorkspaceOrganization(
  value: unknown,
  fallbackRole?: MemberRole,
): WorkspaceOrganization {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("The organization response is invalid.");
  }
  const record = value as Record<string, unknown>;
  const organizationId = record.organizationId;
  const slug = record.slug;
  const name = record.name;
  const role = record.role ?? fallbackRole;
  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0 ||
    typeof slug !== "string" ||
    slug.trim().length === 0 ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    (role !== "owner" && role !== "admin" && role !== "reviewer")
  ) {
    throw new TypeError("The organization response is invalid.");
  }
  return {
    organizationId: organizationId.trim(),
    slug: slug.trim(),
    name: name.trim(),
    config:
      typeof record.config === "object" && record.config !== null && !Array.isArray(record.config)
        ? (record.config as Readonly<Record<string, unknown>>)
        : {},
    role,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

async function organizationResponse(response: Response): Promise<readonly WorkspaceOrganization[]> {
  const payload = (await response.json().catch(() => undefined)) as
    | { readonly data?: unknown; readonly error?: { readonly message?: unknown } }
    | undefined;
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "The organization request failed.";
    throw new Error(message);
  }
  if (!Array.isArray(payload?.data)) throw new TypeError("The organization response is invalid.");
  return payload.data.map((value) => parseWorkspaceOrganization(value));
}

async function organizationMutationResponse(
  response: Response,
  fallbackRole: MemberRole,
): Promise<WorkspaceOrganization> {
  const payload = (await response.json().catch(() => undefined)) as
    | { readonly data?: unknown; readonly error?: { readonly message?: unknown } }
    | undefined;
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "The organization request failed.";
    throw new Error(message);
  }
  return parseWorkspaceOrganization(payload?.data, fallbackRole);
}

function apiBaseUrl(explicit: string | undefined): string {
  return (explicit ?? "").trim().replace(/\/+$/u, "");
}

function roleLabel(role: MemberRole): string {
  if (role === "reviewer") return "Evaluator";
  if (role === "admin") return "Organization admin";
  return "Organization owner";
}

function errorMessage(reason: unknown): string {
  if (reason instanceof MemberApiError) {
    if (reason.code === "LAST_OWNER")
      return "The final organization owner is protected and cannot be changed or revoked.";
    if (reason.code === "ACCESS_DENIED" || reason.status === 403)
      return "Your organization role cannot perform that member change.";
    if (reason.status === 404)
      return "We could not find that organization. Check the workspace and try again.";
    if (reason.status === 401)
      return "Your session has expired. Sign in again and retry this action.";
    return "We could not complete that member request. Check your access and try again.";
  }
  if (reason instanceof TypeError)
    return "We could not load the workspace data. Refresh the page and try again.";
  return reason instanceof Error && reason.message.trim().length > 0
    ? reason.message
    : "We could not complete that request. Try again.";
}

function useMemberWorkspaceController({
  organizationId,
  baseUrl: explicitBaseUrl,
  api: providedApi,
  view = "members",
  initialTab = "people",
}: MemberWorkspaceProps) {
  const settingsOnly = view === "settings";
  const baseUrl = apiBaseUrl(explicitBaseUrl);
  const apiResolution = useMemo(() => {
    if (providedApi !== undefined) return { api: providedApi, error: null };
    try {
      return { api: createMemberApi(baseUrl, organizationId), error: null };
    } catch (reason: unknown) {
      return { api: null, error: errorMessage(reason) };
    }
  }, [baseUrl, organizationId, providedApi]);
  const api = apiResolution.api;
  const [members, setMembers] = useState<readonly OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workspaceError = apiResolution.error ?? error;
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(settingsOnly ? "settings" : initialTab);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<MemberFilter>("all");
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>("all");
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>({
    email: "",
    name: "",
    role: "reviewer",
  });
  const [inviteRoleOverride, setInviteRoleOverride] = useState<InviteRoleOverride | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<readonly WorkspaceOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState<string | null>(null);
  const [organizationNotice, setOrganizationNotice] = useState<string | null>(null);
  const [organizationDraft, setOrganizationDraft] = useState({
    organizationId: "",
    slug: "",
    name: "",
    config: "{}",
  });
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const organizationsLoadIdRef = useRef(0);
  const membersLoadIdRef = useRef(0);
  const currentOrganization = useMemo(
    () =>
      organizations.find((organization) => organization.organizationId === organizationId.trim()),
    [organizationId, organizations],
  );
  const inviteRoles = inviteRolesForOrganization(currentOrganization?.role);
  const memberOwnerKey = organizationId.trim();
  const inviteRoleCandidate =
    inviteRoleOverride?.ownerKey === memberOwnerKey ? inviteRoleOverride.value : inviteDraft.role;
  const inviteRole = inviteRoles.includes(inviteRoleCandidate)
    ? inviteRoleCandidate
    : (inviteRoles[0] ?? "reviewer");

  const loadOrganizations = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const loadId = organizationsLoadIdRef.current + 1;
      organizationsLoadIdRef.current = loadId;
      setOrganizationsLoading(true);
      setOrganizationsError(null);
      try {
        const response = await fetch(organizationRoute(baseUrl, organizationId), {
          credentials: "include",
          cache: "no-store",
          ...(signal === undefined ? {} : { signal }),
        });
        const nextOrganizations = await organizationResponse(response);
        setOrganizations(nextOrganizations);
        const current = nextOrganizations.find(
          (organization) => organization.organizationId === organizationId.trim(),
        );
        if (current !== undefined) {
          setOrganizationDraft({
            organizationId: "",
            slug: current.slug,
            name: current.name,
            config: JSON.stringify(current.config, null, 2),
          });
        }
      } catch (reason: unknown) {
        if (!signal?.aborted) setOrganizationsError(errorMessage(reason));
      } finally {
        setOrganizationsLoading((current) =>
          loadId === organizationsLoadIdRef.current ? false : current,
        );
      }
    },
    [baseUrl, organizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadOrganizations(controller.signal);
    return () => controller.abort();
  }, [loadOrganizations]);

  const loadMembers = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const loadId = membersLoadIdRef.current + 1;
      membersLoadIdRef.current = loadId;
      setLoading(true);
      setError(null);
      try {
        if (api === null) {
          setError("The people service is unavailable. Refresh the page and try again.");
          return;
        }
        const nextMembers = await api.listMembers(signal);
        if (nextMembers.some((member) => member.organizationId !== organizationId.trim())) {
          throw new TypeError("The member response belongs to another organization.");
        }
        setMembers(nextMembers);
      } catch (reason: unknown) {
        if (!signal?.aborted) setError(errorMessage(reason));
      } finally {
        setLoading((current) => (loadId === membersLoadIdRef.current ? false : current));
      }
    },
    [api, organizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (settingsOnly) {
      setLoading(false);
      return () => controller.abort();
    }
    void loadMembers(controller.signal);
    return () => controller.abort();
  }, [loadMembers, settingsOnly]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredMembers = useMemo(
    () =>
      members.filter((member) => {
        const matchesQuery =
          normalizedQuery.length === 0 ||
          [member.name ?? "", member.email, member.userId]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        const matchesRole = roleFilter === "all" || member.role === roleFilter;
        const matchesStatus = statusFilter === "all" || member.status === statusFilter;
        return matchesQuery && matchesRole && matchesStatus;
      }),
    [members, normalizedQuery, roleFilter, statusFilter],
  );
  function updateInvite(field: "email" | "name", value: string): void {
    setInviteDraft((current) => ({ ...current, [field]: value }));
    setNotice(null);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (api === null) {
      setNotice("The people service is unavailable. Refresh the page and try again.");
      return;
    }
    const email = inviteDraft.email.trim();
    const name = inviteDraft.name.trim();
    const allowedRoles = inviteRolesForOrganization(currentOrganization?.role);
    if (!email) {
      setNotice("Enter an email address to send an invitation.");
      return;
    }
    if (!allowedRoles.includes(inviteRole)) {
      setNotice("Your organization role can invite evaluators only.");
      return;
    }
    setInviteBusy(true);
    setNotice(null);
    try {
      const result = await api.inviteMember({
        email,
        role: inviteRole,
        ...(name ? { name } : {}),
      });
      setInviteDraft({ email: "", name: "", role: "reviewer" });
      setInviteRoleOverride(null);
      setMembers((current) =>
        current.some((member) => member.userId === result.member.userId)
          ? current.map((member) =>
              member.userId === result.member.userId ? result.member : member,
            )
          : [...current, result.member],
      );
      setNotice(
        result.created
          ? "Invitation sent. The new member can finish setup from the email."
          : "That member already has an invitation. No duplicate was sent.",
      );
    } catch (reason: unknown) {
      setNotice(errorMessage(reason));
    } finally {
      setInviteBusy(false);
    }
  }

  async function changeRole(member: OrganizationMember, role: MemberRole): Promise<void> {
    if (member.role === "owner") {
      setNotice("Owner access is protected. An authorized owner must change it.");
      return;
    }
    if (api === null) return;
    setBusyUserId(member.userId);
    setNotice(null);
    try {
      const updated = await api.updateMemberRole(member.userId, role);
      setMembers((current) =>
        current.map((candidate) => (candidate.userId === updated.userId ? updated : candidate)),
      );
      setNotice(`${updated.email} is now ${roleLabel(updated.role)}.`);
    } catch (reason: unknown) {
      setNotice(errorMessage(reason));
    } finally {
      setBusyUserId(null);
    }
  }

  async function revokeMember(member: OrganizationMember): Promise<void> {
    if (member.role === "owner") {
      setNotice("Owner access is protected and cannot be revoked here.");
      return;
    }
    if (api === null) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Revoke ${member.email}'s organization membership?`)
    )
      return;
    setBusyUserId(member.userId);
    setNotice(null);
    try {
      await api.revokeMember(member.userId);
      setMembers((current) => current.filter((candidate) => candidate.userId !== member.userId));
      setNotice(`${member.email} was removed from this organization.`);
    } catch (reason: unknown) {
      setNotice(errorMessage(reason));
    } finally {
      setBusyUserId(null);
    }
  }

  function parseOrganizationConfigDraft(): Readonly<Record<string, unknown>> | null {
    try {
      const parsed: unknown = JSON.parse(organizationDraft.config);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
      return parsed as Readonly<Record<string, unknown>>;
    } catch {
      return null;
    }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextOrganizationId = organizationDraft.organizationId.trim();
    const nextSlug = organizationDraft.slug.trim();
    const nextName = organizationDraft.name.trim();
    const config = parseOrganizationConfigDraft();
    if (!nextOrganizationId || !nextSlug || !nextName) {
      setOrganizationNotice("Enter an organization identifier, slug, and display name.");
      return;
    }
    if (config === null) {
      setOrganizationNotice("Advanced configuration must be a JSON object.");
      return;
    }
    setOrganizationBusy(true);
    setOrganizationNotice(null);
    try {
      const response = await fetch(organizationRoute(baseUrl, organizationId), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `organization-${nextOrganizationId}`,
        },
        body: JSON.stringify({
          organizationId: nextOrganizationId,
          slug: nextSlug,
          name: nextName,
          config,
        }),
      });
      const created = await organizationMutationResponse(response, "owner");
      setOrganizationNotice(`Organization ${created.name} created.`);
      setOrganizationDraft({ organizationId: "", slug: "", name: "", config: "{}" });
      await loadOrganizations();
    } catch (reason: unknown) {
      setOrganizationNotice(errorMessage(reason));
    } finally {
      setOrganizationBusy(false);
    }
  }

  async function updateOrganization(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const current = organizations.find(
      (organization) => organization.organizationId === organizationId.trim(),
    );
    if (current === undefined || current.role !== "owner") {
      setOrganizationNotice("Only an organization owner can update these settings.");
      return;
    }
    const nextSlug = organizationDraft.slug.trim();
    const nextName = organizationDraft.name.trim();
    const config = parseOrganizationConfigDraft();
    if (!nextSlug || !nextName || config === null) {
      setOrganizationNotice("Enter a slug, display name, and valid advanced configuration.");
      return;
    }
    setOrganizationBusy(true);
    setOrganizationNotice(null);
    try {
      const response = await fetch(
        `${organizationRoute(baseUrl, organizationId)}/${encodeURIComponent(organizationId.trim())}`,
        {
          method: "PATCH",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug: nextSlug, name: nextName, config }),
        },
      );
      const updated = await organizationMutationResponse(response, current.role);
      setOrganizations((currentOrganizations) =>
        currentOrganizations.map((organization) =>
          organization.organizationId === updated.organizationId ? updated : organization,
        ),
      );
      setOrganizationNotice("Organization settings updated.");
    } catch (reason: unknown) {
      setOrganizationNotice(errorMessage(reason));
    } finally {
      setOrganizationBusy(false);
    }
  }

  return {
    settingsOnly,
    currentOrganization,
    organizationsLoading,
    loading,
    loadOrganizations,
    loadMembers,
    workspaceError,
    notice,
    organizationsError,
    activeTab,
    onActiveTabChange: setActiveTab,
    members,
    filteredMembers,
    query,
    roleFilter,
    statusFilter,
    busyUserId,
    onQueryChange: setQuery,
    onRoleFilterChange: setRoleFilter,
    onStatusFilterChange: setStatusFilter,
    onInvite: () => setActiveTab("invite"),
    onRoleChange: (member: OrganizationMember, role: MemberRole) => {
      void changeRole(member, role);
    },
    onRevoke: (member: OrganizationMember) => {
      void revokeMember(member);
    },
    memberOwnerKey,
    inviteDraft,
    inviteRole,
    inviteRoles,
    inviteBusy,
    apiAvailable: api !== null,
    onInviteSubmit: (event: FormEvent<HTMLFormElement>) => {
      void inviteMember(event);
    },
    onInviteUpdate: updateInvite,
    onInviteRoleChange: (value: MemberRole) => {
      setInviteRoleOverride({ ownerKey: memberOwnerKey, value });
      setNotice(null);
    },
    organizationDraft,
    organizationBusy,
    organizationNotice,
    onOrganizationDraftChange: (field: keyof typeof organizationDraft, value: string) => {
      setOrganizationDraft((current) => ({ ...current, [field]: value }));
    },
    onOrganizationUpdate: (event: FormEvent<HTMLFormElement>) => {
      void updateOrganization(event);
    },
    onOrganizationCreate: (event: FormEvent<HTMLFormElement>) => {
      void createOrganization(event);
    },
  };
}

export function MemberWorkspace(props: MemberWorkspaceProps) {
  const controller = useMemberWorkspaceController(props);
  return <MemberWorkspaceLayout {...controller} />;
}
