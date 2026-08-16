export type WorkEventInvitationRole = "reviewer" | "speaker";
export type WorkEventInvitationStatus = "pending" | "accepted";

export interface WorkEventInvitation {
  readonly id: string;
  readonly version: number;
  readonly role: WorkEventInvitationRole;
  readonly status: WorkEventInvitationStatus;
  readonly eventName: string;
  readonly organizationName: string | null;
  readonly workspaceHref: string | null;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function humanName(value: unknown, identifiers: readonly unknown[]): string | null {
  const name = text(value);
  if (name === null) return null;
  const rawIdentifiers = identifiers.map(text).filter((item): item is string => item !== null);
  return rawIdentifiers.includes(name) ? null : name;
}

function role(value: unknown): WorkEventInvitationRole | null {
  const normalized = text(value)?.toLowerCase();
  return normalized === "reviewer" || normalized === "speaker" ? normalized : null;
}

function status(value: unknown): WorkEventInvitationStatus | null {
  const normalized = text(value)?.toLowerCase();
  return normalized === "pending" || normalized === "accepted" ? normalized : null;
}

function internalHref(value: unknown): string | null {
  const href = text(value);
  return href?.startsWith("/") && !href.startsWith("//") ? href : null;
}

function invitation(value: unknown): WorkEventInvitation | null {
  const item = record(value);
  if (item === null) return null;
  const event = record(item.event);
  const organization = record(item.organization);
  const invitationId = text(item.id ?? item.invitationId);
  const invitationRole = role(item.role ?? item.invitationRole ?? item.type);
  const invitationStatus = status(item.status ?? item.invitationStatus);
  const version = item.version ?? item.expectedVersion;
  const eventName = humanName(item.eventName ?? event?.name, [item.eventId, event?.id]);
  if (
    invitationId === null ||
    invitationRole === null ||
    invitationStatus === null ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    eventName === null
  ) {
    return null;
  }
  const roleHref =
    invitationRole === "reviewer"
      ? item.reviewerWorkspaceHref
      : (item.participantWorkspaceHref ?? item.speakerWorkspaceHref);
  return {
    id: invitationId,
    version,
    role: invitationRole,
    status: invitationStatus,
    eventName,
    organizationName: humanName(item.organizationName ?? organization?.name, [
      item.organizationId,
      organization?.id,
    ]),
    workspaceHref: internalHref(item.workspaceHref ?? roleHref),
  };
}

export function parseWorkEventInvitations(value: unknown): readonly WorkEventInvitation[] {
  const payload = record(value);
  const data = payload !== null && "data" in payload ? payload.data : value;
  const dataRecord = record(data);
  const list = Array.isArray(data)
    ? data
    : Array.isArray(dataRecord?.invitations)
      ? dataRecord.invitations
      : [];
  return list.flatMap((item) => {
    const parsed = invitation(item);
    return parsed === null ? [] : [parsed];
  });
}

export function parseInvitationMutationHref(value: unknown): string | null {
  const payload = record(value);
  const data = record(payload?.data) ?? payload;
  const updatedInvitation = record(data?.invitation);
  return internalHref(
    data?.workspaceHref ??
      updatedInvitation?.workspaceHref ??
      data?.reviewerWorkspaceHref ??
      data?.participantWorkspaceHref ??
      data?.speakerWorkspaceHref ??
      updatedInvitation?.reviewerWorkspaceHref ??
      updatedInvitation?.participantWorkspaceHref ??
      updatedInvitation?.speakerWorkspaceHref,
  );
}
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type InvitationDecision = "accept" | "decline";

interface InvitationMutationError extends Error {
  readonly status: number;
  readonly code: string;
}

function mutationError(response: Response, payload: unknown): InvitationMutationError {
  const payloadRecord =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const errorRecord =
    typeof payloadRecord?.error === "object" &&
    payloadRecord.error !== null &&
    !Array.isArray(payloadRecord.error)
      ? (payloadRecord.error as Record<string, unknown>)
      : null;
  const error = new Error(
    typeof errorRecord?.message === "string" ? errorRecord.message : "Invitation update failed",
  ) as InvitationMutationError;
  Object.assign(error, {
    status: response.status,
    code: typeof errorRecord?.code === "string" ? errorRecord.code : "INVITATION_UPDATE_FAILED",
  });
  return error;
}

export async function respondToEventInvitation(
  fetcher: Fetcher,
  input: Readonly<{
    invitationId: string;
    expectedVersion: number;
    response: InvitationDecision;
  }>,
): Promise<string | null> {
  const response = await fetcher(
    `/api/account/event-invitations/${encodeURIComponent(input.invitationId)}/${input.response}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedVersion: input.expectedVersion }),
    },
  );
  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) throw mutationError(response, payload);
  return input.response === "accept" ? parseInvitationMutationHref(payload) : null;
}
