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
import { atClock, daysBetween, longDate, midSentence, shortDate, toHhmm, type Ymd, weekdayName, weekday, ymdParts } from '@huishouden/pwa-kit/time';
import { capitalize } from '@huishouden/pwa-kit/i18n';
import { t as tr, useT } from '../i18n';
import type { HomeStore } from '../data/types';
import { CategoryTile, DateTile, EventTile, WhoLine } from '../components/bits';
import { HomeAddress } from '../components/HomeAddress';
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
  /** Admins and members, who can set the household's home in the portal. */
  canSetHome: boolean;
}

const contactOf = (contacts: Contact[], id?: string) => (id ? contacts.find((c) => c.id === id) : undefined);

/** What the house needs now, readable from across the room: the next job first, then booked visits, warranties and the house's address. */
export function Overview({ store, today, onDone, onEditTask, onAddTask, onEditEntry, onEditWarranty, onOpen, prep, now, onTogglePrep, onSkipPrep, onOpenOccurrence, canSetHome }: Props) {
  const t = useT();
  const { tasks, log, warranties, contacts, events } = store.data;
  const regular = nextUp(events, today, now).slice(0, 2);
  const prepLate = prep.filter((p) => p.state === 'due' || p.state === 'missed').length;
  const prepOpen = prep.filter((p) => p.state !== 'done').length;
  const jobs = activeJobs(tasks);
  const attention = needsAttention(jobs, today);
  const [first, ...rest] = attention.length ? attention : byDue(jobs).slice(0, 1);
  const later = attention.length ? rest : [];
  const overdue = attention.filter((x) => dueState(x.due, today).state === 'overdue').length;
  const booked = log.filter((e) => daysBetween(today, e.date) >= 0 && !(e.taskId && e.date === today && tasks.some((x) => x.lastDone === today && x.id === e.taskId)))
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
      <section className={`${cardClass} flex min-h-0 flex-col px-5 py-5 sm:px-8 sm:py-6`} aria-label={t('tab.upkeep')}>
        <div className="flex items-center justify-between gap-4">
          <p className={overline}>
            {attention.length === 0
              ? t('tab.upkeep')
              : overdue
                ? t('overview.overdueSoon', { overdue, soon: attention.length - overdue })
                : t('overview.dueTwoWeeks', { count: attention.length })}
            {prepOpen > 0 ? ` · ${prepLate ? t('overview.toDoNow', { count: prepOpen }) : t('overview.toDoSoon', { count: prepOpen })}` : ''}
          </p>
          <button type="button" className={`${ghostButton} shrink-0 whitespace-nowrap`} onClick={() => onOpen('upkeep')}>
            {t('overview.allJobs')} <ChevronRight size={18} />
          </button>
        </div>
        {prep.length > 0 && (
          <ul className="mt-2 mb-3 border-b border-line" aria-label={t('overview.beforeRegular')}>
            {prep.map((p) => (
              <PrepRow key={p.id} task={p} now={now} today={today} me={store.me} onToggle={() => onTogglePrep(p)} onSkip={() => onSkipPrep(p)} />
            ))}
          </ul>
        )}
        {!first ? (
          <div className="mt-2">
            <p className="text-3xl font-semibold text-ink">{t('overview.emptyTitle')}</p>
            <p className="mt-2 text-lg text-muted">{t('overview.emptyBody')}</p>
            <button type="button" className={`${primaryButton} mt-5`} onClick={onAddTask}>
              <Plus size={20} /> {t('overview.addJob')}
            </button>
          </div>
        ) : (
          <>
            <Lead task={first} today={today} contact={contactOf(contacts, first.contactId)} onDone={() => onDone(first)} onEdit={() => onEditTask(first)} />
            {later.length > 0 && (
              <ul className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-line" aria-label={t('overview.alsoDue')}>
                {later.map((x) => (
                  <Row key={x.id} task={x} today={today} onDone={() => onDone(x)} onEdit={() => onEditTask(x)} />
                ))}
              </ul>
            )}
            {attention.length === 0 && <p className="mt-4 text-lg text-muted">{t('overview.nothingElse')}</p>}
          </>
        )}
        <div className="mt-auto shrink-0 pt-5">
          <HomeAddress canSetHome={canSetHome} />
        </div>
      </section>

      <div className={`flex min-h-0 flex-col ${regular.length ? 'gap-4' : 'gap-6'}`}>
        {regular.length > 0 && (
          <section className={`${cardClass} shrink-0 px-6 py-4`} aria-label={t('regular.title')}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-ink">{t('overview.comingUp')}</h2>
              <button type="button" className={`${ghostButton} shrink-0 whitespace-nowrap`} onClick={() => onOpen('regular')}>
                {t('tab.regular')} <ChevronRight size={18} />
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
                      {occurrence.moved ? ` · ${t('regular.moved')}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`${cardClass} flex ${regular.length ? 'shrink-0 py-4' : 'min-h-0 py-5'} flex-col px-6`} aria-label={t('history.bookedVisits')}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-ink">{t('history.bookedVisits')}</h2>
            <button type="button" className={`${ghostButton} shrink-0 whitespace-nowrap`} onClick={() => onOpen('history')}>
              {t('tab.history')} <ChevronRight size={18} />
            </button>
          </div>
          {booked.length === 0 ? (
            <p className="mt-2 text-base text-muted">{t('overview.noVisits')}</p>
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

        <section className={`${cardClass} px-6 py-5`} aria-label={t('overview.warrantiesEnding')}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-ink">{t('tab.warranties')}</h2>
            <button type="button" className={`${ghostButton} shrink-0 whitespace-nowrap`} onClick={() => onOpen('warranties')}>
              {t('overview.all')} <ChevronRight size={18} />
            </button>
          </div>
          {ending.length === 0 ? (
            <p className="mt-2 text-base text-muted">{t('overview.noneEnding', { days: EXPIRING_DAYS })}</p>
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

        <section className={`${cardClass} flex items-center justify-between gap-4 px-6 py-5`} aria-label={t('overview.spentIn', { year: String(year) })}>
          <div>
            <p className={overline}>{t('overview.spentIn', { year: String(year) })}</p>
            <p className="text-sm text-muted">
              {t('overview.entries', { count: thisYear.length })}
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
  if (d === 0) return tr('occurrence.today');
  if (d === 1) return tr('occurrence.tomorrow');
  if (d < 7) return capitalize(weekdayName(weekday(date)));
  return shortDate(date, today);
}

function Lead({ task, today, contact, onDone, onEdit }: { task: HomeTask; today: Ymd; contact?: Contact; onDone: () => void; onEdit: () => void }) {
  const t = useT();
  const { state } = dueState(task.due, today);
  const late = state === 'overdue';
  return (
    <div className="mt-3">
      <div className="flex items-start gap-5">
        <CategoryTile category={task.category} attention={late} size="lg" />
        <button type="button" className="-mx-2 min-w-0 flex-1 rounded-xl px-2 text-left hover:bg-sunken" onClick={onEdit} aria-label={t('a11y.edit', { name: task.title })}>
          <p className={`text-3xl leading-tight font-semibold tracking-tight sm:text-4xl ${late ? 'text-attention' : 'text-ink'}`}>{headline(task.title, task.due, today)}</p>
          <p className="mt-2 text-lg text-muted sm:text-xl">
            {late ? t('overview.wasDue', { date: longDate(task.due, today) }) : capitalize(longDate(task.due, today))} · {describeSchedule(task.schedule)}
          </p>
        </button>
      </div>
      {task.notes && <p className="mt-2 sm:ml-[76px] text-base text-muted">{task.notes}</p>}
      <div className="mt-1 sm:ml-[76px]">
        <WhoLine contact={contact} />
      </div>
      <div className="mt-3 sm:ml-[76px]">
        <button type="button" className={primaryButton} onClick={onDone} aria-label={t('a11y.markDone', { name: task.title })}>
          <Check size={20} /> {t('common.done')}
        </button>
      </div>
    </div>
  );
}

function Row({ task, today, onDone, onEdit }: { task: HomeTask; today: Ymd; onDone: () => void; onEdit: () => void }) {
  const t = useT();
  const late = dueState(task.due, today).state === 'overdue';
  return (
    <li className="flex items-center gap-4 border-b border-line py-2.5 last:border-b-0">
      <CategoryTile category={task.category} attention={late} />
      <button type="button" className="-mx-2 flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-xl px-2 text-left hover:bg-sunken" onClick={onEdit}>
        <span className="text-lg leading-snug font-semibold text-ink [overflow-wrap:anywhere]">{task.title}</span>
        <span className={`text-base ${late ? 'font-semibold text-attention' : 'text-muted'}`}>{dueText(task.due, today)}</span>
      </button>
      <button type="button" className={secondaryButton} onClick={onDone} aria-label={t('a11y.markDone', { name: task.title })}>
        <Check size={18} /> {t('common.done')}
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
  const t = useT();
  const { event, occurrence: o, prep, state, tick } = task;
  const late = state === 'due' || state === 'missed';
  const done = state === 'done';
  const skipped = done && !!tick?.skipped;
  const when = prepWhen(task.deadline, now);
  const detail = done && tick
    ? t(skipped ? 'prep.skippedBy' : 'prep.doneBy', { name: personName(tick.by, { email: me }), at: atClock(toHhmm(tick.at)) })
    : state === 'missed'
      ? o.time
        ? t('prep.missedAt', { event: midSentence(event.title), at: atClock(o.time) })
        : t('prep.missedToday', { event: midSentence(event.title) })
      : t('prep.for', { what: midSentence(eventWhen(event, o, today)) });
  const word = skipped ? t('prep.skipped') : t('common.done');
  return (
    <li className="flex items-center gap-3 py-2.5 sm:gap-4" aria-label={prep.title}>
      <span className="hidden sm:block">
        <EventTile kind={event.kind} attention={late} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-lg leading-snug font-semibold text-ink [overflow-wrap:anywhere]">
          {prep.title}
          {!done && <span className={late ? 'text-attention' : 'font-medium text-link'}> · {state === 'due' ? t('prep.wasDue', { when }) : when}</span>}
        </p>
        <p className={`text-base ${late ? 'font-semibold text-attention' : 'text-muted'}`}>{detail}</p>
      </div>
      {!done && state !== 'missed' && (
        <button type="button" className={`${ghostButton} shrink-0`} onClick={onSkip} aria-label={t('prep.skipName', { name: prep.title })}>
          {t('prep.skip')}
        </button>
      )}
      <button
        type="button"
        aria-pressed={done}
        aria-label={t('prep.wordName', { word, name: prep.title })}
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
