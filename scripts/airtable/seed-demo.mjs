import {
  createLocalDemoAgenda,
  createLocalDemoSpeakerGallery,
} from "../../apps/web/src/features/embed/demo/projections.ts";

const organizationId = process.env.NEXT_PUBLIC_ORGANIZATION_ID?.trim() || "foreverbrowsing";
const eventId = "open-sessionboard-conf";
const formId = "main-cfp";
const token = process.env.AIRTABLE_ACCESS_TOKEN?.trim();
const baseId = process.env.AIRTABLE_BASE_ID?.trim();
const dryRun = process.argv.includes("--dry-run");

if (!token || !baseId) {
  throw new Error("AIRTABLE_ACCESS_TOKEN and AIRTABLE_BASE_ID are required.");
}

const agenda = createLocalDemoAgenda(eventId);
const speakers = createLocalDemoSpeakerGallery(eventId);
const event = {
  id: eventId,
  tenantId: organizationId,
  version: 1,
  slug: eventId,
  name: agenda.event.name,
  timezone: agenda.event.timeZone,
  opensAt: "2026-08-01T07:00:00.000Z",
  closesAt: "2026-09-15T07:00:00.000Z",
};
const form = {
  id: formId,
  tenantId: organizationId,
  eventId,
  name: "Open Systems Summit call for speakers",
  version: 1,
  status: "published",
  welcomeContent:
    "Share the session you want to bring to Open Systems Summit. Drafts are saved securely as you work.",
  settings: {
    speakerLimit: 3,
    maxSubmissionsPerAccount: 3,
    remindersEnabled: true,
    adminNotificationsEnabled: true,
    confirmationMessage: "Your proposal has been received.",
    successContent:
      "Thank you for submitting. Continue to your speaker portal to track status and complete tasks.",
    redirectUrl: "https://open-sessionboard-web-production.ashleyha0317.workers.dev/portal",
  },
  sections: [
    { id: "session", title: "Submission", description: "Tell us about the session." },
    { id: "people", title: "Participants", description: "Add every person presenting." },
  ],
  submissionFields: [
    {
      id: "field-title",
      sectionId: "session",
      key: "title",
      label: "Title",
      kind: "text",
      required: true,
      options: [],
    },
    {
      id: "field-description",
      sectionId: "session",
      key: "description",
      label: "Description",
      kind: "rich_text",
      required: true,
      options: [],
    },
    {
      id: "field-format",
      sectionId: "session",
      key: "format",
      label: "Format",
      kind: "select",
      required: true,
      options: ["Featured Keynote", "Keynote", "Breakout Session", "Workshop", "Panel"],
    },
    {
      id: "field-tags",
      sectionId: "session",
      key: "tags",
      label: "Tags",
      kind: "multi_select",
      required: true,
      options: ["AI engineering", "Open source", "Operations", "Accessibility", "Leadership"],
    },
    {
      id: "field-track",
      sectionId: "session",
      key: "track",
      label: "Track",
      kind: "select",
      required: true,
      options: ["Main stage", "Program craft", "Operations"],
    },
    {
      id: "field-level",
      sectionId: "session",
      key: "level",
      label: "Level",
      kind: "select",
      required: false,
      options: ["Introductory", "Intermediate", "Advanced"],
    },
    {
      id: "field-language",
      sectionId: "session",
      key: "language",
      label: "Language",
      kind: "select",
      required: false,
      options: ["English"],
    },
  ],
  participantFields: [
    {
      id: "participant-first-name",
      sectionId: "people",
      key: "firstName",
      label: "First name",
      kind: "text",
      required: true,
      options: [],
    },
    {
      id: "participant-last-name",
      sectionId: "people",
      key: "lastName",
      label: "Last name",
      kind: "text",
      required: true,
      options: [],
    },
    {
      id: "participant-email",
      sectionId: "people",
      key: "email",
      label: "Email",
      kind: "email",
      required: true,
      options: [],
    },
    {
      id: "participant-phone",
      sectionId: "people",
      key: "phone",
      label: "Mobile phone",
      kind: "text",
      required: false,
      options: [],
    },
    {
      id: "participant-biography",
      sectionId: "people",
      key: "biography",
      label: "Biography",
      kind: "rich_text",
      required: false,
      options: [],
    },
  ],
  rules: [],
};

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function localTimestamp(iso) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: agenda.event.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

const roomIds = new Map();
const trackIds = new Map();
const speakerIds = new Map(speakers.speakers.map((speaker) => [speaker.displayName, speaker.id]));
const sessions = agenda.entries.map((entry) => ({
  id: `session_${slug(entry.id)}`,
  title: entry.title,
  status: "accepted",
  participantIds: entry.speakerNames.map((name) => speakerIds.get(name) ?? `speaker_${slug(name)}`),
  resourceIds: [],
  capacityRequired: 1,
  summary: entry.summary,
  format: entry.format,
  speakerNames: entry.speakerNames,
}));
const entries = agenda.entries.map((entry, index) => {
  const roomId = roomIds.get(entry.roomName) ?? `room_${slug(entry.roomName)}`;
  roomIds.set(entry.roomName, roomId);
  const entryTrackIds = entry.trackNames.map((name) => {
    const id = trackIds.get(name) ?? `track_${slug(name)}`;
    trackIds.set(name, id);
    return id;
  });
  return {
    ...entry,
    sessionId: sessions[index].id,
    roomId,
    trackIds: entryTrackIds,
    startsAtLocal: localTimestamp(entry.startsAt),
    endsAtLocal: localTimestamp(entry.endsAt),
    timeZone: agenda.event.timeZone,
  };
});
const revision = {
  id: agenda.revision.id,
  eventId,
  revisionNumber: agenda.revision.number,
  sourceDraftVersion: agenda.revision.number,
  timeZone: agenda.event.timeZone,
  entries,
  warningOverrides: [],
  publishedAt: agenda.revision.publishedAt,
  publishedBy: "Open Sessionboard demo organizer",
  rollbackOfRevisionId: null,
  event: agenda.event,
};
const agendaState = {
  eventId,
  stateVersion: agenda.revision.number,
  timeZone: agenda.event.timeZone,
  minimumTravelMinutes: 10,
  sessions,
  rooms: [...roomIds].map(([name, id]) => ({ id, name, capacity: 500 })),
  tracks: [...trackIds].map(([name, id]) => ({ id, name })),
  draft: {
    eventId,
    version: agenda.revision.number,
    timeZone: agenda.event.timeZone,
    entries,
    warningOverrides: [],
    updatedAt: agenda.revision.publishedAt,
    updatedBy: "Open Sessionboard demo organizer",
  },
  revisions: [revision],
  currentPublishedRevisionId: revision.id,
  outbox: [],
  audit: [],
};
const speakerProjection = {
  id: `published-speakers:${eventId}:${speakers.revision.id}`,
  organizationId,
  ...speakers,
};

const targets = [
  {
    table: "Events",
    id: eventId,
    fields: {
      "Application ID": eventId,
      Name: event.name,
      Slug: event.slug,
      Status: "open",
      "Settings JSON": JSON.stringify(event),
      "Time Zone": event.timezone,
      Version: event.version,
    },
  },
  {
    table: "CFP Forms",
    id: formId,
    fields: {
      "Application ID": formId,
      Name: form.name,
      Status: form.status,
      Description: form.welcomeContent,
      "Fields JSON": JSON.stringify(form),
      Version: form.version,
    },
  },
  {
    table: "Agenda Versions",
    id: eventId,
    fields: {
      "Application ID": eventId,
      "Agenda ID": eventId,
      Number: revision.revisionNumber,
      Status: "published",
      "Conflicts JSON": JSON.stringify(agendaState),
      "Published At": revision.publishedAt,
    },
  },
  {
    table: "Published Speaker Projections",
    id: speakerProjection.id,
    fields: {
      "Application ID": speakerProjection.id,
      "Organization ID": organizationId,
      "Event Slug": eventId,
      "Revision ID": speakers.revision.id,
      "Revision Number": speakers.revision.number,
      "Published At": speakers.revision.publishedAt,
      "Projection JSON": JSON.stringify(speakerProjection),
    },
  },
];

async function airtable(table, path = "", init = {}) {
  const response = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init.headers,
      },
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Airtable ${table} request failed with HTTP ${response.status}.`);
  }
  return body;
}

async function upsert(target) {
  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{Application ID}="${target.id}"`,
  });
  const current = await airtable(target.table, `?${query}`);
  const records = Array.isArray(current.records) ? current.records : [];
  if (records.length > 1) {
    throw new Error(`Duplicate Application ID ${target.id} in ${target.table}.`);
  }
  const existing = records[0];
  const action = existing ? "update" : "create";
  if (!dryRun) {
    await airtable(target.table, existing ? `/${existing.id}` : "", {
      method: existing ? "PATCH" : "POST",
      body: JSON.stringify({ fields: target.fields, typecast: true }),
    });
  }
  return { table: target.table, applicationId: target.id, action };
}

const results = [];
for (const target of targets) {
  results.push(await upsert(target));
}
console.log(JSON.stringify({ dryRun, organizationId, eventId, results }, null, 2));
