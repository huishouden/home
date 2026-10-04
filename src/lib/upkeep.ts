import { SOON_DAYS, daysBetween, dueHeadline, dueText as kitDueText, formatSpan, type SpanOptions, type Ymd } from '@huishouden/pwa-kit/time';
import { t } from '../i18n';

// Due-date wording and ordering for the upkeep list, on the kit's time helpers. Home rounds months
// to the nearest one ("Done 3 months ago" for 88 days). Pure: every function takes today.

export { dueState, SOON_DAYS, type DueState } from '@huishouden/pwa-kit/time';

const SPAN: SpanOptions = { months: 'nearest' };

/** A distance in days as people say it: days up to `daysUpTo` (13), weeks under two months, then months and years. */
export const spanWords = (days: number, daysUpTo = 13): string => formatSpan(days, { ...SPAN, daysUpTo });

/** "Overdue by 5 days", "Due today", "Due tomorrow", "Due in 4 days", "Due in 3 weeks", "Due in 5 months". */
export const dueText = (due: Ymd, today: Ymd): string => kitDueText(due, today, SPAN);

/** The glanceable line: "Overdue: gutter cleaning", "Filter change due in 4 days", "Lawn service due today". */
export const headline = (title: string, due: Ymd, today: Ymd): string => dueHeadline(title, due, today, SPAN);

/** Soonest first; overdue (the most overdue first) leads. Ties by title. */
export function byDue<T extends { due: Ymd; title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => daysBetween(b.due, a.due) || a.title.localeCompare(b.title));
}

/** What the overview shows: everything overdue or due within `soonDays`, soonest first. */
export function needsAttention<T extends { due: Ymd; title: string }>(items: T[], today: Ymd, soonDays = SOON_DAYS): T[] {
  return byDue(items.filter((i) => daysBetween(today, i.due) <= soonDays));
}

/** "Done 3 months ago", "Done today", "Not done yet". */
export function lastDoneText(lastDone: Ymd | undefined, today: Ymd): string {
  if (!lastDone) return t('upkeep.notDoneYet');
  const days = daysBetween(lastDone, today);
  if (days <= 0) return t('upkeep.doneToday');
  if (days === 1) return t('upkeep.doneYesterday');
  return t('upkeep.doneAgo', { span: spanWords(days) });
}

/** Paused: kept with its schedule, but not due anywhere (Overview, Upkeep's due groups, the agenda, the to-do list). */
export const isPaused = (t: { pausedAt?: number }) => t.pausedAt !== undefined;

/** The jobs that come due: every one not paused. */
export const activeJobs = <T extends { pausedAt?: number }>(tasks: T[]): T[] => tasks.filter((t) => !isPaused(t));
