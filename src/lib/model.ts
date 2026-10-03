import {
  cleanRule, happensOn, isEventPrep, isEventRule, toChange, type EventPrep, type EventRule, type OccurrenceChanges, PREP_TITLE_MAX, isSchedule, type Schedule,
} from '@huishouden/pwa-kit/schedule';
import { MAX_CENTS } from '@huishouden/pwa-kit/money';
import { isHhmm, isYmd, type Hhmm, type Ymd } from '@huishouden/pwa-kit/time';

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
  /** Paused (ms): kept with its schedule, but not due anywhere until resumed. */
  pausedAt?: number;
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

export const EVENT_KINDS = ['trash', 'recycling', 'yard waste', 'lawn', 'hoa', 'cleaning', 'other'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  trash: 'Garbage',
  recycling: 'Recycling',
  'yard waste': 'Yard waste',
  lawn: 'Lawn and garden',
  hoa: 'HOA',
  cleaning: 'Cleaning',
  other: 'Other',
};

/**
 * homeEvents/{id}: something that comes and goes on a schedule without anyone completing it
 * (garbage pickup, a lawn service). One occurrence moved or skipped is a change keyed by the day
 * the schedule put it on (`exceptions`), so the schedule itself stays put.
 */
export interface HomeEventData {
  title: string;
  kind: EventKind;
  rule: EventRule;
  /** When it happens on its day; all day without one. */
  time?: Hhmm;
  contactId?: string;
  notes?: string;
  /** Something to do before each occurrence: "Take the garbage out", the evening before. */
  prep?: EventPrep;
  exceptions?: OccurrenceChanges;
  createdAt: number;
  updatedAt?: number;
  by: string;
}
export interface HomeEvent extends HomeEventData {
  id: string;
}

/**
 * homeEventPrep/{eventId}_{day}: the thing to do before one occurrence, ticked off. `day` is the
 * occurrence's original day. `skipped`: not needed this time (still `done`, so it no longer comes due).
 */
export interface PrepTickData {
  done: true;
  skipped?: true;
  /** When it was ticked, ms. */
  at: number;
  by: string;
}
export interface PrepTick extends PrepTickData {
  id: string;
}

export const prepTickId = (eventId: string, original: Ymd) => `${eventId}_${original}`;

export const LIMITS = { title: 120, notes: 1000, who: 120, item: 120, details: 200, url: 500 } as const;

export const TASK_KEYS = ['title', 'category', 'schedule', 'due', 'lastDone', 'contactId', 'notes', 'calendarEventId', 'calendarLink', 'pausedAt', 'createdAt', 'updatedAt', 'by'] as const;
export const SERVICE_KEYS = ['date', 'title', 'taskId', 'contactId', 'who', 'costCents', 'notes', 'calendarEventId', 'calendarLink', 'createdAt', 'updatedAt', 'by'] as const;
export const EVENT_KEYS = ['title', 'kind', 'rule', 'time', 'contactId', 'notes', 'prep', 'exceptions', 'createdAt', 'updatedAt', 'by'] as const;
export const PREP_TICK_KEYS = ['done', 'skipped', 'at', 'by'] as const;
export const WARRANTY_KEYS = ['item', 'details', 'purchaseDate', 'warrantyEnd', 'receiptUrl', 'manualUrl', 'contactId', 'notes', 'createdAt', 'updatedAt', 'by'] as const;

export type TaskInput = Pick<HomeTaskData, 'title' | 'category' | 'schedule' | 'due' | 'lastDone' | 'contactId' | 'notes' | 'calendarEventId' | 'calendarLink'>;
export type ServiceInput = Pick<ServiceEntryData, 'date' | 'title' | 'taskId' | 'contactId' | 'who' | 'costCents' | 'notes' | 'calendarEventId' | 'calendarLink'>;
export type EventInput = Pick<HomeEventData, 'title' | 'kind' | 'rule' | 'time' | 'contactId' | 'notes' | 'prep' | 'exceptions'>;
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

/**
 * The stored event: a clean rule, a valid time and prep, and only the changes that still fall on
 * the schedule (editing the schedule drops changes to days it no longer has).
 */
export function eventDoc(input: EventInput, s: Stamp): HomeEventData {
  const rule = cleanRule(input.rule);
  if (!isEventRule(rule)) throw new Error('Not a schedule');
  const title = input.title.trim().slice(0, LIMITS.title);
  if (!title) throw new Error('No title');
  const prepTitle = input.prep?.title.trim().slice(0, PREP_TITLE_MAX);
  const prep = input.prep && prepTitle ? { title: prepTitle, offset: { daysBefore: input.prep.offset.daysBefore, time: input.prep.offset.time }, remind: input.prep.remind === true } : undefined;
  const exceptions = Object.fromEntries(
    Object.entries(input.exceptions ?? {})
      .map(([day, c]) => [day, toChange(c)] as const)
      .filter(([day, c]) => c && isYmd(day) && happensOn(rule, day)),
  ) as OccurrenceChanges;
  return defined({
    title,
    kind: EVENT_KINDS.includes(input.kind) ? input.kind : 'other',
    rule,
    time: isHhmm(input.time) ? input.time : undefined,
    contactId: input.contactId || undefined,
    notes: text(input.notes, LIMITS.notes),
    prep: prep && isEventPrep(prep) ? prep : undefined,
    exceptions: Object.keys(exceptions).length ? exceptions : undefined,
    ...stamp(s),
  });
}

export const prepTickDoc = (by: string, at: number, skipped = false): PrepTickData => ({ done: true, ...(skipped ? { skipped: true as const } : {}), at: Math.round(at), by });

