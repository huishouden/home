import { useState } from 'react';
import { CalendarArrowDown, ExternalLink, Pencil, Plus } from 'lucide-react';
import type { ServiceEntry } from '../lib/model';
import { HOME_CALENDAR_QUERIES, fromCalendar } from '../lib/calendarImport';
import { formatCents } from '@huishouden/pwa-kit/money';
import { daysBetween, longDate, type Ymd, ymdParts } from '@huishouden/pwa-kit/time';
import type { HomeStore } from '../data/types';
import { auth } from '../data/firebase';
import { DateTile, WhoLine } from '../components/bits';
import { CalendarHint, CalendarImportDialog, useCalendarSearch } from '@huishouden/pwa-kit/react/calendar';
import { cardClass, iconButton, linkClass, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';

/** The service history: booked visits ahead, then everything done, newest first, with what it cost. */
export function History({ store, today, calendarAvailable, onAdd, onEdit, notify }: {
  store: HomeStore;
  today: Ymd;
  calendarAvailable: boolean;
  onAdd: () => void;
  onEdit: (e: ServiceEntry) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const [importing, setImporting] = useState(false);
  const scan = useCalendarSearch(auth, 'Home');
  const { log, tasks } = store.data;
  const booked = log.filter((e) => daysBetween(today, e.date) > 0).sort((a, b) => daysBetween(b.date, a.date));
  const done = log.filter((e) => daysBetween(today, e.date) <= 0).sort((a, b) => daysBetween(a.date, b.date) || b.createdAt - a.createdAt);
  const years = [...new Set(done.map((e) => ymdParts(e.date)!.y))].sort((a, b) => b - a);
  const runScan = () => void scan.run(HOME_CALENDAR_QUERIES, { limit: 25 });

  return (
    <div className="mx-auto max-w-4xl space-y-6 lg:h-full lg:overflow-y-auto">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h2 className="text-2xl font-semibold text-stone-800">History</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButton}
              disabled={!calendarAvailable}
              onClick={() => {
                setImporting(true);
                // Straight from the tap: the first search opens Google's permission window.
                runScan();
              }}
            >
              <CalendarArrowDown size={20} /> Import from calendar
            </button>
            <button type="button" className={primaryButton} onClick={onAdd}>
              <Plus size={20} /> Add entry
            </button>
          </div>
        </div>
        <div className="mt-1 flex justify-end text-right">
          <CalendarHint app="Home" available={calendarAvailable} />
        </div>
      </div>

      {booked.length > 0 && (
        <section aria-label="Booked visits">
          <h3 className={`${overline} mb-2`}>Booked</h3>
          <ul className={cardClass}>
            {booked.map((e, i) => (
              <Entry key={e.id} entry={e} today={today} store={store} strong={i === 0} onEdit={() => onEdit(e)} />
            ))}
          </ul>
        </section>
      )}

      {done.length === 0 && booked.length === 0 && (
        <p className={`${cardClass} p-6 text-lg text-stone-600`}>Nothing in the history yet. Marking an upkeep job done adds it here, or add a visit by hand.</p>
      )}

      {years.map((y) => {
        const entries = done.filter((e) => e.date.startsWith(`${y}-`));
        const total = entries.reduce((s, e) => s + (e.costCents ?? 0), 0);
        return (
          <section key={y} aria-label={`Done in ${y}`}>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <h3 className={overline}>{y}</h3>
              <p className="text-base text-stone-600">
                Spent <span className="font-semibold text-stone-800 tabular-nums">{formatCents(total)}</span>
              </p>
            </div>
            <ul className={cardClass}>
              {entries.map((e) => (
                <Entry key={e.id} entry={e} today={today} store={store} onEdit={() => onEdit(e)} />
              ))}
            </ul>
          </section>
        );
      })}

      {importing && (
        <CalendarImportDialog
          state={scan.state}
          intro="Pest control, lawn, HVAC, plumber, electrician, inspection, gutter, roof and pool visits from last week to a year ahead."
          noneFound="No house visits found in your calendars."
          allImported="Every house visit in your calendar is already in Home."
          records={log}
          onRetry={runScan}
          onAdd={(list) => {
            for (const m of list) store.actions.saveEntry(null, fromCalendar(m, tasks));
            notify(list.length === 1 ? `Added ${list[0].title}` : `Added ${list.length} visits`);
          }}
          onClose={() => {
            setImporting(false);
            scan.reset();
          }}
        />
      )}
    </div>
  );
}

function Entry({ entry: e, today, store, strong, onEdit }: { entry: ServiceEntry; today: Ymd; store: HomeStore; strong?: boolean; onEdit: () => void }) {
  const contact = e.contactId ? store.data.contacts.find((c) => c.id === e.contactId) : undefined;
  return (
    <li className="flex items-start gap-4 border-b border-stone-200 p-4 last:border-b-0 sm:gap-5 sm:p-5" aria-label={`${e.title}, ${longDate(e.date, today)}`}>
      <DateTile date={e.date} strong={strong} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <p className="text-xl font-semibold text-stone-800">{e.title}</p>
          {e.costCents !== undefined && <p className="text-lg font-semibold text-stone-800 tabular-nums">{formatCents(e.costCents)}</p>}
        </div>
        <p className="text-base text-stone-600">{longDate(e.date, today)}</p>
        <WhoLine contact={contact} who={e.who} compact />
        {e.notes && <p className="mt-0.5 text-base whitespace-pre-line text-stone-600">{e.notes}</p>}
        {e.calendarLink && (
          <a className={linkClass} href={e.calendarLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" /> Open in Calendar
          </a>
        )}
      </div>
      <button type="button" className={iconButton} onClick={onEdit} aria-label={`Edit ${e.title}`}>
        <Pencil size={18} />
      </button>
    </li>
  );
}
