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
import { compareText } from '@huishouden/pwa-kit/i18n';
import { useT } from '../i18n';

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
  const t = useT();
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
      title={entry ? t('entryDialog.titleEdit') : t('entryDialog.titleAdd')}
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
          <input className={inputClass} value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder={t('entryDialog.titlePlaceholder')} />
        </Field>
        <CalendarFind
          auth={auth}
          app="Home"
          name={t('app.name')}
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
          <Field label={t('common.date')} hint={booked ? t('entryDialog.bookedHint') : undefined}>
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('entryDialog.cost')} hint={costCents === null ? t('entryDialog.costHint', { whole: '95', example: centsToInput(9550) }) : undefined}>
            <input className={`${inputClass} tabular-nums`} type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={centsToInput(0)} />
          </Field>
        </div>
        {tasks.length > 0 && (
          <Field
            label={t('entryDialog.job')}
            hint={linkedTask && !entry && !booked ? t('entryDialog.jobHint', { name: linkedTask.title }) : undefined}
          >
            <select className={inputClass} value={taskId} onChange={(e) => pickTask(e.target.value)}>
              <option value="">{t('entryDialog.noJob')}</option>
              {[...tasks]
                .sort((a, b) => compareText(a.title, b.title))
                .map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              {taskId && !linkedTask && <option value={taskId}>{t('entryDialog.removedJob')}</option>}
            </select>
          </Field>
        )}
        <Field label={t('entryDialog.who')}>
          <ContactSelect value={contactId} contacts={contacts} onChange={setContactId} empty={t('entryDialog.someoneElse')} />
        </Field>
        {!contactId && (
          <Field label={t('entryDialog.name')}>
            <input className={inputClass} value={who} maxLength={LIMITS.who} onChange={(e) => setWho(e.target.value)} placeholder={t('entryDialog.namePlaceholder')} />
          </Field>
        )}
        <Field label={t('form.notesOptional')}>
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
