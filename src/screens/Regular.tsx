import { Pencil, Plus } from 'lucide-react';
import { describePrep, describeRule } from '@huishouden/pwa-kit/schedule';
import { addDays, clockWords, type Ymd } from '@huishouden/pwa-kit/time';
import { RoleNote } from '@huishouden/pwa-kit/react/roles';
import { cardClass, iconButton, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { mayChange, type HomeStore } from '../data/types';
import { EventTile, WhoLine } from '../components/bits';
import { fromWords, nextUp, occurrencesOf, occurrenceWords } from '../lib/events';
import type { HomeEvent } from '../lib/model';
import type { Occurrence } from '@huishouden/pwa-kit/schedule';

/** How many occurrences each event lists. */
const SHOWN = 4;

/** Things that come and go on a schedule: each event, how it repeats, and its next few dates to move or skip. */
export function Regular({ store, today, onAdd, onEdit, onOpen }: {
  store: HomeStore;
  today: Ymd;
  onAdd: () => void;
  onEdit: (e: HomeEvent) => void;
  onOpen: (e: HomeEvent, o: Occurrence) => void;
}) {
  const { events, contacts } = store.data;
  // Soonest next occurrence first; events with none left (an end date passed) last.
  const order = new Map(nextUp(events, today).map((x, i) => [x.event.id, i]));
  const sorted = [...events].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.title.localeCompare(b.title));

  return (
    <div className="mx-auto max-w-4xl space-y-6 lg:h-full lg:overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 className="text-2xl font-semibold text-ink">Regular events</h2>
        <button type="button" className={primaryButton} onClick={onAdd}>
          <Plus size={20} /> Add event
        </button>
      </div>
      {store.helping && <RoleNote action="edit-others" />}
      {events.length === 0 && (
        <p className={`${cardClass} p-6 text-lg text-muted`}>
          Nothing regular yet. Add garbage and recycling pickup, the lawn service or the HOA meeting, with what to do the night before.
        </p>
      )}
      {sorted.length > 0 && (
        <ul className={cardClass}>
          {sorted.map((e) => {
            const contact = e.contactId ? contacts.find((c) => c.id === e.contactId) : undefined;
            const list = occurrencesOf(e, today, addDays(today, 400), true).slice(0, SHOWN);
            return (
              <li key={e.id} className="flex items-start gap-4 border-b border-line p-4 last:border-b-0 sm:p-5" aria-label={e.title}>
                <EventTile kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xl font-semibold text-ink">{e.title}</p>
                      <p className="text-base text-muted">
                        {describeRule(e.rule)}
                        {e.time ? ` at ${clockWords(e.time)}` : ''}
                      </p>
                      {e.prep && (
                        <p className="text-base text-muted">
                          {e.prep.title}: {describePrep(e.prep.offset).replace(/^./, (c) => c.toLowerCase())}
                        </p>
                      )}
                      <WhoLine contact={contact} compact />
                    </div>
                    {mayChange(store, e) && (
                      <button type="button" className={iconButton} onClick={() => onEdit(e)} aria-label={`Edit the schedule: ${e.title}`}>
                        <Pencil size={18} />
                      </button>
                    )}
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Next: ${e.title}`}>
                    {list.length === 0 && <li className="text-base text-muted">No more dates.</li>}
                    {list.map((o) => (
                      <li key={o.original}>
                        <button
                          type="button"
                          onClick={() => onOpen(e, o)}
                          className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors duration-150 hover:border-forest-400 ${
                            o.skipped ? 'border-line bg-sunken text-muted line-through' : o.moved ? 'border-forest-200 bg-tint dark:border-forest-600 text-link' : 'border-line bg-surface text-ink-soft'
                          }`}
                          aria-label={`${e.title}, ${occurrenceWords(o, today)}${o.skipped ? ', skipped' : o.moved ? `, moved from ${fromWords(o.original, today)}` : ''}`}
                        >
                          {o.skipped ? occurrenceWords({ date: o.original }, today) : occurrenceWords(o, today)}
                          {o.moved && <span className="font-normal">· moved</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
