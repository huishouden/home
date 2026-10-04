import { useState } from 'react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { isEventRule, type EventPrep, type EventRule } from '@huishouden/pwa-kit/schedule';
import { PrepPicker, RulePicker } from '@huishouden/pwa-kit/react/schedule';
import { isHhmm, type Hhmm, type Ymd } from '@huishouden/pwa-kit/time';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton, selectClass } from '@huishouden/pwa-kit/react/ui';
import { EVENT_KINDS, eventKindLabel, LIMITS, type EventInput, type EventKind, type HomeEvent } from '../lib/model';
import { eventPresets, guessEventKind, prepTitleFor } from '../lib/events';
import { useT } from '../i18n';
import { ContactSelect, DeleteButton } from './bits';

/**
 * Add or edit a regular event: what, how it repeats, at what time, who comes, and something to do
 * before each one. New events start from a preset (garbage, recycling, lawn, HOA) or a blank one.
 */
export function EventDialog({ event, initial, today, contacts, onSave, onDelete, onClose }: {
  event: HomeEvent | null;
  /** What it starts with: a new one from a calendar series, or an existing one's thing to do before from a calendar reminder. */
  initial?: Partial<EventInput>;
  today: Ymd;
  contacts: Contact[];
  onSave: (input: EventInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const presets = eventPresets();
  const start = event ? { ...event, ...initial } : initial;
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
    const p = presets.find((x) => x.id === id)!;
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
      title={event ? t('eventDialog.titleEdit') : t('eventDialog.titleAdd')}
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
        {!event && !initial && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('eventDialog.startFrom')}>
            {presets.map((p) => (
              <Chip key={p.id} active={preset === p.id} onClick={() => usePreset(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
        )}
        <Field label={t('form.what')}>
          <input
            className={inputClass}
            value={title}
            maxLength={LIMITS.title}
            placeholder={t('preset.trashTitle')}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!kindTouched) setKind(guessEventKind(e.target.value) ?? 'other');
            }}
          />
        </Field>
        <Field label={t('form.kind')}>
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
                {eventKindLabel(k)}
              </option>
            ))}
          </select>
        </Field>

        <RulePicker rule={rule} onChange={setRule} today={today} />

        <Field label={t('form.atOptional')} hint={time ? undefined : t('eventDialog.allDay')}>
          <input className={`${inputClass} w-auto`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>

        <PrepPicker prep={prep} onChange={setPrep} suggestedTitle={prepTitleFor(kind)} />

        {(contacts.length > 0 || contactId) && (
          <Field label={t('eventDialog.who')}>
            <ContactSelect value={contactId} contacts={contacts} onChange={setContactId} />
          </Field>
        )}
        <Field label={t('form.notesOptional')}>
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('eventDialog.notesPlaceholder')} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
