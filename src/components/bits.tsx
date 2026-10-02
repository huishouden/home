import {
  AlarmSmoke,
  Bug,
  CalendarSearch,
  CloudRain,
  Droplets,
  ExternalLink,
  Fan,
  FileText,
  Leaf,
  MapPin,
  Phone,
  Trash2,
  UserRound,
  WashingMachine,
  Waves,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { CalendarMatch } from '@huishouden/pwa-kit/calendar';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { telHref } from '@huishouden/pwa-kit/places';
import { CATEGORY_LABELS, type Category } from '../lib/model';
import { MONTHS, parseYmd, toYmd, type Ymd } from '../lib/ymd';
import { calendarAsked, useCalendarSearch } from '../data/calendar';
import { ErrorNotice, ghostButton, iconButton, inputClass, linkClass } from './ui';

const ICONS: Record<Category, LucideIcon> = {
  hvac: Fan,
  pest: Bug,
  lawn: Leaf,
  gutters: CloudRain,
  plumbing: Droplets,
  electrical: Zap,
  appliances: WashingMachine,
  safety: AlarmSmoke,
  pool: Waves,
  paperwork: FileText,
  other: Wrench,
};

/** The job's kind as an icon on a soft tile; terracotta when it needs attention. */
export function CategoryTile({ category, attention, size = 'md' }: { category: Category; attention?: boolean; size?: 'md' | 'lg' }) {
  const Icon = ICONS[category] ?? Wrench;
  const box = size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';
  return (
    <span
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-xl ${attention ? 'bg-terracotta-light text-terracotta-dark' : 'bg-forest-50 text-forest-700'}`}
      role="img"
      aria-label={CATEGORY_LABELS[category]}
    >
      <Icon size={size === 'lg' ? 28 : 22} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

/** "Oct" over "28": the date tile on history and visit rows. */
export function DateTile({ date, strong }: { date: Ymd; strong?: boolean }) {
  const p = parseYmd(date)!;
  return (
    <div className={`flex w-16 shrink-0 flex-col items-center rounded-xl py-1.5 ${strong ? 'bg-forest-700 text-white' : 'bg-forest-50 text-forest-700'}`} aria-hidden="true">
      <span className="text-sm font-medium">{MONTHS[p.m - 1].slice(0, 3)}</span>
      <span className="text-2xl leading-tight font-semibold tabular-nums">{p.d}</span>
    </div>
  );
}

/** Who does it: the contact's name and a tap-to-call number, or the typed name. */
export function WhoLine({ contact, who, compact }: { contact?: Contact; who?: string; compact?: boolean }) {
  if (!contact && !who) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-4 text-stone-600 ${compact ? 'text-sm' : 'text-base'}`}>
      <span className="flex min-h-11 items-center gap-1.5">
        <UserRound size={16} aria-hidden="true" /> {contact?.name ?? who}
      </span>
      {contact?.phone && (
        <a className={`${linkClass} tabular-nums`} href={telHref(contact.phone)} aria-label={`Call ${contact.name}, ${contact.phone}`}>
          <Phone size={16} aria-hidden="true" /> {contact.phone}
        </a>
      )}
    </div>
  );
}

/** One line before Google's first permission window, or why the search is off. */
export function CalendarHint({ available }: { available: boolean }) {
  if (!available) return <p className="text-base text-stone-600">Sign in to search your calendar.</p>;
  if (!calendarAsked()) return <p className="text-base text-stone-600">Google will ask once to let Home read your calendar. Home never changes it.</p>;
  return null;
}

const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Sun, Oct 19, 9:00 AM · Family". */
export function matchWhen(m: CalendarMatch): string {
  const p = parseYmd(toYmd(m.start))!;
  const day = new Date(m.start).toLocaleDateString('en-US', { weekday: 'short' });
  return `${day}, ${MONTHS[p.m - 1].slice(0, 3)} ${p.d}${m.allDay ? ', all day' : `, ${time(m.start)}`} · ${m.calendarName}`;
}

/**
 * "Find in my calendar" inside a dialog: searches for `query` (the job or visit title) and hands
 * the picked event back. The first search opens Google's permission window, so it runs on the tap.
 */
export function CalendarFind({ query, available, onPick }: { query: string; available: boolean; onPick: (m: CalendarMatch) => void }) {
  const search = useCalendarSearch();
  const q = query.trim();
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`${ghostButton} bg-forest-50 text-forest-700 hover:bg-forest-100 disabled:opacity-50`}
        disabled={!available || !q || search.state.status === 'searching'}
        onClick={() => void search.run(q)}
      >
        <CalendarSearch size={18} /> {search.state.status === 'searching' ? 'Searching your calendars' : 'Find in my calendar'}
      </button>
      <CalendarHint available={available} />
      {search.state.status === 'error' && <ErrorNotice message={search.state.message} onRetry={() => void search.run(q)} />}
      {search.state.status === 'done' && search.state.matches.length === 0 && (
        <p role="status" className="text-base text-stone-600">
          No events matching "{q}" in your calendars from last week to a year ahead.
        </p>
      )}
      {search.state.status === 'done' && search.state.matches.length > 0 && (
        <ul className="grid gap-1.5" aria-label="Calendar matches">
          {search.state.matches.map((m) => (
            <li key={`${m.id}-${m.start}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(m);
                  search.reset();
                }}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-left hover:border-forest-500 hover:bg-forest-50"
              >
                <span className="block font-medium text-stone-800 [overflow-wrap:anywhere]">{m.title}</span>
                <span className="block text-sm text-stone-600">{matchWhen(m)}</span>
                {m.location && (
                  <span className="flex items-start gap-1 text-sm text-stone-600 [overflow-wrap:anywhere]">
                    <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {m.location}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The linked calendar event inside a dialog, with a way to unlink it. */
export function LinkedEvent({ link, onUnlink }: { link?: string; onUnlink: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-forest-50 py-0.5 pr-1 pl-3 text-base text-stone-700">
      <span className="min-w-0 flex-1">From your calendar.</span>
      {link && (
        <a className={linkClass} href={link} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden="true" /> Open in Calendar
        </a>
      )}
      <button type="button" className={iconButton} aria-label="Unlink from the calendar event" onClick={onUnlink}>
        <X size={18} />
      </button>
    </div>
  );
}

/** The red Delete at the left of a dialog footer. */
export function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="mr-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium text-red-700 hover:bg-stone-100" onClick={onClick}>
      <Trash2 size={18} /> Delete
    </button>
  );
}

/** A select of the household's contacts, keeping a removed one visible until another is picked. */
export function ContactSelect({ id, value, contacts, onChange, empty = 'No one in particular' }: {
  id?: string;
  value: string;
  contacts: Contact[];
  onChange: (id: string) => void;
  empty?: string;
}) {
  const removed = value && !contacts.some((c) => c.id === value);
  return (
    <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.role ? `${c.name} (${c.role})` : c.name}
        </option>
      ))}
      {removed && <option value={value}>A removed contact</option>}
    </select>
  );
}
