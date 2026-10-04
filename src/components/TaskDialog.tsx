import { useState } from 'react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { CATEGORIES, categoryLabel, LIMITS, type Category, type HomeTask, type TaskInput } from '../lib/model';
import { MAX_EVERY, UNITS, describeSchedule, dueFromLastDone, type Schedule, type Unit } from '@huishouden/pwa-kit/schedule';
import { guessCategory } from '../lib/calendarImport';
import { initialLastDone, lastDoneChoices, savedLastDone, toLastDone, type LastDoneChoice } from '../lib/lastDone';
import { dueText } from '../lib/upkeep';
import { isYmd, longDate, toYmd, type Ymd } from '@huishouden/pwa-kit/time';
import { CalendarFind, LinkedEvent } from '@huishouden/pwa-kit/react/calendar';
import { ContactSelect, DeleteButton } from './bits';
import { auth } from '../data/firebase';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { Pause } from 'lucide-react';
import { useT } from '../i18n';

// i18n-dynamic: unit.
const UNIT_KEYS = { day: 'unit.day', week: 'unit.week', month: 'unit.month', year: 'unit.year' } as const satisfies Record<Unit, string>;

/**
 * Add or edit a recurring upkeep job: what, how often, when it was last done, when next, who does
 * it. A new job is not assumed done: "Not done yet" makes it due now. Next due follows the answer
 * live and can be set by hand; an existing job keeps its dates until either is changed.
 */
export function TaskDialog({ task, today, contacts, calendarAvailable, onSave, onDelete, onPause, onClose }: {
  task: HomeTask | null;
  today: Ymd;
  contacts: Contact[];
  calendarAvailable: boolean;
  onSave: (input: TaskInput) => void;
  onDelete?: () => void;
  /** Stops a job coming due until it is resumed (offered for an existing, unpaused job). */
  onPause?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const s = task?.schedule;
  const [title, setTitle] = useState(task?.title ?? '');
  const [category, setCategory] = useState<Category>(task?.category ?? 'other');
  const [categoryTouched, setCategoryTouched] = useState(!!task);
  const [kind, setKind] = useState<Schedule['kind']>(s?.kind ?? 'after-done');
  const [every, setEvery] = useState(String(s?.every ?? 3));
  const [unit, setUnit] = useState<Unit>(s?.unit ?? 'month');
  const [anchor, setAnchor] = useState<Ymd>(s?.kind === 'fixed' ? s.anchor : (task?.due ?? today));
  const initial = initialLastDone(task?.lastDone, today);
  const [choice, setChoice] = useState<LastDoneChoice>(initial.choice);
  const [doneOn, setDoneOn] = useState<Ymd | ''>(initial.on);
  // A date set by hand (or the job's saved one), until the answer or the schedule changes it.
  const [dueSet, setDueSet] = useState<Ymd | null>(task?.due ?? null);
  const [contactId, setContactId] = useState(task?.contactId ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [event, setEvent] = useState(task?.calendarEventId || task?.calendarLink ? { id: task.calendarEventId, link: task.calendarLink } : null);

  const n = Number(every);
  const everyOk = Number.isInteger(n) && n >= 1 && n <= MAX_EVERY;
  const schedule: Schedule | null = !everyOk ? null : kind === 'fixed' ? (isYmd(anchor) ? { kind, every: n, unit, anchor } : null) : { kind, every: n, unit };
  const last = toLastDone(choice, doneOn, today, kind);
  const nextDue: Ymd | null = dueSet && isYmd(dueSet) ? dueSet : schedule && last ? dueFromLastDone(schedule, today, last) : null;
  const valid = title.trim().length > 0 && !!schedule && !!nextDue && (choice !== 'date' || !!last);

  // A new schedule moves the date when it depends on it: set dates, or a day it was done.
  const rescheduled = (nextKind = kind) => {
    if (nextKind === 'fixed' || choice === 'today' || choice === 'date') setDueSet(null);
  };
  const answer = (c: LastDoneChoice) => {
    setChoice(c);
    setDueSet(null);
  };

  const save = () => {
    if (!valid || !schedule || !nextDue) return;
    onSave({
      title,
      category,
      schedule,
      due: nextDue,
      lastDone: savedLastDone(last),
      contactId: contactId || undefined,
      notes,
      calendarEventId: event?.id,
      calendarLink: event?.link,
    });
    onClose();
  };

  return (
    <Dialog
      title={task ? t('taskDialog.titleEdit') : t('taskDialog.titleAdd')}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <DeleteButton
              onClick={() => {
                onDelete();
                onClose();
              }}
            />
          )}
          {onPause && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                onPause();
                onClose();
              }}
            >
              <Pause size={18} /> {t('taskDialog.pause')}
            </button>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t('form.what')}>
          <input
            className={inputClass}
            value={title}
            maxLength={LIMITS.title}
            placeholder={t('taskDialog.titlePlaceholder')}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!categoryTouched) setCategory(guessCategory(e.target.value) ?? 'other');
            }}
          />
        </Field>
        <Field label={t('form.kind')}>
          <select
            className={inputClass}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              setCategoryTouched(true);
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="space-y-3 rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink-soft">{t('taskDialog.repeats')}</legend>
          <div className="flex flex-wrap gap-2">
            <Chip
              active={kind === 'after-done'}
              onClick={() => {
                setKind('after-done');
                if (choice === 'overdue') setChoice('not-yet');
                rescheduled('after-done');
              }}
            >
              {t('taskDialog.afterDone')}
            </Chip>
            <Chip
              active={kind === 'fixed'}
              onClick={() => {
                setKind('fixed');
                rescheduled('fixed');
              }}
            >
              {t('taskDialog.fixed')}
            </Chip>
          </div>
          <div className="flex items-end gap-2">
            <span className="pb-3 text-base text-ink-soft">{t('taskDialog.every')}</span>
            <label className="w-20">
              <span className="sr-only">{t('taskDialog.howMany')}</span>
              <input
                className={`${inputClass} tabular-nums`}
                inputMode="numeric"
                value={every}
                aria-label={t('taskDialog.howMany')}
                onChange={(e) => {
                  setEvery(e.target.value.replace(/\D/g, '').slice(0, 2));
                  rescheduled();
                }}
              />
            </label>
            <label className="flex-1">
              <span className="sr-only">{t('taskDialog.unit')}</span>
              <select
                className={inputClass}
                value={unit}
                aria-label={t('taskDialog.unit')}
                onChange={(e) => {
                  setUnit(e.target.value as Unit);
                  rescheduled();
                }}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(UNIT_KEYS[u], { count: n })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {kind === 'fixed' && (
            <Field label={t('taskDialog.startingOn')} hint={schedule ? `${describeSchedule(schedule)}.` : undefined}>
              <input
                className={inputClass}
                type="date"
                value={anchor}
                onChange={(e) => {
                  setAnchor(e.target.value);
                  rescheduled();
                }}
              />
            </Field>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink-soft">{t('taskDialog.lastDoneQ')}</legend>
          <div className="flex flex-wrap gap-2">
            {lastDoneChoices(kind).map((c) => (
              <Chip key={c.value} active={choice === c.value || (c.value === 'not-yet' && choice === 'overdue' && kind === 'after-done')} onClick={() => answer(c.value)}>
                {c.label}
              </Chip>
            ))}
          </div>
          {choice === 'date' && (
            <Field label={t('taskDialog.lastDone')}>
              <input
                className={inputClass}
                type="date"
                value={doneOn}
                max={today}
                onChange={(e) => {
                  setDoneOn(e.target.value);
                  setDueSet(null);
                }}
              />
            </Field>
          )}
          <Field
            label={t('taskDialog.nextDue')}
            hint={
              nextDue
                ? `${t('taskDialog.nextDueHint', { due: dueText(nextDue, today), date: longDate(nextDue, today) })}${kind === 'after-done' ? ` ${t('taskDialog.afterThat')}` : ''}`
                : choice === 'date'
                  ? t('taskDialog.pickLastDone')
                  : undefined
            }
          >
            <input className={inputClass} type="date" value={nextDue ?? ''} onChange={(e) => setDueSet(e.target.value || null)} />
          </Field>
        </fieldset>

        <CalendarFind
          auth={auth}
          app="Home"
          name={t('app.name')}
          query={title}
          available={calendarAvailable}
          onPick={(m) => {
            const day = toYmd(m.start);
            if (kind === 'fixed') {
              setAnchor(day);
              setDueSet(null);
            } else setDueSet(day);
            setEvent({ id: m.id, link: m.link });
          }}
        />
        {event && <LinkedEvent link={event.link} onUnlink={() => setEvent(null)} />}

        {(contacts.length > 0 || contactId) && (
          <Field label={t('taskDialog.who')}>
            <ContactSelect value={contactId} contacts={contacts} onChange={setContactId} empty={t('taskDialog.ourselves')} />
          </Field>
        )}
        <Field label={t('form.notesOptional')}>
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('taskDialog.notesPlaceholder')} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
