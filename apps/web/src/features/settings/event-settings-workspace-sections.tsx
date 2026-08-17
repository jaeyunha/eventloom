"use client";

import { MoreHorizontal, Pencil, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { SettingGroup, SettingRow } from "@/components/workspace/settings-ui";
import type {
  EventRoom,
  EventSettingsResourceKind,
  EventTaxonomyResource,
  RoomInput,
  SessionSettingsRecord,
  TaxonomyInput,
} from "./api";
import {
  type EventSettingsSection,
  eventSettingsSectionDefinition,
  eventSettingsSectionHref,
} from "./event-settings-sections";
import styles from "./event-settings-workspace.module.css";
import { eventSettingsSectionNavigation, validateRoomForm } from "./event-settings-workspace-model";

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The event settings request could not be completed.";
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

function navigationGroupId(prefix: string, group: string): string {
  return `${prefix}-${group.toLowerCase().replaceAll(" ", "-")}`;
}

export function SettingsSectionNavigation({
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
    const grouped = new Map<string, (typeof eventSettingsSectionNavigation)[number][]>();
    for (const item of eventSettingsSectionNavigation) {
      const current = grouped.get(item.group) ?? [];
      current.push(item);
      grouped.set(item.group, current);
    }
    return [...grouped.entries()];
  }, []);
  const active = eventSettingsSectionDefinition(section);

  const links = (items: readonly (typeof eventSettingsSectionNavigation)[number][]) => (
    <ul className={styles.navigationList}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            className={`${styles.navigationLink} ${section === item.id ? styles.navigationLinkActive : ""}`}
            href={eventSettingsSectionHref(organizationId, eventId, item.id)}
            aria-current={section === item.id ? "page" : undefined}
            title={item.description}
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
      <aside className={styles.desktopNavigation} aria-label="Program settings sections">
        <div className={styles.navigationHeader}>
          <p className={styles.navigationEyebrow}>Program settings</p>
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
            aria-label="Choose Program settings section"
          >
            <span className={styles.mobileNavigationLabel}>Program settings</span>
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

type UpdateSettings = (input: {
  expectedVersion: number;
  statuses: readonly string[];
  agendaEligibleStatuses: readonly string[];
}) => Promise<void>;

export function StatusSettingsForm({
  settings,
  busy,
  onSave,
  readOnly = false,
}: Readonly<{
  settings: SessionSettingsRecord;
  busy: boolean;
  onSave?: UpdateSettings;
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
  const eligibleSet = new Set(eligible);
  const [newStatus, setNewStatus] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const cleanedStatuses = statuses.map(({ value }) => value.trim());
  const normalizedEligible = cleanedStatuses.filter((status) => eligibleSet.has(status));
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
                      checked={eligibleSet.has(status.value)}
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
  const [resourcesText, setResourcesText] = useState(() =>
    (room?.resources ?? room?.resourceIds ?? []).join(", "),
  );
  const [formError, setFormError] = useState<string | null>(null);

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

type UpdateRoom = (input: {
  roomId: string;
  expectedVersion: number;
  name: string;
  capacity: number;
  resources: readonly string[];
}) => Promise<void>;
type DeleteRoom = (roomId: string, expectedVersion: number) => Promise<void>;

export function RoomsSection({
  rooms,
  busy,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
}: Readonly<{
  rooms: readonly EventRoom[];
  busy: boolean;
  onCreateRoom?: (input: RoomInput) => Promise<void>;
  onUpdateRoom?: UpdateRoom;
  onDeleteRoom?: DeleteRoom;
}>) {
  const [showForm, setShowForm] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventRoom | null>(null);
  const roomsById = useMemo(() => {
    const index = new Map<string, EventRoom>();
    for (const room of rooms) {
      if (!index.has(room.id)) index.set(room.id, room);
    }
    return index;
  }, [rooms]);
  const editingRoom = editingRoomId === null ? undefined : roomsById.get(editingRoomId);
  const canCreate = Boolean(onCreateRoom);
  const canUpdate = Boolean(onUpdateRoom);
  const canDelete = Boolean(onDeleteRoom);

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
              if (!onCreateRoom) return;
              await onCreateRoom(input);
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
              key={editingRoom.id}
              room={editingRoom}
              busy={busy}
              onCancel={() => setEditingRoomId(null)}
              onSave={async (input) => {
                if (!onUpdateRoom) return;
                await onUpdateRoom({
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
        key={`room-delete-${deleteTarget?.id ?? "closed"}-${deleteTarget !== null && canDelete ? "open" : "closed"}`}
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
          if (!deleteTarget || !onDeleteRoom) return;
          const currentTarget = roomsById.get(deleteTarget.id);
          if (!currentTarget) {
            setDeleteTarget(null);
            return;
          }
          await onDeleteRoom(currentTarget.id, currentTarget.version);
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

type CreateResource = (kind: EventSettingsResourceKind, input: TaxonomyInput) => Promise<void>;
type UpdateResource = (
  kind: EventSettingsResourceKind,
  input: {
    resourceId: string;
    expectedVersion: number;
    name: string;
    description: string;
  },
) => Promise<void>;
type DeleteResource = (
  kind: EventSettingsResourceKind,
  resourceId: string,
  expectedVersion: number,
) => Promise<void>;

export function TaxonomySection({
  kind,
  resources,
  busy,
  onCreateResource,
  onUpdateResource,
  onDeleteResource,
}: Readonly<{
  kind: EventSettingsResourceKind;
  resources: readonly EventTaxonomyResource[];
  busy: boolean;
  onCreateResource?: CreateResource;
  onUpdateResource?: UpdateResource;
  onDeleteResource?: DeleteResource;
}>) {
  const title = resourceTitle(kind);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventTaxonomyResource | null>(null);
  const resourcesById = useMemo(() => {
    const index = new Map<string, EventTaxonomyResource>();
    for (const resource of resources) {
      if (!index.has(resource.id)) index.set(resource.id, resource);
    }
    return index;
  }, [resources]);
  const editing = editingId === null ? undefined : resourcesById.get(editingId);
  const canCreate = Boolean(onCreateResource);
  const canUpdate = Boolean(onUpdateResource);
  const canDelete = Boolean(onDeleteResource);
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
            key={`${kind}-new-${showForm ? "open" : "closed"}`}
            busy={busy}
            onCancel={() => setShowForm(false)}
            onSave={async (input) => {
              if (!onCreateResource) return;
              await onCreateResource(kind, input);
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
              key={`${kind}-${editing.id}`}
              resource={editing}
              busy={busy}
              onCancel={() => setEditingId(null)}
              onSave={async (input) => {
                if (!onUpdateResource) return;
                await onUpdateResource(kind, {
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
        key={`${kind}-delete-${deleteTarget?.id ?? "closed"}-${deleteTarget !== null && canDelete ? "open" : "closed"}`}
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
          if (!deleteTarget || !onDeleteResource) return;
          const currentTarget = resourcesById.get(deleteTarget.id);
          if (!currentTarget) {
            setDeleteTarget(null);
            return;
          }
          await onDeleteResource(kind, currentTarget.id, currentTarget.version);
          setDeleteTarget(null);
        }}
      />
    </article>
  );
}
