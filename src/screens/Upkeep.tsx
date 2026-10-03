import { Check, Pencil, Play, Plus } from 'lucide-react';
import type { HomeTask } from '../lib/model';
import { describeSchedule } from '@huishouden/pwa-kit/schedule';
import { SOON_DAYS, activeJobs, byDue, dueState, dueText, isPaused, lastDoneText } from '../lib/upkeep';
import { shortDate, toYmd, type Ymd } from '@huishouden/pwa-kit/time';
import type { HomeStore } from '../data/types';
import { CategoryTile, WhoLine } from '../components/bits';
import { cardClass, iconButton, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { RoleNote } from '@huishouden/pwa-kit/react/roles';
import { mayChange } from '../data/types';

/** Every recurring job, soonest first, grouped by how soon. */
export function Upkeep({ store, today, onAdd, onEdit, onDone, onResume }: {
  store: HomeStore;
  today: Ymd;
  onAdd: () => void;
  onEdit: (t: HomeTask) => void;
  onDone: (t: HomeTask) => void;
  onResume: (t: HomeTask) => void;
}) {
  const { tasks, contacts } = store.data;
  const sorted = byDue(activeJobs(tasks));
  const paused = tasks.filter(isPaused).sort((a, b) => a.title.localeCompare(b.title));
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
      {store.helping && <RoleNote action="edit-others" />}
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
                        {dueText(t.due, today)} <span className="font-normal text-stone-600">· {shortDate(t.due, today)}</span>
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
                    {mayChange(store, t) && (
                      <button type="button" className={iconButton.replace('inline-flex', 'hidden sm:inline-flex')} onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}>
                        <Pencil size={18} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {paused.length > 0 && (
        <section aria-label="Paused">
          <h3 className={`${overline} mb-2`}>Paused</h3>
          <ul className={cardClass}>
            {paused.map((t) => (
              <li key={t.id} className="flex items-start gap-4 border-b border-stone-200 p-4 last:border-b-0 sm:p-5" aria-label={t.title}>
                <CategoryTile category={t.category} />
                <div className="min-w-0 flex-1">
                  <button type="button" className="-mx-1 min-h-11 rounded-xl px-1 text-left text-xl font-semibold text-stone-600 hover:bg-stone-50" onClick={() => onEdit(t)}>
                    {t.title}
                  </button>
                  <p className="mt-0.5 text-base text-stone-600">
                    Paused {shortDate(toYmd(t.pausedAt!), today)} · {describeSchedule(t.schedule)} · {lastDoneText(t.lastDone, today)}
                  </p>
                </div>
                {mayChange(store, t) && (
                  <button type="button" className={`${secondaryButton} shrink-0`} onClick={() => onResume(t)} aria-label={`Resume: ${t.title}`}>
                    <Play size={18} /> <span className="hidden sm:inline">Resume</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
