import { daysBetween, type Ymd } from './ymd';

// Due-date wording and ordering for the upkeep list. Pure: every function takes today.

/** Within this many days a job counts as "due soon" and shows on the overview. */
export const SOON_DAYS = 14;

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

export function dueState(due: Ymd, today: Ymd, soonDays = SOON_DAYS): { state: DueState; days: number } {
  const days = daysBetween(today, due);
  if (days < 0) return { state: 'overdue', days };
  if (days === 0) return { state: 'today', days };
  return { state: days <= soonDays ? 'soon' : 'later', days };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * A distance in days as people say it: days under two weeks (or under `daysUpTo`), then weeks
 * under two months, months under two years, then years.
 */
export function spanWords(days: number, daysUpTo = 13): string {
  const n = Math.abs(days);
  if (n <= daysUpTo) return plural(n, 'day');
  if (n < 60) return plural(Math.floor(n / 7), 'week');
  if (n < 730) return plural(Math.max(2, Math.round(n / 30.44)), 'month');
  return plural(Math.floor(n / 365.25), 'year');
}

/** "Overdue by 5 days", "Due today", "Due tomorrow", "Due in 4 days", "Due in 3 weeks", "Due in 5 months". */
export function dueText(due: Ymd, today: Ymd): string {
  const { days } = dueState(due, today);
  if (days < 0) return `Overdue by ${spanWords(days)}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${spanWords(days)}`;
}

/** Sentence-case title used mid-sentence: "Gutter cleaning" → "gutter cleaning", "HVAC filter" stays. */
export function midSentence(title: string): string {
  const t = title.trim();
  if (t.length > 1 && t[1] === t[1].toLowerCase() && t[0] !== t[0].toLowerCase()) return t[0].toLowerCase() + t.slice(1);
  return t;
}

/** The glanceable line: "Overdue: gutter cleaning", "Filter change due in 4 days", "Lawn service due today". */
export function headline(title: string, due: Ymd, today: Ymd): string {
  const { days } = dueState(due, today);
  const t = title.trim();
  if (days < 0) return `Overdue: ${midSentence(t)}`;
  if (days === 0) return `${t} due today`;
  if (days === 1) return `${t} due tomorrow`;
  return `${t} due in ${spanWords(days)}`;
}

/** Soonest first; overdue (the most overdue first) leads. Ties by title. */
export function byDue<T extends { due: Ymd; title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => daysBetween(b.due, a.due) || a.title.localeCompare(b.title));
}

/** What the overview shows: everything overdue or due within `soonDays`, soonest first. */
export function needsAttention<T extends { due: Ymd; title: string }>(items: T[], today: Ymd, soonDays = SOON_DAYS): T[] {
  return byDue(items.filter((i) => daysBetween(today, i.due) <= soonDays));
}

/** "Last done 3 months ago", "Done today", "Never done". */
export function lastDoneText(lastDone: Ymd | undefined, today: Ymd): string {
  if (!lastDone) return 'Not done yet';
  const days = daysBetween(lastDone, today);
  if (days <= 0) return 'Done today';
  if (days === 1) return 'Done yesterday';
  return `Done ${spanWords(days)} ago`;
}
