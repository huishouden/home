import { useState } from 'react';
import { CalendarArrowDown, ExternalLink, Pencil, Plus, Repeat } from 'lucide-react';
import type { ServiceEntry } from '../lib/model';
import { CALENDAR_WORDS } from '../lib/calendarImport';
import { splitRegular } from '../lib/events';
import { describeRule } from '@huishouden/pwa-kit/schedule';
import { clockWords } from '@huishouden/pwa-kit/time';
import type { CalendarMatch, CalendarSeries } from '@huishouden/pwa-kit/calendar';
import { formatCents } from '@huishouden/pwa-kit/money';
import { daysBetween, longDate, type Ymd, ymdParts } from '@huishouden/pwa-kit/time';
import { mayChange, type HomeStore } from '../data/types';
import { RoleNote } from '@huishouden/pwa-kit/react/roles';
import { auth } from '../data/firebase';
import { DateTile, WhoLine } from '../components/bits';
import { CalendarHint, CalendarImportDialog, useCalendarSearch } from '@huishouden/pwa-kit/react/calendar';
import { cardClass, iconButton, linkClass, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';

/** The service history: booked visits ahead, then everything done, newest first, with what it cost. */
export function History({ store, today, calendarAvailable, onAdd, onEdit, onImport, onMakeRegular }: {
  store: HomeStore;
  today: Ymd;
  calendarAvailable: boolean;
  onAdd: () => void;
  onEdit: (e: ServiceEntry) => void;
  /** Adds calendar events to the history as visits, with a toast. */
  onImport: (list: CalendarMatch[]) => void;
  /** Opens a new regular event from a repeating calendar series (garbage pickup every Thursday). */
  onMakeRegular: (series: CalendarSeries) => void;
}) {
  const [importing, setImporting] = useState(false);
  const scan = useCalendarSearch(auth, 'Home');
  const { log } = store.data;
  const booked = log.filter((e) => daysBetween(today, e.date) > 0).sort((a, b) => daysBetween(b.date, a.date));
  const done = log.filter((e) => daysBetween(today, e.date) <= 0).sort((a, b) => daysBetween(a.date, b.date) || b.createdAt - a.createdAt);
  const years = [...new Set(done.map((e) => ymdParts(e.date)!.y))].sort((a, b) => b - a);
  const runScan = () => void scan.run(CALENDAR_WORDS, { limit: 50 });
  // Repeating pickups and lawn services are offered as one regular event each, not as visits.
  const split = scan.state.status === 'done' ? splitRegular(scan.state.matches, store.data.events) : null;
  const visitsState = split ? { status: 'done' as const, matches: split.visits } : scan.state;

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
      {store.helping && <RoleNote action="edit-others" />}

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
          state={visitsState}
          intro="Pest control, lawn, HVAC, plumber, electrician, inspection, gutter, roof and pool visits from last week to a year ahead, and garbage, recycling and lawn days that repeat."
          noneFound="No house visits found in your calendars."
          allImported="Every house visit in your calendar is already in Home."
          records={log}
          onRetry={runScan}
          onAdd={onImport}
          onClose={() => {
            setImporting(false);
            scan.reset();
          }}
        >
          {split && split.offers.length > 0 && (
            <ul className="mt-4 divide-y divide-stone-200 rounded-2xl border border-forest-200 bg-forest-50" aria-label="Regular events">
              {split.offers.map((o) => (
                <li key={o.key} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-stone-800 [overflow-wrap:anywhere]">{o.title}</p>
                    <p className="text-sm text-stone-600">
                      Looks regular: {describeRule(o.rule)}
                      {o.time ? ` at ${clockWords(o.time)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      setImporting(false);
                      scan.reset();
                      onMakeRegular(o);
                    }}
                    aria-label={`Make ${o.title} a regular event`}
                  >
                    <Repeat size={18} /> Make it regular
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CalendarImportDialog>
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
      {mayChange(store, e) && (
        <button type="button" className={iconButton} onClick={onEdit} aria-label={`Edit ${e.title}`}>
          <Pencil size={18} />
        </button>
      )}
    </li>
  );
}
