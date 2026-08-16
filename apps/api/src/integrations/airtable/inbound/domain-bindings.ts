import type { Session, SessionRepository } from "../../../features/sessions/types";
import type {
  AirtableConflictDomainCommandBinding,
  AirtableConflictDomainCommandInput,
} from "../conflicts/runtime";
import type {
  AirtableInboundDomainCommands,
  AirtableInboundFieldSnapshot,
  AirtableInboundTranslator,
  AirtableInboundTranslatorRegistry,
} from "./change-worker";

const fields = ["title", "description", "roomId", "trackId", "tagIds"] as const;
type Field = (typeof fields)[number];

export interface AirtableSessionInboundDependencies {
  readonly repository: SessionRepository & Required<Pick<SessionRepository, "commit">>;
  readonly resolveEventId: (input: {
    organizationId: string;
    sessionId: string;
  }) => Promise<string | null>;
  readonly now?: () => Date;
}

export function createAirtableSessionInboundBindings(
  dependencies: AirtableSessionInboundDependencies,
): {
  readonly translators: AirtableInboundTranslatorRegistry;
  readonly domainCommands: AirtableInboundDomainCommands;
  readonly conflictBindings: readonly AirtableConflictDomainCommandBinding[];
} {
  const domainCommands: AirtableInboundDomainCommands = {
    readField: (input) =>
      read(dependencies, input.organizationId, input.applicationId, input.fieldId),
    applyValue: (input) =>
      apply(dependencies, input.organizationId, input.applicationId, input.fieldId, input),
  };
  return {
    translators: {
      get: (entityType, fieldId) =>
        entityType === "session" && isField(fieldId) ? translator(fieldId) : null,
    },
    domainCommands,
    conflictBindings: fields.map((field) => ({
      entityType: "session",
      fieldId: field,
      applyValue: (input) => applyConflict(dependencies, field, input),
    })),
  };
}

function translator(field: Field): AirtableInboundTranslator {
  return {
    async translate(input) {
      const valueJson = JSON.stringify(parse(field, JSON.stringify(input.sourceValue)));
      return { valueJson, valueHash: await sha256(valueJson) };
    },
  };
}

async function applyConflict(
  dependencies: AirtableSessionInboundDependencies,
  field: Field,
  input: AirtableConflictDomainCommandInput,
) {
  const result = await apply(dependencies, input.organizationId, input.applicationId, field, {
    commandId: input.commandId,
    valueJson: input.valueJson,
    expectedVersion: input.expectedVersion,
  });
  return result.kind === "applied"
    ? { kind: "applied" as const, version: result.version }
    : { kind: "version_conflict" as const, currentVersion: result.current.version };
}

async function read(
  dependencies: AirtableSessionInboundDependencies,
  organizationId: string,
  sessionId: string,
  fieldId: string,
): Promise<AirtableInboundFieldSnapshot> {
  if (!isField(fieldId)) throw new Error(`Unsupported session field: ${fieldId}`);
  const eventId = await dependencies.resolveEventId({ organizationId, sessionId });
  if (eventId === null) throw new Error("Session event scope was not found.");
  return snapshot(
    await dependencies.repository.getSession(organizationId, eventId, sessionId),
    fieldId,
  );
}

async function apply(
  dependencies: AirtableSessionInboundDependencies,
  organizationId: string,
  sessionId: string,
  fieldId: string,
  command: { commandId: string; valueJson: string; expectedVersion: number },
) {
  if (!isField(fieldId)) throw new Error(`Unsupported session field: ${fieldId}`);
  const eventId = await dependencies.resolveEventId({ organizationId, sessionId });
  if (eventId === null) throw new Error("Session event scope was not found.");
  const current = await dependencies.repository.getSession(organizationId, eventId, sessionId);
  if (current === null || current.version !== command.expectedVersion)
    return { kind: "version_conflict" as const, current: await snapshot(current, fieldId) };
  const audit = await dependencies.repository.listAudit(organizationId, eventId, sessionId);
  if (audit.some((entry) => entry.id === command.commandId))
    return { kind: "applied" as const, version: current.version };
  const next = mutate(current, fieldId, parse(fieldId, command.valueJson));
  try {
    await dependencies.repository.commit({
      operation: "putSession",
      value: next,
      expectedVersion: current.version,
      audit: {
        id: command.commandId,
        tenantId: organizationId,
        eventId,
        entityType: "session",
        entityId: sessionId,
        action: "updated",
        version: next.version,
        actorId: "airtable",
        occurredAt: (dependencies.now ?? (() => new Date()))().toISOString(),
        before: current,
        after: next,
      },
    });
    return { kind: "applied" as const, version: next.version };
  } catch {
    return {
      kind: "version_conflict" as const,
      current: await snapshot(
        await dependencies.repository.getSession(organizationId, eventId, sessionId),
        fieldId,
      ),
    };
  }
}

function parse(field: Field, valueJson: string): unknown {
  const value: unknown = JSON.parse(valueJson);
  if (field === "title") {
    if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 300)
      throw new Error("Invalid session title.");
    return value.trim();
  }
  if (field === "description") {
    if (typeof value !== "string" || value.length > 20_000)
      throw new Error("Invalid session description.");
    return value;
  }
  if (field === "roomId" || field === "trackId") {
    if (value !== null && (typeof value !== "string" || value.length === 0))
      throw new Error(`Invalid ${field}.`);
    return value;
  }
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    value.some((item) => typeof item !== "string" || item.length === 0) ||
    new Set(value).size !== value.length
  )
    throw new Error("Invalid tagIds.");
  return value;
}

function mutate(session: Session, field: Field, value: unknown): Session {
  const next = { ...session, version: session.version + 1 };
  if (field === "title") return { ...next, title: value as string };
  if (field === "description") return { ...next, description: value as string };
  if (field === "roomId")
    return value === null ? omit(next, "roomId") : { ...next, roomId: value as string };
  if (field === "trackId")
    return value === null
      ? { ...omit(next, "trackId"), trackIds: [] }
      : { ...next, trackId: value as string, trackIds: [value as string] };
  return { ...next, tagIds: value as string[] };
}

async function snapshot(
  session: Session | null,
  field: Field,
): Promise<AirtableInboundFieldSnapshot> {
  const value =
    session === null
      ? null
      : field === "roomId" || field === "trackId"
        ? (session[field] ?? null)
        : session[field];
  const valueJson = JSON.stringify(value);
  return { version: session?.version ?? 0, valueJson, valueHash: await sha256(valueJson) };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function isField(value: string): value is Field {
  return (fields as readonly string[]).includes(value);
}
