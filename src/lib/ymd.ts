// Local calendar days as 'YYYY-MM-DD'. Upkeep happens on days, not at times, so nothing here deals
// in hours and every function takes "today" instead of reading the clock.

export type Ymd = string;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isYmd = (s: unknown): s is Ymd => typeof s === 'string' && YMD.test(s) && parseYmd(s) !== null;

/** 'YYYY-MM-DD' to its parts, or null when malformed or not a real date (2031-02-30). */
export function parseYmd(s: string | undefined | null): { y: number; m: number; d: number } | null {
  const match = s ? YMD.exec(s) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const ymd = (y: number, m: number, d: number): Ymd => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** The local day containing a moment. */
export function toYmd(t: number): Ymd {
  const date = new Date(t);
  return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Local midnight at the start of the day. */
export function ymdToTime(s: Ymd): number {
  const p = parseYmd(s);
  if (!p) throw new Error(`Not a date: ${s}`);
  return new Date(p.y, p.m - 1, p.d).getTime();
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Day number since 1970-01-01, ignoring time zones and DST: exact day arithmetic. */
function dayNumber(s: Ymd): number {
  const p = parseYmd(s);
  if (!p) throw new Error(`Not a date: ${s}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
}

function fromDayNumber(n: number): Ymd {
  const d = new Date(n * 86_400_000);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export const addDays = (s: Ymd, days: number): Ymd => fromDayNumber(dayNumber(s) + days);

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: Ymd, to: Ymd): number => dayNumber(to) - dayNumber(from);

/** 0 = Sunday. */
export const weekday = (s: Ymd): number => new Date(dayNumber(s) * 86_400_000).getUTCDay();

/**
 * Months later (or earlier), clamped to the month's last day: 31 January plus one month is the
 * 28th or 29th of February. `day` keeps the intended day of month for later months (the 31st).
 */
export function addMonths(s: Ymd, months: number, day?: number): Ymd {
  const p = parseYmd(s);
  if (!p) throw new Error(`Not a date: ${s}`);
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return ymd(y, m, Math.min(day ?? p.d, daysInMonth(y, m)));
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "1st", "2nd", "23rd", "31st". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** "Tuesday, November 4" (and the year when it isn't this year's). */
export function formatDay(s: Ymd, today?: Ymd): string {
  const p = parseYmd(s)!;
  const base = `${WEEKDAYS[weekday(s)]}, ${MONTHS[p.m - 1]} ${p.d}`;
  return today && parseYmd(today)!.y === p.y ? base : `${base}, ${p.y}`;
}

/** "Nov 4" (and ", 2032" when not this year's). */
export function formatShort(s: Ymd, today?: Ymd): string {
  const p = parseYmd(s)!;
  const base = `${MONTHS[p.m - 1].slice(0, 3)} ${p.d}`;
  return today && parseYmd(today)!.y === p.y ? base : `${base}, ${p.y}`;
}

/** "November 2033". */
export function formatMonthYear(s: Ymd): string {
  const p = parseYmd(s)!;
  return `${MONTHS[p.m - 1]} ${p.y}`;
}
