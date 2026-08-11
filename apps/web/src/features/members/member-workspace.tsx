"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "../admin/admin-shell.module.css";
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

export interface MemberWorkspaceProps {
  readonly organizationId: string;
  readonly eventId?: string;
  readonly roundId?: string;
  readonly baseUrl?: string;
  readonly api?: MemberApi;
}

type MemberFilter = "all" | MemberRole;
type MemberStatusFilter = "all" | "pending" | "active";

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

const panelStyle = {
  display: "grid",
  gap: "1rem",
  padding: "1.2rem",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-md)",
  background: "var(--admin-surface)",
  boxShadow: "var(--admin-shadow)",
} as const;

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
  gap: "0.85rem",
} as const;

const fieldStyle = { display: "grid", gap: "0.35rem" } as const;
const labelStyle = {
  color: "var(--admin-ink)",
  fontSize: "0.76rem",
  fontWeight: 760,
} as const;
const inputStyle = {
  width: "100%",
  minHeight: "2.55rem",
  padding: "0.55rem 0.65rem",
  border: "1px solid var(--admin-border-strong)",
  borderRadius: "var(--admin-radius-sm)",
  background: "var(--admin-surface)",
  color: "var(--admin-ink)",
  font: "inherit",
  fontSize: "0.84rem",
} as const;
const mutedStyle = {
  margin: 0,
  color: "var(--admin-muted)",
  fontSize: "0.79rem",
  lineHeight: 1.55,
} as const;
const inlineStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "0.55rem",
  alignItems: "center",
} as const;
const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "0.2rem 0.5rem",
  borderRadius: 999,
  background: "var(--admin-brand-soft)",
  color: "var(--admin-brand-strong)",
  fontSize: "0.7rem",
  fontWeight: 800,
} as const;
const tableCellStyle = {
  padding: "0.72rem 0.65rem",
  borderBottom: "1px solid var(--admin-border)",
  verticalAlign: "top" as const,
} as const;

function apiBaseUrl(explicit: string | undefined): string {
  const normalized = (explicit ?? "").trim().replace(/\/+$/u, "");
  return normalized;
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
      return "The evaluator must finish one-time setup before joining an evaluation plan.";
    if (reason.code === "ASSIGNMENT_CAP_REACHED")
      return "This evaluator has reached the assignment cap for the round.";
    return reason.message;
  }
  return reason instanceof Error && reason.message.trim().length > 0
    ? reason.message
    : "The organization member request could not be completed.";
}

function FormMessage({ message, error = false }: Readonly<{ message: string; error?: boolean }>) {
  return (
    <p
      role={error ? "alert" : "status"}
      aria-live="polite"
      style={{ ...mutedStyle, color: error ? "var(--admin-danger)" : undefined }}
    >
      {message}
    </p>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function dashboardHref(
  eventId: string | undefined,
  roundId: string | undefined,
  reviewerId: string,
): string {
  if (!eventId) return "/admin/events";
  const query = new URLSearchParams({ reviewerId, ...(roundId ? { roundId } : {}) });
  return `/admin/events/${encodeURIComponent(eventId)}/reviews/evaluate?${query.toString()}`;
}

function poolFromGrants(pool: ReviewerPool | null): Record<string, number> {
  if (!pool) return {};
  return Object.fromEntries(pool.grants.map((grant) => [grant.reviewerId, grant.maxAssignments]));
}

function reviewersForPool(members: readonly OrganizationMember[]): readonly OrganizationMember[] {
  return members.filter((member) => member.role === "reviewer");
}

function MemberRow({
  member,
  eventId,
  roundId,
  busy,
  onRoleChange,
  onRevoke,
}: Readonly<{
  readonly member: OrganizationMember;
  readonly eventId?: string;
  readonly roundId?: string;
  readonly busy: boolean;
  readonly onRoleChange: (member: OrganizationMember, role: MemberRole) => void;
  readonly onRevoke: (member: OrganizationMember) => void;
}>) {
  const ownerProtected = member.role === "owner";
  return (
    <tr>
      <th scope="row" style={tableCellStyle}>
        <strong>{member.name || "Unnamed member"}</strong>
        <span
          style={{
            display: "block",
            marginTop: "0.2rem",
            color: "var(--admin-muted)",
            fontSize: "0.75rem",
            fontWeight: 500,
          }}
        >
          {member.email}
        </span>
        {!member.emailVerified ? (
          <span
            style={{
              display: "block",
              marginTop: "0.2rem",
              color: "var(--admin-warning)",
              fontSize: "0.72rem",
            }}
          >
            Setup pending
          </span>
        ) : null}
      </th>
      <td style={tableCellStyle}>
        <span style={badgeStyle}>{roleLabel(member.role)}</span>
        {member.role === "reviewer" ? (
          <span
            style={{
              display: "block",
              marginTop: "0.25rem",
              color: "var(--admin-muted)",
              fontSize: "0.72rem",
            }}
          >
            Separate from admin access
          </span>
        ) : null}
      </td>
      <td style={tableCellStyle}>
        <span style={badgeStyle}>{statusLabel(member.status)}</span>
      </td>
      <td style={tableCellStyle}>{formatDate(member.updatedAt)}</td>
      <td style={tableCellStyle}>
        <div style={{ display: "grid", gap: "0.45rem", minWidth: "12rem" }}>
          <label style={fieldStyle}>
            <span className={styles.srOnly}>Change role for {member.email}</span>
            <select
              aria-label={`Change role for ${member.email}`}
              style={inputStyle}
              value={member.role}
              disabled={busy || ownerProtected}
              onChange={(event) => onRoleChange(member, event.target.value as MemberRole)}
            >
              {memberRoles.map((role) => (
                <option value={role} key={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          {ownerProtected ? (
            <span style={{ color: "var(--admin-muted)", fontSize: "0.7rem" }}>
              Owner protected; only the server can authorize owner changes.
            </span>
          ) : null}
          {member.role === "reviewer" ? (
            <Link
              className={styles.outlineButton}
              href={dashboardHref(eventId, roundId, member.userId)}
            >
              Open assigned review dashboard
            </Link>
          ) : null}
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => onRevoke(member)}
            disabled={busy || ownerProtected}
          >
            {busy ? "Updating…" : "Revoke membership"}
          </button>
        </div>
      </td>
    </tr>
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
        setError("The organization member API is unavailable.");
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
    [api, baseUrl, organizationId],
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
        setPoolError("The reviewer pool API is unavailable.");
        return;
      }
      if (!eventScope || !roundScope) {
        setPoolError(
          "Enter both an event ID and a round ID to load a round-specific reviewer pool.",
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
            ? "No reviewer pool is configured for this event and round yet."
            : "Reviewer pool loaded.",
        );
      } catch (reason: unknown) {
        setPoolError(errorMessage(reason));
      } finally {
        setPoolLoading(false);
      }
    },
    [api, baseUrl],
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

  function updateInvite(field: "email" | "name", value: string): void {
    setInviteDraft((current) => ({ ...current, [field]: value }));
    setNotice(null);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (api === null) {
      setNotice("The organization member invitation API is unavailable.");
      return;
    }
    const email = inviteDraft.email.trim();
    const name = inviteDraft.name.trim();
    const allowedRoles = inviteRolesForOrganization(currentOrganization?.role);
    if (!email) {
      setNotice("Member email is required.");
      return;
    }
    if (!allowedRoles.includes(inviteDraft.role)) {
      setNotice("Your organization role cannot invite that member role.");
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
          ? "Invitation emailed. The evaluator completes setup from their email."
          : "No duplicate invitation was created. The evaluator can complete setup from their existing email invitation.",
      );
    } catch (reason: unknown) {
      setNotice(errorMessage(reason));
    } finally {
      setInviteBusy(false);
    }
  }

  async function changeRole(member: OrganizationMember, role: MemberRole): Promise<void> {
    if (member.role === "owner") {
      setNotice(
        "Owner membership is protected. Only an authorized owner can change it on the server.",
      );
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
      setNotice("Owner membership is protected and cannot be revoked from this workspace.");
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
      setNotice(`${member.email} was revoked from this organization.`);
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
      setPoolError("The reviewer pool API is unavailable.");
      return;
    }
    const eventScope = poolEventId.trim();
    const roundScope = poolRoundId.trim();
    if (!eventScope || !roundScope) {
      setPoolError("Enter both an event ID and a round ID before saving a reviewer pool.");
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
      setPoolNotice(
        `Reviewer pool saved for event ${eventScope}, round ${roundScope}. Assignment caps are enforced by the server.`,
      );
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
      setOrganizationNotice("Organization ID, slug, and name are required.");
      return;
    }
    if (config === null) {
      setOrganizationNotice("Organization configuration must be a JSON object.");
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
      setOrganizationNotice("Only an organization owner can update this configuration.");
      return;
    }
    const nextSlug = organizationDraft.slug.trim();
    const nextName = organizationDraft.name.trim();
    const config = parseOrganizationConfigDraft();
    if (!nextSlug || !nextName || config === null) {
      setOrganizationNotice("Slug, name, and a JSON object configuration are required.");
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
      setOrganizationNotice("Organization configuration updated.");
    } catch (reason: unknown) {
      setOrganizationNotice(errorMessage(reason));
    } finally {
      setOrganizationBusy(false);
    }
  }

  return (
    <div>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Organization operations · Members</p>
          <h1 className={styles.pageTitle}>Members and evaluators</h1>
          <p className={styles.pageDescription}>
            Invite organization members, keep admin access separate, and configure each event
            round&apos;s evaluator pool and assignment cap.
          </p>
          <p style={mutedStyle}>
            Organization <strong>{organizationId}</strong>
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void loadMembers()}
            disabled={loading}
          >
            {loading ? "Loading members…" : "Refresh members"}
          </button>
        </div>
      </header>

      {error ? <FormMessage message={error} error /> : null}
      {notice ? (
        <FormMessage
          message={notice}
          error={notice.includes("could not") || notice.includes("unavailable")}
        />
      ) : null}
      <section
        style={{ ...panelStyle, marginBottom: "1rem" }}
        aria-labelledby="organizations-heading"
      >
        <div>
          <p className={styles.panelEyebrow}>Tenant context</p>
          <h2 className={styles.panelTitle} id="organizations-heading">
            Organizations
          </h2>
          <p style={mutedStyle}>
            Switch between organizations you belong to without changing environment configuration.
            Each destination remains organization-qualified.
          </p>
        </div>
        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Switch organization</span>
            <select
              aria-label="Switch organization"
              style={inputStyle}
              value={organizationId}
              onChange={(event) => switchOrganization(event.target.value)}
              disabled={organizationsLoading}
            >
              <option value={organizationId}>Current: {organizationId}</option>
              {organizations
                .filter((organization) => organization.organizationId !== organizationId.trim())
                .map((organization) => (
                  <option value={organization.organizationId} key={organization.organizationId}>
                    {organization.name} ({organization.role})
                  </option>
                ))}
            </select>
          </label>
          <nav aria-label="Organization workspaces" style={{ display: "grid", gap: "0.35rem" }}>
            {organizations.map((organization) => (
              <Link
                href={`/admin/organizations/${encodeURIComponent(organization.organizationId)}/members`}
                key={organization.organizationId}
              >
                {organization.name} · {organization.role}
              </Link>
            ))}
          </nav>
        </div>
        {organizationsLoading ? <FormMessage message="Loading your organizations…" /> : null}
        {organizationsError ? <FormMessage message={organizationsError} error /> : null}
        {organizationNotice ? <FormMessage message={organizationNotice} /> : null}
        <form
          onSubmit={(event) => void createOrganization(event)}
          style={{ display: "grid", gap: "0.85rem" }}
        >
          <div>
            <p className={styles.panelEyebrow}>Owner self-service</p>
            <h3 className={styles.panelTitle}>Create organization</h3>
            <p style={mutedStyle}>
              The authenticated owner becomes an owner atomically; IDs and slugs are validated by
              the server and are never selected from a compile-time allowlist.
            </p>
          </div>
          <div style={fieldGridStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Organization ID</span>
              <input
                style={inputStyle}
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
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Organization slug</span>
              <input
                style={inputStyle}
                value={organizationDraft.slug}
                onChange={(event) =>
                  setOrganizationDraft((current) => ({ ...current, slug: event.target.value }))
                }
                maxLength={64}
                placeholder="secondary-team"
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Display name</span>
              <input
                style={inputStyle}
                value={organizationDraft.name}
                onChange={(event) =>
                  setOrganizationDraft((current) => ({ ...current, name: event.target.value }))
                }
                maxLength={200}
                placeholder="Secondary team"
              />
            </label>
          </div>
          <label style={fieldStyle}>
            <span style={labelStyle}>Organization configuration (JSON)</span>
            <textarea
              style={{ ...inputStyle, minHeight: "5rem", fontFamily: "monospace" }}
              value={organizationDraft.config}
              onChange={(event) =>
                setOrganizationDraft((current) => ({ ...current, config: event.target.value }))
              }
              spellCheck={false}
            />
          </label>
          <div style={inlineStyle}>
            <button className={styles.primaryButton} type="submit" disabled={organizationBusy}>
              {organizationBusy ? "Saving organization…" : "Create organization"}
            </button>
          </div>
        </form>
        <form
          onSubmit={(event) => void updateOrganization(event)}
          style={{ display: "grid", gap: "0.85rem" }}
        >
          <div>
            <p className={styles.panelEyebrow}>Owner-only settings</p>
            <h3 className={styles.panelTitle}>Update current organization</h3>
            <p style={mutedStyle}>
              Update the current tenant&apos;s display name, safe slug, or configuration. Server
              authorization is required.
            </p>
          </div>
          <div style={inlineStyle}>
            <button className={styles.secondaryButton} type="submit" disabled={organizationBusy}>
              {organizationBusy ? "Updating organization…" : "Update organization"}
            </button>
          </div>
        </form>
      </section>

      <section
        style={{ ...panelStyle, marginBottom: "1rem" }}
        aria-labelledby="invite-member-heading"
      >
        <div>
          <p className={styles.panelEyebrow}>CFP-10 · one-time setup</p>
          <h2 className={styles.panelTitle} id="invite-member-heading">
            Invite an organization member
          </h2>
          <p style={mutedStyle}>
            Send a secure setup invitation to a member&apos;s email. This workspace never creates or
            displays credentials.
          </p>
        </div>
        <form
          onSubmit={(event) => void inviteMember(event)}
          style={{ display: "grid", gap: "0.85rem" }}
        >
          <div style={fieldGridStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Member name</span>
              <input
                style={inputStyle}
                type="text"
                value={inviteDraft.name}
                onChange={(event) => updateInvite("name", event.target.value)}
                maxLength={200}
                autoComplete="name"
                placeholder="Taylor Member"
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Member email</span>
              <input
                style={inputStyle}
                type="email"
                value={inviteDraft.email}
                onChange={(event) => updateInvite("email", event.target.value)}
                maxLength={320}
                autoComplete="email"
                required
                placeholder="member@example.com"
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Member role</span>
              <select
                style={inputStyle}
                value={inviteDraft.role}
                onChange={(event) => {
                  setInviteDraft((current) => ({
                    ...current,
                    role: event.target.value as MemberRole,
                  }));
                  setNotice(null);
                }}
                disabled={inviteBusy || api === null}
              >
                {inviteRoles.map((role) => (
                  <option value={role} key={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
              <span style={mutedStyle}>
                {currentOrganization?.role === "owner"
                  ? "Owners may invite owners, admins, or evaluators."
                  : "Your organization role may invite evaluators only."}
              </span>
            </label>
          </div>
          <div style={inlineStyle}>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={inviteBusy || api === null}
            >
              {inviteBusy ? "Sending invitation…" : "Invite member"}
            </button>
            <span style={mutedStyle}>
              The evaluator completes setup from their email; this client never creates tokens.
            </span>
          </div>
        </form>
      </section>

      <section
        style={{ ...panelStyle, marginBottom: "1rem" }}
        aria-labelledby="member-list-heading"
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "0.8rem",
            alignItems: "end",
          }}
        >
          <div>
            <p className={styles.panelEyebrow}>Organization identity and membership</p>
            <h2 className={styles.panelTitle} id="member-list-heading">
              Members {loading ? "" : `(${filteredMembers.length} of ${members.length})`}
            </h2>
            <p style={mutedStyle}>
              Search by name, email, or user ID. Evaluator membership is distinct from organization
              admin access.
            </p>
          </div>
          <div style={inlineStyle}>
            <label style={fieldStyle}>
              <span className={styles.srOnly}>Search members</span>
              <input
                style={{ ...inputStyle, minWidth: "15rem" }}
                aria-label="Search members"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search members"
              />
            </label>
            <label style={fieldStyle}>
              <span className={styles.srOnly}>Filter members by role</span>
              <select
                aria-label="Filter members by role"
                style={inputStyle}
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as MemberFilter)}
              >
                <option value="all">All roles</option>
                {memberRoles.map((role) => (
                  <option value={role} key={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span className={styles.srOnly}>Filter members by status</span>
              <select
                aria-label="Filter members by status"
                style={inputStyle}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as MemberStatusFilter)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending setup</option>
              </select>
            </label>
          </div>
        </div>
        {loading ? <FormMessage message="Loading organization members…" /> : null}
        {!loading && error === null && members.length === 0 ? (
          <div
            role="status"
            style={{
              padding: "1rem",
              border: "1px dashed var(--admin-border-strong)",
              borderRadius: "var(--admin-radius-sm)",
            }}
          >
            <strong>No organization members yet.</strong>
            <p style={mutedStyle}>
              Invite an evaluator to begin a least-privilege evaluation team.
            </p>
          </div>
        ) : null}
        {!loading && members.length > 0 && filteredMembers.length === 0 ? (
          <FormMessage message="No members match the current search and filters." />
        ) : null}
        {filteredMembers.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <caption
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                  clip: "rect(0 0 0 0)",
                }}
              >
                Organization members and evaluator access
              </caption>
              <thead>
                <tr>
                  {["Member", "Organization role", "Status", "Updated", "Actions"].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        style={{
                          ...tableCellStyle,
                          color: "var(--admin-muted)",
                          fontSize: "0.7rem",
                          textAlign: "left",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    {...(memberCardEventId ? { eventId: memberCardEventId } : {})}
                    {...(memberCardRoundId ? { roundId: memberCardRoundId } : {})}
                    busy={busyUserId === member.userId}
                    onRoleChange={(candidate, role) => void changeRole(candidate, role)}
                    onRevoke={(candidate) => void revokeMember(candidate)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section style={{ ...panelStyle, marginBottom: "1rem" }} aria-labelledby="pool-heading">
        <div>
          <p className={styles.panelEyebrow}>ABS-02 · event-round business data</p>
          <h2 className={styles.panelTitle} id="pool-heading">
            Evaluator pool and assignment caps
          </h2>
          <p style={mutedStyle}>
            Pools are isolated by organization, event, and round. Only active evaluators can receive
            assignments; caps are checked by the server.
          </p>
        </div>
        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Event ID</span>
            <input
              style={inputStyle}
              value={poolEventId}
              onChange={(event) => setPoolEventId(event.target.value)}
              placeholder="event-2026"
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Round ID</span>
            <input
              style={inputStyle}
              value={poolRoundId}
              onChange={(event) => setPoolRoundId(event.target.value)}
              placeholder="round-initial"
            />
          </label>
        </div>
        <div style={inlineStyle}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void loadPool(poolEventId, poolRoundId)}
            disabled={poolLoading || api === null}
          >
            {poolLoading ? "Loading pool…" : "Load evaluator pool"}
          </button>
          {pool ? (
            <span style={mutedStyle}>
              Server version {pool.version} · last updated {formatDate(pool.updatedAt)}
            </span>
          ) : null}
        </div>
        {poolError ? <FormMessage message={poolError} error /> : null}
        {poolNotice ? <FormMessage message={poolNotice} /> : null}
        {!poolLoading && !poolError && !poolEventId.trim() && !poolRoundId.trim() ? (
          <FormMessage message="Enter an event ID and round ID to configure a round-specific evaluator pool." />
        ) : null}
        {!poolLoading && !poolError && pool !== null && activeReviewers.length === 0 ? (
          <FormMessage message="No active evaluators are available for this pool. Complete evaluator setup first." />
        ) : null}
        {!poolLoading &&
        !poolError &&
        pool === null &&
        poolEventId.trim() &&
        poolRoundId.trim() &&
        poolNotice === null ? (
          <FormMessage message="No evaluator pool is configured for this event and round." />
        ) : null}
        {activeReviewers.length > 0 ? (
          <fieldset
            style={{
              display: "grid",
              gap: "0.7rem",
              margin: 0,
              padding: "0.85rem",
              border: "1px solid var(--admin-border)",
              borderRadius: "var(--admin-radius-sm)",
            }}
          >
            <legend style={{ padding: "0 0.35rem", ...labelStyle }}>
              Active evaluators for this round
            </legend>
            {activeReviewers.map((reviewer) => {
              const selected = poolSelections[reviewer.userId] !== undefined;
              return (
                <div
                  key={reviewer.userId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(13rem, 1fr) minmax(8rem, 10rem) auto",
                    gap: "0.55rem",
                    alignItems: "end",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      gap: "0.45rem",
                      alignItems: "center",
                      minHeight: "2.55rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleReviewer(reviewer.userId)}
                    />
                    <span>
                      <strong>{reviewer.name || reviewer.email}</strong>
                      <span
                        style={{
                          display: "block",
                          color: "var(--admin-muted)",
                          fontSize: "0.72rem",
                        }}
                      >
                        {reviewer.email}
                      </span>
                    </span>
                  </label>
                  <label style={fieldStyle}>
                    <span className={styles.srOnly}>Maximum assignments for {reviewer.email}</span>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      step={1}
                      value={poolSelections[reviewer.userId] ?? 1}
                      disabled={!selected || poolSaving}
                      onChange={(event) => updateReviewerCap(reviewer.userId, event.target.value)}
                      aria-label={`Maximum assignments for ${reviewer.email}`}
                    />
                  </label>
                  {selected ? (
                    <span style={{ ...mutedStyle, paddingBottom: "0.65rem" }}>
                      {pool?.grants.find((grant) => grant.reviewerId === reviewer.userId)
                        ?.assignedCount ?? 0}{" "}
                      reserved
                    </span>
                  ) : (
                    <span style={{ ...mutedStyle, paddingBottom: "0.65rem" }}>Not assigned</span>
                  )}
                </div>
              );
            })}
          </fieldset>
        ) : null}
        {pendingReviewers.length > 0 ? (
          <p
            style={{
              ...mutedStyle,
              padding: "0.7rem",
              border: "1px solid var(--admin-border)",
              borderRadius: "var(--admin-radius-sm)",
            }}
          >
            <strong>Setup required:</strong>{" "}
            {pendingReviewers.map((reviewer) => reviewer.email).join(", ")} cannot enter a pool
            until the one-time invitation is completed.
          </p>
        ) : null}
        {activeReviewers.length > 0 ? (
          <div style={inlineStyle}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void savePool()}
              disabled={poolSaving || api === null}
            >
              {poolSaving ? "Saving pool…" : "Save evaluator pool"}
            </button>
            <span style={mutedStyle}>
              {selectedReviewerIds.length} evaluator{selectedReviewerIds.length === 1 ? "" : "s"}{" "}
              selected · remove all selections to clear this round&apos;s pool.
            </span>
          </div>
        ) : null}
        {poolEventId.trim() ? (
          <p style={mutedStyle}>
            My Evaluations access:{" "}
            <Link href={dashboardHref(poolEventId.trim(), poolRoundId.trim() || undefined, "pool")}>
              open the assigned review dashboard
            </Link>
            . Evaluator projections never include member administration controls.
          </p>
        ) : null}
      </section>
    </div>
  );
}
