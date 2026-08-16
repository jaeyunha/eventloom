"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createMemberApi,
  type MemberApi,
  MemberApiError,
  type MemberRole,
  memberRoles,
  type OrganizationMember,
} from "./api";
import styles from "./member-workspace.module.css";
import { inviteRolesForOrganization } from "./member-workspace-model";

const MEMBER_UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

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

function statusLabel(value: string): string {
  return value.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return MEMBER_UPDATED_AT_FORMATTER.format(date);
}

function StatusMessage({ message, error = false }: Readonly<{ message: string; error?: boolean }>) {
  if (error) {
    return (
      <Alert variant="destructive" className={styles.alert}>
        <AlertTitle>Action needed</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }
  return (
    <p className={styles.statusMessage} role="status" aria-live="polite">
      {message}
    </p>
  );
}

function MemberRow({
  member,
  busy,
  onRoleChange,
  onRevoke,
}: Readonly<{
  readonly member: OrganizationMember;
  readonly busy: boolean;
  readonly onRoleChange: (member: OrganizationMember, role: MemberRole) => void;
  readonly onRevoke: (member: OrganizationMember) => void;
}>) {
  const ownerProtected = member.role === "owner";
  return (
    <TableRow>
      <TableHead scope="row" className={styles.memberCell}>
        <strong className={styles.memberName}>{member.name || "Unnamed member"}</strong>
        <span className={styles.memberMeta}>{member.email}</span>
        {!member.emailVerified ? <span className={styles.pendingText}>Setup pending</span> : null}
      </TableHead>
      <TableCell>
        <Badge variant="secondary">{roleLabel(member.role)}</Badge>
        {member.role === "reviewer" ? (
          <span className={styles.cellHint}>Review access only</span>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant={member.status === "active" ? "default" : "outline"}>
          {statusLabel(member.status)}
        </Badge>
      </TableCell>
      <TableCell className={styles.dateCell}>{formatDate(member.updatedAt)}</TableCell>
      <TableCell>
        <div className={styles.rowActions}>
          <Select
            value={member.role}
            onValueChange={(value) => onRoleChange(member, value as MemberRole)}
            disabled={busy || ownerProtected}
          >
            <SelectTrigger
              className={styles.compactControl}
              aria-label={`Change role for ${member.email}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {memberRoles.map((role) => (
                <SelectItem value={role} key={role}>
                  {roleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {ownerProtected ? (
            <span className={styles.cellHint}>Owner access is protected</span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => onRevoke(member)}
            disabled={busy || ownerProtected}
          >
            {busy ? "Updating…" : "Revoke access"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function MemberWorkspace({
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

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Organization workspace</p>
          <h1 className={styles.title}>{settingsOnly ? "Settings" : "People"}</h1>
          <p className={styles.description}>
            {settingsOnly
              ? "Manage details and configuration for this organization."
              : "Manage who can access this organization and invite teammates for organizer or reviewer work."}
          </p>
          <p className={styles.contextLine}>
            {currentOrganization?.name ?? "Your organization"}
            {currentOrganization ? ` · ${roleLabel(currentOrganization.role)}` : ""}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            type="button"
            onClick={() => void (settingsOnly ? loadOrganizations() : loadMembers())}
            disabled={settingsOnly ? organizationsLoading : loading}
          >
            {settingsOnly
              ? organizationsLoading
                ? "Refreshing…"
                : "Refresh settings"
              : loading
                ? "Refreshing…"
                : "Refresh people"}
          </Button>
        </div>
      </header>

      {workspaceError ? <StatusMessage message={workspaceError} error /> : null}
      {notice ? <StatusMessage message={notice} /> : null}
      {settingsOnly && organizationsError ? (
        <StatusMessage message={organizationsError} error />
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
        className={styles.tabs}
      >
        {!settingsOnly ? (
          <TabsList className={styles.tabList} aria-label="People workspace sections">
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="invite">Invite member</TabsTrigger>
          </TabsList>
        ) : null}

        <TabsContent value="people" className={styles.tabContent}>
          <Card>
            <CardHeader className={styles.cardHeader}>
              <div>
                <CardTitle>People directory</CardTitle>
                <CardDescription>
                  Search everyone in this organization and keep administrative access separate from
                  review access.
                </CardDescription>
              </div>
              <CardAction>
                <Button type="button" onClick={() => setActiveTab("invite")}>
                  Invite member
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className={styles.cardContent}>
              <div className={styles.filters}>
                <div className={styles.searchField}>
                  <Label htmlFor="member-search">Search people</Label>
                  <Input
                    id="member-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by name or email"
                  />
                </div>
                <div className={styles.filterField}>
                  <Label htmlFor="member-role-filter">Role</Label>
                  <Select
                    value={roleFilter}
                    onValueChange={(value) => setRoleFilter(value as MemberFilter)}
                  >
                    <SelectTrigger id="member-role-filter" aria-label="Filter people by role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      {memberRoles.map((role) => (
                        <SelectItem value={role} key={role}>
                          {roleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.filterField}>
                  <Label htmlFor="member-status-filter">Status</Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as MemberStatusFilter)}
                  >
                    <SelectTrigger id="member-status-filter" aria-label="Filter people by status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending setup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loading ? <p className={styles.statusMessage}>Loading people…</p> : null}
              {!loading && workspaceError === null && members.length === 0 ? (
                <Empty className={styles.empty}>
                  <EmptyHeader>
                    <EmptyTitle>No one has been added yet</EmptyTitle>
                    <EmptyDescription>
                      Invite a teammate to give them organization access. Evaluators can finish
                      setup from their email.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button type="button" onClick={() => setActiveTab("invite")}>
                      Invite your first member
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : null}
              {!loading && members.length > 0 && filteredMembers.length === 0 ? (
                <p className={styles.statusMessage} role="status" aria-live="polite">
                  No people match the current search and filters.
                </p>
              ) : null}
              {filteredMembers.length > 0 ? (
                <Table>
                  <caption className={styles.srOnly}>People and organization access</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((member) => (
                      <MemberRow
                        key={member.userId}
                        member={member}
                        busy={busyUserId === member.userId}
                        onRoleChange={(candidate, role) => void changeRole(candidate, role)}
                        onRevoke={(candidate) => void revokeMember(candidate)}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
            <CardFooter className={styles.cardFooter}>
              <span>
                {loading ? "" : `${filteredMembers.length} of ${members.length} people shown`}
              </span>
              <span>Owners are protected from accidental removal.</span>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="invite" className={styles.tabContent}>
          <Card>
            <CardHeader>
              <CardTitle>Invite member</CardTitle>
              <CardDescription>
                Send a secure email invitation. The recipient creates their own sign-in details
                during setup.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.cardContent}>
              <form
                key={memberOwnerKey}
                onSubmit={(event) => void inviteMember(event)}
                className={styles.formStack}
              >
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <Label htmlFor="invite-name">Name</Label>
                    <Input
                      id="invite-name"
                      type="text"
                      value={inviteDraft.name}
                      onChange={(event) => updateInvite("name", event.target.value)}
                      maxLength={200}
                      autoComplete="name"
                      placeholder="Taylor Member"
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteDraft.email}
                      onChange={(event) => updateInvite("email", event.target.value)}
                      maxLength={320}
                      autoComplete="email"
                      required
                      placeholder="member@example.com"
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="invite-role">Access level</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => {
                        setInviteRoleOverride({
                          ownerKey: memberOwnerKey,
                          value: value as MemberRole,
                        });
                        setNotice(null);
                      }}
                      disabled={inviteBusy || api === null}
                    >
                      <SelectTrigger id="invite-role" aria-label="Choose an access level">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {inviteRoles.map((role) => (
                          <SelectItem value={role} key={role}>
                            {roleLabel(role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className={styles.fieldHint}>
                      {currentOrganization?.role === "owner"
                        ? "Owners can invite owners, admins, or evaluators."
                        : "Your organization role can invite evaluators only."}
                    </p>
                  </div>
                </div>
                <div className={styles.formActions}>
                  <Button type="submit" disabled={inviteBusy || api === null}>
                    {inviteBusy ? "Sending invitation…" : "Send invitation"}
                  </Button>
                  <span className={styles.fieldHint}>
                    No credentials are created or shown here.
                  </span>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className={styles.tabContent} aria-label="Settings">
          <Card>
            <CardHeader>
              <CardTitle>Organization settings</CardTitle>
              <CardDescription>
                Update the current organization. Owner-only changes are checked on the server.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.cardContent}>
              <section
                className={styles.settingsSection}
                aria-labelledby="current-settings-heading"
              >
                <div>
                  <h2 id="current-settings-heading" className={styles.sectionTitle}>
                    Current organization
                  </h2>
                  <p className={styles.fieldHint}>
                    Update the display name or slug for this workspace.
                  </p>
                </div>
                <form
                  onSubmit={(event) => void updateOrganization(event)}
                  className={styles.formStack}
                >
                  <div className={styles.fieldGrid}>
                    <div className={styles.field}>
                      <Label htmlFor="current-organization-name">Display name</Label>
                      <Input
                        id="current-organization-name"
                        value={organizationDraft.name}
                        onChange={(event) =>
                          setOrganizationDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        maxLength={200}
                        placeholder="Your organization"
                      />
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="current-organization-slug">Workspace slug</Label>
                      <Input
                        id="current-organization-slug"
                        value={organizationDraft.slug}
                        onChange={(event) =>
                          setOrganizationDraft((current) => ({
                            ...current,
                            slug: event.target.value,
                          }))
                        }
                        maxLength={64}
                        placeholder="your-team"
                      />
                    </div>
                  </div>
                  <details className={styles.advanced}>
                    <summary>Advanced configuration (JSON)</summary>
                    <div className={styles.field}>
                      <Label htmlFor="organization-config">Configuration object</Label>
                      <Textarea
                        id="organization-config"
                        value={organizationDraft.config}
                        onChange={(event) =>
                          setOrganizationDraft((current) => ({
                            ...current,
                            config: event.target.value,
                          }))
                        }
                        spellCheck={false}
                        className={styles.configInput}
                      />
                    </div>
                  </details>
                  <div className={styles.formActions}>
                    <Button type="submit" variant="outline" disabled={organizationBusy}>
                      {organizationBusy ? "Saving settings…" : "Save organization settings"}
                    </Button>
                  </div>
                </form>
              </section>

              <details className={styles.advanced}>
                <summary>Create another organization (advanced)</summary>
                <form
                  onSubmit={(event) => void createOrganization(event)}
                  className={styles.formStack}
                >
                  <p className={styles.fieldHint}>
                    The authenticated owner becomes an owner of the new organization. Use this only
                    when you need a separate workspace.
                  </p>
                  <div className={styles.fieldGrid}>
                    <div className={styles.field}>
                      <Label htmlFor="new-organization-id">Organization identifier</Label>
                      <Input
                        id="new-organization-id"
                        value={organizationDraft.organizationId}
                        onChange={(event) =>
                          setOrganizationDraft((current) => ({
                            ...current,
                            organizationId: event.target.value,
                          }))
                        }
                        maxLength={128}
                        placeholder="org-secondary"
                      />
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="new-organization-slug">Workspace slug</Label>
                      <Input
                        id="new-organization-slug"
                        value={organizationDraft.slug}
                        onChange={(event) =>
                          setOrganizationDraft((current) => ({
                            ...current,
                            slug: event.target.value,
                          }))
                        }
                        maxLength={64}
                        placeholder="secondary-team"
                      />
                    </div>
                    <div className={styles.field}>
                      <Label htmlFor="new-organization-name">Display name</Label>
                      <Input
                        id="new-organization-name"
                        value={organizationDraft.name}
                        onChange={(event) =>
                          setOrganizationDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        maxLength={200}
                        placeholder="Secondary team"
                      />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="new-organization-config">Configuration object (JSON)</Label>
                    <Textarea
                      id="new-organization-config"
                      value={organizationDraft.config}
                      onChange={(event) =>
                        setOrganizationDraft((current) => ({
                          ...current,
                          config: event.target.value,
                        }))
                      }
                      spellCheck={false}
                      className={styles.configInput}
                    />
                  </div>
                  <div className={styles.formActions}>
                    <Button type="submit" disabled={organizationBusy}>
                      {organizationBusy ? "Creating organization…" : "Create organization"}
                    </Button>
                  </div>
                </form>
              </details>
              {organizationNotice ? <StatusMessage message={organizationNotice} /> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
