import type { CalendarInvitationPayload } from "@open-sessionboard/contracts";
import { createCalendarInvitation, type CalendarInvitationResult } from "../calendar";
import type { OpenSendMessage } from "./types";

export interface CalendarOpenSendMessageOptions {
  readonly htmlIntroduction?: string;
  readonly textIntroduction?: string;
}

export function createCalendarOpenSendMessage(
  payload: CalendarInvitationPayload,
  invitation: CalendarInvitationResult,
  options: CalendarOpenSendMessageOptions = {},
): OpenSendMessage {
  assertInvitationMatchesPayload(payload, invitation);

  const action = actionLabel(payload.method);
  const when = formatEventTime(payload.startsAt, payload.endsAt, payload.timeZone);
  const location = payload.location.trim();
  const textIntroduction =
    options.textIntroduction ?? `${action} calendar information for ${payload.summary}.`;
  const htmlIntroduction =
    options.htmlIntroduction ?? `${action} calendar information for ${payload.summary}.`;
  const instruction =
    payload.method === "CANCEL"
      ? "Open the attached iCalendar cancellation to remove this event from your calendar."
      : "Open the attached iCalendar file to add or update this event.";

  return {
    from: payload.organizer,
    to: [...payload.attendees],
    subject: `${subjectPrefix(payload.method)}: ${payload.summary}`,
    text: [
      textIntroduction,
      `When: ${when}`,
      ...(location.length === 0 ? [] : [`Where: ${location}`]),
      instruction,
    ].join("\n\n"),
    html: [
      `<p>${escapeHtml(htmlIntroduction)}</p>`,
      `<p><strong>When:</strong> ${escapeHtml(when)}</p>`,
      ...(location.length === 0 ? [] : [`<p><strong>Where:</strong> ${escapeHtml(location)}</p>`]),
      `<p>${escapeHtml(instruction)}</p>`,
    ].join(""),
    idempotencyKey: payload.idempotencyKey,
    headers: {
      "Content-Class": "urn:content-classes:calendarmessage",
      "X-Sessionboard-Calendar-Action": payload.method,
      "X-Sessionboard-Calendar-Uid": payload.uid,
    },
    attachments: [
      {
        filename: calendarFilename(payload.uid),
        content: encodeBase64Utf8(invitation.ics),
        content_type: invitation.contentType,
      },
    ],
  };
}
function assertInvitationMatchesPayload(
  payload: CalendarInvitationPayload,
  invitation: CalendarInvitationResult,
): void {
  const expected = createCalendarInvitation(payload, {
    generatedAt: invitation.generatedAt,
  });
  if (
    invitation.method !== expected.method ||
    invitation.contentType !== expected.contentType ||
    invitation.ics !== expected.ics
  ) {
    throw new TypeError(
      "Calendar invitation bytes and MIME metadata do not match the committed lifecycle payload.",
    );
  }
}

function actionLabel(method: CalendarInvitationPayload["method"]): string {
  if (method === "CANCEL") {
    return "Cancelled";
  }
  if (method === "UPDATE") {
    return "Updated";
  }
  return "New";
}

function subjectPrefix(method: CalendarInvitationPayload["method"]): string {
  if (method === "CANCEL") {
    return "Cancelled";
  }
  if (method === "UPDATE") {
    return "Updated invitation";
  }
  return "Invitation";
}

function formatEventTime(startsAt: string, endsAt: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${formatter.format(new Date(startsAt))} – ${formatter.format(new Date(endsAt))}`;
}

function calendarFilename(uid: string): string {
  const safe = uid
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${safe.length === 0 ? "session" : safe}.ics`;
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
