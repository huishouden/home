import { useState } from 'react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { CATEGORIES, CATEGORY_LABELS, LIMITS, type Category, type HomeTask, type TaskInput } from '../lib/model';
import { MAX_EVERY, UNITS, describeSchedule, firstDue, occurrenceOnOrAfter, type Schedule, type Unit } from '../lib/schedule';
import { guessCategory } from '../lib/calendarImport';
import { formatDay, isYmd, toYmd, type Ymd } from '../lib/ymd';
import { CalendarFind, ContactSelect, DeleteButton, LinkedEvent } from './bits';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from './ui';

const UNIT_LABELS: Record<Unit, [string, string]> = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], year: ['year', 'years'] };

const sameSchedule = (a: Schedule, b: Schedule) =>
  a.kind === b.kind && a.every === b.every && a.unit === b.unit && (a.kind !== 'fixed' || (b.kind === 'fixed' && a.anchor === b.anchor));

/** Add or edit a recurring upkeep job: what, how often, when next, who does it. */
export function TaskDialog({ task, today, contacts, calendarAvailable, onSave, onDelete, onClose }: {
  task: HomeTask | null;
  today: Ymd;
  contacts: Contact[];
  calendarAvailable: boolean;
  onSave: (input: TaskInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const s = task?.schedule;
  const [title, setTitle] = useState(task?.title ?? '');
  const [category, setCategory] = useState<Category>(task?.category ?? 'other');
  const [categoryTouched, setCategoryTouched] = useState(!!task);
  const [kind, setKind] = useState<Schedule['kind']>(s?.kind ?? 'after-done');
  const [every, setEvery] = useState(String(s?.every ?? 3));
  const [unit, setUnit] = useState<Unit>(s?.unit ?? 'month');
  const [anchor, setAnchor] = useState<Ymd>(s?.kind === 'fixed' ? s.anchor : (task?.due ?? today));
  const [due, setDue] = useState<Ymd>(task?.due ?? today);
  const [lastDone, setLastDone] = useState<Ymd>(task?.lastDone ?? '');
  const [contactId, setContactId] = useState(task?.contactId ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [event, setEvent] = useState(task?.calendarEventId || task?.calendarLink ? { id: task.calendarEventId, link: task.calendarLink } : null);

  const n = Number(every);
  const everyOk = Number.isInteger(n) && n >= 1 && n <= MAX_EVERY;
  const schedule: Schedule | null = !everyOk ? null : kind === 'fixed' ? { kind, every: n, unit, anchor } : { kind, every: n, unit };
  // Fixed dates follow from the schedule; an unchanged schedule keeps its current (maybe overdue) date.
  const nextDue: Ymd | null = !schedule
    ? null
    : schedule.kind === 'fixed'
      ? isYmd(anchor)
        ? task && sameSchedule(task.schedule, schedule)
          ? task.due
          : occurrenceOnOrAfter(schedule, today)
        : null
      : isYmd(due)
        ? due
        : null;
  const valid = title.trim().length > 0 && !!schedule && !!nextDue;

  const save = () => {
    if (!valid || !schedule || !nextDue) return;
    onSave({
      title,
      category,
      schedule,
      due: nextDue,
      lastDone: isYmd(lastDone) ? lastDone : undefined,
      contactId: contactId || undefined,
      notes,
      calendarEventId: event?.id,
      calendarLink: event?.link,
    });
    onClose();
  };

  // A new after-done job with a last-done day starts one interval later, until a date is picked.
  const suggestDue = (last: Ymd, e = every, u = unit) => {
    const count = Number(e);
    if (task || kind !== 'after-done' || !Number.isInteger(count) || count < 1) return;
    setDue(firstDue({ kind: 'after-done', every: count, unit: u }, today, isYmd(last) ? last : undefined));
  };

  return (
    <Dialog
      title={task ? 'Edit job' : 'New upkeep job'}
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
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            Save
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
        <Field label="What">
          <input
            className={inputClass}
            value={title}
            maxLength={LIMITS.title}
            placeholder="Change HVAC filter"
            onChange={(e) => {
              setTitle(e.target.value);
              if (!categoryTouched) setCategory(guessCategory(e.target.value) ?? 'other');
            }}
          />
        </Field>
        <Field label="Kind">
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
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="space-y-3 rounded-2xl border border-stone-200 p-4">
          <legend className="px-1 text-sm font-medium text-stone-700">Repeats</legend>
          <div className="flex flex-wrap gap-2">
            <Chip active={kind === 'after-done'} onClick={() => setKind('after-done')}>
              Counted from when it's done
            </Chip>
            <Chip active={kind === 'fixed'} onClick={() => setKind('fixed')}>
              On set dates
            </Chip>
          </div>
          <div className="flex items-end gap-2">
            <span className="pb-3 text-base text-stone-700">Every</span>
            <label className="w-20">
              <span className="sr-only">How many</span>
              <input
                className={`${inputClass} tabular-nums`}
                inputMode="numeric"
                value={every}
                aria-label="How many"
                onChange={(e) => {
                  setEvery(e.target.value.replace(/\D/g, '').slice(0, 2));
                  suggestDue(lastDone, e.target.value, unit);
                }}
              />
            </label>
            <label className="flex-1">
              <span className="sr-only">Unit</span>
              <select
                className={inputClass}
                value={unit}
                aria-label="Unit"
                onChange={(e) => {
                  setUnit(e.target.value as Unit);
                  suggestDue(lastDone, every, e.target.value as Unit);
                }}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u][n === 1 ? 0 : 1]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {kind === 'fixed' ? (
            <Field label="Starting on" hint={schedule && nextDue ? `${describeSchedule(schedule)}. Next due ${formatDay(nextDue, today)}.` : undefined}>
              <input className={inputClass} type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
            </Field>
          ) : (
            <Field label="Next due" hint="After that, it counts from the day it is marked done.">
              <input className={inputClass} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          )}
        </fieldset>

        <CalendarFind
          query={title}
          available={calendarAvailable}
          onPick={(m) => {
            const day = toYmd(m.start);
            if (kind === 'fixed') setAnchor(day);
            else setDue(day);
            setEvent({ id: m.id, link: m.link });
          }}
        />
        {event && <LinkedEvent link={event.link} onUnlink={() => setEvent(null)} />}

        <Field label="Last done (optional)">
          <input
            className={inputClass}
            type="date"
            value={lastDone}
            max={today}
            onChange={(e) => {
              setLastDone(e.target.value);
              suggestDue(e.target.value);
            }}
          />
        </Field>
        {(contacts.length > 0 || contactId) && (
          <Field label="Who does it (optional)">
            <ContactSelect value={contactId} contacts={contacts} onChange={setContactId} empty="We do it ourselves" />
          </Field>
        )}
        <Field label="Notes (optional)">
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Filter size, where the shut-off valve is" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
