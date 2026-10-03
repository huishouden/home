import { useState } from 'react';
import { CalendarArrowUp, CalendarX2, Pencil, Undo2 } from 'lucide-react';
import { MAX_MOVE_DAYS, NOTE_MAX, type Occurrence, type OccurrenceChange } from '@huishouden/pwa-kit/schedule';
import { addDays, clockWords, isHhmm, isYmd, longDate, type Ymd } from '@huishouden/pwa-kit/time';
import { RoleNote } from '@huishouden/pwa-kit/react/roles';
import { Dialog, Field, ghostButton, inputClass, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import type { HomeEvent } from '../lib/model';
import { fromWords } from '../lib/events';

/**
 * One occurrence of a regular event: move this one (a holiday week) or skip it without touching
 * the schedule, put it back, or edit the schedule itself.
 */
export function OccurrenceDialog({ event, occurrence, today, canChange, onChange, onEditSchedule, onClose }: {
  event: HomeEvent;
  occurrence: Occurrence;
  today: Ymd;
  /** Helpers and kids change only events they added. */
  canChange: boolean;
  onChange: (change: OccurrenceChange | null) => void;
  onEditSchedule: () => void;
  onClose: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState<Ymd>(occurrence.date);
  const [time, setTime] = useState(occurrence.time ?? '');
  const [note, setNote] = useState(occurrence.note ?? '');
  const o = occurrence;
  const changed = o.moved || o.skipped;
  // Within a month either way, so it is still found when the schedule is read for a window.
  const min = addDays(o.original, -MAX_MOVE_DAYS);
  const max = addDays(o.original, MAX_MOVE_DAYS);
  const moveOk = isYmd(date) && date >= min && date <= max && (!time || isHhmm(time)) && (date !== o.date || (time || undefined) !== o.time || note.trim() !== (o.note ?? ''));

  const done = (change: OccurrenceChange | null) => {
    onChange(change);
    onClose();
  };

  return (
    <Dialog title={event.title} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-lg text-ink">
          {o.skipped ? (
            <p className="font-semibold">Skipped this time</p>
          ) : (
            <p className="font-semibold">
              {longDate(o.date, today)}
              {o.time ? ` at ${clockWords(o.time)}` : ''}
            </p>
          )}
          {o.moved && <p className="text-base text-muted">Moved from {fromWords(o.original, today)}</p>}
          {o.note && <p className="text-base text-muted">{o.note}</p>}
        </div>

        {!canChange ? (
          <RoleNote action="edit-others" />
        ) : moving ? (
          <form
            className="space-y-3 rounded-2xl border border-line p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (moveOk) done({ moved: { date, ...(isHhmm(time) ? { time } : {}) }, ...(note.trim() ? { note: note.trim() } : {}) });
            }}
          >
            <div className="flex flex-wrap gap-3">
              <Field label="New day">
                <input className={`${inputClass} w-auto`} type="date" min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="At (optional)">
                <input className={`${inputClass} w-auto`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
            <Field label="Why (optional)">
              <input className={inputClass} maxLength={NOTE_MAX} value={note} placeholder="Holiday week" onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostButton} onClick={() => setMoving(false)}>
                Cancel
              </button>
              <button type="submit" className={primaryButton} disabled={!moveOk}>
                Move it
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            {changed && (
              <button type="button" className={`${secondaryButton} justify-start`} onClick={() => done(null)}>
                <Undo2 size={20} /> {o.skipped ? 'Put it back' : `Back to ${fromWords(o.original, today)}`}
              </button>
            )}
            {!o.skipped && (
              <button type="button" className={`${secondaryButton} justify-start`} onClick={() => setMoving(true)}>
                <CalendarArrowUp size={20} /> Move this one
              </button>
            )}
            {!o.skipped && (
              <button type="button" className={`${secondaryButton} justify-start`} onClick={() => done({ skipped: true, ...(o.note ? { note: o.note } : {}) })}>
                <CalendarX2 size={20} /> Skip this one
              </button>
            )}
            <button
              type="button"
              className={`${ghostButton} justify-start`}
              onClick={() => {
                onClose();
                onEditSchedule();
              }}
            >
              <Pencil size={20} /> Edit the schedule
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
