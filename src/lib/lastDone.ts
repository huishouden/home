import type { LastDone, Schedule } from '@huishouden/pwa-kit/schedule';
import { daysBetween, isYmd, type Ymd } from '@huishouden/pwa-kit/time';
import { t } from '../i18n';

// The job dialog's "When was it last done?": a new job is not assumed done. Not done yet means it
// needs doing now (after-done) or on its next date (fixed); "It's overdue" puts a fixed job on the
// date that passed. Pure: every function takes today.

export type LastDoneChoice = 'not-yet' | 'overdue' | 'today' | 'date';

/** The answers offered for a schedule: "It's overdue" only means something for set dates. */
export function lastDoneChoices(kind: Schedule['kind']): { value: LastDoneChoice; label: string }[] {
  return kind === 'after-done'
    ? [
        { value: 'not-yet', label: t('lastDone.notYetDueNow') },
        { value: 'today', label: t('lastDone.today') },
        { value: 'date', label: t('lastDone.onDate') },
      ]
    : [
        { value: 'not-yet', label: t('lastDone.notYet') },
        { value: 'overdue', label: t('lastDone.overdue') },
        { value: 'today', label: t('lastDone.today') },
        { value: 'date', label: t('lastDone.onDate') },
      ];
}

/** Where an existing job starts: its saved last-done day, or "not done yet". A new job: not done yet. */
export function initialLastDone(lastDone: Ymd | undefined, today: Ymd): { choice: LastDoneChoice; on: Ymd | '' } {
  if (!lastDone || !isYmd(lastDone)) return { choice: 'not-yet', on: '' };
  return { choice: lastDone === today ? 'today' : 'date', on: lastDone };
}

/** The answer as the kit's `LastDone`; null while "On a date" has no valid past day. */
export function toLastDone(choice: LastDoneChoice, on: Ymd | '', today: Ymd, kind: Schedule['kind']): LastDone | null {
  if (choice === 'today') return { kind: 'done', on: today };
  if (choice === 'date') return isYmd(on) && daysBetween(on, today) >= 0 ? { kind: 'done', on } : null;
  return { kind: choice === 'overdue' && kind === 'fixed' ? 'overdue' : 'not-yet' };
}

/** The last-done day saved on the job: only a day it was actually done. */
export const savedLastDone = (last: LastDone | null): Ymd | undefined => (last?.kind === 'done' ? last.on : undefined);
