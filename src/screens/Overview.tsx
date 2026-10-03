import { Check, ChevronRight, Plus, SkipForward } from 'lucide-react';
import { personName } from '@huishouden/pwa-kit/people';
import { prepWhen, type Occurrence } from '@huishouden/pwa-kit/schedule';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { HomeEvent, HomeTask, ServiceEntry, Warranty } from '../lib/model';
import { eventWhen, nextUp, occurrenceWords, type PrepTask } from '../lib/events';
import { describeSchedule } from '@huishouden/pwa-kit/schedule';
import { activeJobs, dueState, dueText, headline, needsAttention, byDue } from '../lib/upkeep';
import { EXPIRING_DAYS, byExpiry, warrantyState, warrantyText } from '../lib/warranty';
import { formatCents } from '@huishouden/pwa-kit/money';
import { clockWords, daysBetween, longDate, midSentence, shortDate, toHhmm, type Ymd, ymdParts } from '@huishouden/pwa-kit/time';
import type { HomeStore } from '../data/types';
import { CategoryTile, DateTile, EventTile, WhoLine } from '../components/bits';
import { cardClass, ghostButton, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';

export type { TabId } from '../lib/tabs';
import type { TabId } from '../lib/tabs';

interface Props {
  store: HomeStore;
  today: Ymd;
  onDone: (task: HomeTask) => void;
  onEditTask: (task: HomeTask) => void;
  onAddTask: () => void;
  onEditEntry: (entry: ServiceEntry) => void;
  onEditWarranty: (w: Warranty) => void;
  onOpen: (tab: TabId) => void;
  /** Things to do before regular events that need doing now (`prepTasks`). */
  prep: PrepTask[];
  now: number;
  onTogglePrep: (task: PrepTask) => void;
  /** Not needed this time: ticked off as skipped. */
  onSkipPrep: (task: PrepTask) => void;
  onOpenOccurrence: (event: HomeEvent, occurrence: Occurrence) => void;
}

const contactOf = (contacts: Contact[], id?: string) => (id ? contacts.find((c) => c.id === id) : undefined);

/** What the house needs now, readable from across the room: the next job first, then booked visits and warranties. */
export function Overview({ store, today, onDone, onEditTask, onAddTask, onEditEntry, onEditWarranty, onOpen, prep, now, onTogglePrep, onSkipPrep, onOpenOccurrence }: Props) {
  const { tasks, log, warranties, contacts, events } = store.data;
  const regular = nextUp(events, today, now).slice(0, 2);
  const prepLate = prep.filter((t) => t.state === 'due' || t.state === 'missed').length;
  const prepOpen = prep.filter((t) => t.state !== 'done').length;
  const jobs = activeJobs(tasks);
  const attention = needsAttention(jobs, today);
  const [first, ...rest] = attention.length ? attention : byDue(jobs).slice(0, 1);
  const later = attention.length ? rest : [];
  const overdue = attention.filter((t) => dueState(t.due, today).state === 'overdue').length;
  const booked = log.filter((e) => daysBetween(today, e.date) >= 0 && !(e.taskId && e.date === today && tasks.some((t) => t.lastDone === today && t.id === e.taskId)))
    .sort((a, b) => daysBetween(b.date, a.date));
  const ending = byExpiry(warranties, today).filter((w) => {
    const s = warrantyState(w.warrantyEnd, today);
    return s.state === 'expiring';
  });
  const year = ymdParts(today)!.y;
  const thisYear = log.filter((e) => e.date.startsWith(`${year}-`) && daysBetween(e.date, today) >= 0);
  const spent = thisYear.reduce((sum, e) => sum + (e.costCents ?? 0), 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className={`${cardClass} flex min-h-0 flex-col px-5 py-5 sm:px-8 sm:py-6`} aria-label="Upkeep">
        <div className="flex items-center justify-between gap-4">
          <p className={overline}>
            {attention.length === 0 ? 'Upkeep' : overdue ? `${overdue} overdue · ${attention.length - overdue} due soon` : `${attention.length} due in the next two weeks`}
            {prepOpen > 0 ? ` · ${prepOpen} to do ${prepLate ? 'now' : 'soon'}` : ''}
          </p>
          <button type="button" className={ghostButton} onClick={() => onOpen('upkeep')}>
            All jobs <ChevronRight size={18} />
          </button>
        </div>
        {prep.length > 0 && (
          <ul className="mt-2 mb-3 border-b border-line" aria-label="Before regular events">
            {prep.map((t) => (
              <PrepRow key={t.id} task={t} now={now} today={today} me={store.me} onToggle={() => onTogglePrep(t)} onSkip={() => onSkipPrep(t)} />
            ))}
          </ul>
        )}
        {!first ? (
          <div className="mt-2">
            <p className="text-3xl font-semibold text-ink">Nothing scheduled yet</p>
            <p className="mt-2 text-lg text-muted">Add the jobs that keep the house running: filters, pest control, gutters, renewals.</p>
            <button type="button" className={`${primaryButton} mt-5`} onClick={onAddTask}>
              <Plus size={20} /> Add a job
            </button>
          </div>
        ) : (
          <>
            <Lead task={first} today={today} contact={contactOf(contacts, first.contactId)} onDone={() => onDone(first)} onEdit={() => onEditTask(first)} />
            {later.length > 0 && (
              <ul className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-line" aria-label="Also due">
                {later.map((t) => (
                  <Row key={t.id} task={t} today={today} onDone={() => onDone(t)} onEdit={() => onEditTask(t)} />
                ))}
              </ul>
            )}
            {attention.length === 0 && <p className="mt-4 text-lg text-muted">Nothing else in the next two weeks.</p>}
          </>
        )}
      </section>

      <div className={`flex min-h-0 flex-col ${regular.length ? 'gap-4' : 'gap-6'}`}>
        {regular.length > 0 && (
          <section className={`${cardClass} shrink-0 px-6 py-4`} aria-label="Regular events">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-ink">Coming up</h2>
              <button type="button" className={ghostButton} onClick={() => onOpen('regular')}>
                Regular <ChevronRight size={18} />
              </button>
            </div>
            <ul className="mt-1">
              {regular.map(({ event, occurrence }) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-3 text-left hover:bg-sunken"
                    onClick={() => onOpenOccurrence(event, occurrence)}
                    aria-label={`${event.title} · ${occurrenceWords(occurrence, today)}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-lg font-medium text-ink">{event.title}</span>
                    <span className="shrink-0 text-base font-medium text-link">
                      {occurrenceWords(occurrence, today)}
                      {occurrence.moved ? ' · moved' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`${cardClass} flex ${regular.length ? 'shrink-0 py-4' : 'min-h-0 py-5'} flex-col px-6`} aria-label="Booked visits">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-ink">Booked visits</h2>
            <button type="button" className={ghostButton} onClick={() => onOpen('history')}>
              History <ChevronRight size={18} />
            </button>
          </div>
          {booked.length === 0 ? (
            <p className="mt-2 text-base text-muted">No visits booked.</p>
          ) : (
            <ul className="mt-2 min-h-0 overflow-y-auto">
              {booked.slice(0, regular.length ? 1 : 3).map((e, i) => {
                const who = contactOf(contacts, e.contactId);
                return (
                  <li key={e.id} className="border-b border-line last:border-b-0">
                    <button type="button" className="flex w-full items-center gap-4 py-2.5 text-left hover:bg-sunken" onClick={() => onEditEntry(e)}>
                      <DateTile date={e.date} strong={i === 0} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold text-ink">{e.title}</span>
                        <span className="block truncate text-base text-muted">
                          <span className="font-medium text-link">{relative(e.date, today)}</span>
                          {who || e.who ? ` · ${who?.name ?? e.who}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`${cardClass} px-6 py-5`} aria-label="Warranties ending">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-ink">Warranties</h2>
            <button type="button" className={ghostButton} onClick={() => onOpen('warranties')}>
              All <ChevronRight size={18} />
            </button>
          </div>
          {ending.length === 0 ? (
            <p className="mt-2 text-base text-muted">None ending in the next {EXPIRING_DAYS} days.</p>
          ) : (
            <ul className="mt-1">
              {ending.slice(0, 2).map((w) => (
                <li key={w.id}>
                  <button type="button" className="flex min-h-12 w-full items-baseline justify-between gap-3 py-1.5 text-left hover:bg-sunken" onClick={() => onEditWarranty(w)}>
                    <span className="truncate text-lg font-medium text-ink">{w.item}</span>
                    <span className="shrink-0 text-base font-semibold text-attention">{warrantyText(w.warrantyEnd, today)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${cardClass} flex items-center justify-between gap-4 px-6 py-5`} aria-label={`Spent in ${year}`}>
          <div>
            <p className={overline}>Spent in {year}</p>
            <p className="text-sm text-muted">
              {thisYear.length} {thisYear.length === 1 ? 'entry' : 'entries'} in the history
            </p>
          </div>
          <p className="text-3xl font-semibold text-ink tabular-nums">{formatCents(spent, { headline: true })}</p>
        </section>
      </div>
    </div>
  );
}

function relative(date: Ymd, today: Ymd): string {
  const d = daysBetween(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 7) return longDate(date, today).split(',')[0];
  return shortDate(date, today);
}

function Lead({ task, today, contact, onDone, onEdit }: { task: HomeTask; today: Ymd; contact?: Contact; onDone: () => void; onEdit: () => void }) {
  const { state } = dueState(task.due, today);
  const late = state === 'overdue';
  return (
    <div className="mt-3">
      <div className="flex items-start gap-5">
        <CategoryTile category={task.category} attention={late} size="lg" />
        <button type="button" className="-mx-2 min-w-0 flex-1 rounded-xl px-2 text-left hover:bg-sunken" onClick={onEdit} aria-label={`Edit ${task.title}`}>
          <p className={`text-3xl leading-tight font-semibold tracking-tight sm:text-4xl ${late ? 'text-attention' : 'text-ink'}`}>{headline(task.title, task.due, today)}</p>
          <p className="mt-2 text-lg text-muted sm:text-xl">
            {late ? 'Was due ' : ''}
            {longDate(task.due, today)} · {describeSchedule(task.schedule)}
          </p>
        </button>
      </div>
      {task.notes && <p className="mt-2 sm:ml-[76px] text-base text-muted">{task.notes}</p>}
      <div className="mt-1 sm:ml-[76px]">
        <WhoLine contact={contact} />
      </div>
      <div className="mt-3 sm:ml-[76px]">
        <button type="button" className={primaryButton} onClick={onDone} aria-label={`Mark done: ${task.title}`}>
          <Check size={20} /> Done
        </button>
      </div>
    </div>
  );
}

function Row({ task, today, onDone, onEdit }: { task: HomeTask; today: Ymd; onDone: () => void; onEdit: () => void }) {
  const late = dueState(task.due, today).state === 'overdue';
  return (
    <li className="flex items-center gap-4 border-b border-line py-2.5 last:border-b-0">
      <CategoryTile category={task.category} attention={late} />
      <button type="button" className="-mx-2 flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-xl px-2 text-left hover:bg-sunken" onClick={onEdit}>
        <span className="text-lg leading-snug font-semibold text-ink [overflow-wrap:anywhere]">{task.title}</span>
        <span className={`text-base ${late ? 'font-semibold text-attention' : 'text-muted'}`}>{dueText(task.due, today)}</span>
      </button>
      <button type="button" className={secondaryButton} onClick={onDone} aria-label={`Mark done: ${task.title}`}>
        <Check size={18} /> Done
      </button>
    </li>
  );
}

/**
 * A thing to do before a regular event: "Take the garbage out · tonight by 7 PM", for which event,
 * a big Done toggle and a quiet Skip for when it isn't needed this time; once done or skipped, who
 * did it and when (tap again to undo). Terracotta once late.
 */
function PrepRow({ task, now, today, me, onToggle, onSkip }: { task: PrepTask; now: number; today: Ymd; me: string; onToggle: () => void; onSkip: () => void }) {
  const { event, occurrence: o, prep, state, tick } = task;
  const late = state === 'due' || state === 'missed';
  const done = state === 'done';
  const skipped = done && !!tick?.skipped;
  const when = prepWhen(task.deadline, now);
  const detail = done && tick
    ? `${skipped ? 'Skipped' : 'Done'} by ${personName(tick.by, { email: me })} at ${clockWords(toHhmm(tick.at))}`
    : state === 'missed'
      ? `Missed: ${midSentence(event.title)} was ${o.time ? `at ${clockWords(o.time)}` : 'today'}`
      : `For ${midSentence(eventWhen(event, o, today))}`;
  const word = skipped ? 'Skipped' : 'Done';
  return (
    <li className="flex items-center gap-3 py-2.5 sm:gap-4" aria-label={prep.title}>
      <span className="hidden sm:block">
        <EventTile kind={event.kind} attention={late} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-snug font-semibold text-ink [overflow-wrap:anywhere]">
          {prep.title}
          {!done && <span className={late ? 'text-attention' : 'font-medium text-link'}> · {state === 'due' ? `was due ${when}` : when}</span>}
        </p>
        <p className={`text-base ${late ? 'font-semibold text-attention' : 'text-muted'}`}>{detail}</p>
      </div>
      {!done && state !== 'missed' && (
        <button type="button" className={`${ghostButton} shrink-0`} onClick={onSkip} aria-label={`Skip: ${prep.title}`}>
          Skip
        </button>
      )}
      <button
        type="button"
        aria-pressed={done}
        aria-label={`${word}: ${prep.title}`}
        onClick={onToggle}
        className={`inline-flex min-h-14 shrink-0 items-center gap-2 rounded-xl border px-4 text-lg font-semibold sm:px-5 transition-colors duration-150 ${
          skipped
            ? 'border-line bg-sunken text-ink-soft hover:border-stone-400 dark:hover:border-forest-400'
            : done
              ? 'border-primary bg-primary text-on-primary hover:bg-primary-hover'
              : 'border-line bg-surface text-ink hover:border-forest-400'
        }`}
      >
        {skipped ? <SkipForward size={22} /> : <Check size={22} />} {word}
      </button>
    </li>
  );
}
