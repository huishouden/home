import { isSchedule, type Schedule } from './schedule';
import { MAX_CENTS } from './money';
import { isYmd, type Ymd } from './ymd';

// Firestore shapes under households/{householdId}. The project's rules accept exactly these keys,
// so writers build documents with the functions below and never add fields.

export const CATEGORIES = ['hvac', 'pest', 'lawn', 'gutters', 'plumbing', 'electrical', 'appliances', 'safety', 'pool', 'paperwork', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  hvac: 'Heating and cooling',
  pest: 'Pest control',
  lawn: 'Lawn and garden',
  gutters: 'Gutters and roof',
  plumbing: 'Plumbing and water',
  electrical: 'Electrical',
  appliances: 'Appliances',
  safety: 'Safety',
  pool: 'Pool',
  paperwork: 'Insurance and HOA',
  other: 'Other',
};

/** homeTasks/{id}: one recurring upkeep job. */
export interface HomeTaskData {
  title: string;
  category: Category;
  schedule: Schedule;
  /** The current due date: the next occurrence once done. */
  due: Ymd;
  lastDone?: Ymd;
  /** Who usually does it (households/{id}/contacts). */
  contactId?: string;
  notes?: string;
  /** A booked visit in Google Calendar that the due date came from. */
  calendarEventId?: string;
  calendarLink?: string;
  createdAt: number;
  updatedAt?: number;
  by: string;
}
export interface HomeTask extends HomeTaskData {
  id: string;
}

/** homeServiceLog/{id}: a visit or job, done (history) or booked (a future date). */
export interface ServiceEntryData {
  date: Ymd;
  title: string;
  /** The upkeep job this was. */
  taskId?: string;
  contactId?: string;
  /** Who did it when they aren't a saved contact: "We did it", "Neighbour's handyman". */
  who?: string;
  /** Whole cents. */
  costCents?: number;
  notes?: string;
  calendarEventId?: string;
  calendarLink?: string;
  createdAt: number;
  updatedAt?: number;
  by: string;
}
export interface ServiceEntry extends ServiceEntryData {
  id: string;
}

/** homeWarranties/{id}: an appliance or system with its purchase, warranty and papers. */
export interface WarrantyData {
  item: string;
  /** Brand, model, serial: whatever helps on the phone with support. */
  details?: string;
  purchaseDate?: Ymd;
  warrantyEnd?: Ymd;
  receiptUrl?: string;
  manualUrl?: string;
  contactId?: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  by: string;
}
export interface Warranty extends WarrantyData {
  id: string;
}

export const LIMITS = { title: 120, notes: 1000, who: 120, item: 120, details: 200, url: 500 } as const;

export const TASK_KEYS = ['title', 'category', 'schedule', 'due', 'lastDone', 'contactId', 'notes', 'calendarEventId', 'calendarLink', 'createdAt', 'updatedAt', 'by'] as const;
export const SERVICE_KEYS = ['date', 'title', 'taskId', 'contactId', 'who', 'costCents', 'notes', 'calendarEventId', 'calendarLink', 'createdAt', 'updatedAt', 'by'] as const;
export const WARRANTY_KEYS = ['item', 'details', 'purchaseDate', 'warrantyEnd', 'receiptUrl', 'manualUrl', 'contactId', 'notes', 'createdAt', 'updatedAt', 'by'] as const;

export type TaskInput = Pick<HomeTaskData, 'title' | 'category' | 'schedule' | 'due' | 'lastDone' | 'contactId' | 'notes' | 'calendarEventId' | 'calendarLink'>;
export type ServiceInput = Pick<ServiceEntryData, 'date' | 'title' | 'taskId' | 'contactId' | 'who' | 'costCents' | 'notes' | 'calendarEventId' | 'calendarLink'>;
export type WarrantyInput = Pick<WarrantyData, 'item' | 'details' | 'purchaseDate' | 'warrantyEnd' | 'receiptUrl' | 'manualUrl' | 'contactId' | 'notes'>;

const text = (s: string | undefined, max: number) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : undefined;
};

/** An https link, with "https://" added to a bare "example.com/manual.pdf"; anything else is dropped. */
export function httpsUrl(s: string | undefined): string | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  const url = /^[a-z]+:\/\//i.test(t) ? t : `https://${t}`;
  return /^https:\/\/[^\s/]+\.[^\s]+$/i.test(url) && url.length <= LIMITS.url ? url : undefined;
}

/** Copies only defined values, so documents carry what was filled in and nothing else. */
function defined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

interface Stamp {
  by: string;
  createdAt: number;
  updatedAt?: number;
}

const stamp = (s: Stamp) => ({ createdAt: Math.round(s.createdAt), ...(s.updatedAt !== undefined ? { updatedAt: Math.round(s.updatedAt) } : {}), by: s.by });

export function taskDoc(input: TaskInput, s: Stamp): HomeTaskData {
  if (!isSchedule(input.schedule)) throw new Error('Not a schedule');
  if (!isYmd(input.due)) throw new Error('No due date');
  const schedule: Schedule =
    input.schedule.kind === 'fixed'
      ? { kind: 'fixed', every: input.schedule.every, unit: input.schedule.unit, anchor: input.schedule.anchor }
      : { kind: 'after-done', every: input.schedule.every, unit: input.schedule.unit };
  return defined({
    title: input.title.trim().slice(0, LIMITS.title),
    category: CATEGORIES.includes(input.category) ? input.category : 'other',
    schedule,
    due: input.due,
    lastDone: isYmd(input.lastDone) ? input.lastDone : undefined,
    contactId: input.contactId || undefined,
    notes: text(input.notes, LIMITS.notes),
    calendarEventId: input.calendarEventId || undefined,
    calendarLink: httpsUrl(input.calendarLink),
    ...stamp(s),
  });
}

export function serviceDoc(input: ServiceInput, s: Stamp): ServiceEntryData {
  if (!isYmd(input.date)) throw new Error('No date');
  const cost = input.costCents;
  return defined({
    date: input.date,
    title: input.title.trim().slice(0, LIMITS.title),
    taskId: input.taskId || undefined,
    contactId: input.contactId || undefined,
    who: input.contactId ? undefined : text(input.who, LIMITS.who),
    costCents: Number.isInteger(cost) && cost! >= 0 && cost! <= MAX_CENTS ? cost : undefined,
    notes: text(input.notes, LIMITS.notes),
    calendarEventId: input.calendarEventId || undefined,
    calendarLink: httpsUrl(input.calendarLink),
    ...stamp(s),
  });
}

export function warrantyDoc(input: WarrantyInput, s: Stamp): WarrantyData {
  return defined({
    item: input.item.trim().slice(0, LIMITS.item),
    details: text(input.details, LIMITS.details),
    purchaseDate: isYmd(input.purchaseDate) ? input.purchaseDate : undefined,
    warrantyEnd: isYmd(input.warrantyEnd) ? input.warrantyEnd : undefined,
    receiptUrl: httpsUrl(input.receiptUrl),
    manualUrl: httpsUrl(input.manualUrl),
    contactId: input.contactId || undefined,
    notes: text(input.notes, LIMITS.notes),
    ...stamp(s),
  });
}

/** Strips the id for writing a document back (Undo). */
export const withoutId = <T extends { id: string }>({ id: _id, ...rest }: T) => rest;
