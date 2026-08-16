export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day, 12);
  return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day
    ? parsed
    : null;
}

export function datePart(value: string): string {
  return value.slice(0, 10);
}

export function sortedUniqueDates(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function isEventDateDisabled(
  date: string,
  minimumDate: string,
  minimumEndDate = "",
  activeBoundary: "start" | "end" = "start",
): boolean {
  return (
    (minimumDate !== "" && date < minimumDate) ||
    (activeBoundary === "end" && minimumEndDate !== "" && date <= minimumEndDate)
  );
}

export function eventDatesBetween(startsAt: string, endsAt: string): readonly string[] {
  const start = parseDateOnly(datePart(startsAt));
  const end = parseDateOnly(datePart(endsAt));
  if (start === null || end === null || start > end) return [];
  const dates: string[] = [];
  for (
    let date = start;
    date <= end && dates.length < 366;
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12)
  ) {
    dates.push(localDateKey(date));
  }
  return dates;
}

export function toggleEventDate(selectedDates: readonly string[], date: string): readonly string[] {
  return selectedDates.includes(date)
    ? selectedDates.filter((selectedDate) => selectedDate !== date)
    : sortedUniqueDates([...selectedDates, date]);
}
