export interface TemporalConstraints {
  readonly minimum?: string | undefined;
  readonly maximum?: string | undefined;
  readonly allowedDates?: readonly string[] | undefined;
  readonly unchangedValues?: readonly string[] | undefined;
}

export type TemporalConstraintViolation = "after-maximum" | "before-minimum" | "date-not-allowed";

export function temporalConstraintViolation(
  value: string,
  constraints: TemporalConstraints,
): TemporalConstraintViolation | null {
  if (constraints.unchangedValues?.includes(value) === true) return null;
  const date = value.slice(0, 10);
  if (constraints.allowedDates !== undefined && !constraints.allowedDates.includes(date)) {
    return "date-not-allowed";
  }
  if (constraints.minimum !== undefined && value < constraints.minimum) {
    return "before-minimum";
  }
  if (constraints.maximum !== undefined && value > constraints.maximum) {
    return "after-maximum";
  }
  return null;
}

export function isTemporalDateDisabled(date: string, constraints: TemporalConstraints): boolean {
  if (constraints.unchangedValues?.some((value) => value.slice(0, 10) === date) === true) {
    return false;
  }
  if (constraints.allowedDates !== undefined && !constraints.allowedDates.includes(date)) {
    return true;
  }
  if (constraints.minimum !== undefined && date < constraints.minimum.slice(0, 10)) {
    return true;
  }
  return constraints.maximum !== undefined && date > constraints.maximum.slice(0, 10);
}

export function temporalTimeBounds(
  date: string,
  constraints: TemporalConstraints,
): Readonly<{ minimum?: string; maximum?: string }> {
  const minimum =
    constraints.minimum?.startsWith(`${date}T`) === true
      ? constraints.minimum.slice(11, 16)
      : undefined;
  const maximum =
    constraints.maximum?.startsWith(`${date}T`) === true
      ? constraints.maximum.slice(11, 16)
      : undefined;
  return {
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum }),
  };
}

export function rangeBoundaryTimeBounds(
  boundary: "start" | "end",
  date: string,
  startValue: string,
  endValue: string,
  constraints: TemporalConstraints,
): Readonly<{ minimum?: string; maximum?: string }> {
  const global = temporalTimeBounds(date, constraints);
  if (boundary === "start" && endValue.slice(0, 10) === date) {
    const rangeMaximum = shiftMinute(endValue.slice(11, 16), -1);
    const maximum = earlierTime(global.maximum, rangeMaximum);
    return {
      ...(global.minimum === undefined ? {} : { minimum: global.minimum }),
      ...(maximum === undefined ? {} : { maximum }),
    };
  }
  if (boundary === "end" && startValue.slice(0, 10) === date) {
    const rangeMinimum = shiftMinute(startValue.slice(11, 16), 1);
    const minimum = laterTime(global.minimum, rangeMinimum);
    return {
      ...(minimum === undefined ? {} : { minimum }),
      ...(global.maximum === undefined ? {} : { maximum: global.maximum }),
    };
  }
  return global;
}

function shiftMinute(value: string, delta: -1 | 1): string | undefined {
  if (!/^\d{2}:\d{2}$/u.test(value)) return undefined;
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  const total = hours * 60 + minutes + delta;
  if (total < 0 || total >= 24 * 60) return undefined;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(
    2,
    "0",
  )}`;
}

function earlierTime(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left < right ? left : right;
}

function laterTime(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left > right ? left : right;
}
