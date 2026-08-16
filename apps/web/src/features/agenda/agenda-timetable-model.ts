import type { AgendaEntry } from "./types";

export const TIMETABLE_SLOT_MINUTES = 30;
export const TIMETABLE_SNAP_MINUTES = 15;
export const TIMETABLE_MINUTE_HEIGHT = 1.2;

const DEFAULT_START_MINUTE = 8 * 60;
const DEFAULT_END_MINUTE = 18 * 60;

export interface TimetableWindow {
  startMinute: number;
  endMinute: number;
  totalMinutes: number;
  slotMinutes: readonly number[];
}

export interface TimetableEntryLayout {
  entry: AgendaEntry;
  startMinute: number;
  durationMinutes: number;
  offsetPixels: number;
  heightPixels: number;
}

function localMinutes(value: string): number | null {
  const match = /T(\d{2}):(\d{2})/u.exec(value);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function floorToInterval(value: number, interval: number): number {
  return Math.floor(value / interval) * interval;
}

function ceilToInterval(value: number, interval: number): number {
  return Math.ceil(value / interval) * interval;
}

export function formatTimetableMinute(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minutePart = normalized % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minutePart.toString().padStart(2, "0")} ${period}`;
}

export function deriveTimetableWindow(
  entries: readonly AgendaEntry[],
  slotMinutes = TIMETABLE_SLOT_MINUTES,
): TimetableWindow {
  const starts = entries.flatMap((entry) => {
    const minute = localMinutes(entry.startsAtLocal);
    return minute === null ? [] : [minute];
  });
  const ends = entries.flatMap((entry) => {
    const minute = localMinutes(entry.endsAtLocal);
    return minute === null ? [] : [minute];
  });
  const startMinute = floorToInterval(Math.min(DEFAULT_START_MINUTE, ...starts), slotMinutes);
  const endMinute = ceilToInterval(Math.max(DEFAULT_END_MINUTE, ...ends), slotMinutes);
  const slotCount = Math.max(1, Math.ceil((endMinute - startMinute) / slotMinutes));
  const slotMinuteValues = Array.from(
    { length: slotCount },
    (_, index) => startMinute + index * slotMinutes,
  );

  return {
    startMinute,
    endMinute,
    totalMinutes: endMinute - startMinute,
    slotMinutes: slotMinuteValues,
  };
}

export function layoutTimetableEntries(
  entries: readonly AgendaEntry[],
  window: TimetableWindow,
): readonly TimetableEntryLayout[] {
  return [...entries]
    .sort((left, right) => left.startsAtLocal.localeCompare(right.startsAtLocal))
    .flatMap((entry) => {
      const startMinute = localMinutes(entry.startsAtLocal);
      const endMinute = localMinutes(entry.endsAtLocal);
      if (startMinute === null || endMinute === null) return [];
      const durationMinutes = Math.max(TIMETABLE_SNAP_MINUTES, endMinute - startMinute);
      return [
        {
          entry,
          startMinute,
          durationMinutes,
          offsetPixels: (startMinute - window.startMinute) * TIMETABLE_MINUTE_HEIGHT,
          heightPixels: durationMinutes * TIMETABLE_MINUTE_HEIGHT,
        },
      ];
    });
}

export function snapTimetableMinute(minute: number, window: TimetableWindow): number {
  const snapped = Math.round(minute / TIMETABLE_SNAP_MINUTES) * TIMETABLE_SNAP_MINUTES;
  return Math.min(window.endMinute - TIMETABLE_SNAP_MINUTES, Math.max(window.startMinute, snapped));
}

export function localDateTimeForMinute(date: string, minute: number): string {
  const hour = Math.floor(minute / 60)
    .toString()
    .padStart(2, "0");
  const minutePart = (minute % 60).toString().padStart(2, "0");
  return `${date}T${hour}:${minutePart}:00`;
}
