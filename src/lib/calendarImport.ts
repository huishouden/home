import { plainText, type CalendarMatch } from '@huishouden/pwa-kit/calendar';
import { LIMITS, type Category, type HomeEvent, type HomeTask, type ServiceInput } from './model';
import { REGULAR_CALENDAR_QUERIES, guessEventKind } from './events';
import { toYmd } from '@huishouden/pwa-kit/time';

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

/** What calendar scans look for: house visits, and pickups and lawn services that may repeat (offered as regular events). */
export const CALENDAR_WORDS = [...new Set([...HOME_CALENDAR_QUERIES, ...REGULAR_CALENDAR_QUERIES])];

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

/**
 * A service entry for a calendar event: its day, title and notes, linked to the job and its
 * provider; without a job, the provider of a regular event of the same kind (the lawn service's).
 */
export function fromCalendar(m: CalendarMatch, tasks: HomeTask[], events: Pick<HomeEvent, 'kind' | 'contactId'>[] = []): ServiceInput {
  const task = matchTask(m.title, tasks);
  const kind = task ? null : guessEventKind(m.title);
  const contactId = task?.contactId ?? (kind ? events.find((e) => e.kind === kind && e.contactId)?.contactId : undefined);
  const notes = plainText([m.location?.trim(), plainText(m.description ?? '')].filter(Boolean).join('\n'), LIMITS.notes);
  return {
    date: toYmd(m.start),
    title: m.title.trim().slice(0, LIMITS.title),
    ...(task ? { taskId: task.id } : {}),
    ...(contactId ? { contactId } : {}),
    ...(notes ? { notes } : {}),
    calendarEventId: m.id,
    calendarLink: m.link,
  };
}
