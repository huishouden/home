import { allDayStart } from '@huishouden/pwa-kit/agenda';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { Role } from '@huishouden/pwa-kit/roles';
import type { Schedule } from '@huishouden/pwa-kit/schedule';
import type { NextDuePlaceholder, TodoAction, TodoInput } from '@huishouden/pwa-kit/todos';
import { HOUR, midSentence, toYmd, type Ymd } from '@huishouden/pwa-kit/time';
import { COLLECTIONS } from '../data/actions';
import { screen } from './agenda';
import type { HomeData } from './demo';
import { PREP_LEAD_HOURS, fromWords, prepTasks, type PrepTask } from './events';
import { categoryLabel, type HomeTask } from './model';
import { t as tr } from '../i18n';
import { activeJobs, needsAttention } from './upkeep';

// What Home puts on the household to-do list (households/{id}/todos, read by the portal's To-do
// tab): the upkeep jobs Overview shows as needing doing (overdue or due in the next two weeks) and
// the things to do before regular events Overview shows (coming up or late). Each comes with Done
// and a cancel (Pause a job, Skip a thing to do before) written as the same writes Home makes, with
// placeholders for the moment someone taps it. Pure: whatever depends on the time takes `now`.

const EVERYONE: Role[] = ['admin', 'member', 'helper', 'kid'];
const STAFF: Role[] = ['admin', 'member'];

export const todoJobRef = (id: string) => `job:${id}`;
export const todoPrepRef = (prepId: string) => `prep:${prepId}`;
/** The history entry a job done from the to-do list adds: one id per job and due date. */
export const todoEntryId = (task: Pick<HomeTask, 'id' | 'due'>) => `todo-${task.id}-${task.due}`;

const UNIT_LETTER = { day: 'd', week: 'w', month: 'm', year: 'y' } as const;

/**
 * The job's next due date as an op value, worked out when Done is tapped, not when published.
 * After-done counts from that day: `$today+3m`. Set dates go to the first one after both the due
 * date and that day (`$nextDue`), so a job several dates overdue by the tap isn't left overdue.
 */
export function nextDueValue(schedule: Schedule, due: Ymd): string | NextDuePlaceholder {
  return schedule.kind === 'after-done' ? `$today+${schedule.every}${UNIT_LETTER[schedule.unit]}` : { $nextDue: { schedule, due } };
}

/** Done: Home's Mark done, as ops. The job's tick fields (helpers and kids may), and a history entry in the member's name. */
export function jobDone(task: HomeTask): TodoAction {
  return {
    label: tr('todo.done'),
    ops: [
      { col: COLLECTIONS.tasks, id: task.id, merge: true, data: { lastDone: '$today', due: nextDueValue(task.schedule, task.due), updatedAt: '$now' } },
      {
        col: COLLECTIONS.log,
        id: todoEntryId(task),
        data: { date: '$today', title: task.title, taskId: task.id, ...(task.contactId ? { contactId: task.contactId } : {}), createdAt: '$now', by: '$me' },
      },
    ],
    roles: EVERYONE,
  };
}

/** Pause: kept, not due anywhere until resumed in Home. Admins, members, and whoever added it. */
export function jobPause(task: HomeTask): TodoAction {
  return { label: tr('todo.pause'), ops: [{ col: COLLECTIONS.tasks, id: task.id, merge: true, data: { pausedAt: '$now', updatedAt: '$now' } }], roles: STAFF, owner: true };
}

export function jobTodo(task: HomeTask, contacts: Contact[]): TodoInput {
  const contact = task.contactId ? contacts.find((c) => c.id === task.contactId)?.name : undefined;
  return {
    ref: todoJobRef(task.id),
    title: task.title,
    detail: contact ?? categoryLabel(task.category),
    createdAt: task.createdAt,
    due: allDayStart(task.due),
    url: screen('upkeep'),
    owner: task.by,
    private: false,
    done: jobDone(task),
    cancel: jobPause(task),
  };
}

/**
 * A thing to do before an occurrence. `createdAt` is when it came up (Overview shows it from
 * `PREP_LEAD_HOURS` before its deadline), not when the event was added: the event is usually months
 * old, and each week's "Take the garbage out" is new. Done and Skip tick it in the member's name.
 */
export function prepTodo(t: PrepTask, now: number): TodoInput {
  const tick = (skipped: boolean) => [{ col: COLLECTIONS.prep, id: t.id, data: { done: true, ...(skipped ? { skipped: true } : {}), at: '$now', by: '$me' } }];
  return {
    ref: todoPrepRef(t.id),
    title: t.prep.title,
    detail: tr('todo.prepDetail', { event: midSentence(t.event.title), date: fromWords(t.occurrence.date, toYmd(now)) }),
    createdAt: t.deadline - PREP_LEAD_HOURS * HOUR,
    due: t.deadline,
    url: screen('overview'),
    owner: t.event.by,
    private: false,
    done: { label: tr('todo.done'), ops: tick(false), roles: EVERYONE },
    cancel: { label: tr('todo.skip'), ops: tick(true), roles: EVERYONE },
  };
}

/** Everything open Home publishes, for `syncTodos`: jobs due in the next two weeks (not paused), and things to do before that are coming up or late. */
export function todoItems(data: Pick<HomeData, 'tasks' | 'contacts' | 'events' | 'prep'>, now: number): TodoInput[] {
  const jobs = needsAttention(activeJobs(data.tasks), toYmd(now)).map((t) => jobTodo(t, data.contacts));
  const prep = prepTasks(data.events, data.prep, now)
    .filter((t) => t.state === 'soon' || t.state === 'due')
    .map((t) => prepTodo(t, now));
  return [...jobs, ...prep];
}
