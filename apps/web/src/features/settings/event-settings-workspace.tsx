"use client";

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "../admin/admin-shell.module.css";
import {
  createEventSettingsApi,
  defaultAgendaEligibleStatuses,
  defaultSessionStatuses,
  type EventRoom,
  type EventSettingsApi,
  EventSettingsApiError,
  type EventSettingsAuditEntry,
  type EventSettingsData,
  type EventSettingsResourceKind,
  type EventTaxonomyResource,
  type RoomInput,
  type SessionSettingsRecord,
  type TaxonomyInput,
} from "./api";

const stackStyle: CSSProperties = { display: "grid", gap: "1rem" };
const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
  gap: "1rem",
};
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const fieldLabelStyle: CSSProperties = {
  color: "var(--admin-ink)",
  fontSize: "0.78rem",
  fontWeight: 750,
};
const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: "2.55rem",
  padding: "0.55rem 0.65rem",
  border: "1px solid var(--admin-border-strong)",
  borderRadius: "var(--admin-radius-sm)",
  background: "var(--admin-surface)",
  color: "var(--admin-ink)",
  font: "inherit",
  fontSize: "0.84rem",
};
const inlineActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.55rem",
  alignItems: "center",
};
const listStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
  padding: 0,
  margin: 0,
  listStyle: "none",
};
const cardStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  padding: "0.95rem 1rem",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  background: "var(--admin-canvas)",
};
const subtleTextStyle: CSSProperties = {
  color: "var(--admin-muted)",
  fontSize: "0.78rem",
  lineHeight: 1.5,
};

export type EventSettingsWorkspaceState =
  | { readonly status: "loading" }
  | { readonly status: "error" | "config-error"; readonly message: string }
  | { readonly status: "loaded"; readonly data: EventSettingsData };

export interface EventSettingsWorkspaceActions {
  updateSettings(input: {
    expectedVersion: number;
    statuses: readonly string[];
    agendaEligibleStatuses: readonly string[];
  }): Promise<void>;
  createRoom(input: RoomInput): Promise<void>;
  updateRoom(input: {
    roomId: string;
    expectedVersion: number;
    name: string;
    capacity: number;
    resources: readonly string[];
  }): Promise<void>;
  deleteRoom(roomId: string, expectedVersion: number): Promise<void>;
  createResource(kind: EventSettingsResourceKind, input: TaxonomyInput): Promise<void>;
  updateResource(
    kind: EventSettingsResourceKind,
    input: {
      resourceId: string;
      expectedVersion: number;
      name: string;
      description: string;
    },
  ): Promise<void>;
  deleteResource(
    kind: EventSettingsResourceKind,
    resourceId: string,
    expectedVersion: number,
  ): Promise<void>;
}

export interface EventSettingsWorkspaceViewProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly state: EventSettingsWorkspaceState;
  readonly busy?: boolean;
  readonly notice?: string | null;
  readonly actions?: Partial<EventSettingsWorkspaceActions>;
  readonly onRetry?: () => void;
}

function contextLabel(organizationId: string, eventId: string): string {
  return `Organization ${organizationId} · Event ${eventId}`;
}

function normalizedSettings(settings: SessionSettingsRecord): SessionSettingsRecord {
  return {
    ...settings,
    statuses: settings.statuses.length > 0 ? settings.statuses : [...defaultSessionStatuses],
    agendaEligibleStatuses:
      settings.agendaEligibleStatuses.length > 0
        ? settings.agendaEligibleStatuses
        : [...defaultAgendaEligibleStatuses],
  };
}

function normalizeData(
  data: EventSettingsData,
  organizationId: string,
  eventId: string,
): EventSettingsData {
  if (data.organizationId && data.organizationId !== organizationId) {
    throw new TypeError("The settings response belongs to a different organization.");
  }
  if (data.eventId && data.eventId !== eventId) {
    throw new TypeError("The settings response belongs to a different event.");
  }
  return {
    ...data,
    organizationId,
    eventId,
    settings: normalizedSettings(data.settings),
    rooms: data.rooms ?? [],
    tracks: data.tracks ?? [],
    formats: data.formats ?? [],
    levels: data.levels ?? [],
    tags: data.tags ?? [],
    audit: data.audit ?? [],
  };
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The event settings request could not be completed.";
}

export async function persistEventSettingsMutation(
  operation: () => Promise<void>,
  refresh: () => Promise<void>,
): Promise<"refreshed" | "refresh-failed"> {
  await operation();
  try {
    await refresh();
    return "refreshed";
  } catch {
    return "refresh-failed";
  }
}

function resourceTitle(kind: EventSettingsResourceKind): string {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`;
}

function resourceDescription(kind: EventSettingsResourceKind): string {
  switch (kind) {
    case "track":
      return "Group sessions for agenda views and filtering.";
    case "format":
      return "Describe how a session is delivered, such as a workshop or panel.";
    case "level":
      return "Help participants find sessions by experience level.";
    case "tag":
      return "Add flexible labels without changing the session status workflow.";
  }
}

function auditSummary(entry: EventSettingsAuditEntry): string {
  if (entry.entityType === "settings" && entry.action === "settings.updated") {
    return `Agenda eligibility and status settings updated to version ${entry.version}.`;
  }
  return `${entry.entityType} ${entry.action} at version ${entry.version}.`;
}

function SettingsGroupedNavigation(): ReactNode {
  return (
    <nav
      aria-label="Event settings sections"
      style={{ ...cardStyle, gap: "1.1rem", alignSelf: "start" }}
    >
      <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>Event settings</h2>
      <SettingsNavGroup
        title="Event setup"
        links={[
          { href: "#session-settings", label: "Sessions and statuses" },
          { href: "#rooms", label: "Rooms and capacity" },
        ]}
      />
      <SettingsNavGroup
        title="Library"
        links={[{ href: "#library", label: "Tracks, formats, levels, and tags" }]}
      />
      <SettingsNavGroup
        title="Communications"
        links={[{ href: "#communications", label: "Email and message settings" }]}
      />
      <SettingsNavGroup
        title="Calendar"
        links={[{ href: "#calendar", label: "Calendar delivery" }]}
      />
    </nav>
  );
}

function SettingsNavGroup({
  title,
  links,
}: Readonly<{ title: string; links: readonly { href: string; label: string }[] }>) {
  return (
    <section aria-labelledby={`settings-nav-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <h3
        id={`settings-nav-${title.toLowerCase().replaceAll(" ", "-")}`}
        style={{
          margin: "0 0 0.35rem",
          color: "var(--admin-subtle)",
          fontSize: "0.68rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h3>
      <ul style={{ display: "grid", gap: "0.25rem", padding: 0, margin: 0, listStyle: "none" }}>
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              style={{
                color: "var(--admin-brand-strong)",
                fontSize: "0.78rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface StatusRow {
  readonly id: string;
  readonly value: string;
}
function StatusSettingsForm({
  settings,
  busy,
  onSave,
}: Readonly<{
  settings: SessionSettingsRecord;
  busy: boolean;
  onSave: EventSettingsWorkspaceActions["updateSettings"];
}>) {
  const nextStatusRowId = useRef(0);
  const createStatusRows = useCallback(
    (values: readonly string[]): StatusRow[] =>
      values.map((value) => ({ id: `status-${nextStatusRowId.current++}`, value })),
    [],
  );
  const [statuses, setStatuses] = useState<StatusRow[]>(() => createStatusRows(settings.statuses));
  const [eligible, setEligible] = useState<string[]>([...settings.agendaEligibleStatuses]);
  const [newStatus, setNewStatus] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setStatuses(createStatusRows(settings.statuses));
    setEligible([...settings.agendaEligibleStatuses]);
  }, [createStatusRows, settings]);

  function changeStatus(id: string, value: string) {
    const previous = statuses.find((status) => status.id === id)?.value ?? "";
    setStatuses((current) =>
      current.map((status) => (status.id === id ? { ...status, value } : status)),
    );
    setEligible((current) => current.map((status) => (status === previous ? value : status)));
  }

  function addStatus() {
    const normalized = newStatus.trim();
    if (!normalized) {
      setFormError("Enter a status name before adding it.");
      return;
    }
    if (statuses.some((status) => status.value.toLowerCase() === normalized.toLowerCase())) {
      setFormError("Status names must be unique.");
      return;
    }
    const row: StatusRow = { id: `status-${nextStatusRowId.current++}`, value: normalized };
    setStatuses((current) => [...current, row]);
    setNewStatus("");
    setFormError(null);
  }

  function removeStatus(status: string) {
    if (statuses.length <= 1) {
      setFormError("Keep at least one status configured.");
      return;
    }
    setStatuses((current) => current.filter((candidate) => candidate.value !== status));
    setEligible((current) => current.filter((candidate) => candidate !== status));
  }

  function toggleEligibility(status: string) {
    setEligible((current) =>
      current.includes(status)
        ? current.filter((candidate) => candidate !== status)
        : [...current, status],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = statuses.map((status) => status.value.trim());
    if (cleaned.some((status) => status.length === 0)) {
      setFormError("Status names cannot be empty.");
      return;
    }
    if (new Set(cleaned.map((status) => status.toLowerCase())).size !== cleaned.length) {
      setFormError("Status names must be unique.");
      return;
    }
    if (eligible.length === 0) {
      setFormError("Choose at least one agenda-eligible status.");
      return;
    }
    setFormError(null);
    try {
      await onSave({
        expectedVersion: settings.version,
        statuses: cleaned,
        agendaEligibleStatuses: eligible,
      });
    } catch (error) {
      setFormError(messageFrom(error));
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} style={stackStyle}>
      <div style={twoColumnStyle}>
        <div style={stackStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: "0.98rem" }}>Session statuses</h3>
            <p style={subtleTextStyle}>
              Statuses are event-scoped. Changes are versioned and audited.
            </p>
          </div>
          <ul aria-label="Configured session statuses" style={listStyle}>
            {statuses.map((status, index) => (
              <li
                key={status.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <label style={fieldStyle}>
                  <span className={styles.srOnly}>Status {index + 1}</span>
                  <input
                    style={inputStyle}
                    value={status.value}
                    maxLength={64}
                    onChange={(event) => changeStatus(status.id, event.target.value)}
                  />
                </label>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => removeStatus(status.value)}
                  disabled={busy}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: "0.45rem", alignItems: "end" }}>
            <label style={{ ...fieldStyle, flex: 1 }}>
              <span style={fieldLabelStyle}>Add status</span>
              <input
                style={inputStyle}
                value={newStatus}
                maxLength={64}
                onChange={(event) => setNewStatus(event.target.value)}
              />
            </label>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={addStatus}
              disabled={busy}
            >
              Add
            </button>
          </div>
        </div>
        <fieldset style={{ ...cardStyle, gap: "0.65rem", margin: 0 }}>
          <legend style={{ padding: "0 0.35rem", fontSize: "0.86rem", fontWeight: 800 }}>
            Agenda eligibility
          </legend>
          <p style={{ ...subtleTextStyle, margin: 0 }}>
            Eligible sessions can be scheduled in the private agenda. Accepted is the default.
          </p>
          {statuses.map((status) => (
            <label
              key={status.id}
              style={{
                display: "flex",
                gap: "0.55rem",
                alignItems: "center",
                color: "var(--admin-ink)",
                fontSize: "0.82rem",
              }}
            >
              <input
                type="checkbox"
                checked={eligible.includes(status.value)}
                onChange={() => toggleEligibility(status.value)}
                disabled={busy}
              />
              <span>{status.value}</span>
            </label>
          ))}
        </fieldset>
      </div>
      {formError ? (
        <p
          role="alert"
          style={{ margin: 0, color: "var(--admin-danger)", fontSize: "0.8rem", fontWeight: 700 }}
        >
          {formError}
        </p>
      ) : null}
      <div style={inlineActionsStyle}>
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          {busy ? "Saving settings…" : "Save session settings"}
        </button>
        <span style={subtleTextStyle}>Version {settings.version}</span>
      </div>
    </form>
  );
}

export function parseRoomResources(value: string): { resources: string[]; error?: string } {
  if (value.trim() === "") return { resources: [] };
  const parts = value.split(",").map((part) => part.trim());
  if (parts.some((part) => part.length === 0))
    return { resources: [], error: "Resource names cannot be empty." };
  const seen = new Set<string>();
  for (const resource of parts) {
    const key = resource.toLowerCase();
    if (seen.has(key)) return { resources: [], error: "Resource names must be unique." };
    seen.add(key);
  }
  return { resources: parts };
}

export function validateRoomForm(
  name: string,
  capacity: string,
  resourcesText: string,
): { input?: RoomInput; error?: string } {
  const normalizedName = name.trim();
  if (!normalizedName) return { error: "Room name is required." };
  const parsedCapacity = Number(capacity);
  if (!Number.isSafeInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 1_000_000)
    return { error: "Room capacity must be between 1 and 1000000." };
  const parsedResources = parseRoomResources(resourcesText);
  if (parsedResources.error) return { error: parsedResources.error };
  return {
    input: { name: normalizedName, capacity: parsedCapacity, resources: parsedResources.resources },
  };
}
function roomRequestId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function") return `room-${randomUUID.call(globalThis.crypto)}`;
  return `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function RoomForm({
  room,
  busy,
  onSave,
  onCancel,
}: Readonly<{
  room?: EventRoom;
  busy: boolean;
  onSave(input: RoomInput): Promise<void>;
  onCancel?: () => void;
}>) {
  const createRoomId = useRef<string | null>(null);
  const [name, setName] = useState(room?.name ?? "");
  const [capacity, setCapacity] = useState(String(room?.capacity ?? ""));
  const [resourcesText, setResourcesText] = useState(
    (room?.resources ?? room?.resourceIds ?? []).join(", "),
  );
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(room?.name ?? "");
    setCapacity(String(room?.capacity ?? ""));
    setResourcesText((room?.resources ?? room?.resourceIds ?? []).join(", "));
    setFormError(null);
  }, [room]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateRoomForm(name, capacity, resourcesText);
    if (!result.input) {
      setFormError(result.error ?? "Check the room fields.");
      return;
    }
    setFormError(null);
    try {
      if (room) {
        await onSave(result.input);
        return;
      }
      const id = createRoomId.current ?? roomRequestId();
      createRoomId.current = id;
      await onSave({ ...result.input, id });
    } catch (error) {
      setFormError(messageFrom(error));
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      style={{ ...cardStyle, background: "var(--admin-surface)" }}
    >
      <div style={twoColumnStyle}>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Room name</span>
          <input
            style={inputStyle}
            value={name}
            maxLength={200}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Capacity</span>
          <input
            style={inputStyle}
            type="number"
            min={1}
            step={1}
            value={capacity}
            required
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
      </div>
      <label style={fieldStyle}>
        <span style={fieldLabelStyle}>Resources</span>
        <input
          style={inputStyle}
          value={resourcesText}
          placeholder="Projector, microphones"
          onChange={(event) => setResourcesText(event.target.value)}
        />
        <span style={subtleTextStyle}>
          Comma-separated resource names. Duplicate or blank names are rejected.
        </span>
      </label>
      {formError ? (
        <p
          role="alert"
          style={{ margin: 0, color: "var(--admin-danger)", fontSize: "0.8rem", fontWeight: 700 }}
        >
          {formError}
        </p>
      ) : null}
      <div style={inlineActionsStyle}>
        {onCancel ? (
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          {busy ? "Saving room…" : room ? "Save room" : "Add room"}
        </button>
      </div>
    </form>
  );
}

function RoomsSection({
  rooms,
  busy,
  actions,
}: Readonly<{
  rooms: readonly EventRoom[];
  busy: boolean;
  actions: Partial<EventSettingsWorkspaceActions>;
}>) {
  const [showForm, setShowForm] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const editingRoom = rooms.find((room) => room.id === editingRoomId);

  return (
    <section id="rooms" className={styles.panel} aria-labelledby="rooms-heading">
      <header className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Event setup</p>
          <h2 id="rooms-heading" className={styles.panelTitle}>
            Rooms, capacity, and resources
          </h2>
        </div>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => {
            setEditingRoomId(null);
            setShowForm((current) => !current);
          }}
          aria-expanded={showForm}
          aria-controls="room-form"
        >
          {showForm ? "Close form" : "Add room"}
        </button>
      </header>
      <div className={styles.panelContent} style={stackStyle}>
        {showForm ? (
          <div id="room-form">
            {actions.createRoom ? (
              <RoomForm
                busy={busy}
                onCancel={() => setShowForm(false)}
                onSave={async (input) => {
                  await actions.createRoom?.(input);
                  setShowForm(false);
                }}
              />
            ) : null}
          </div>
        ) : null}
        {editingRoom ? (
          <div id={`room-edit-${editingRoom.id}`}>
            {actions.updateRoom ? (
              <RoomForm
                room={editingRoom}
                busy={busy}
                onCancel={() => setEditingRoomId(null)}
                onSave={async (input) => {
                  await actions.updateRoom?.({
                    roomId: editingRoom.id,
                    expectedVersion: editingRoom.version,
                    ...input,
                    resources: input.resources ?? [],
                  });
                  setEditingRoomId(null);
                }}
              />
            ) : null}
          </div>
        ) : null}
        {rooms.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <strong>No rooms configured yet.</strong>
            <p style={{ ...subtleTextStyle, margin: "0.25rem 0 0" }}>
              Add a room with a capacity before scheduling accepted sessions.
            </p>
          </div>
        ) : (
          <ul aria-label="Event rooms" style={listStyle}>
            {rooms.map((room) => (
              <li key={room.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "start",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: "0.94rem" }}>{room.name}</h3>
                    <p style={{ ...subtleTextStyle, margin: "0.25rem 0 0" }}>
                      {room.capacity} seats · Version {room.version}
                    </p>
                  </div>
                  <div style={inlineActionsStyle}>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setShowForm(false);
                        setEditingRoomId((current) => (current === room.id ? null : room.id));
                      }}
                      aria-expanded={editingRoomId === room.id}
                      aria-controls={`room-edit-${room.id}`}
                    >
                      Edit
                    </button>
                    {actions.deleteRoom ? (
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        disabled={busy}
                        onClick={() => void actions.deleteRoom?.(room.id, room.version)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
                <p style={{ ...subtleTextStyle, margin: 0 }}>
                  <strong>Resources:</strong>{" "}
                  {room.resources?.length || room.resourceIds?.length
                    ? (room.resources ?? room.resourceIds ?? []).join(", ")
                    : "None configured"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TaxonomyForm({
  resource,
  busy,
  onSave,
  onCancel,
}: Readonly<{
  resource?: EventTaxonomyResource;
  busy: boolean;
  onSave(input: TaxonomyInput): Promise<void>;
  onCancel?: () => void;
}>) {
  const [name, setName] = useState(resource?.name ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setName(resource?.name ?? "");
    setDescription(resource?.description ?? "");
    setFormError(null);
  }, [resource]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setFormError(null);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
    } catch (error) {
      setFormError(messageFrom(error));
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      style={{ ...cardStyle, background: "var(--admin-surface)" }}
    >
      <div style={twoColumnStyle}>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Name</span>
          <input
            style={inputStyle}
            value={name}
            maxLength={200}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>Description</span>
          <input
            style={inputStyle}
            value={description}
            maxLength={2_000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>
      {formError ? (
        <p
          role="alert"
          style={{ margin: 0, color: "var(--admin-danger)", fontSize: "0.8rem", fontWeight: 700 }}
        >
          {formError}
        </p>
      ) : null}
      <div style={inlineActionsStyle}>
        {onCancel ? (
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          {busy ? "Saving…" : resource ? "Save changes" : "Add"}
        </button>
      </div>
    </form>
  );
}

function TaxonomySection({
  kind,
  resources,
  busy,
  actions,
}: Readonly<{
  kind: EventSettingsResourceKind;
  resources: readonly EventTaxonomyResource[];
  busy: boolean;
  actions: Partial<EventSettingsWorkspaceActions>;
}>) {
  const title = resourceTitle(kind);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = resources.find((resource) => resource.id === editingId);

  return (
    <section className={styles.panel} aria-labelledby={`${kind}-heading`}>
      <header className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Library</p>
          <h3 id={`${kind}-heading`} className={styles.panelTitle}>
            {title}
          </h3>
          <p style={{ ...subtleTextStyle, margin: "0.3rem 0 0" }}>{resourceDescription(kind)}</p>
        </div>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => {
            setEditingId(null);
            setShowForm((current) => !current);
          }}
          aria-expanded={showForm}
          aria-controls={`${kind}-form`}
        >
          {showForm ? "Close form" : `Add ${kind}`}
        </button>
      </header>
      <div className={styles.panelContent} style={stackStyle}>
        {showForm && actions.createResource ? (
          <div id={`${kind}-form`}>
            <TaxonomyForm
              busy={busy}
              onCancel={() => setShowForm(false)}
              onSave={async (input) => {
                await actions.createResource?.(kind, input);
                setShowForm(false);
              }}
            />
          </div>
        ) : null}
        {editing && actions.updateResource ? (
          <div id={`${kind}-edit-${editing.id}`}>
            <TaxonomyForm
              resource={editing}
              busy={busy}
              onCancel={() => setEditingId(null)}
              onSave={async (input) => {
                await actions.updateResource?.(kind, {
                  resourceId: editing.id,
                  expectedVersion: editing.version,
                  name: input.name,
                  description: input.description ?? "",
                });
                setEditingId(null);
              }}
            />
          </div>
        ) : null}
        {resources.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center" }}>
            <strong>No {kind}s configured yet.</strong>
            <p style={{ ...subtleTextStyle, margin: "0.25rem 0 0" }}>
              Use the add button to create the first event-scoped {kind}.
            </p>
          </div>
        ) : (
          <ul aria-label={`Event ${title.toLowerCase()}`} style={listStyle}>
            {resources.map((resource) => (
              <li key={resource.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "start",
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: "0.9rem" }}>{resource.name}</h4>
                    {resource.description ? (
                      <p style={{ ...subtleTextStyle, margin: "0.25rem 0 0" }}>
                        {resource.description}
                      </p>
                    ) : null}
                    <small style={{ ...subtleTextStyle, display: "block", marginTop: "0.25rem" }}>
                      Version {resource.version}
                    </small>
                  </div>
                  <div style={inlineActionsStyle}>
                    {actions.updateResource ? (
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setShowForm(false);
                          setEditingId((current) => (current === resource.id ? null : resource.id));
                        }}
                        aria-expanded={editingId === resource.id}
                        aria-controls={`${kind}-edit-${resource.id}`}
                      >
                        Edit
                      </button>
                    ) : null}
                    {actions.deleteResource ? (
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void actions.deleteResource?.(kind, resource.id, resource.version)
                        }
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AuditSection({ audit }: Readonly<{ audit: readonly EventSettingsAuditEntry[] }>) {
  return (
    <section className={styles.panel} aria-labelledby="audit-heading">
      <header className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Safety and history</p>
          <h2 id="audit-heading" className={styles.panelTitle}>
            Settings audit history
          </h2>
        </div>
      </header>
      <div className={styles.panelContent}>
        {audit.length === 0 ? (
          <p style={{ ...subtleTextStyle, margin: 0 }}>
            No settings changes have been audited for this event yet.
          </p>
        ) : (
          <ol aria-label="Settings audit history" style={{ ...listStyle, listStyleType: "none" }}>
            {audit.map((entry) => (
              <li
                key={entry.id}
                style={{ ...cardStyle, gridTemplateColumns: "minmax(0, 1fr) auto" }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "0.8rem" }}>
                    {auditSummary(entry)}
                  </strong>
                  <span style={subtleTextStyle}>
                    {entry.entityId} · actor {entry.actorId}
                  </span>
                </div>
                <time
                  dateTime={entry.occurredAt}
                  style={{ ...subtleTextStyle, whiteSpace: "nowrap" }}
                >
                  {new Date(entry.occurredAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function InformationalGroup({
  id,
  title,
  description,
  detail,
}: Readonly<{ id: string; title: string; description: string; detail: string }>) {
  return (
    <section id={id} className={styles.panel} aria-labelledby={`${id}-heading`}>
      <header className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Event settings</p>
          <h2 id={`${id}-heading`} className={styles.panelTitle}>
            {title}
          </h2>
        </div>
      </header>
      <div className={styles.panelContent}>
        <p style={{ margin: 0, color: "var(--admin-ink)", fontSize: "0.86rem", lineHeight: 1.55 }}>
          {description}
        </p>
        <p style={{ ...subtleTextStyle, margin: "0.55rem 0 0" }}>{detail}</p>
      </div>
    </section>
  );
}

export function EventSettingsWorkspaceView({
  organizationId,
  eventId,
  state,
  busy = false,
  notice = null,
  actions = {},
  onRetry,
}: EventSettingsWorkspaceViewProps) {
  const data = state.status === "loaded" ? state.data : null;
  return (
    <main id="event-settings-content" tabIndex={-1}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Event setup</p>
          <h1 className={styles.pageTitle}>Event settings</h1>
          <p className={styles.pageDescription}>
            Configure the program vocabulary, scheduling rules, and operational groups for this
            event.
          </p>
          <p style={{ ...subtleTextStyle, margin: "0.7rem 0 0" }}>
            {contextLabel(organizationId, eventId)}
          </p>
        </div>
      </header>
      {state.status === "error" || state.status === "config-error" ? (
        <div
          role="alert"
          className={styles.callout}
          style={{
            marginBottom: "1.25rem",
            borderColor: "#f2c9c7",
            background: "var(--admin-danger-soft)",
          }}
        >
          <div>
            <strong>Event settings unavailable</strong>
            <p>{state.message}</p>
            {onRetry ? (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={onRetry}
                style={{ marginTop: "0.7rem" }}
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className={styles.dashboardGrid}
        style={{ gridTemplateColumns: "minmax(13rem, 0.34fr) minmax(0, 1fr)" }}
      >
        <SettingsGroupedNavigation />
        <div style={stackStyle}>
          <div className={styles.srOnly} role="status" aria-live="polite">
            {notice}
          </div>
          {notice ? (
            <div
              role="status"
              aria-live="polite"
              className={styles.callout}
              style={{ marginBottom: "1rem" }}
            >
              {notice}
            </div>
          ) : null}
          {state.status === "loading" && !data ? (
            <section className={styles.panel} aria-live="polite" aria-busy="true">
              <div className={styles.panelContent}>
                <h2 className={styles.panelTitle}>Loading event settings</h2>
                <p style={subtleTextStyle}>
                  Retrieving event-scoped statuses, rooms, and library values.
                </p>
              </div>
            </section>
          ) : null}
          {data ? (
            <>
              <section
                id="session-settings"
                className={styles.panel}
                aria-labelledby="session-settings-heading"
              >
                <header className={styles.panelHeader}>
                  <div className={styles.panelHeading}>
                    <p className={styles.panelEyebrow}>Event setup</p>
                    <h2 id="session-settings-heading" className={styles.panelTitle}>
                      Session settings
                    </h2>
                    <p style={{ ...subtleTextStyle, margin: "0.3rem 0 0" }}>
                      Set statuses and decide which statuses are eligible for the private agenda.
                    </p>
                  </div>
                </header>
                <div className={styles.panelContent}>
                  {actions.updateSettings ? (
                    <StatusSettingsForm
                      settings={data.settings}
                      busy={busy}
                      onSave={actions.updateSettings}
                    />
                  ) : (
                    <div style={stackStyle}>
                      <p style={{ ...subtleTextStyle, margin: 0 }}>
                        Settings are read-only until the organizer API is connected.
                      </p>
                      <p style={{ ...subtleTextStyle, margin: 0 }}>
                        <strong>Configured statuses:</strong> {data.settings.statuses.join(", ")}
                      </p>
                      <p style={{ ...subtleTextStyle, margin: 0 }}>
                        <strong>Agenda-eligible:</strong>{" "}
                        {data.settings.agendaEligibleStatuses.join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              </section>
              <RoomsSection rooms={data.rooms} busy={busy} actions={actions} />
              <section id="library" aria-labelledby="library-heading" style={stackStyle}>
                <div>
                  <p className={styles.eyebrow}>Library</p>
                  <h2 id="library-heading" className={styles.sectionTitle}>
                    Program library
                  </h2>
                  <p style={{ ...subtleTextStyle, margin: "0.35rem 0 0" }}>
                    Event-scoped values keep the event vocabulary predictable without crossing
                    organization boundaries.
                  </p>
                </div>
                <div style={twoColumnStyle}>
                  <TaxonomySection
                    kind="track"
                    resources={data.tracks}
                    busy={busy}
                    actions={actions}
                  />
                  <TaxonomySection
                    kind="format"
                    resources={data.formats}
                    busy={busy}
                    actions={actions}
                  />
                  <TaxonomySection
                    kind="level"
                    resources={data.levels}
                    busy={busy}
                    actions={actions}
                  />
                  <TaxonomySection kind="tag" resources={data.tags} busy={busy} actions={actions} />
                </div>
              </section>
              <InformationalGroup
                id="communications"
                title="Communications"
                description="Keep event communications organized around approved, event-scoped messages."
                detail="Transactional templates and recipient groups are managed in the Communications workspace. This settings page does not send messages."
              />
              <InformationalGroup
                id="calendar"
                title="Calendar"
                description="Calendar delivery follows the published agenda and the event timezone."
                detail="Calendar invitations are generated only from published agenda changes. Draft settings never leak to public or participant calendar feeds."
              />
              <AuditSection audit={data.audit} />
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export interface EventSettingsWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly api?: EventSettingsApi;
  readonly initialData?: EventSettingsData;
}

export function EventSettingsWorkspace({
  organizationId,
  eventId,
  api: providedApi,
  initialData,
}: EventSettingsWorkspaceProps) {
  const [state, setState] = useState<EventSettingsWorkspaceState>(() => {
    if (initialData) {
      try {
        return { status: "loaded", data: normalizeData(initialData, organizationId, eventId) };
      } catch (error) {
        return { status: "config-error", message: messageFrom(error) };
      }
    }
    return { status: "loading" };
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const api = useMemo(() => {
    if (providedApi) return providedApi;
    try {
      return createEventSettingsApi("", organizationId);
    } catch {
      return null;
    }
  }, [organizationId, providedApi]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestVersion.current;
      if (!organizationId.trim() || !eventId.trim()) {
        if (requestId === requestVersion.current) {
          setState({
            status: "config-error",
            message: "An organization and event context are required.",
          });
        }
        return;
      }
      if (!api) {
        if (requestId === requestVersion.current) {
          setState({
            status: "config-error",
            message: "The organizer API URL is not configured for event settings.",
          });
        }
        return;
      }
      setState((current) => (current.status === "loaded" ? current : { status: "loading" }));
      setNotice(null);
      try {
        const loaded = await api.getOverview(eventId, signal);
        if (!signal?.aborted && requestId === requestVersion.current) {
          setState({ status: "loaded", data: normalizeData(loaded, organizationId, eventId) });
        }
      } catch (error) {
        if (
          !(error instanceof DOMException && error.name === "AbortError") &&
          !signal?.aborted &&
          requestId === requestVersion.current
        ) {
          setState({ status: "error", message: messageFrom(error) });
        }
      }
    },
    [api, eventId, organizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const currentData = state.status === "loaded" ? state.data : null;

  const refresh = useCallback(async () => {
    const requestId = ++requestVersion.current;
    if (!api) throw new TypeError("The organizer API URL is not configured for event settings.");
    const loaded = await api.getOverview(eventId);
    if (requestId === requestVersion.current) {
      setState({ status: "loaded", data: normalizeData(loaded, organizationId, eventId) });
    }
  }, [api, eventId, organizationId]);

  async function mutate(operation: () => Promise<void>, successMessage: string): Promise<void> {
    if (!currentData) return;
    if (!api) {
      const error = new TypeError("The organizer API URL is not configured for event settings.");
      setNotice(`Unable to complete this change. ${error.message}`);
      throw error;
    }
    requestVersion.current += 1;
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await persistEventSettingsMutation(operation, refresh);
      setNotice(
        outcome === "refreshed"
          ? successMessage
          : `${successMessage} The saved change could not be refreshed; reload to see the latest settings.`,
      );
    } catch (error) {
      const message =
        error instanceof EventSettingsApiError && error.code === "VERSION_CONFLICT"
          ? "This event settings record changed in another organizer session. Reload before saving again."
          : messageFrom(error);
      try {
        await refresh();
      } catch {
        // Keep the loaded state and original mutation error when the recovery read is unavailable.
      }
      setNotice(`Unable to complete this change. ${message}`);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  const actions: EventSettingsWorkspaceActions = {
    updateSettings: async (input) => {
      await mutate(async () => {
        if (!api) return;
        await api.updateSettings(eventId, input);
      }, "Session settings saved and the change was audited.");
    },
    createRoom: async (input) => {
      await mutate(async () => {
        if (!api) return;
        await api.createRoom(eventId, input);
      }, "Room created.");
    },
    updateRoom: async (input) => {
      await mutate(async () => {
        if (!api) return;
        await api.updateRoom(eventId, input);
      }, "Room updated.");
    },
    deleteRoom: async (roomId, expectedVersion) => {
      await mutate(async () => {
        if (!api) return;
        await api.deleteRoom(eventId, roomId, expectedVersion);
      }, "Room deleted.");
    },
    createResource: async (kind, input) => {
      await mutate(
        async () => {
          if (!api) return;
          await api.createResource(eventId, kind, input);
        },
        `${kind.charAt(0).toUpperCase() + kind.slice(1)} created.`,
      );
    },
    updateResource: async (kind, input) => {
      await mutate(
        async () => {
          if (!api) return;
          await api.updateResource(eventId, kind, input);
        },
        `${kind.charAt(0).toUpperCase() + kind.slice(1)} updated.`,
      );
    },
    deleteResource: async (kind, resourceId, expectedVersion) => {
      await mutate(
        async () => {
          if (!api) return;
          await api.deleteResource(eventId, kind, resourceId, expectedVersion);
        },
        `${kind.charAt(0).toUpperCase() + kind.slice(1)} deleted.`,
      );
    },
  };

  return (
    <EventSettingsWorkspaceView
      organizationId={organizationId}
      eventId={eventId}
      state={state}
      busy={busy}
      notice={notice}
      actions={actions}
      onRetry={() => void load()}
    />
  );
}
