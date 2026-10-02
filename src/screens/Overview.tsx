import { Check, ChevronRight, Plus } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { HomeTask, ServiceEntry, Warranty } from '../lib/model';
import { describeSchedule } from '../lib/schedule';
import { dueState, dueText, headline, needsAttention, byDue } from '../lib/upkeep';
import { EXPIRING_DAYS, byExpiry, warrantyState, warrantyText } from '../lib/warranty';
import { formatMoney } from '../lib/money';
import { daysBetween, formatDay, formatShort, parseYmd, type Ymd } from '../lib/ymd';
import type { HomeStore } from '../data/types';
import { CategoryTile, DateTile, WhoLine } from '../components/bits';
import { cardClass, ghostButton, overline, primaryButton, secondaryButton } from '../components/ui';

export type TabId = 'overview' | 'upkeep' | 'history' | 'warranties' | 'contacts';

interface Props {
  store: HomeStore;
  today: Ymd;
  onDone: (task: HomeTask) => void;
  onEditTask: (task: HomeTask) => void;
  onAddTask: () => void;
  onEditEntry: (entry: ServiceEntry) => void;
  onEditWarranty: (w: Warranty) => void;
  onOpen: (tab: TabId) => void;
}

const contactOf = (contacts: Contact[], id?: string) => (id ? contacts.find((c) => c.id === id) : undefined);

/** What the house needs now, readable from across the room: the next job first, then booked visits and warranties. */
export function Overview({ store, today, onDone, onEditTask, onAddTask, onEditEntry, onEditWarranty, onOpen }: Props) {
  const { tasks, log, warranties, contacts } = store.data;
  const attention = needsAttention(tasks, today);
  const [first, ...rest] = attention.length ? attention : byDue(tasks).slice(0, 1);
  const later = attention.length ? rest : [];
  const overdue = attention.filter((t) => dueState(t.due, today).state === 'overdue').length;
  const booked = log.filter((e) => daysBetween(today, e.date) >= 0 && !(e.taskId && e.date === today && tasks.some((t) => t.lastDone === today && t.id === e.taskId)))
    .sort((a, b) => daysBetween(b.date, a.date));
  const ending = byExpiry(warranties, today).filter((w) => {
    const s = warrantyState(w.warrantyEnd, today);
    return s.state === 'expiring';
  });
  const year = parseYmd(today)!.y;
  const thisYear = log.filter((e) => e.date.startsWith(`${year}-`) && daysBetween(e.date, today) >= 0);
  const spent = thisYear.reduce((sum, e) => sum + (e.costCents ?? 0), 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className={`${cardClass} flex min-h-0 flex-col px-5 py-5 sm:px-8 sm:py-6`} aria-label="Upkeep">
        <div className="flex items-center justify-between gap-4">
          <p className={overline}>
            {attention.length === 0 ? 'Upkeep' : overdue ? `${overdue} overdue · ${attention.length - overdue} due soon` : `${attention.length} due in the next two weeks`}
          </p>
          <button type="button" className={ghostButton} onClick={() => onOpen('upkeep')}>
            All jobs <ChevronRight size={18} />
          </button>
        </div>
        {!first ? (
          <div className="mt-2">
            <p className="text-3xl font-semibold text-stone-800">Nothing scheduled yet</p>
            <p className="mt-2 text-lg text-stone-600">Add the jobs that keep the house running: filters, pest control, gutters, renewals.</p>
            <button type="button" className={`${primaryButton} mt-5`} onClick={onAddTask}>
              <Plus size={20} /> Add a job
            </button>
          </div>
        ) : (
          <>
            <Lead task={first} today={today} contact={contactOf(contacts, first.contactId)} onDone={() => onDone(first)} onEdit={() => onEditTask(first)} />
            {later.length > 0 && (
              <ul className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-stone-200" aria-label="Also due">
                {later.map((t) => (
                  <Row key={t.id} task={t} today={today} onDone={() => onDone(t)} onEdit={() => onEditTask(t)} />
                ))}
              </ul>
            )}
            {attention.length === 0 && <p className="mt-4 text-lg text-stone-600">Nothing else in the next two weeks.</p>}
          </>
        )}
      </section>

      <div className="flex min-h-0 flex-col gap-6">
        <section className={`${cardClass} flex min-h-0 flex-col px-6 py-5`} aria-label="Booked visits">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-stone-800">Booked visits</h2>
            <button type="button" className={ghostButton} onClick={() => onOpen('history')}>
              History <ChevronRight size={18} />
            </button>
          </div>
          {booked.length === 0 ? (
            <p className="mt-2 text-base text-stone-600">No visits booked.</p>
          ) : (
            <ul className="mt-2 min-h-0 overflow-y-auto">
              {booked.slice(0, 3).map((e, i) => {
                const who = contactOf(contacts, e.contactId);
                return (
                  <li key={e.id} className="border-b border-stone-200 last:border-b-0">
                    <button type="button" className="flex w-full items-center gap-4 py-2.5 text-left hover:bg-stone-50" onClick={() => onEditEntry(e)}>
                      <DateTile date={e.date} strong={i === 0} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold text-stone-800">{e.title}</span>
                        <span className="block truncate text-base text-stone-600">
                          <span className="font-medium text-forest-700">{relative(e.date, today)}</span>
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
            <h2 className="text-xl font-semibold text-stone-800">Warranties</h2>
            <button type="button" className={ghostButton} onClick={() => onOpen('warranties')}>
              All <ChevronRight size={18} />
            </button>
          </div>
          {ending.length === 0 ? (
            <p className="mt-2 text-base text-stone-600">None ending in the next {EXPIRING_DAYS} days.</p>
          ) : (
            <ul className="mt-1">
              {ending.slice(0, 2).map((w) => (
                <li key={w.id}>
                  <button type="button" className="flex min-h-12 w-full items-baseline justify-between gap-3 py-1.5 text-left hover:bg-stone-50" onClick={() => onEditWarranty(w)}>
                    <span className="truncate text-lg font-medium text-stone-800">{w.item}</span>
                    <span className="shrink-0 text-base font-semibold text-terracotta-dark">{warrantyText(w.warrantyEnd, today)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${cardClass} flex items-center justify-between gap-4 px-6 py-5`} aria-label={`Spent in ${year}`}>
          <div>
            <p className={overline}>Spent in {year}</p>
            <p className="text-sm text-stone-600">
              {thisYear.length} {thisYear.length === 1 ? 'entry' : 'entries'} in the history
            </p>
          </div>
          <p className="text-3xl font-semibold text-stone-800 tabular-nums">{formatMoney(spent, { headline: true })}</p>
        </section>
      </div>
    </div>
  );
}

function relative(date: Ymd, today: Ymd): string {
  const d = daysBetween(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 7) return formatDay(date, today).split(',')[0];
  return formatShort(date, today);
}

function Lead({ task, today, contact, onDone, onEdit }: { task: HomeTask; today: Ymd; contact?: Contact; onDone: () => void; onEdit: () => void }) {
  const { state } = dueState(task.due, today);
  const late = state === 'overdue';
  return (
    <div className="mt-3">
      <div className="flex items-start gap-5">
        <CategoryTile category={task.category} attention={late} size="lg" />
        <button type="button" className="-mx-2 min-w-0 flex-1 rounded-xl px-2 text-left hover:bg-stone-50" onClick={onEdit} aria-label={`Edit ${task.title}`}>
          <p className={`text-3xl leading-tight font-semibold tracking-tight sm:text-4xl ${late ? 'text-terracotta-dark' : 'text-stone-800'}`}>{headline(task.title, task.due, today)}</p>
          <p className="mt-2 text-lg text-stone-600 sm:text-xl">
            {late ? 'Was due ' : ''}
            {formatDay(task.due, today)} · {describeSchedule(task.schedule)}
          </p>
        </button>
      </div>
      {task.notes && <p className="mt-2 sm:ml-[76px] text-base text-stone-600">{task.notes}</p>}
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
    <li className="flex items-center gap-4 border-b border-stone-200 py-2.5 last:border-b-0">
      <CategoryTile category={task.category} attention={late} />
      <button type="button" className="-mx-2 flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-xl px-2 text-left hover:bg-stone-50" onClick={onEdit}>
        <span className="text-lg leading-snug font-semibold text-stone-800 [overflow-wrap:anywhere]">{task.title}</span>
        <span className={`text-base ${late ? 'font-semibold text-terracotta-dark' : 'text-stone-600'}`}>{dueText(task.due, today)}</span>
      </button>
      <button type="button" className={secondaryButton} onClick={onDone} aria-label={`Mark done: ${task.title}`}>
        <Check size={18} /> Done
      </button>
    </li>
  );
}
