import type { HomeTask, ServiceInput } from './model';
import { nextDueAfterDone } from '@huishouden/pwa-kit/schedule';
import { daysBetween, type Ymd } from '@huishouden/pwa-kit/time';

/** What marking a job done writes: the job's new due date and last-done day, and a history entry. */
export function markDone(task: HomeTask, doneOn: Ymd): { due: Ymd; lastDone: Ymd; entry: ServiceInput } {
  return {
    due: nextDueAfterDone(task.schedule, task.due, doneOn),
    lastDone: doneOn,
    entry: { date: doneOn, title: task.title, taskId: task.id, ...(task.contactId ? { contactId: task.contactId } : {}) },
  };
}

/**
 * A history entry added for a job moves the job on when it is the latest time it was done: a
 * visit dated today or earlier, after the last recorded one. A booked (future) visit changes nothing.
 */
export function doneFromEntry(task: HomeTask, date: Ymd, today: Ymd): { due: Ymd; lastDone: Ymd } | null {
  if (daysBetween(date, today) < 0) return null;
  if (task.lastDone && daysBetween(task.lastDone, date) <= 0) return null;
  const { due, lastDone } = markDone(task, date);
  return { due, lastDone };
}

/**
 * The fields that tick a job off. Helpers and kids may mark anyone's job done, and the rules let
 * them change only these on a job someone else added (huishouden/rules README "Roles").
 */
export const TICK_FIELDS = ['due', 'lastDone', 'updatedAt'] as const;

/** The job as it is after being done on a day: only the tick fields change, `by` stays its author. */
export function tickedTask(task: HomeTask, done: { due: Ymd; lastDone: Ymd }, now: number): HomeTask {
  return { ...task, due: done.due, lastDone: done.lastDone, updatedAt: now };
}
