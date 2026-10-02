import type { CalendarMatch } from '@huishouden/pwa-kit/calendar';
import { LIMITS, type Category, type HomeTask, type ServiceEntry, type ServiceInput } from './model';
import { toYmd } from './ymd';

/** What Import from calendar looks for: the words house visits tend to carry. */
export const HOME_CALENDAR_QUERIES = [
  'pest',
  'lawn',
  'hvac',
  'plumber',
  'electrician',
  'inspection',
  'gutter',
  'roof',
  'pool',
  'furnace',
  'termite',
  'landscaping',
  'chimney',
  'septic',
];

const CATEGORY_WORDS: [Category, RegExp][] = [
  ['pest', /\b(pest|termites?|exterminator|bugs?|rodents?|mosquito)\b/i],
  ['hvac', /\b(hvac|furnace|a\/?c|air condition\w*|heat pump|ac filter|air filter|hvac filter|ducts?|heating|cooling)\b/i],
  ['lawn', /\b(lawn|landscap\w*|garden\w*|mow\w*|trees?|sprinklers?|irrigation|yard)\b/i],
  ['gutters', /\b(gutters?|roof\w*|chimney)\b/i],
  ['plumbing', /\b(plumb\w*|water heater|septic|drains?|water softener|leaks?|sump( pump)?|pipes?|faucets?|toilets?)\b/i],
  ['electrical', /\b(electric\w*|generator|wiring)\b/i],
  ['pool', /\b(pool|spa|hot tub)\b/i],
  ['safety', /\b(smoke|detectors?|alarms?|extinguishers?|carbon monoxide|co detector)\b/i],
  ['appliances', /\b(dryer|dishwasher|fridge|refrigerator|washer|appliances?|oven)\b/i],
  ['paperwork', /\b(insurance|hoa|policy|renewal|dues|homeowners)\b/i],
];

/** The kind of upkeep a piece of text is about ("Quarterly pest treatment" → pest), or null. */
export function guessCategory(text: string): Category | null {
  for (const [category, re] of CATEGORY_WORDS) if (re.test(text)) return category;
  return null;
}

/** The upkeep job a calendar event is a visit for: the only job of that kind, or the one sharing a word with it. */
export function matchTask(title: string, tasks: HomeTask[]): HomeTask | undefined {
  const category = guessCategory(title);
  if (!category) return undefined;
  const same = tasks.filter((t) => t.category === category);
  if (same.length <= 1) return same[0];
  // Several of that kind: the one sharing the most words with the event, when there is one.
  const words = new Set(title.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const scored = same.map((t) => ({ t, n: t.title.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length })).sort((a, b) => b.n - a.n);
  return scored[0].n > 0 && scored[0].n > scored[1].n ? scored[0].t : undefined;
}

/** Calendar descriptions often arrive as HTML; notes are plain text within the rules' limit. */
export function plainText(description: string, max: number = LIMITS.notes): string {
  const text = description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** A service entry for a calendar event: its day, title and notes, linked to the job and its provider. */
export function fromCalendar(m: CalendarMatch, tasks: HomeTask[]): ServiceInput {
  const task = matchTask(m.title, tasks);
  const notes = plainText([m.location?.trim(), plainText(m.description ?? '')].filter(Boolean).join('\n'));
  return {
    date: toYmd(m.start),
    title: m.title.trim().slice(0, LIMITS.title),
    ...(task ? { taskId: task.id } : {}),
    ...(task?.contactId ? { contactId: task.contactId } : {}),
    ...(notes ? { notes } : {}),
    calendarEventId: m.id,
    calendarLink: m.link,
  };
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether the service log already has this calendar event. */
export function isImported(m: CalendarMatch, entries: ServiceEntry[]): boolean {
  return entries.some(
    (e) => (e.calendarEventId && e.calendarEventId === m.id) || (e.calendarLink && e.calendarLink === m.link) || (e.date === toYmd(m.start) && sameTitle(e.title, m.title)),
  );
}

/** Calendar events not yet in the log, each once, soonest first. */
export function notImported(matches: CalendarMatch[], entries: ServiceEntry[]): CalendarMatch[] {
  const seen = new Set<string>();
  return matches
    .filter((m) => {
      if (seen.has(m.id) || isImported(m, entries)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

/** A readable reason for a failed calendar search; every case offers Try again. */
export function calendarError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled')
    return 'Calendar access was not allowed. Try again when you are ready.';
  if (code === 'auth/popup-blocked') return 'The browser blocked the Google window. Allow pop-ups for this site and try again.';
  return "Couldn't search your calendar. Check the connection and try again.";
}
