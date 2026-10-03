import { useState } from 'react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { LIMITS, type HomeTask, type ServiceEntry, type ServiceInput } from '../lib/model';
import { centsToInput, parseCents } from '@huishouden/pwa-kit/money';
import { plainText } from '@huishouden/pwa-kit/calendar';
import { matchTask } from '../lib/calendarImport';
import { daysBetween, isYmd, toYmd, type Ymd } from '@huishouden/pwa-kit/time';
import { CalendarFind, LinkedEvent } from '@huishouden/pwa-kit/react/calendar';
import { ContactSelect, DeleteButton } from './bits';
import { auth } from '../data/firebase';
import { Dialog, Field, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';

/** Add or edit a history entry: a visit or job on a day, who did it, what it cost. Future days are booked visits. */
export function EntryDialog({ entry, initial, today, tasks, contacts, calendarAvailable, onSave, onDelete, onClose }: {
  entry: ServiceEntry | null;
  /** Prefills a new entry (a job's "Add to history"). */
  initial?: Partial<ServiceInput>;
  today: Ymd;
  tasks: HomeTask[];
  contacts: Contact[];
  calendarAvailable: boolean;
  onSave: (input: ServiceInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const start = entry ?? initial;
  const [date, setDate] = useState<Ymd>(start?.date ?? today);
  const [title, setTitle] = useState(start?.title ?? '');
  const [taskId, setTaskId] = useState(start?.taskId ?? '');
  const [contactId, setContactId] = useState(start?.contactId ?? '');
  const [who, setWho] = useState(start?.who ?? '');
  const [cost, setCost] = useState(centsToInput(start?.costCents));
  const [notes, setNotes] = useState(start?.notes ?? '');
  const [event, setEvent] = useState(start?.calendarEventId || start?.calendarLink ? { id: start.calendarEventId, link: start.calendarLink } : null);
  const costCents = parseCents(cost);
  const valid = title.trim().length > 0 && isYmd(date) && costCents !== null;
  const booked = isYmd(date) && daysBetween(today, date) > 0;
  const linkedTask = tasks.find((t) => t.id === taskId);

  const pickTask = (id: string) => {
    setTaskId(id);
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (!title.trim()) setTitle(t.title);
    if (!contactId && t.contactId) setContactId(t.contactId);
  };

  const save = () => {
    if (!valid || costCents === null) return;
    onSave({
      date,
      title,
      taskId: taskId || undefined,
      contactId: contactId || undefined,
      who: contactId ? undefined : who,
      costCents,
      notes,
      calendarEventId: event?.id,
      calendarLink: event?.link,
    });
    onClose();
  };

  return (
    <Dialog
      title={entry ? 'Edit entry' : 'Add to history'}
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
          <input className={inputClass} value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder="Pest control visit" />
        </Field>
        <CalendarFind
          auth={auth}
          app="Home"
          query={title}
          available={calendarAvailable}
          onPick={(m) => {
            setDate(toYmd(m.start));
            const text = plainText([m.location?.trim(), plainText(m.description ?? '')].filter(Boolean).join('\n'), LIMITS.notes);
            if (text && !notes.trim()) setNotes(text);
            const t = !taskId ? matchTask(m.title, tasks) : undefined;
            if (t) pickTask(t.id);
            setEvent({ id: m.id, link: m.link });
          }}
        />
        {event && <LinkedEvent link={event.link} onUnlink={() => setEvent(null)} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" hint={booked ? 'A booked visit until then.' : undefined}>
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Cost (optional)" hint={costCents === null ? 'An amount like 95 or 95.50.' : undefined}>
            <span className="relative block">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true">
                $
              </span>
              <input className={`${inputClass} pl-7 tabular-nums`} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
            </span>
          </Field>
        </div>
        {tasks.length > 0 && (
          <Field
            label="Upkeep job (optional)"
            hint={linkedTask && !entry && !booked ? `Saving marks ${linkedTask.title} done on this day, if it is the latest time.` : undefined}
          >
            <select className={inputClass} value={taskId} onChange={(e) => pickTask(e.target.value)}>
              <option value="">Not one of the upkeep jobs</option>
              {[...tasks]
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              {taskId && !linkedTask && <option value={taskId}>A removed job</option>}
            </select>
          </Field>
        )}
        <Field label="Who">
          <ContactSelect value={contactId} contacts={contacts} onChange={setContactId} empty="Someone else, or ourselves" />
        </Field>
        {!contactId && (
          <Field label="Name (optional)">
            <input className={inputClass} value={who} maxLength={LIMITS.who} onChange={(e) => setWho(e.target.value)} placeholder="We did it" />
          </Field>
        )}
        <Field label="Notes (optional)">
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
