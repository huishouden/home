import { MONTHS, WEEKDAYS, addDays, addMonths, daysBetween, ordinal, parseYmd, weekday, type Ymd } from './ymd';

// Recurring schedules (the kit proposal's B6 shape), in two kinds:
// - after-done: floats. "Change the HVAC filter 3 months after the last change."
// - fixed: calendar-anchored. "HOA dues on the 1st of every month", "insurance renews every 1 February".
// Pure: the caller passes the days.

export type Unit = 'day' | 'week' | 'month' | 'year';
export const UNITS: readonly Unit[] = ['day', 'week', 'month', 'year'];

export type Schedule = { kind: 'after-done'; every: number; unit: Unit } | { kind: 'fixed'; every: number; unit: Unit; anchor: Ymd };

export const MAX_EVERY = 99;

/** `n` units after `from`. Months and years clamp to the month's end and keep `day` for later months. */
export function addInterval(from: Ymd, n: number, unit: Unit, day?: number): Ymd {
  switch (unit) {
    case 'day':
      return addDays(from, n);
    case 'week':
      return addDays(from, 7 * n);
    case 'month':
      return addMonths(from, n, day);
    case 'year':
      return addMonths(from, 12 * n, day);
  }
}

/** The k-th occurrence of a fixed schedule, counted from its anchor (k = 0 is the anchor). */
export function occurrence(s: Extract<Schedule, { kind: 'fixed' }>, k: number): Ymd {
  return addInterval(s.anchor, k * s.every, s.unit, parseYmd(s.anchor)!.d);
}

/** The first occurrence of a fixed schedule on or after `day`. */
export function occurrenceOnOrAfter(s: Extract<Schedule, { kind: 'fixed' }>, day: Ymd): Ymd {
  const gap = daysBetween(s.anchor, day);
  if (gap <= 0) return s.anchor;
  // Start from an estimate a little short of the answer, then step forward.
  const approxDays = { day: 1, week: 7, month: 28, year: 365 }[s.unit] * s.every;
  let k = Math.max(0, Math.floor(gap / approxDays) - 2);
  while (daysBetween(occurrence(s, k), day) > 0) k++;
  return occurrence(s, k);
}

/** The first occurrence strictly after `day`. */
export const occurrenceAfter = (s: Extract<Schedule, { kind: 'fixed' }>, day: Ymd): Ymd => occurrenceOnOrAfter(s, addDays(day, 1));

/**
 * The first due date for a new or edited schedule. Fixed: the first occurrence on or after today.
 * After-done: one interval after the last time it was done, or today when it never was.
 */
export function firstDue(s: Schedule, today: Ymd, lastDone?: Ymd): Ymd {
  if (s.kind === 'fixed') return occurrenceOnOrAfter(s, today);
  return lastDone ? addInterval(lastDone, s.every, s.unit) : today;
}

/**
 * The next due date once it is done on `doneOn`. After-done counts from that day. Fixed moves to
 * the occurrence after both the current due date and the day it was done: doing an overdue job
 * once covers the missed dates, and doing it early covers the coming one.
 */
export function nextDueAfterDone(s: Schedule, due: Ymd, doneOn: Ymd): Ymd {
  if (s.kind === 'after-done') return addInterval(doneOn, s.every, s.unit);
  return occurrenceAfter(s, daysBetween(due, doneOn) > 0 ? doneOn : due);
}

const unitWord = (unit: Unit, n: number) => (n === 1 ? unit : `${n} ${unit}s`);

/** "Every 3 months", "Every week", "Every month on the 1st", "Every year on November 2", "Every 2 weeks on Tuesday". */
export function describeSchedule(s: Schedule): string {
  const base = `Every ${unitWord(s.unit, s.every)}`;
  if (s.kind === 'after-done') return base;
  const p = parseYmd(s.anchor)!;
  switch (s.unit) {
    case 'day':
      return base;
    case 'week':
      return `${base} on ${WEEKDAYS[weekday(s.anchor)]}`;
    case 'month':
      return `${base} on the ${ordinal(p.d)}`;
    case 'year':
      return `${base} on ${MONTHS[p.m - 1]} ${p.d}`;
  }
}

/** Whether a stored value is a schedule the app (and the rules) accept. */
export function isSchedule(v: unknown): v is Schedule {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (!Number.isInteger(s.every) || (s.every as number) < 1 || (s.every as number) > MAX_EVERY) return false;
  if (!UNITS.includes(s.unit as Unit)) return false;
  if (s.kind === 'after-done') return true;
  return s.kind === 'fixed' && parseYmd(s.anchor as string) !== null;
}
