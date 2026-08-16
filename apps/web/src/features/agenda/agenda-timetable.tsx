"use client";

import { AlertTriangle, Clock3, MapPin, PencilLine, Users2 } from "lucide-react";
import type { CSSProperties, DragEvent } from "react";
import { Badge } from "@/components/ui/badge";
import styles from "./agenda-timetable.module.css";
import {
  deriveTimetableWindow,
  formatTimetableMinute,
  layoutTimetableEntries,
  localDateTimeForMinute,
  TIMETABLE_MINUTE_HEIGHT,
} from "./agenda-timetable-model";
import { formatLocalTime } from "./model";
import type { AgendaEntry, AgendaRoom, AgendaSession, AgendaTrack } from "./types";

export const AGENDA_ENTRY_DRAG_TYPE = "application/x-eventloom-agenda-entry";

export interface AgendaTimetablePlacement {
  sessionId: string;
  roomId: string;
  startsAtLocal: string;
  endsAtLocal: string;
}

export interface AgendaTimetableMove extends AgendaTimetablePlacement {
  entryId: string;
}

interface AgendaTimetableProps {
  date: string;
  entries: readonly AgendaEntry[];
  rooms: readonly AgendaRoom[];
  sessions: readonly AgendaSession[];
  tracks: readonly AgendaTrack[];
  conflictEntryIds: ReadonlySet<string>;
  warningEntryIds: ReadonlySet<string>;
  onEditEntry: (entryId: string) => void;
  onMoveEntry: (placement: AgendaTimetableMove) => Promise<void>;
  onRequestPlacement: (placement: AgendaTimetablePlacement) => void;
}

interface GridStyle extends CSSProperties {
  "--agenda-grid-height": string;
  "--agenda-room-count": number;
}

interface EntryStyle extends CSSProperties {
  "--agenda-entry-accent": string;
  "--agenda-entry-height": string;
  "--agenda-entry-top": string;
}

function primaryTrackColor(entry: AgendaEntry, tracks: readonly AgendaTrack[]): string {
  const trackId = entry.trackIds[0];
  return tracks.find((track) => track.id === trackId)?.color ?? "var(--primary)";
}

function EntryCard({
  entry,
  style,
  hasConflict,
  hasWarning,
  onEdit,
  onDragStart,
}: {
  entry: AgendaEntry;
  style?: EntryStyle;
  hasConflict: boolean;
  hasWarning: boolean;
  onEdit: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className={styles.entryCard}
      data-entry-id={entry.id}
      data-conflict={hasConflict ? "true" : undefined}
      data-warning={hasWarning ? "true" : undefined}
      draggable
      style={style}
      onClick={onEdit}
      onDragStart={onDragStart}
      aria-label={`Edit ${entry.title}, ${entry.roomName}, ${formatLocalTime(entry.startsAtLocal)} to ${formatLocalTime(entry.endsAtLocal)}`}
    >
      <span className={styles.entryTime}>
        {formatLocalTime(entry.startsAtLocal)}–{formatLocalTime(entry.endsAtLocal)}
      </span>
      <strong>{entry.title}</strong>
      <span className={styles.entryMeta}>
        <Users2 aria-hidden="true" />
        {entry.speakerNames.join(", ") || "Speaker pending"}
      </span>
      {hasConflict || hasWarning ? (
        <span className={styles.entryIssue}>
          <AlertTriangle aria-hidden="true" />
          <span className={styles.srOnly}>{hasConflict ? "Hard conflict:" : "Warning:"}</span>
          {hasConflict ? "Conflict" : "Check"}
        </span>
      ) : (
        <PencilLine className={styles.editGlyph} aria-hidden="true" />
      )}
    </button>
  );
}

export function AgendaTimetable({
  date,
  entries,
  rooms,
  sessions,
  tracks,
  conflictEntryIds,
  warningEntryIds,
  onEditEntry,
  onMoveEntry,
  onRequestPlacement,
}: AgendaTimetableProps) {
  const window = deriveTimetableWindow(entries);
  const layouts = layoutTimetableEntries(entries, window);
  const entriesByRoom = new Map(
    rooms.map((room) => [room.id, layouts.filter((layout) => layout.entry.roomId === room.id)]),
  );
  const gridStyle: GridStyle = {
    "--agenda-grid-height": `${window.totalMinutes * TIMETABLE_MINUTE_HEIGHT}px`,
    "--agenda-room-count": Math.max(1, rooms.length),
  };

  const handleDrop = async (event: DragEvent<HTMLElement>, roomId: string, startMinute: number) => {
    event.preventDefault();
    event.stopPropagation();
    const entryId = event.dataTransfer.getData(AGENDA_ENTRY_DRAG_TYPE);
    if (entryId !== "") {
      const layout = layouts.find((candidate) => candidate.entry.id === entryId);
      if (layout === undefined) return;
      await onMoveEntry({
        entryId,
        sessionId: layout.entry.sessionId,
        roomId,
        startsAtLocal: localDateTimeForMinute(date, startMinute),
        endsAtLocal: localDateTimeForMinute(date, startMinute + layout.durationMinutes),
      });
      return;
    }
    const sessionId = event.dataTransfer.getData("text/plain");
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (session === undefined) return;
    onRequestPlacement({
      sessionId,
      roomId,
      startsAtLocal: localDateTimeForMinute(date, startMinute),
      endsAtLocal: localDateTimeForMinute(date, startMinute + session.durationMinutes),
    });
  };

  return (
    <section className={styles.timetable} aria-label="Timetable by room and time">
      {entries.length === 0 ? (
        <p className={styles.emptyTimetable} role="status">
          No sessions scheduled on this day.
        </p>
      ) : null}
      <div className={styles.desktopTimetable}>
        <div className={styles.gridScroller}>
          <div className={styles.gridFrame} style={gridStyle}>
            <div className={styles.semanticGrid} data-agenda-grid="true">
              <div className={styles.gridHeader}>
                <div className={styles.timeHeader}>Time</div>
                {rooms.map((room) => (
                  <div className={styles.roomHeader} key={room.id}>
                    <MapPin aria-hidden="true" />
                    <span>
                      <strong>{room.name}</strong>
                      <small>{room.capacity} seats</small>
                    </span>
                  </div>
                ))}
              </div>
              <div className={styles.slotRows}>
                {window.slotMinutes.map((minute) => (
                  <div className={styles.slotRow} key={minute}>
                    <div className={styles.timeLabel} data-slot-minute={minute}>
                      {formatTimetableMinute(minute)}
                    </div>
                    {rooms.map((room) => (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        className={styles.slotCell}
                        data-room-id={room.id}
                        data-slot-minute={minute}
                        key={`${room.id}-${minute}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => void handleDrop(event, room.id, minute)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.entryOverlay}>
              <span />
              {rooms.map((room) => (
                <div className={styles.roomEntries} key={room.id}>
                  {(entriesByRoom.get(room.id) ?? []).map((layout) => (
                    <EntryCard
                      entry={layout.entry}
                      hasConflict={conflictEntryIds.has(layout.entry.id)}
                      hasWarning={warningEntryIds.has(layout.entry.id)}
                      key={layout.entry.id}
                      onEdit={() => onEditEntry(layout.entry.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(AGENDA_ENTRY_DRAG_TYPE, layout.entry.id);
                        event.dataTransfer.setData("text/plain", `agenda-entry:${layout.entry.id}`);
                      }}
                      style={{
                        "--agenda-entry-accent": primaryTrackColor(layout.entry, tracks),
                        "--agenda-entry-height": `${layout.heightPixels}px`,
                        "--agenda-entry-top": `${layout.offsetPixels}px`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.mobileTimetable}>
        {rooms.map((room) => {
          const roomEntries = entriesByRoom.get(room.id) ?? [];
          return (
            <section className={styles.mobileRoom} data-room-id={room.id} key={room.id}>
              <header>
                <div>
                  <MapPin aria-hidden="true" />
                  <strong>{room.name}</strong>
                </div>
                <Badge variant="outline">{roomEntries.length} sessions</Badge>
              </header>
              {roomEntries.length === 0 ? (
                <p className={styles.mobileEmpty}>No sessions placed in this room.</p>
              ) : (
                <div className={styles.mobileEntryList}>
                  {roomEntries.map(({ entry }) => (
                    <EntryCard
                      entry={entry}
                      hasConflict={conflictEntryIds.has(entry.id)}
                      hasWarning={warningEntryIds.has(entry.id)}
                      key={entry.id}
                      onEdit={() => onEditEntry(entry.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(AGENDA_ENTRY_DRAG_TYPE, entry.id);
                        event.dataTransfer.setData("text/plain", `agenda-entry:${entry.id}`);
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className={styles.dropHint}>
        <Clock3 aria-hidden="true" />
        Drag a session onto any room interval, or use Schedule session for keyboard placement.
      </p>
    </section>
  );
}
