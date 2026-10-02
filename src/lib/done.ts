import type { HomeTask, ServiceInput } from './model';
import { nextDueAfterDone } from './schedule';
import { daysBetween, type Ymd } from './ymd';

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
