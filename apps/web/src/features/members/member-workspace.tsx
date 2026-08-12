"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  type ReviewerPool,
  type SetReviewerPoolInput,
} from "./api";
import styles from "./member-workspace.module.css";

export interface MemberWorkspaceProps {
  readonly organizationId: string;
  readonly eventId?: string;
  readonly roundId?: string;
  readonly baseUrl?: string;
  readonly api?: MemberApi;
}

type MemberFilter = "all" | MemberRole;
type MemberStatusFilter = "all" | "pending" | "active";
type WorkspaceTab = "people" | "invite" | "pools" | "settings";

interface InviteDraft {
  readonly email: string;
  readonly name: string;
  readonly role: MemberRole;
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

const reviewerOnlyInviteRoles = ["reviewer"] as const;

export function inviteRolesForOrganization(role: MemberRole | undefined): readonly MemberRole[] {
  return role === "owner" ? memberRoles : reviewerOnlyInviteRoles;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof MemberApiError) {
    if (reason.code === "LAST_OWNER")
      return "The final organization owner is protected and cannot be changed or revoked.";
    if (reason.code === "ACCESS_DENIED" || reason.status === 403)
      return "Your organization role cannot perform that member change.";
    if (reason.code === "REVIEWER_NOT_ACTIVE")
      return "The evaluator must finish setup before joining a review pool.";
    if (reason.code === "ASSIGNMENT_CAP_REACHED")
      return "This evaluator has reached the assignment limit for the round.";
    if (reason.status === 404)
      return "We could not find that organization or round. Check the workspace and try again.";
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
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function dashboardHref(
  organizationId: string,
  eventId: string | undefined,
  roundId: string | undefined,
  reviewerId: string,
): string {
  if (!eventId) return "/admin/events";
  const query = new URLSearchParams({ reviewerId, ...(roundId ? { roundId } : {}) });
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/reviews/evaluate?${query.toString()}`;
}

function poolFromGrants(pool: ReviewerPool | null): Record<string, number> {
  if (!pool) return {};
  return Object.fromEntries(pool.grants.map((grant) => [grant.reviewerId, grant.maxAssignments]));
}

function reviewersForPool(members: readonly OrganizationMember[]): readonly OrganizationMember[] {
  return members.filter((member) => member.role === "reviewer");
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
  organizationId,
  eventId,
  roundId,
  busy,
  onRoleChange,
  onRevoke,
}: Readonly<{
  readonly member: OrganizationMember;
  readonly organizationId: string;
  readonly eventId?: string;
  readonly roundId?: string;
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
          {member.role === "reviewer" ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={dashboardHref(organizationId, eventId, roundId, member.userId)}>
                Open review dashboard
              </Link>
            </Button>
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
  eventId,
  roundId,
  baseUrl: explicitBaseUrl,
  api: providedApi,
}: MemberWorkspaceProps) {
  const baseUrl = apiBaseUrl(explicitBaseUrl);
  const [api, setApi] = useState<MemberApi | null>(providedApi ?? null);
  const [members, setMembers] = useState<readonly OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("people");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<MemberFilter>("all");
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>("all");
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>({
    email: "",
    name: "",
    role: "reviewer",
  });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [poolEventId, setPoolEventId] = useState(eventId ?? "");
  const [poolRoundId, setPoolRoundId] = useState(roundId ?? "");
  const [pool, setPool] = useState<ReviewerPool | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [poolNotice, setPoolNotice] = useState<string | null>(null);
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolSelections, setPoolSelections] = useState<Readonly<Record<string, number>>>({});
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
  const currentOrganization = useMemo(
    () =>
      organizations.find((organization) => organization.organizationId === organizationId.trim()),
    [organizationId, organizations],
  );
  const inviteRoles = inviteRolesForOrganization(currentOrganization?.role);

  useEffect(() => {
    setInviteDraft((current) => {
      const allowedRoles = inviteRolesForOrganization(currentOrganization?.role);
      return allowedRoles.includes(current.role) ? current : { ...current, role: "reviewer" };
    });
  }, [currentOrganization?.role]);

  useEffect(() => {
    if (providedApi !== undefined) {
      setApi(providedApi);
      return;
    }
    try {
      setApi(createMemberApi(baseUrl, organizationId));
    } catch (reason: unknown) {
      setApi(null);
      setError(errorMessage(reason));
    }
  }, [baseUrl, organizationId, providedApi]);

  const loadOrganizations = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
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
        if (!signal?.aborted) setOrganizationsLoading(false);
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
      if (api === null) {
        setLoading(false);
        setError("The people service is unavailable. Refresh the page and try again.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const nextMembers = await api.listMembers(signal);
        if (nextMembers.some((member) => member.organizationId !== organizationId.trim())) {
          throw new TypeError("The member response belongs to another organization.");
        }
        setMembers(nextMembers);
      } catch (reason: unknown) {
        if (!signal?.aborted) setError(errorMessage(reason));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api, organizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadMembers(controller.signal);
    return () => controller.abort();
  }, [loadMembers]);

  useEffect(() => {
    setPoolEventId(eventId ?? "");
    setPoolRoundId(roundId ?? "");
    setPool(null);
    setPoolSelections({});
    setPoolError(null);
  }, [eventId, roundId]);

  const loadPool = useCallback(
    async (eventValue: string, roundValue: string): Promise<void> => {
      const eventScope = eventValue.trim();
      const roundScope = roundValue.trim();
      if (api === null) {
        setPoolError("The review pool service is unavailable. Refresh the page and try again.");
        return;
      }
      if (!eventScope || !roundScope) {
        setPoolError(
          "Choose an event and round in the advanced scope options before loading a pool.",
        );
        return;
      }
      setPoolLoading(true);
      setPoolError(null);
      setPoolNotice(null);
      try {
        const nextPool = await api.getReviewerPool(eventScope, roundScope);
        setPool(nextPool);
        setPoolSelections(poolFromGrants(nextPool));
        setPoolEventId(eventScope);
        setPoolRoundId(roundScope);
        setPoolNotice(
          nextPool === null
            ? "No review pool is configured for this event and round yet."
            : "Review pool loaded.",
        );
      } catch (reason: unknown) {
        setPoolError(errorMessage(reason));
      } finally {
        setPoolLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (api === null || !eventId?.trim() || !roundId?.trim()) return;
    void loadPool(eventId, roundId);
  }, [api, eventId, roundId, loadPool]);

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
  const reviewers = useMemo(() => reviewersForPool(members), [members]);
  const activeReviewers = reviewers.filter(
    (member) => member.status === "active" && member.emailVerified,
  );
  const pendingReviewers = reviewers.filter(
    (member) => !activeReviewers.some((active) => active.userId === member.userId),
  );
  const selectedReviewerIds = Object.keys(poolSelections);
  const memberCardEventId = poolEventId.trim() || eventId;
  const memberCardRoundId = poolRoundId.trim() || roundId;
  const poolHasScope = poolEventId.trim().length > 0 && poolRoundId.trim().length > 0;

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
    if (!allowedRoles.includes(inviteDraft.role)) {
      setNotice("Your organization role can invite evaluators only.");
      return;
    }
    setInviteBusy(true);
    setNotice(null);
    try {
      const result = await api.inviteMember({
        email,
        role: inviteDraft.role,
        ...(name ? { name } : {}),
      });
      setInviteDraft({ email: "", name: "", role: "reviewer" });
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
      setPoolSelections((current) => {
        const next = { ...current };
        delete next[member.userId];
        return next;
      });
      setNotice(`${member.email} was removed from this organization.`);
    } catch (reason: unknown) {
      setNotice(errorMessage(reason));
    } finally {
      setBusyUserId(null);
    }
  }

  function toggleReviewer(reviewerId: string): void {
    setPoolSelections((current) => {
      if (current[reviewerId] !== undefined) {
        const next = { ...current };
        delete next[reviewerId];
        return next;
      }
      const previous =
        pool?.grants.find((grant) => grant.reviewerId === reviewerId)?.maxAssignments ?? 1;
      return { ...current, [reviewerId]: previous };
    });
    setPoolNotice(null);
  }

  function updateReviewerCap(reviewerId: string, rawValue: string): void {
    const value = Number(rawValue);
    setPoolSelections((current) => ({
      ...current,
      [reviewerId]: Number.isSafeInteger(value) && value > 0 ? value : 1,
    }));
    setPoolNotice(null);
  }

  async function savePool(): Promise<void> {
    if (api === null) {
      setPoolError("The review pool service is unavailable. Refresh the page and try again.");
      return;
    }
    const eventScope = poolEventId.trim();
    const roundScope = poolRoundId.trim();
    if (!eventScope || !roundScope) {
      setPoolError("Choose an event and round in the advanced scope options before saving a pool.");
      return;
    }
    const reviewersInput = selectedReviewerIds.map((reviewerId) => ({
      reviewerId,
      maxAssignments: poolSelections[reviewerId] ?? 1,
    }));
    setPoolSaving(true);
    setPoolError(null);
    setPoolNotice(null);
    try {
      const input: SetReviewerPoolInput = {
        reviewers: reviewersInput,
        ...(pool?.version === undefined ? {} : { expectedVersion: pool.version }),
      };
      const nextPool = await api.setReviewerPool(eventScope, roundScope, input);
      setPool(nextPool);
      setPoolSelections(poolFromGrants(nextPool));
      setPoolNotice("Review pool saved. Assignment limits are enforced automatically.");
    } catch (reason: unknown) {
      setPoolError(errorMessage(reason));
    } finally {
      setPoolSaving(false);
    }
  }

  function switchOrganization(targetOrganizationId: string): void {
    const target = targetOrganizationId.trim();
    if (!target || typeof window === "undefined") return;
    window.location.assign(`/admin/organizations/${encodeURIComponent(target)}/members`);
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
          <h1 className={styles.title}>People</h1>
          <p className={styles.description}>
            Keep your organization access clear, invite teammates, and choose evaluators when a
            review round is ready.
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
            onClick={() => void loadMembers()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh people"}
          </Button>
        </div>
      </header>

      {error ? <StatusMessage message={error} error /> : null}
      {notice ? <StatusMessage message={notice} /> : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
        className={styles.tabs}
      >
        <TabsList className={styles.tabList} aria-label="People workspace sections">
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="invite">Invite member</TabsTrigger>
          <TabsTrigger value="pools">Reviewer pools</TabsTrigger>
          <TabsTrigger value="settings">Organization settings</TabsTrigger>
        </TabsList>

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
              {!loading && error === null && members.length === 0 ? (
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
                        organizationId={organizationId}
                        {...(memberCardEventId ? { eventId: memberCardEventId } : {})}
                        {...(memberCardRoundId ? { roundId: memberCardRoundId } : {})}
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
              <form onSubmit={(event) => void inviteMember(event)} className={styles.formStack}>
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
                      value={inviteDraft.role}
                      onValueChange={(value) => {
                        setInviteDraft((current) => ({ ...current, role: value as MemberRole }));
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

        <TabsContent value="pools" className={styles.tabContent}>
          <Card>
            <CardHeader>
              <CardTitle>Reviewer pools</CardTitle>
              <CardDescription>
                Choose active evaluators for one event round and set the maximum number of
                assignments each can receive.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.cardContent}>
              <div className={styles.scopeSummary}>
                <div>
                  <span className={styles.eyebrow}>Current scope</span>
                  <strong>{poolHasScope ? "Event round selected" : "Choose an event round"}</strong>
                </div>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void loadPool(poolEventId, poolRoundId)}
                  disabled={poolLoading || api === null}
                >
                  {poolLoading ? "Loading pool…" : "Load pool"}
                </Button>
              </div>
              <details className={styles.advanced} open={!poolHasScope}>
                <summary>Change event or round (advanced)</summary>
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <Label htmlFor="pool-event-reference">Event reference</Label>
                    <Input
                      id="pool-event-reference"
                      value={poolEventId}
                      onChange={(event) => setPoolEventId(event.target.value)}
                      placeholder="Choose an event"
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="pool-round-reference">Round reference</Label>
                    <Input
                      id="pool-round-reference"
                      value={poolRoundId}
                      onChange={(event) => setPoolRoundId(event.target.value)}
                      placeholder="Choose a round"
                    />
                  </div>
                </div>
              </details>
              {poolError ? <StatusMessage message={poolError} error /> : null}
              {poolNotice ? <StatusMessage message={poolNotice} /> : null}
              {!poolLoading && !poolError && !poolHasScope ? (
                <p className={styles.statusMessage}>
                  Add an event and round in the advanced scope options to configure a pool.
                </p>
              ) : null}
              {!poolLoading &&
              !poolError &&
              poolHasScope &&
              pool !== null &&
              activeReviewers.length === 0 ? (
                <p className={styles.statusMessage}>
                  No active evaluators are available. Invite a member and have them finish setup
                  first.
                </p>
              ) : null}
              {poolHasScope && activeReviewers.length > 0 ? (
                <fieldset className={styles.reviewerList}>
                  <legend>Active evaluators for this round</legend>
                  {activeReviewers.map((reviewer) => {
                    const selected = poolSelections[reviewer.userId] !== undefined;
                    return (
                      <div className={styles.reviewerRow} key={reviewer.userId}>
                        <Label className={styles.reviewerChoice}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleReviewer(reviewer.userId)}
                          />
                          <span>
                            <strong>{reviewer.name || reviewer.email}</strong>
                            <span className={styles.memberMeta}>{reviewer.email}</span>
                          </span>
                        </Label>
                        <div className={styles.capField}>
                          <Label htmlFor={`reviewer-cap-${reviewer.userId}`}>
                            Assignment limit
                          </Label>
                          <Input
                            id={`reviewer-cap-${reviewer.userId}`}
                            type="number"
                            min={1}
                            step={1}
                            value={poolSelections[reviewer.userId] ?? 1}
                            disabled={!selected || poolSaving}
                            onChange={(event) =>
                              updateReviewerCap(reviewer.userId, event.target.value)
                            }
                          />
                        </div>
                        <span className={styles.assignmentHint}>
                          {selected
                            ? `${pool?.grants.find((grant) => grant.reviewerId === reviewer.userId)?.assignedCount ?? 0} assigned`
                            : "Not selected"}
                        </span>
                      </div>
                    );
                  })}
                </fieldset>
              ) : null}
              {poolHasScope && pendingReviewers.length > 0 ? (
                <p className={styles.setupHint}>
                  <strong>Setup still needed:</strong>{" "}
                  {pendingReviewers.map((reviewer) => reviewer.email).join(", ")} can join a pool
                  after completing the invitation.
                </p>
              ) : null}
            </CardContent>
            {poolHasScope && activeReviewers.length > 0 ? (
              <CardFooter className={styles.cardFooter}>
                <span>
                  {selectedReviewerIds.length} evaluator
                  {selectedReviewerIds.length === 1 ? "" : "s"} selected
                </span>
                <Button
                  type="button"
                  onClick={() => void savePool()}
                  disabled={poolSaving || api === null}
                >
                  {poolSaving ? "Saving pool…" : "Save reviewer pool"}
                </Button>
              </CardFooter>
            ) : null}
            {poolHasScope ? (
              <CardFooter className={styles.cardFooterSecondary}>
                <Link
                  href={dashboardHref(
                    organizationId,
                    poolEventId.trim(),
                    poolRoundId.trim() || undefined,
                    "pool",
                  )}
                >
                  Open My Evaluations
                </Link>
              </CardFooter>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="settings" className={styles.tabContent}>
          <Card>
            <CardHeader>
              <CardTitle>Organization settings</CardTitle>
              <CardDescription>
                Switch workspaces or update the current organization. Owner-only changes are checked
                on the server.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.cardContent}>
              <section
                className={styles.settingsSection}
                aria-labelledby="organization-switch-heading"
              >
                <div>
                  <h2 id="organization-switch-heading" className={styles.sectionTitle}>
                    Your organizations
                  </h2>
                  <p className={styles.fieldHint}>Choose where you want to manage people.</p>
                </div>
                <Select
                  value={organizationId}
                  onValueChange={switchOrganization}
                  disabled={organizationsLoading}
                >
                  <SelectTrigger aria-label="Switch organization" className={styles.settingsSelect}>
                    <SelectValue placeholder="Choose an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.length === 0 ? (
                      <SelectItem value={organizationId}>Current organization</SelectItem>
                    ) : (
                      organizations.map((organization) => (
                        <SelectItem
                          value={organization.organizationId}
                          key={organization.organizationId}
                        >
                          {organization.name} · {roleLabel(organization.role)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {organizationsLoading ? (
                  <p className={styles.statusMessage}>Loading organizations…</p>
                ) : null}
                {organizationsError ? <StatusMessage message={organizationsError} error /> : null}
              </section>

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
