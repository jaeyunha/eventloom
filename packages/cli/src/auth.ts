import {
  type AccessContext,
  accessContextSchema,
  type OrganizerStatus,
  organizerStatusSchema,
  type ReviewerInbox,
  reviewerInboxSchema,
  reviewerWorkloadWarningSchema,
  type SpeakerTasks,
  speakerTasksSchema,
} from "@eventloom/contracts";
import type { CredentialReader } from "./credentials";
import type { StoredProfile } from "./store";

export type SessionCookieName = StoredProfile["session"]["name"];

const SESSION_COOKIE_NAMES = new Set<SessionCookieName>([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

export interface SessionIdentity {
  id: string;
  email: string;
}

export interface AuthenticatedAccess {
  identity: SessionIdentity;
  contexts: AccessContext[];
}

export type Fetcher = typeof fetch;

export interface WorkloadResult<T> {
  data: T;
  traceIds: string[];
}

export class AuthClientError extends Error {
  constructor(
    readonly kind: "authentication" | "authorization" | "transport" | "invalid-response",
    message: string,
    readonly traceId?: string,
  ) {
    super(message);
    this.name = "AuthClientError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sessionIdentity(value: unknown): SessionIdentity | null {
  if (!isRecord(value)) return null;
  const payload = isRecord(value.data) ? value.data : value;
  const user = isRecord(payload.user) ? payload.user : null;
  const session = isRecord(payload.session) ? payload.session : null;
  if (user === null || session === null) return null;
  const id = user.id;
  const email = user.email;
  if (
    !nonEmptyString(id) ||
    !nonEmptyString(email) ||
    !nonEmptyString(session.id ?? session.sessionId)
  )
    return null;
  return { id, email };
}

function requestUrl(origin: string, path: string): string {
  return new URL(path, `${origin}/`).toString();
}

function cookieHeader(profile: Pick<StoredProfile, "session">): string {
  return `${profile.session.name}=${profile.session.value}`;
}

function splitSetCookie(header: string): string[] {
  const values: string[] = [];
  let start = 0;
  let inExpires = false;
  for (let index = 0; index < header.length; index += 1) {
    if (header.slice(index, index + 8).toLowerCase() === "expires=") {
      inExpires = true;
      index += 7;
      continue;
    }
    const character = header[index];
    if (inExpires && character === ";") inExpires = false;
    if (!inExpires && character === ",") {
      values.push(header.slice(start, index));
      start = index + 1;
    }
  }
  values.push(header.slice(start));
  return values.map((value) => value.trim()).filter(Boolean);
}

function setCookieValues(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(headers);
  const raw = headers.get("set-cookie");
  return raw === null ? [] : splitSetCookie(raw);
}

/** Extracts exactly one supported session cookie name/value and discards attributes and unrelated cookies. */
export function parseSessionCookie(headers: Headers): StoredProfile["session"] {
  const supported = setCookieValues(headers)
    .map((value) => value.split(";", 1)[0] ?? "")
    .map((pair) => {
      const separator = pair.indexOf("=");
      if (separator <= 0) return null;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!SESSION_COOKIE_NAMES.has(name as SessionCookieName) || value.length === 0) return null;
      return { name: name as SessionCookieName, value };
    })
    .filter((cookie): cookie is StoredProfile["session"] => cookie !== null);
  if (supported.length !== 1) {
    throw new AuthClientError(
      "authentication",
      "Sign-in did not return exactly one supported session cookie",
    );
  }
  const [session] = supported;
  if (session === undefined)
    throw new AuthClientError("authentication", "Sign-in did not return a session cookie");
  return session;
}

function identityMatches(
  profile: Pick<StoredProfile, "account">,
  identity: SessionIdentity,
): boolean {
  return (
    profile.account.id === identity.id &&
    profile.account.email.toLowerCase() === identity.email.toLowerCase()
  );
}

async function request(fetcher: Fetcher, url: string, init: RequestInit): Promise<Response> {
  try {
    const response = await fetcher(url, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      throw new AuthClientError(
        "authentication",
        "Authentication server redirects are not allowed",
      );
    }
    return response;
  } catch (error) {
    if (error instanceof AuthClientError) throw error;
    throw new AuthClientError("transport", "Unable to reach the authentication server");
  }
}

export class AuthClient {
  constructor(
    readonly origin: string,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async signIn(
    reader: CredentialReader,
  ): Promise<{ session: StoredProfile["session"]; identity: SessionIdentity }> {
    const credentials = await reader.read();
    const response = await request(
      this.fetcher,
      requestUrl(this.origin, "/api/auth/sign-in/email"),
      {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(credentials),
      },
    );
    if (!response.ok)
      throw new AuthClientError("authentication", "Email or password was not accepted");
    const session = parseSessionCookie(response.headers);
    const identity = await this.getSessionFor(session);
    return { session, identity };
  }

  async getSession(profile: Pick<StoredProfile, "session">): Promise<SessionIdentity> {
    return this.getSessionFor(profile.session);
  }

  private async getSessionFor(session: StoredProfile["session"]): Promise<SessionIdentity> {
    const response = await request(this.fetcher, requestUrl(this.origin, "/api/auth/get-session"), {
      method: "GET",
      headers: { accept: "application/json", cookie: `${session.name}=${session.value}` },
      cache: "no-store",
    });
    if (!response.ok)
      throw new AuthClientError("authentication", "Session is expired or invalid; sign in again");
    const identity = sessionIdentity(await response.json().catch(() => null));
    if (identity === null)
      throw new AuthClientError(
        "authentication",
        "Session validation returned an invalid identity",
      );
    return identity;
  }

  async accessContexts(profile: StoredProfile): Promise<AccessContext[]> {
    const response = await request(
      this.fetcher,
      requestUrl(this.origin, "/api/account/access-contexts"),
      {
        method: "GET",
        headers: { accept: "application/json", cookie: cookieHeader(profile) },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new AuthClientError(
        response.status === 401 ? "authentication" : "invalid-response",
        "Access contexts are unavailable",
      );
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new AuthClientError("invalid-response", "Access contexts returned an invalid response");
    }
    try {
      return payload.data.map((context) => accessContextSchema.parse(context));
    } catch {
      throw new AuthClientError("invalid-response", "Access contexts returned an invalid response");
    }
  }

  private async authenticatedJson(
    profile: StoredProfile,
    path: string,
  ): Promise<{ data: unknown; traceId?: string }> {
    const response = await request(this.fetcher, requestUrl(this.origin, path), {
      method: "GET",
      headers: { accept: "application/json", cookie: cookieHeader(profile) },
      cache: "no-store",
    });
    if (!response.ok) {
      const traceId = response.headers.get("x-request-id") ?? undefined;
      throw new AuthClientError(
        response.status === 401
          ? "authentication"
          : response.status === 403
            ? "authorization"
            : "invalid-response",
        response.status === 403 ? "The workload request was denied" : "The workload request failed",
        traceId,
      );
    }
    const traceId = response.headers.get("x-request-id");
    return {
      data: await response.json().catch(() => null),
      ...(traceId === null ? {} : { traceId }),
    };
  }

  async organizerStatusWithTrace(
    profile: StoredProfile,
    context: AccessContext,
  ): Promise<WorkloadResult<OrganizerStatus>> {
    if (
      !context.capabilities.includes("organizer.overview.read") ||
      (context.membershipRole !== "owner" && context.membershipRole !== "admin")
    )
      throw new AuthClientError("invalid-response", "Organizer access context is invalid");
    const organization = context.organization;
    const encoded = encodeURIComponent(organization.id);
    const [core, activity] = await Promise.all([
      this.authenticatedJson(profile, `/api/admin/organizations/${encoded}/overview/core`),
      this.authenticatedJson(profile, `/api/admin/organizations/${encoded}/overview/activity`),
    ]);
    if (
      !isRecord(core.data) ||
      !isRecord(core.data.data) ||
      core.data.data.organizationId !== organization.id ||
      !isRecord(activity.data) ||
      !isRecord(activity.data.data) ||
      activity.data.data.organizationId !== organization.id ||
      !Array.isArray(activity.data.data.actionItems)
    )
      throw new AuthClientError(
        "invalid-response",
        "Organizer status returned an invalid response",
      );
    const data = organizerStatusSchema.parse({
      organizations: [
        {
          organization,
          membershipRole: context.membershipRole,
          actionItems: activity.data.data.actionItems.map((item) => {
            if (!isRecord(item))
              throw new AuthClientError(
                "invalid-response",
                "Organizer status returned an invalid response",
              );
            return {
              id: item.id,
              title: item.title,
              dueAt: item.dueAt ?? null,
              priority: item.priority,
              ...(typeof item.eventId === "string" ? { eventId: item.eventId } : {}),
            };
          }),
        },
      ],
    });
    return {
      data,
      traceIds: [core.traceId, activity.traceId].filter(
        (value): value is string => value !== undefined,
      ),
    };
  }

  async organizerStatus(profile: StoredProfile, context: AccessContext): Promise<OrganizerStatus> {
    return (await this.organizerStatusWithTrace(profile, context)).data;
  }

  async reviewerInboxWithTrace(
    profile: StoredProfile,
    contexts: readonly Extract<AccessContext, { scope: "event" }>[],
  ): Promise<WorkloadResult<ReviewerInbox>> {
    const traceIds: string[] = [];
    const assignments: ReviewerInbox["assignments"] = [];
    const warnings: ReviewerInbox["warnings"] = [];
    for (const context of contexts) {
      const query = new URLSearchParams({
        organizationId: context.organization.id,
        eventId: context.event.id,
      });
      const payload = await this.authenticatedJson(
        profile,
        `/api/account/reviewer-workspace?${query}`,
      );
      if (payload.traceId !== undefined) traceIds.push(payload.traceId);
      if (
        !isRecord(payload.data) ||
        !isRecord(payload.data.data) ||
        !Array.isArray(payload.data.data.organizations) ||
        !Array.isArray(payload.data.data.warnings)
      )
        throw new AuthClientError(
          "invalid-response",
          "Reviewer inbox returned an invalid response",
        );
      for (const rawWarning of payload.data.data.warnings) {
        let parsedWarning: ReturnType<typeof reviewerWorkloadWarningSchema.parse>;
        try {
          parsedWarning = reviewerWorkloadWarningSchema.parse(rawWarning);
        } catch {
          throw new AuthClientError(
            "invalid-response",
            "Reviewer inbox returned an invalid response",
          );
        }
        if (parsedWarning.organization.id !== context.organization.id)
          throw new AuthClientError(
            "invalid-response",
            "Reviewer inbox returned an invalid response",
          );
        warnings.push({
          code: "REVIEWER_WORKSPACE_UNAVAILABLE",
          message: `Reviewer workspace is unavailable for organization '${parsedWarning.organization.id}'`,
          profileName: profile.name,
          organizationId: parsedWarning.organization.id,
        });
      }
      for (const organizationEntry of payload.data.data.organizations) {
        if (
          !isRecord(organizationEntry) ||
          !isRecord(organizationEntry.organization) ||
          organizationEntry.organization.id !== context.organization.id ||
          !Array.isArray(organizationEntry.assignments)
        )
          throw new AuthClientError(
            "invalid-response",
            "Reviewer inbox returned an invalid response",
          );
        for (const entry of organizationEntry.assignments) {
          if (
            !isRecord(entry) ||
            !isRecord(entry.assignment) ||
            !isRecord(entry.plan) ||
            !isRecord(entry.round) ||
            !isRecord(entry.submission)
          )
            throw new AuthClientError(
              "invalid-response",
              "Reviewer inbox returned an invalid response",
            );
          assignments.push({
            organization: context.organization,
            event: context.event,
            planId: String(entry.assignment.planId),
            roundId: String(entry.assignment.roundId),
            assignmentId: String(entry.assignment.id),
            title: String(entry.submission.title),
            deadline:
              typeof entry.round.closesAt === "string"
                ? entry.round.closesAt
                : typeof entry.plan.closesAt === "string"
                  ? entry.plan.closesAt
                  : null,
          });
        }
      }
    }
    return {
      data: reviewerInboxSchema.parse({
        assignments: assignments.sort(
          (a, b) =>
            a.organization.id.localeCompare(b.organization.id) ||
            a.event.id.localeCompare(b.event.id) ||
            a.assignmentId.localeCompare(b.assignmentId),
        ),
        warnings: warnings.sort(
          (a, b) =>
            a.organizationId.localeCompare(b.organizationId) || a.message.localeCompare(b.message),
        ),
      }),
      traceIds,
    };
  }

  async reviewerInbox(
    profile: StoredProfile,
    contexts: readonly Extract<AccessContext, { scope: "event" }>[],
  ): Promise<ReviewerInbox> {
    return (await this.reviewerInboxWithTrace(profile, contexts)).data;
  }

  async speakerTasksWithTrace(
    profile: StoredProfile,
    contexts: readonly Extract<AccessContext, { scope: "event" }>[],
  ): Promise<WorkloadResult<SpeakerTasks>> {
    const tasks: SpeakerTasks["tasks"] = [];
    const traceIds: string[] = [];
    for (const context of contexts) {
      const query = new URLSearchParams({
        organizationId: context.organization.id,
        eventId: context.event.id,
      });
      const payload = await this.authenticatedJson(profile, `/api/account/speaker-tasks?${query}`);
      if (payload.traceId !== undefined) traceIds.push(payload.traceId);
      if (
        !isRecord(payload.data) ||
        !isRecord(payload.data.data) ||
        payload.data.data.organizationId !== context.organization.id ||
        payload.data.data.eventId !== context.event.id ||
        !Array.isArray(payload.data.data.tasks)
      )
        throw new AuthClientError("invalid-response", "Speaker tasks returned an invalid response");
      for (const task of payload.data.data.tasks) {
        if (!isRecord(task))
          throw new AuthClientError(
            "invalid-response",
            "Speaker tasks returned an invalid response",
          );
        tasks.push(
          speakerTasksSchema.shape.tasks.element.parse({
            organization: context.organization,
            event: context.event,
            taskId: String(task.taskId),
            title: String(task.title),
            dueAt: typeof task.dueAt === "string" ? task.dueAt : null,
            status: task.status,
          }),
        );
      }
    }
    return {
      data: speakerTasksSchema.parse({
        tasks: tasks.sort(
          (a, b) =>
            a.organization.id.localeCompare(b.organization.id) ||
            a.event.id.localeCompare(b.event.id) ||
            a.taskId.localeCompare(b.taskId),
        ),
      }),
      traceIds,
    };
  }

  async speakerTasks(
    profile: StoredProfile,
    contexts: readonly Extract<AccessContext, { scope: "event" }>[],
  ): Promise<SpeakerTasks> {
    return (await this.speakerTasksWithTrace(profile, contexts)).data;
  }

  async authenticatedAccess(profile: StoredProfile): Promise<AuthenticatedAccess> {
    const identity = await this.getSession(profile);
    if (!identityMatches(profile, identity)) {
      throw new AuthClientError("authentication", "Session identity changed; sign in again");
    }
    const contexts = await this.accessContexts(profile);
    return { identity, contexts };
  }

  async signOut(profile: StoredProfile): Promise<void> {
    const response = await request(this.fetcher, requestUrl(this.origin, "/api/auth/sign-out"), {
      method: "POST",
      headers: {
        accept: "application/json",
        cookie: cookieHeader(profile),
        origin: this.origin,
      },
    });
    if (!response.ok) throw new AuthClientError("transport", "Remote session invalidation failed");
  }
}
