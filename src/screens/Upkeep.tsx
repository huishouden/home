import { Check, Pencil, Plus } from 'lucide-react';
import type { HomeTask } from '../lib/model';
import { describeSchedule } from '../lib/schedule';
import { SOON_DAYS, byDue, dueState, dueText, lastDoneText } from '../lib/upkeep';
import { formatShort, type Ymd } from '../lib/ymd';
import type { HomeStore } from '../data/types';
import { CategoryTile, WhoLine } from '../components/bits';
import { cardClass, iconButton, overline, primaryButton, secondaryButton } from '../components/ui';

/** Every recurring job, soonest first, grouped by how soon. */
export function Upkeep({ store, today, onAdd, onEdit, onDone }: {
  store: HomeStore;
  today: Ymd;
  onAdd: () => void;
  onEdit: (t: HomeTask) => void;
  onDone: (t: HomeTask) => void;
}) {
  const { tasks, contacts } = store.data;
  const sorted = byDue(tasks);
  const groups: { label: string; items: HomeTask[] }[] = [
    { label: 'Overdue', items: sorted.filter((t) => dueState(t.due, today).state === 'overdue') },
    { label: 'Next two weeks', items: sorted.filter((t) => ['today', 'soon'].includes(dueState(t.due, today, SOON_DAYS).state)) },
    { label: 'Later', items: sorted.filter((t) => dueState(t.due, today).state === 'later') },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 lg:h-full lg:overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 className="text-2xl font-semibold text-stone-800">Upkeep</h2>
        <button type="button" className={primaryButton} onClick={onAdd}>
          <Plus size={20} /> Add job
        </button>
      </div>
      {tasks.length === 0 && (
        <p className={`${cardClass} p-6 text-lg text-stone-600`}>No upkeep jobs yet. Add the filter change, pest control, gutters and renewals so the house reminds you.</p>
      )}
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className={`${overline} mb-2 ${g.label === 'Overdue' ? 'text-terracotta-dark' : ''}`}>{g.label}</h3>
          <ul className={cardClass}>
            {g.items.map((t) => {
              const contact = t.contactId ? contacts.find((c) => c.id === t.contactId) : undefined;
              const late = dueState(t.due, today).state === 'overdue';
              return (
                <li key={t.id} className="flex items-start gap-4 border-b border-stone-200 p-4 last:border-b-0 sm:p-5" aria-label={t.title}>
                  <CategoryTile category={t.category} attention={late} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <button type="button" className="-mx-1 min-h-11 rounded-xl px-1 text-left text-xl font-semibold text-stone-800 hover:bg-stone-50" onClick={() => onEdit(t)}>
                        {t.title}
                      </button>
                      <p className={`text-base ${late ? 'font-semibold text-terracotta-dark' : 'font-medium text-forest-700'}`}>
                        {dueText(t.due, today)} <span className="font-normal text-stone-600">· {formatShort(t.due, today)}</span>
                      </p>
                    </div>
                    <p className="mt-0.5 text-base text-stone-600">
                      {describeSchedule(t.schedule)} · {lastDoneText(t.lastDone, today)}
                    </p>
                    <WhoLine contact={contact} compact />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" className={secondaryButton} onClick={() => onDone(t)} aria-label={`Mark done: ${t.title}`}>
                      <Check size={18} /> <span className="hidden sm:inline">Done</span>
                    </button>
                    <button type="button" className={iconButton.replace('inline-flex', 'hidden sm:inline-flex')} onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}>
                      <Pencil size={18} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
