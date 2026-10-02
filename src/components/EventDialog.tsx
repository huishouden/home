import { useState } from 'react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { isEventRule, type EventPrep, type EventRule } from '@huishouden/pwa-kit/schedule';
import { PrepPicker, RulePicker } from '@huishouden/pwa-kit/react/schedule';
import { isHhmm, type Hhmm, type Ymd } from '@huishouden/pwa-kit/time';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton, selectClass } from '@huishouden/pwa-kit/react/ui';
import { EVENT_KINDS, EVENT_KIND_LABELS, LIMITS, type EventInput, type EventKind, type HomeEvent } from '../lib/model';
import { EVENT_PRESETS, guessEventKind } from '../lib/events';
import { ContactSelect, DeleteButton } from './bits';

/** What each kind usually needs doing before: the title a newly ticked "Something to do before" starts with. */
const PREP_TITLES: Partial<Record<EventKind, string>> = {
  trash: 'Take the garbage out',
  recycling: 'Put the recycling out',
  'yard waste': 'Put the yard waste out',
  lawn: 'Unlock the side gate',
  cleaning: 'Tidy up',
};

/**
 * Add or edit a regular event: what, how it repeats, at what time, who comes, and something to do
 * before each one. New events start from a preset (garbage, recycling, lawn, HOA) or a blank one.
 */
export function EventDialog({ event, initial, today, contacts, onSave, onDelete, onClose }: {
  event: HomeEvent | null;
  /** For a new one: what it starts with (from a calendar series, say). */
  initial?: Partial<EventInput>;
  today: Ymd;
  contacts: Contact[];
  onSave: (input: EventInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const start = event ?? initial;
  const [title, setTitle] = useState(start?.title ?? '');
  const [kind, setKind] = useState<EventKind>(start?.kind ?? 'other');
  const [kindTouched, setKindTouched] = useState(!!event || !!initial?.kind);
  const [rule, setRule] = useState<EventRule>(start?.rule ?? { freq: 'week', every: 1, start: today });
  const [time, setTime] = useState<Hhmm | ''>(start?.time ?? '');
  const [contactId, setContactId] = useState(start?.contactId ?? '');
  const [notes, setNotes] = useState(start?.notes ?? '');
  const [prep, setPrep] = useState<EventPrep | null>(start?.prep ?? null);
  const [preset, setPreset] = useState<string | null>(null);

  const valid = title.trim().length > 0 && isEventRule(rule) && (!prep || prep.title.trim().length > 0);

  const save = () => {
    if (!valid) return;
    onSave({
      title,
      kind,
      rule,
      time: isHhmm(time) ? time : undefined,
      contactId: contactId || undefined,
      notes,
      prep: prep ?? undefined,
      exceptions: event?.exceptions,
    });
    onClose();
  };

  const usePreset = (id: string) => {
    const p = EVENT_PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setTitle(p.title);
    setKind(p.kind);
    setKindTouched(true);
    setRule(p.rule(rule.start));
    setTime(p.time ?? '');
    setPrep(p.prep ?? null);
  };

  return (
    <Dialog
      title={event ? 'Edit the schedule' : 'New regular event'}
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
        {!event && !initial && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Start from">
            {EVENT_PRESETS.map((p) => (
              <Chip key={p.id} active={preset === p.id} onClick={() => usePreset(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
        )}
        <Field label="What">
          <input
            className={inputClass}
            value={title}
            maxLength={LIMITS.title}
            placeholder="Garbage pickup"
            onChange={(e) => {
              setTitle(e.target.value);
              if (!kindTouched) setKind(guessEventKind(e.target.value) ?? 'other');
            }}
          />
        </Field>
        <Field label="Kind">
          <select
            className={selectClass}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as EventKind);
              setKindTouched(true);
            }}
          >
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        <RulePicker rule={rule} onChange={setRule} today={today} />

        <Field label="At (optional)" hint={time ? undefined : 'All day.'}>
          <input className={`${inputClass} w-auto`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>

        <PrepPicker prep={prep} onChange={setPrep} suggestedTitle={PREP_TITLES[kind] ?? ''} />

        {(contacts.length > 0 || contactId) && (
          <Field label="Who comes (optional)">
            <ContactSelect value={contactId} contacts={contacts} onChange={setContactId} empty="No one in particular" />
          </Field>
        )}
        <Field label="Notes (optional)">
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bins by the curb, lids closed" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
