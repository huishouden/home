import type { AgendaEdit, AgendaInput } from '@huishouden/pwa-kit/agenda';
import type { CalendarEntry } from '@huishouden/pwa-kit/calendar-export';
import type { Role } from '@huishouden/pwa-kit/roles';
import { looksLikePrep, recurringSeries, seriesCover, similarTitles, type CalendarMatch, type CalendarSeries } from '@huishouden/pwa-kit/calendar';
import { allDayStart, inAgendaWindow } from '@huishouden/pwa-kit/agenda';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { ReminderInput } from '@huishouden/pwa-kit/reminders';
import {
  describeRule, eventOccurrences, prepState, prepWindow, pruneChanges, weekdayOfMonth, withChange,
  type EventPrep, type EventRule, type Nth, type Occurrence, type OccurrenceChange, type PrepState,
} from '@huishouden/pwa-kit/schedule';
import { HOUR, addDays, atClock, atTime, clockWords, daysBetween, formatDayShort, formatYmd, midSentence, shortDate, toYmd, weekday, weekdayName, weekdayShort, ymdParts, type Hhmm, type Ymd } from '@huishouden/pwa-kit/time';
import { capitalize, type Lang } from '@huishouden/pwa-kit/i18n';
import { t } from '../i18n';
import { prepTickId, type EventInput, type EventKind, type HomeEvent, type PrepTick } from './model';

// Regular events (garbage pickup, a lawn service) and the things to do before them: what the
// screens list, what Needs doing shows, and what goes on the household agenda and into reminders.
// Pure: every function takes `now` or `today`.

// ---- Presets for the add dialog ----

export interface EventPreset {
  id: string;
  label: string;
  title: string;
  kind: EventKind;
  rule: (today: Ymd) => EventRule;
  time?: Hhmm;
  prep?: EventPrep;
}

const evening = { daysBefore: 1, time: '19:00' };

/** The presets in the active language: what a new event is called is the household's own words. */
export function eventPresets(): EventPreset[] {
  return [
    { id: 'trash', label: t('preset.trash'), title: t('preset.trashTitle'), kind: 'trash', rule: (start) => ({ freq: 'week', every: 1, start }), prep: { title: t('prep.trash'), offset: evening, remind: true } },
    { id: 'recycling', label: t('preset.recycling'), title: t('preset.recyclingTitle'), kind: 'recycling', rule: (start) => ({ freq: 'week', every: 2, start }), prep: { title: t('prep.recycling'), offset: evening, remind: true } },
    { id: 'yard', label: t('preset.yard'), title: t('preset.yardTitle'), kind: 'yard waste', rule: (start) => ({ freq: 'week', every: 1, start }), prep: { title: t('prep.yard'), offset: evening, remind: false } },
    { id: 'lawn', label: t('preset.lawn'), title: t('preset.lawnTitle'), kind: 'lawn', rule: (start) => ({ freq: 'week', every: 2, start }) },
    {
      id: 'hoa',
      label: t('preset.hoa'),
      title: t('preset.hoaTitle'),
      kind: 'hoa',
      time: '19:00',
      rule: (start) => {
        const w = weekdayOfMonth(start);
        return { freq: 'month', every: 1, start, nth: (w.last && w.nth === 5 ? -1 : Math.min(w.nth, 4)) as Nth, weekday: w.weekday };
      },
    },
    { id: 'cleaning', label: t('preset.cleaning'), title: t('preset.cleaningTitle'), kind: 'cleaning', rule: (start) => ({ freq: 'week', every: 2, start }) },
  ];
}

/** What each kind usually needs doing before, in the active language: the title a newly ticked "Something to do before" starts with. */
export function prepTitleFor(kind: EventKind): string {
  if (kind === 'trash') return t('prep.trash');
  if (kind === 'recycling') return t('prep.recycling');
  if (kind === 'yard waste') return t('prep.yard');
  if (kind === 'lawn') return t('prep.lawn');
  if (kind === 'cleaning') return t('prep.cleaning');
  return '';
}

// Words calendars and typed titles use for each kind, in English, Spanish and Dutch: households
// name their pickups in their own language whatever language the app is in. Checked in this order
// ("plastic afval" is recycling, "gft-afval" yard waste, before plain "afval").
const KIND_WORDS: [EventKind, RegExp][] = [
  ['recycling', /\b(recycl\w*|reciclaj\w*|reciclables?|oud ?papier|papier en karton|plastic|pmd)\b/i],
  [
    'yard waste',
    /\b(yard waste|green waste|garden waste|compost|leaf pickup|brush pickup|residuos de jard[ií]n|restos de poda|poda|gft\w*|groenafval|tuinafval|snoeiafval)\b/i,
  ],
  ['trash', /\b(garbage|trash|rubbish|refuse|bins?|waste|basura|desechos|residuos|afval\w*|restafval|vuilnis\w*|huisvuil|kliko)\b/i],
  ['lawn', /\b(lawn|landscap\w*|mow\w*|gardener|c[ée]sped|pasto|jardiner\w*|jard[ií]n(?! de ni[ñn]os| infantil)|grasmaai\w*|gras maaien|tuinman|hovenier|tuinonderhoud|tuin)\b/i],
  ['hoa', /\b(hoa|homeowners|asociaci[óo]n de (?:propietarios|vecinos)|(?:junta|reuni[óo]n) de vecinos|vve)\b/i],
  ['cleaning', /\b(clean\w*|maid|housekeep\w*|limpieza|limpiar|schoonma\w*|werkster|poetsen)\b/i],
];

/** The kind of regular event a title is about ("Recycling pickup" → recycling), or null. */
export function guessEventKind(title: string): EventKind | null {
  for (const [kind, re] of KIND_WORDS) if (re.test(title)) return kind;
  return null;
}

/**
 * What calendar suggestions look for beyond house visits, so pickups can be offered as regular
 * events, by the language a household's calendar may be in.
 */
export const REGULAR_CALENDAR_QUERIES: Record<Lang, readonly string[]> = {
  en: ['garbage', 'trash', 'recycling', 'yard waste', 'landscape'],
  es: ['basura', 'reciclaje', 'césped', 'jardín'],
  nl: ['afval', 'vuilnis', 'oud papier', 'gft', 'plastic', 'grasmaaien', 'tuin'],
};

/** Calendar events about these are offered as a regular event when they repeat (English, Spanish, Dutch). */
export const REGULAR_WORDS =
  /\b(garbage|trash|recycl\w*|yard waste|lawn|landscap\w*|basura|reciclaj\w*|c[ée]sped|jard[ií]n(?! de ni[ñn]os| infantil)|afval\w*|vuilnis\w*|oud ?papier|gft\w*|plastic|pmd|grasmaai\w*|tuin)/i;

const sameTitle = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether the household already has a regular event by this name (so its calendar occurrences aren't offered again). */
export const hasEventNamed = (events: Pick<HomeEvent, 'title'>[], title: string) => events.some((e) => sameTitle(e.title, title));

/** A calendar series that is the reminder before an event the household has: offered as its thing to do before. */
export interface PrepOffer {
  series: CalendarSeries;
  event: HomeEvent;
  prep: EventPrep;
}

/** Whether an event is about what a calendar series is about: the same kind (garbage, recycling, lawn...). */
const relatedTo = (s: CalendarSeries, e: Pick<HomeEvent, 'title' | 'kind'>) => {
  const kind = guessEventKind(s.title);
  return !!kind && (e.kind === kind || guessEventKind(e.title) === kind);
};

/** "Garbage out for Monday Pickup" → "Garbage out for pickup": the reminder for one weekday becomes the one for every pickup. */
export function prepTitleFrom(title: string): string {
  const t = title.trim().replace(/\s+(for|before)\s+(?:the\s+)?(?:sun|mon|tues|wednes|thurs|fri|satur)day(?:'s)?\b/i, ' $1').replace(/\s+/g, ' ');
  if (t === title.trim()) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Calendar events split into regular-event offers (garbage, recycling and lawn events that repeat:
 * one offer per series), reminders offered as an event's thing to do before, and the rest, offered
 * as visits. A series an event already covers is neither offered nor a visit: one with a title
 * like the event's, one on the event's days and rhythm, or one where its thing to do before goes
 * ("Garbage out for Monday pickup" every Sunday evening, before a Monday pickup). That last one is
 * offered as the thing to do before when the event has none and it reads as a reminder (one offer
 * per event). Occurrences of an event the household already has by name are neither.
 */
export function splitRegular(matches: CalendarMatch[], events: HomeEvent[]): { offers: CalendarSeries[]; prepOffers: PrepOffer[]; visits: CalendarMatch[] } {
  const fresh = matches.filter((m) => !hasEventNamed(events, m.title));
  const offers: CalendarSeries[] = [];
  const prepOffers: PrepOffer[] = [];
  const taken = new Set<string>();
  for (const s of recurringSeries(fresh).series) {
    const known = events.some((e) => similarTitles(e.title, s.title));
    const cover = known ? null : seriesCover(s, events, { related: relatedTo });
    if (!known && !cover) {
      if (REGULAR_WORDS.test(s.title)) offers.push(s);
      else continue;
    } else if (cover?.as === 'prep' && cover.offset && !cover.event.prep && looksLikePrep(s) && !prepOffers.some((o) => o.event.id === cover.event.id)) {
      prepOffers.push({ series: s, event: cover.event, prep: { title: prepTitleFrom(s.title), offset: cover.offset, remind: true } });
    }
    for (const m of s.matches) taken.add(m.id);
  }
  return { offers, prepOffers, visits: fresh.filter((m) => !taken.has(m.id)) };
}

/** A new regular event from a calendar series: its title, kind, schedule and time. */
export const fromSeries = (s: CalendarSeries): Partial<EventInput> => ({
  title: s.title,
  kind: guessEventKind(s.title) ?? 'other',
  rule: s.rule,
  ...(s.time ? { time: s.time } : {}),
});

// ---- Occurrences ----

export function occurrencesOf(event: HomeEvent, from: Ymd, to: Ymd, includeSkipped = false): Occurrence[] {
  return eventOccurrences(event.rule, from, to, { time: event.time, changes: event.exceptions, includeSkipped });
}

/** "Thu, Oct 30" ("jue, 30 oct", "do 30 okt"), with the year when it isn't this one; lowercase where the language writes it so mid-sentence. */
function dayShort(day: Ymd, today: Ymd): string {
  const noon = atTime(day, '12:00');
  return ymdParts(day)!.y === ymdParts(today)!.y ? formatDayShort(noon) : formatYmd(day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Today", "Tomorrow", "Thu", "Thu, Oct 30"; with the time: "Thu 7 AM", "Thu, Oct 30, 7 AM". */
export function occurrenceWords(o: Pick<Occurrence, 'date' | 'time'>, today: Ymd): string {
  const n = daysBetween(today, o.date);
  const near = n >= 0 && n < 7;
  const day = n === 0 ? t('occurrence.today') : n === 1 ? t('occurrence.tomorrow') : n > 1 && n < 7 ? capitalize(weekdayShort(atTime(o.date, '12:00'))) : capitalize(dayShort(o.date, today));
  if (!o.time) return day;
  return t(near ? 'occurrence.nearTime' : 'occurrence.farTime', { day, time: clockWords(o.time) });
}

/** "Thu, Dec 25": how a moved one says where it came from. */
export const fromWords = (original: Ymd, today: Ymd) => dayShort(original, today);

export interface NextUp {
  event: HomeEvent;
  occurrence: Occurrence;
}

/**
 * Each event's next occurrence from today (skipped ones passed over), soonest first. With `now`,
 * one earlier today at a time that has passed is over: the one after it is next.
 */
export function nextUp(events: HomeEvent[], today: Ymd, now?: number, withinDays = 400): NextUp[] {
  return events
    .map((event) => ({
      event,
      occurrence: occurrencesOf(event, today, addDays(today, withinDays)).find((o) => now === undefined || !o.time || o.date > today || atTime(o.date, o.time) > now),
    }))
    .filter((x): x is NextUp => !!x.occurrence)
    .sort(
      (a, b) =>
        a.occurrence.date.localeCompare(b.occurrence.date) || (a.occurrence.time ?? '').localeCompare(b.occurrence.time ?? '') || a.event.title.localeCompare(b.event.title),
    );
}

// ---- Things to do before ----

/** Needs doing shows a thing to do before from this many hours ahead of its deadline: 7 PM's from 5 AM, 7 AM's from 5 PM the evening before. */
export const PREP_LEAD_HOURS = 14;

export interface PrepTask {
  event: HomeEvent;
  prep: EventPrep;
  occurrence: Occurrence;
  /** homeEventPrep id: the event and the occurrence's original day. */
  id: string;
  deadline: number;
  missedAt: number;
  state: PrepState;
  tick?: PrepTick;
}

/** Every thing to do before an occurrence from `from` to `to` (by the occurrence's day), with where it stands. */
export function prepTasksBetween(events: HomeEvent[], ticks: PrepTick[], from: Ymd, to: Ymd, now: number): PrepTask[] {
  const ticked = new Map(ticks.map((t) => [t.id, t]));
  const out: PrepTask[] = [];
  for (const event of events) {
    if (!event.prep) continue;
    for (const occurrence of occurrencesOf(event, from, addDays(to, event.prep.offset.daysBefore))) {
      const id = prepTickId(event.id, occurrence.original);
      const tick = ticked.get(id);
      const window = prepWindow(occurrence, event.prep.offset);
      if (window.day > to) continue;
      out.push({ event, prep: event.prep, occurrence, id, ...window, state: prepState(window, now, !!tick, PREP_LEAD_HOURS), ...(tick ? { tick } : {}) });
    }
  }
  return out.sort((a, b) => a.deadline - b.deadline);
}

/**
 * What Needs doing shows: things to do before that are coming up (from `PREP_LEAD_HOURS` ahead),
 * late, or missed (until the end of the event's day), and ones done, until the event begins.
 * Late and missed first.
 */
export function prepTasks(events: HomeEvent[], ticks: PrepTick[], now: number): PrepTask[] {
  const today = toYmd(now);
  const shown = prepTasksBetween(events, ticks, addDays(today, -1), addDays(today, 2), now).filter((t) => {
    if (t.state === 'soon' || t.state === 'due') return true;
    if (t.state === 'missed') return t.occurrence.date >= today;
    if (t.state === 'done') return now >= t.deadline - PREP_LEAD_HOURS * HOUR && now < t.missedAt;
    return false;
  });
  const rank: Record<PrepState, number> = { missed: 0, due: 1, soon: 2, done: 3, later: 4 };
  return shown.sort((a, b) => rank[a.state] - rank[b.state] || a.deadline - b.deadline);
}

/** "Garbage pickup tomorrow at 7 AM", "Lawn service today": the event, seen from the deadline's day. */
export function eventWhen(event: Pick<HomeEvent, 'title'>, o: Pick<Occurrence, 'date' | 'time'>, from: Ymd): string {
  const n = daysBetween(from, o.date);
  const title = event.title;
  const when =
    n === 0
      ? t('eventWhen.today', { title })
      : n === 1
        ? t('eventWhen.tomorrow', { title })
        : n > 1 && n < 7
          ? t('eventWhen.weekday', { title, weekday: weekdayName(weekday(o.date)) })
          : t('eventWhen.date', { title, date: shortDate(o.date, from) });
  return o.time ? t('eventWhen.withTime', { when, at: atClock(o.time) }) : when;
}

// ---- The household agenda and reminders ----

export const eventRef = (id: string) => `event:${id}`;
export const prepRef = (id: string) => `prep:${id}`;

/** Occurrences go on the agenda this many days ahead. */
export const EVENT_AGENDA_DAYS = 60;

/** Visits by someone (a lawn service, cleaners, the HOA meeting) are appointments; pickups are just things that happen. */
const agendaKind = (kind: EventKind) => (kind === 'lawn' || kind === 'cleaning' || kind === 'hoa' ? 'appointment' : 'other');

type AgendaEntry = Omit<AgendaInput, 'ref'>;
const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;

/** How long an occurrence takes, for calendars: a pickup is quick, a lawn service or cleaners take a while. */
export const EVENT_MINUTES: Record<EventKind, number> = { trash: 30, recycling: 30, 'yard waste': 30, lawn: 120, hoa: 60, cleaning: 180, other: 60 };

const STAFF: Role[] = ['admin', 'member'];

/**
 * How a change made in a person's own calendar comes back to the event (huishouden/calendar): one
 * occurrence moved or skipped (a change keyed by the day the schedule put it on, `$original`), the
 * usual time changed, the event renamed, or notes when it has none. As the person: admins and
 * members, or whoever added the event.
 */
export function eventEdit(event: HomeEvent): AgendaEdit {
  const merge = (data: Record<string, unknown>) => ({ ops: [{ col: 'homeEvents', id: event.id, data: { ...data, updatedAt: '$now' }, merge: true }], roles: STAFF, emails: [event.by] });
  return {
    reschedule: merge({ exceptions: { $original: { moved: { date: '$date', time: '$time' } } } }),
    skip: merge({ exceptions: { $original: { skipped: true } } }),
    rename: merge({ title: '$title' }),
    ...(event.time ? { retime: merge({ time: '$time' }) } : {}),
    ...(event.notes ? {} : { notes: merge({ notes: '$notes' }) }),
  };
}

/**
 * Each occurrence of the next 60 days, on its day (at its time, or all day), with no status: it just
 * happens. Each carries the schedule (`series`), so a calendar shows one repeating event, and the
 * edits that bring changes made there back.
 */
export function eventAgenda(event: HomeEvent, contacts: Contact[], now: number, url: string): AgendaEntry[] {
  const today = toYmd(now);
  const through = addDays(today, EVENT_AGENDA_DAYS);
  const who = event.contactId ? contacts.find((c) => c.id === event.contactId)?.name : undefined;
  const minutes = EVENT_MINUTES[event.kind] ?? 60;
  const edit = eventEdit(event);
  return occurrencesOf(event, today, through)
    .map((o): AgendaEntry => {
      const start = o.time ? atTime(o.date, o.time) : allDayStart(o.date);
      return {
        kind: agendaKind(event.kind),
        title: event.title,
        start,
        ...(o.time ? { end: start + minutes * 60_000 } : {}),
        allDay: !o.time,
        detail: joined(o.moved ? t('events.movedFrom', { date: fromWords(o.original, today) }) : describeRule(event.rule), o.note, who),
        url,
        series: { rule: event.rule, ...(event.time ? { time: event.time } : {}), minutes, original: o.original, through },
        edit,
      };
    })
    .filter((i) => inAgendaWindow(i, now));
}

/**
 * The thing to do before each occurrence of the next 60 days, as a task due at its deadline:
 * upcoming, overdue once the deadline passes, done once ticked. It ends when the event begins (or
 * that night), after which an undone one is missed and left off.
 */
export function prepAgenda(event: HomeEvent, ticks: PrepTick[], now: number, url: string): AgendaEntry[] {
  if (!event.prep) return [];
  const today = toYmd(now);
  return prepTasksBetween([event], ticks, today, addDays(today, EVENT_AGENDA_DAYS), now)
    .filter((task) => task.state !== 'missed')
    .map((task): AgendaEntry => {
      // Ends by that night, so the calendar shows it on its own day only.
      const end = Math.min(task.missedAt, atTime(toYmd(task.deadline), '23:59'));
      return {
        kind: 'task',
        title: task.prep.title,
        start: task.deadline,
        ...(end > task.deadline ? { end } : {}),
        allDay: false,
        detail: t('events.before', { what: midSentence(eventWhen(event, task.occurrence, toYmd(task.deadline))) }),
        url,
        status: task.tick ? 'done' : now >= task.deadline ? 'overdue' : 'upcoming',
      };
    });
}

/** Reminders go out this many days ahead (the app opening tops them up). */
export const PREP_REMINDER_DAYS = 14;

export const prepReminderRef = (eventId: string) => `home:prep:${eventId}`;

/** A reminder at the deadline of each thing to do before that asks for one, not yet ticked, in the next two weeks. */
export function prepReminders(events: HomeEvent[], ticks: PrepTick[], now: number, url: string): ReminderInput[] {
  const today = toYmd(now);
  return prepTasksBetween(
    events.filter((e) => e.prep?.remind),
    ticks,
    today,
    addDays(today, PREP_REMINDER_DAYS),
    now,
  )
    .filter((t) => !t.tick && t.deadline > now)
    .map((t) => ({
      app: 'home',
      title: t.prep.title,
      body: eventWhen(t.event, t.occurrence, toYmd(t.deadline)),
      at: t.deadline,
      url,
      recipients: 'all' as const,
      ref: prepReminderRef(t.event.id),
      private: false,
    }));
}

// ---- Changing one occurrence ----

/** Changes to occurrences this many days past are forgotten when the event is next saved. */
export const KEEP_CHANGES_DAYS = 60;

export const eventInput = (e: HomeEvent): EventInput => ({
  title: e.title,
  kind: e.kind,
  rule: e.rule,
  time: e.time,
  contactId: e.contactId,
  notes: e.notes,
  prep: e.prep,
  exceptions: e.exceptions,
});

/** The event with one occurrence moved, skipped, or (with `null`) put back; old changes pruned. */
export function withOccurrenceChange(event: HomeEvent, original: Ymd, change: OccurrenceChange | null, today: Ymd): EventInput {
  return { ...eventInput(event), exceptions: pruneChanges(withChange(event.exceptions, original, change), addDays(today, -KEEP_CHANGES_DAYS)) };
}

// ---- Add to calendar ----

/** A regular event as Add to calendar takes it: the whole series, repeating, from its first day. */
export function eventEntry(event: HomeEvent, contacts: Contact[], url: string): CalendarEntry {
  const who = event.contactId ? contacts.find((c) => c.id === event.contactId)?.name : undefined;
  const start = event.time ? atTime(event.rule.start, event.time) : allDayStart(event.rule.start);
  return {
    title: event.title,
    start,
    allDay: !event.time,
    detail: joined(describeRule(event.rule), who),
    url,
    kind: agendaKind(event.kind),
    series: { rule: event.rule, ...(event.time ? { time: event.time } : {}), minutes: EVENT_MINUTES[event.kind] ?? 60 },
  };
}

/** One occurrence on its own (moved or not), for Add to calendar in its dialog. */
export function occurrenceEntry(event: HomeEvent, o: Pick<Occurrence, 'date' | 'time'>, url: string): CalendarEntry {
  const start = o.time ? atTime(o.date, o.time) : allDayStart(o.date);
  const minutes = EVENT_MINUTES[event.kind] ?? 60;
  return { title: event.title, start, ...(o.time ? { end: start + minutes * 60_000 } : {}), allDay: !o.time, detail: describeRule(event.rule), url, kind: agendaKind(event.kind) };
}
