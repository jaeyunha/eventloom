"use client";

import { ChevronRight, MoreHorizontal, Pencil, Search, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { SettingGroup, SettingRow, SettingsShell } from "@/components/workspace/settings-ui";
import {
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
} from "@/components/workspace/workspace-ui";
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
import {
  eventSettingsAuditDiff,
  eventSettingsAuditPresentation,
  settingsOnlyAuditEntries,
} from "./event-settings-audit";
import {
  type EventSettingsSection,
  eventSettingsSectionDefinition,
  eventSettingsSectionHref,
  eventSettingsSections,
} from "./event-settings-sections";
import styles from "./event-settings-workspace.module.css";

export type EventSettingsDetailsStatus = "loading" | "loaded" | "error";

export type EventSettingsWorkspaceState =
  | { readonly status: "loading" }
  | { readonly status: "error" | "config-error"; readonly message: string }
  | {
      readonly status: "loaded";
      readonly data: EventSettingsData;
      readonly detailsStatus?: EventSettingsDetailsStatus;
      readonly detailsMessage?: string;
    };

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
  readonly section?: EventSettingsSection;
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

export function canCommitEventSettingsAsyncCompletion(
  requestId: number,
  currentRequestId: number,
  mounted: boolean,
  aborted = false,
): boolean {
  return mounted && !aborted && requestId === currentRequestId;
}

export async function loadEventSettingsProgressively(
  api: EventSettingsApi,
  organizationId: string,
  eventId: string,
  onCore: (data: EventSettingsData) => void,
  signal?: AbortSignal,
): Promise<EventSettingsData> {
  const corePromise = Promise.all([
    api.getSettings(eventId, signal),
    api.listRooms(eventId, signal),
  ]);
  const detailsResultPromise = Promise.all([
    api.listTracks(eventId, signal),
    api.listFormats(eventId, signal),
    api.listLevels(eventId, signal),
    api.listTags(eventId, signal),
    api.listAudit(eventId, undefined, signal),
  ]).then(
    ([tracks, formats, levels, tags, audit]) => ({
      status: "loaded" as const,
      tracks,
      formats,
      levels,
      tags,
      audit,
    }),
    (error: unknown) => ({ status: "error" as const, error }),
  );

  const [settings, rooms] = await corePromise;
  const core = normalizeData(
    {
      organizationId,
      eventId,
      settings,
      rooms,
      tracks: [],
      formats: [],
      levels: [],
      tags: [],
      audit: [],
    },
    organizationId,
    eventId,
  );
  onCore(core);

  const detailsResult = await detailsResultPromise;
  if (detailsResult.status === "error") throw detailsResult.error;
  return {
    ...core,
    tracks: detailsResult.tracks,
    formats: detailsResult.formats,
    levels: detailsResult.levels,
    tags: detailsResult.tags,
    audit: detailsResult.audit,
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
      return "Primary topic or program stream. Use one track per session.";
    case "format":
      return "How the session is delivered, such as a workshop or panel.";
    case "level":
      return "The experience level participants should expect.";
    case "tag":
      return "Optional labels for flexible filtering, such as Hands-on or Remote.";
  }
}

function resourceGuidance(kind: EventSettingsResourceKind): string {
  switch (kind) {
    case "track":
      return "Recommended";
    case "format":
      return "Recommended";
    case "level":
      return "Recommended";
    case "tag":
      return "Optional";
  }
}

export const eventSettingsSectionNavigation = eventSettingsSections;

function navigationGroupId(prefix: string, group: string): string {
  return `${prefix}-${group.toLowerCase().replaceAll(" ", "-")}`;
}
function SettingsSectionNavigation({
  organizationId,
  eventId,
  section = "workflow",
}: Readonly<{
  organizationId: string;
  eventId: string;
  section: EventSettingsSection;
}>) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups = useMemo(() => {
    const grouped = new Map<string, (typeof eventSettingsSections)[number][]>();
    for (const item of eventSettingsSectionNavigation) {
      const current = grouped.get(item.group) ?? [];
      current.push(item);
      grouped.set(item.group, current);
    }
    return [...grouped.entries()];
  }, []);
  const active = eventSettingsSectionDefinition(section);

  const links = (items: readonly (typeof eventSettingsSections)[number][]) => (
    <ul className={styles.navigationList}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            className={`${styles.navigationLink} ${section === item.id ? styles.navigationLinkActive : ""}`}
            href={eventSettingsSectionHref(organizationId, eventId, item.id)}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => setMobileOpen(false)}
          >
            <item.icon className={styles.navigationIcon} aria-hidden />
            <span className={styles.navigationLinkCopy}>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={styles.navigationWrapper}>
      <aside className={styles.desktopNavigation} aria-label="Event settings sections">
        <div className={styles.navigationHeader}>
          <p className={styles.navigationEyebrow}>Event settings</p>
          <h2 className={styles.navigationTitle}>Configure this event</h2>
        </div>
        {groups.map(([group, items]) => (
          <section
            key={group}
            className={styles.navigationGroup}
            aria-labelledby={navigationGroupId("settings-nav", group)}
          >
            <h2
              id={navigationGroupId("settings-nav", group)}
              className={styles.navigationGroupTitle}
            >
              {group}
            </h2>
            {links(items)}
          </section>
        ))}
      </aside>
      <Collapsible
        className={styles.mobileNavigation}
        open={mobileOpen}
        onOpenChange={setMobileOpen}
      >
        <CollapsibleTrigger asChild>
          <Button
            className={styles.mobileNavigationTrigger}
            variant="ghost"
            type="button"
            aria-label="Choose event settings section"
          >
            <span className={styles.mobileNavigationLabel}>Event settings</span>
            <strong>{active.shortLabel}</strong>
            <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className={styles.mobileNavigationContent}>
          {groups.map(([group, items]) => (
            <section
              key={group}
              className={styles.navigationGroup}
              aria-labelledby={navigationGroupId("mobile-settings-nav", group)}
            >
              <h2
                id={navigationGroupId("mobile-settings-nav", group)}
                className={styles.navigationGroupTitle}
              >
                {group}
              </h2>
              {links(items)}
            </section>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
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
  readOnly = false,
}: Readonly<{
  settings: SessionSettingsRecord;
  busy: boolean;
  onSave?: EventSettingsWorkspaceActions["updateSettings"];
  readOnly?: boolean;
}>) {
  const disabled = busy || readOnly;
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
  const cleanedStatuses = statuses.map(({ value }) => value.trim());
  const normalizedEligible = cleanedStatuses.filter((status) => eligible.includes(status));
  const normalizedEligibleSet = new Set(normalizedEligible);
  const dirty =
    cleanedStatuses.join("\u0000") !== settings.statuses.join("\u0000") ||
    normalizedEligible.length !== settings.agendaEligibleStatuses.length ||
    settings.agendaEligibleStatuses.some((status) => !normalizedEligibleSet.has(status));

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

  function toggleEligibility(status: string, checked: boolean) {
    setEligible((current) =>
      checked
        ? current.includes(status)
          ? current
          : [...current, status]
        : current.filter((candidate) => candidate !== status),
    );
  }

  function resetChanges() {
    setStatuses(createStatusRows(settings.statuses));
    setEligible([...settings.agendaEligibleStatuses]);
    setNewStatus("");
    setFormError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = cleanedStatuses;
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
      if (!onSave) return;
      await onSave({
        expectedVersion: settings.version,
        statuses: cleaned,
        agendaEligibleStatuses: normalizedEligible,
      });
    } catch (error) {
      setFormError(messageFrom(error));
    }
  }

  return (
    <form className={styles.settingsForm} onSubmit={(event) => void submit(event)}>
      {readOnly ? (
        <p className={styles.capabilityNote}>
          Session status editing is unavailable until the organizer API capability is connected.
        </p>
      ) : null}
      <p className="sr-only">Configured session statuses and agenda eligibility</p>
      <ul className={styles.settingRows} aria-label="Configured session statuses">
        {statuses.map((status, index) => {
          const statusInputId = `${status.id}-value`;
          const checkboxId = `${status.id}-agenda`;
          const statusLabel = status.value || `Status ${index + 1}`;
          return (
            <SettingRow
              key={status.id}
              label={
                <>
                  <Label className="sr-only" htmlFor={statusInputId}>
                    Status {index + 1}
                  </Label>
                  <Input
                    className={styles.statusNameInput}
                    id={statusInputId}
                    value={status.value}
                    maxLength={64}
                    disabled={disabled}
                    onChange={(event) => changeStatus(status.id, event.target.value)}
                  />
                </>
              }
              description="Used to organize sessions through the review and scheduling workflow."
              controls={
                <>
                  <Label className={styles.checkboxLabel} htmlFor={checkboxId}>
                    <Checkbox
                      id={checkboxId}
                      checked={eligible.includes(status.value)}
                      disabled={disabled}
                      aria-label={`Can ${statusLabel} appear on the private agenda`}
                      onCheckedChange={(checked) =>
                        toggleEligibility(status.value, checked === true)
                      }
                    />
                    <span>Private agenda</span>
                  </Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={disabled}
                        aria-label={`More actions for ${statusLabel}`}
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => removeStatus(status.value)}
                      >
                        <Trash2 aria-hidden />
                        Remove status
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
            />
          );
        })}
      </ul>
      <div className={styles.addStatusRow}>
        <Label className={styles.formField} htmlFor="new-status">
          <span>Status name</span>
          <Input
            id="new-status"
            value={newStatus}
            maxLength={64}
            disabled={disabled}
            onChange={(event) => setNewStatus(event.target.value)}
            placeholder="Add a status"
          />
        </Label>
        <Button type="button" variant="outline" disabled={disabled} onClick={addStatus}>
          Add status
        </Button>
      </div>
      {formError ? (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      ) : null}
      <div className={styles.formActions}>
        {dirty ? (
          <Button type="button" variant="ghost" disabled={disabled} onClick={resetChanges}>
            <Undo2 aria-hidden />
            Cancel changes
          </Button>
        ) : null}
        <Button type="submit" disabled={busy || readOnly || !onSave || !dirty}>
          {readOnly
            ? "Session settings are read-only."
            : busy
              ? "Saving settings…"
              : "Save changes"}
        </Button>
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
    <form className={styles.dialogForm} onSubmit={(event) => void submit(event)}>
      <div className={styles.formGrid}>
        <Label className={styles.formField} htmlFor="room-name">
          <span>Room name</span>
          <Input
            id="room-name"
            value={name}
            maxLength={200}
            required
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </Label>
        <Label className={styles.formField} htmlFor="room-capacity">
          <span>Capacity</span>
          <Input
            id="room-capacity"
            type="number"
            min={1}
            max={1_000_000}
            step={1}
            value={capacity}
            required
            disabled={busy}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </Label>
      </div>
      <Label className={styles.formField} htmlFor="room-resources">
        <span>Resources</span>
        <Input
          id="room-resources"
          value={resourcesText}
          placeholder="Projector, microphones"
          disabled={busy}
          onChange={(event) => setResourcesText(event.target.value)}
        />
        <span className={styles.mutedText}>
          Comma-separated resource names. Duplicate or blank names are rejected.
        </span>
      </Label>
      {formError ? (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      ) : null}
      <DialogFooter className={styles.dialogActions}>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving room…" : room ? "Save room" : "Add room"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  busy,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  busy: boolean;
  onConfirm(): Promise<void>;
}>) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function confirm() {
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (reason) {
      setError(messageFrom(reason));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className={styles.formError} role="alert">
            Delete was not completed. {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const [deleteTarget, setDeleteTarget] = useState<EventRoom | null>(null);
  const editingRoom = rooms.find((room) => room.id === editingRoomId);
  const canCreate = Boolean(actions.createRoom);
  const canUpdate = Boolean(actions.updateRoom);
  const canDelete = Boolean(actions.deleteRoom);

  return (
    <SettingGroup
      id="rooms"
      aria-labelledby="rooms-heading"
      title="Rooms and venues"
      description="Define capacity and resources before assigning sessions to the agenda."
      action={
        <Button
          type="button"
          variant="outline"
          disabled={busy || !canCreate}
          aria-expanded={showForm}
          aria-controls="room-form-dialog"
          title={canCreate ? "Add a room" : "Adding rooms is unavailable"}
          onClick={() => {
            setEditingRoomId(null);
            setShowForm(true);
          }}
        >
          Add room
        </Button>
      }
    >
      {!canCreate || !canUpdate || !canDelete ? (
        <p className={styles.capabilityNote}>
          Room editing controls are read-only until the organizer API capabilities are connected.
        </p>
      ) : null}
      <ul className={styles.resourceList} aria-label="Event rooms">
        {rooms.length === 0 ? (
          <li className={styles.emptyState}>
            <strong>No rooms configured yet.</strong>
            <span>Add a room with a capacity before scheduling accepted sessions.</span>
          </li>
        ) : (
          rooms.map((room) => (
            <SettingRow
              key={room.id}
              label={room.name}
              description={`${room.capacity} seats · ${
                room.resources?.length || room.resourceIds?.length
                  ? (room.resources ?? room.resourceIds ?? []).join(", ")
                  : "No resources configured"
              }`}
              controls={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy || (!canUpdate && !canDelete)}
                      aria-label={`More actions for ${room.name}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={!canUpdate}
                      onSelect={() => {
                        setShowForm(false);
                        setEditingRoomId(room.id);
                      }}
                    >
                      <Pencil aria-hidden />
                      Edit room
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!canDelete}
                      onSelect={() => setDeleteTarget(room)}
                    >
                      <Trash2 aria-hidden />
                      Delete room
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))
        )}
      </ul>
      <Dialog
        open={showForm && canCreate}
        onOpenChange={(open) => {
          if (!open) setShowForm(false);
        }}
      >
        <DialogContent id="room-form-dialog">
          <DialogHeader>
            <DialogTitle>Add room</DialogTitle>
            <DialogDescription>
              Add an event-scoped room with the capacity and resources used by scheduling.
            </DialogDescription>
          </DialogHeader>
          <RoomForm
            busy={busy}
            onCancel={() => setShowForm(false)}
            onSave={async (input) => {
              await actions.createRoom?.(input);
              setShowForm(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={editingRoom !== undefined && canUpdate}
        onOpenChange={(open) => {
          if (!open) setEditingRoomId(null);
        }}
      >
        <DialogContent id={editingRoom ? `room-edit-${editingRoom.id}` : undefined}>
          <DialogHeader>
            <DialogTitle>Edit room</DialogTitle>
            <DialogDescription>
              Save changes against the room version shown in this form.
            </DialogDescription>
          </DialogHeader>
          {editingRoom ? (
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
        </DialogContent>
      </Dialog>
      <DeleteConfirmationDialog
        open={deleteTarget !== null && canDelete}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete this room?"
        description={
          deleteTarget
            ? `${deleteTarget.name} will be removed from this event. This cannot be undone.`
            : "This room will be removed from this event."
        }
        busy={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const currentTarget = rooms.find((room) => room.id === deleteTarget.id);
          if (!currentTarget) {
            setDeleteTarget(null);
            return;
          }
          await actions.deleteRoom?.(currentTarget.id, currentTarget.version);
          setDeleteTarget(null);
        }}
      />
    </SettingGroup>
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
    <form className={styles.dialogForm} onSubmit={(event) => void submit(event)}>
      <Label className={styles.formField} htmlFor="taxonomy-name">
        <span>Name</span>
        <Input
          id="taxonomy-name"
          value={name}
          maxLength={200}
          required
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </Label>
      <Label className={styles.formField} htmlFor="taxonomy-description">
        <span>Description</span>
        <Textarea
          id="taxonomy-description"
          value={description}
          maxLength={2_000}
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Label>
      {formError ? (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      ) : null}
      <DialogFooter className={styles.dialogActions}>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : resource ? "Save changes" : "Add"}
        </Button>
      </DialogFooter>
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
  const [deleteTarget, setDeleteTarget] = useState<EventTaxonomyResource | null>(null);
  const editing = resources.find((resource) => resource.id === editingId);
  const canCreate = Boolean(actions.createResource);
  const canUpdate = Boolean(actions.updateResource);
  const canDelete = Boolean(actions.deleteResource);
  const capabilityNoteId = `${kind}-capability-note`;
  const guidance = resourceGuidance(kind);
  const emptyAction = kind === "tag" ? "Add a tag" : `Add your first ${kind}`;

  return (
    <article className={styles.taxonomyCard} aria-labelledby={`${kind}-heading`}>
      <header className={styles.taxonomyHeader}>
        <div className={styles.taxonomyHeading}>
          <div className={styles.taxonomyTitleRow}>
            <h3 id={`${kind}-heading`} className={styles.subheading}>
              {title}
            </h3>
            <span
              className={`${styles.guidanceBadge} ${
                guidance === "Optional" ? styles.guidanceBadgeOptional : ""
              }`}
            >
              {guidance}
            </span>
          </div>
          <p className={styles.mutedText}>{resourceDescription(kind)}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !canCreate}
          aria-expanded={showForm}
          aria-controls={`${kind}-form-dialog`}
          aria-describedby={!canCreate ? capabilityNoteId : undefined}
          title={canCreate ? `Add ${kind}` : `${title} are read-only`}
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
        >
          Add {kind}
        </Button>
      </header>
      {!canCreate || !canUpdate || !canDelete ? (
        <p id={capabilityNoteId} className={styles.capabilityNote}>
          {title} editing is unavailable until the organizer API capability is connected; existing
          values remain visible.
        </p>
      ) : null}
      <ul className={styles.resourceList} aria-label={`Event ${title.toLowerCase()}`}>
        {resources.length === 0 ? (
          <li className={styles.emptyState}>
            <strong>{kind === "tag" ? "No tags yet" : `No ${kind}s configured`}</strong>
            <span>
              {canCreate
                ? kind === "track"
                  ? "Start with broad topics such as Engineering, Product, or Leadership."
                  : kind === "format"
                    ? "Common formats include Talk, Workshop, Panel, and Roundtable."
                    : kind === "level"
                      ? "A simple set is Introductory, Intermediate, and Advanced."
                      : "Add tags only when you need labels that cut across tracks."
                : "Adding values is unavailable in this view."}
            </span>
            {canCreate ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setShowForm(true);
                }}
              >
                {emptyAction}
              </Button>
            ) : null}
          </li>
        ) : (
          resources.map((resource) => (
            <SettingRow
              key={resource.id}
              label={resource.name}
              description={resource.description || `No ${kind} description`}
              controls={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy || (!canUpdate && !canDelete)}
                      aria-label={`More actions for ${resource.name}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={!canUpdate}
                      onSelect={() => {
                        setShowForm(false);
                        setEditingId(resource.id);
                      }}
                    >
                      <Pencil aria-hidden />
                      Edit {kind}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!canDelete}
                      onSelect={() => setDeleteTarget(resource)}
                    >
                      <Trash2 aria-hidden />
                      Delete {kind}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))
        )}
      </ul>
      <Dialog
        open={showForm && canCreate}
        onOpenChange={(open) => {
          if (!open) setShowForm(false);
        }}
      >
        <DialogContent id={`${kind}-form-dialog`}>
          <DialogHeader>
            <DialogTitle>Add {kind}</DialogTitle>
            <DialogDescription>{resourceDescription(kind)}</DialogDescription>
          </DialogHeader>
          <TaxonomyForm
            busy={busy}
            onCancel={() => setShowForm(false)}
            onSave={async (input) => {
              await actions.createResource?.(kind, input);
              setShowForm(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={editing !== undefined && canUpdate}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent id={editing ? `${kind}-edit-${editing.id}` : undefined}>
          <DialogHeader>
            <DialogTitle>Edit {kind}</DialogTitle>
            <DialogDescription>
              Save changes against the current version of this value.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
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
          ) : null}
        </DialogContent>
      </Dialog>
      <DeleteConfirmationDialog
        open={deleteTarget !== null && canDelete}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete this ${kind}?`}
        description={
          deleteTarget
            ? `${deleteTarget.name} will be removed from this event. This cannot be undone.`
            : `This ${kind} will be removed from this event.`
        }
        busy={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const currentTarget = resources.find((resource) => resource.id === deleteTarget.id);
          if (!currentTarget) {
            setDeleteTarget(null);
            return;
          }
          await actions.deleteResource?.(kind, currentTarget.id, currentTarget.version);
          setDeleteTarget(null);
        }}
      />
    </article>
  );
}

function actorLabel(actorId: string): string {
  return actorId
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function auditTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function AuditSection({ audit }: Readonly<{ audit: readonly EventSettingsAuditEntry[] }>) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries = settingsOnlyAuditEntries(audit);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = entries.filter((entry) => {
    if (scope !== "all" && entry.entityType !== scope) return false;
    if (!normalizedQuery) return true;
    const presentation = eventSettingsAuditPresentation(entry);
    return [
      presentation.domain,
      presentation.entityLabel,
      presentation.summary,
      actorLabel(entry.actorId),
      entry.entityId,
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const selectedEntry = entries.find(({ id }) => id === selectedId) ?? null;
  const selectedPresentation = selectedEntry ? eventSettingsAuditPresentation(selectedEntry) : null;
  const selectedDiff = selectedEntry ? eventSettingsAuditDiff(selectedEntry) : [];

  return (
    <SettingGroup
      id="history"
      aria-labelledby="history-heading"
      title="Change history"
      description="Review audited configuration changes without mixing in ordinary session activity."
    >
      <div className={styles.historyToolbar}>
        <Label className={styles.historySearch} htmlFor="settings-history-search">
          <Search aria-hidden />
          <span className="sr-only">Search change history</span>
          <Input
            id="settings-history-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search changes or entities"
          />
        </Label>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger aria-label="Filter change history by configuration type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All configuration</SelectItem>
            <SelectItem value="settings">Session workflow</SelectItem>
            <SelectItem value="room">Rooms and venues</SelectItem>
            <SelectItem value="track">Tracks</SelectItem>
            <SelectItem value="format">Formats</SelectItem>
            <SelectItem value="level">Levels</SelectItem>
            <SelectItem value="tag">Tags</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {entries.length === 0 ? (
        <p className={styles.mutedText}>
          No configuration changes have been audited for this event yet.
        </p>
      ) : filteredEntries.length === 0 ? (
        <p className={styles.mutedText}>No changes match the current search and scope.</p>
      ) : (
        <ol className={styles.auditList} aria-label="Configuration change history">
          {filteredEntries.map((entry) => {
            const presentation = eventSettingsAuditPresentation(entry);
            return (
              <li key={entry.id} className={styles.auditEntry}>
                <button type="button" onClick={() => setSelectedId(entry.id)}>
                  <span className={styles.auditEntryMain}>
                    <span className={styles.auditDomain}>{presentation.domain}</span>
                    <strong>{presentation.entityLabel}</strong>
                    <span>{presentation.summary}</span>
                  </span>
                  <span className={styles.auditEntryMeta}>
                    <span>{actorLabel(entry.actorId)}</span>
                    <time dateTime={entry.occurredAt}>{auditTimestamp(entry.occurredAt)}</time>
                    <span>{presentation.versionLabel}</span>
                    <ChevronRight aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <Sheet
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent className={styles.revisionSheet}>
          {selectedEntry && selectedPresentation ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedPresentation.entityLabel} updated</SheetTitle>
                <SheetDescription>
                  {selectedPresentation.domain} · {actorLabel(selectedEntry.actorId)} ·{" "}
                  {auditTimestamp(selectedEntry.occurredAt)}
                </SheetDescription>
              </SheetHeader>
              <div className={styles.revisionSummary}>
                <span>{selectedPresentation.summary}</span>
                <strong>{selectedPresentation.versionLabel}</strong>
              </div>
              <div className={styles.revisionDiff}>
                <h3>Changes</h3>
                {selectedDiff.length === 0 ? (
                  <p>No field-level difference is available for this revision.</p>
                ) : (
                  <dl>
                    {selectedDiff.map((change) => (
                      <div key={change.field}>
                        <dt>{change.field}</dt>
                        <dd>
                          <span className={styles.revisionBefore}>− {change.before}</span>
                          <span className={styles.revisionAfter}>+ {change.after}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <details className={styles.revisionTechnical}>
                <summary>Technical details</summary>
                <dl>
                  <div>
                    <dt>Audit ID</dt>
                    <dd>{selectedEntry.id}</dd>
                  </div>
                  <div>
                    <dt>Entity ID</dt>
                    <dd>{selectedEntry.entityId}</dd>
                  </div>
                  <div>
                    <dt>Actor ID</dt>
                    <dd>{selectedEntry.actorId}</dd>
                  </div>
                </dl>
              </details>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </SettingGroup>
  );
}

export function EventSettingsWorkspaceView({
  organizationId,
  eventId,
  section = "workflow",
  state,
  busy = false,
  notice = null,
  actions = {},
  onRetry,
}: EventSettingsWorkspaceViewProps) {
  const data = state.status === "loaded" ? state.data : null;
  const detailsStatus = state.status === "loaded" ? (state.detailsStatus ?? "loaded") : "loaded";
  const detailsMessage =
    state.status === "loaded"
      ? (state.detailsMessage ?? "The event library and audit history could not be loaded.")
      : null;
  const sectionDefinition = eventSettingsSectionDefinition(section);

  return (
    <main id="event-settings-content" className={styles.workspace} tabIndex={-1}>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <Link href="/admin/events">Events</Link>
            <span aria-hidden="true">/</span>
            <span>{eventId}</span>
            <span aria-hidden="true">/</span>
            <span>Settings</span>
          </WorkspaceBreadcrumb>
        }
        title={sectionDefinition.label}
        description={sectionDefinition.description}
        metadata={<WorkspaceMetaItem>{contextLabel(organizationId, eventId)}</WorkspaceMetaItem>}
      />

      {state.status === "error" || state.status === "config-error" ? (
        <Card className={styles.fullWidthState} role="alert">
          <CardHeader>
            <CardTitle>Event settings unavailable</CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
          <CardContent className={styles.stateActions}>
            <p className={styles.mutedText}>
              Core event settings were not loaded, so section navigation is unavailable.
            </p>
            {onRetry ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : state.status === "loading" && !data ? (
        <Card className={styles.fullWidthState} aria-live="polite" aria-busy="true">
          <CardHeader>
            <CardTitle>Loading event settings</CardTitle>
            <CardDescription>Retrieving event-scoped statuses and rooms.</CardDescription>
          </CardHeader>
        </Card>
      ) : data ? (
        <SettingsShell
          navigation={
            <SettingsSectionNavigation
              organizationId={organizationId}
              eventId={eventId}
              section={section}
            />
          }
          wide={section === "history"}
        >
          <div className="sr-only" role="status" aria-live="polite">
            {notice}
          </div>
          {notice ? (
            <div className={styles.notice} role="status" aria-live="polite">
              {notice}
            </div>
          ) : null}
          {section === "workflow" ? (
            <SettingGroup
              id="workflow"
              aria-labelledby="workflow-heading"
              title="Session statuses"
              description="Define the statuses organizers use and which ones can appear on the private agenda."
              metadata={`Version ${data.settings.version}`}
            >
              <StatusSettingsForm
                settings={data.settings}
                busy={busy}
                {...(actions.updateSettings === undefined
                  ? {}
                  : { onSave: actions.updateSettings })}
                readOnly={!actions.updateSettings}
              />
            </SettingGroup>
          ) : null}
          {section === "rooms" ? (
            <RoomsSection rooms={data.rooms} busy={busy} actions={actions} />
          ) : null}
          {section === "classification" ? (
            <SettingGroup
              id="classification"
              className={styles.librarySection}
              aria-labelledby="classification-heading"
              title="Classification library"
              description="Define how sessions are organized and discovered. These options appear in submissions, session editing, agenda filters, and the public program."
              contentClassName={styles.classificationContent}
            >
              <p className={styles.sectionNote}>
                Tracks, formats, and levels are recommended. Tags are optional and can be added
                later.
              </p>
              {detailsStatus === "loading" ? (
                <Card className={styles.detailsState} role="status" aria-live="polite">
                  <CardContent>
                    <p>Loading session classification and audit history…</p>
                  </CardContent>
                </Card>
              ) : detailsStatus === "error" ? (
                <Card className={styles.detailsState} role="alert">
                  <CardContent>
                    <p>Session classification unavailable. {detailsMessage}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className={styles.taxonomyGrid}>
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
              )}
            </SettingGroup>
          ) : null}
          {section === "history" && detailsStatus === "loaded" ? (
            <AuditSection audit={data.audit} />
          ) : section === "history" ? (
            <SettingGroup id="history" aria-labelledby="history-heading" title="Change history">
              <p
                className={styles.mutedText}
                role={detailsStatus === "error" ? "alert" : "status"}
                aria-live="polite"
              >
                {detailsStatus === "loading"
                  ? "Loading change history…"
                  : `Change history unavailable. ${detailsMessage}`}
              </p>
            </SettingGroup>
          ) : null}
        </SettingsShell>
      ) : null}
    </main>
  );
}

export interface EventSettingsWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly section: EventSettingsSection;
  readonly api?: EventSettingsApi;
  readonly initialData?: EventSettingsData;
}

export function eventSettingsWorkspaceScopeKey(organizationId: string, eventId: string): string {
  return `${organizationId}\u0000${eventId}`;
}

export function EventSettingsWorkspace(props: Readonly<EventSettingsWorkspaceProps>) {
  const scopeKey = eventSettingsWorkspaceScopeKey(props.organizationId, props.eventId);
  return <ScopedEventSettingsWorkspace key={scopeKey} {...props} />;
}

function ScopedEventSettingsWorkspace({
  organizationId,
  eventId,
  section,
  api: providedApi,
  initialData,
}: Readonly<EventSettingsWorkspaceProps>) {
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
  const mountedRef = useRef(true);

  const api = useMemo(() => {
    if (providedApi) return providedApi;
    try {
      return createEventSettingsApi("", organizationId);
    } catch {
      return null;
    }
  }, [organizationId, providedApi]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersion.current += 1;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestVersion.current;
      const requestIsCurrent = () =>
        canCommitEventSettingsAsyncCompletion(
          requestId,
          requestVersion.current,
          mountedRef.current,
          signal?.aborted ?? false,
        );
      if (!organizationId.trim() || !eventId.trim()) {
        if (requestIsCurrent()) {
          setState({
            status: "config-error",
            message: "An organization and event context are required.",
          });
        }
        return;
      }
      if (!api) {
        if (requestIsCurrent()) {
          setState({
            status: "config-error",
            message: "The organizer API URL is not configured for event settings.",
          });
        }
        return;
      }
      setState((current) => (current.status === "loaded" ? current : { status: "loading" }));
      setNotice(null);
      let coreCommitted = false;
      try {
        const loaded = await loadEventSettingsProgressively(
          api,
          organizationId,
          eventId,
          (core) => {
            if (!requestIsCurrent()) return;
            coreCommitted = true;
            setState({ status: "loaded", data: core, detailsStatus: "loading" });
          },
          signal,
        );
        if (requestIsCurrent()) {
          setState({ status: "loaded", data: loaded, detailsStatus: "loaded" });
        }
      } catch (error) {
        if (!requestIsCurrent() || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setState((current) => {
          if (coreCommitted && current.status === "loaded") {
            return {
              ...current,
              detailsStatus: "error",
              detailsMessage: messageFrom(error),
            };
          }
          return { status: "error", message: messageFrom(error) };
        });
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
    if (!mountedRef.current) return;
    const requestId = ++requestVersion.current;
    if (!api) throw new TypeError("The organizer API URL is not configured for event settings.");
    const loaded = await api.getOverview(eventId);
    if (
      canCommitEventSettingsAsyncCompletion(requestId, requestVersion.current, mountedRef.current)
    ) {
      setState({
        status: "loaded",
        data: normalizeData(loaded, organizationId, eventId),
        detailsStatus: "loaded",
      });
    }
  }, [api, eventId, organizationId]);

  async function mutate(operation: () => Promise<void>, successMessage: string): Promise<void> {
    if (!currentData || !mountedRef.current) return;
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
      if (!mountedRef.current) return;
      setNotice(
        outcome === "refreshed"
          ? successMessage
          : `${successMessage} The saved change could not be refreshed; reload to see the latest settings.`,
      );
    } catch (error) {
      if (!mountedRef.current) throw error;
      const message =
        error instanceof EventSettingsApiError && error.code === "VERSION_CONFLICT"
          ? "This event settings record changed in another organizer session. Reload before saving again."
          : messageFrom(error);
      try {
        await refresh();
      } catch {
        // Keep the loaded state and original mutation error when the recovery read is unavailable.
      }
      if (mountedRef.current) setNotice(`Unable to complete this change. ${message}`);
      throw error;
    } finally {
      if (mountedRef.current) setBusy(false);
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
      section={section}
      state={state}
      busy={busy}
      notice={notice}
      actions={actions}
      onRetry={() => void load()}
    />
  );
}
