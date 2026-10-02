import {
  AlarmSmoke,
  Bug,
  CloudRain,
  Droplets,
  Fan,
  FileText,
  Leaf,
  Phone,
  Trash2,
  UserRound,
  WashingMachine,
  Waves,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { telHref } from '@huishouden/pwa-kit/places';
import { CATEGORY_LABELS, type Category } from '../lib/model';
import { deleteButton, inputClass, linkClass } from '@huishouden/pwa-kit/react/ui';
import { MONTHS, ymdParts, type Ymd } from '@huishouden/pwa-kit/time';

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
  const p = ymdParts(date)!;
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

/** The red Delete at the left of a dialog footer. */
export function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={deleteButton} onClick={onClick}>
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
