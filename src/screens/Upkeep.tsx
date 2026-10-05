import { Pencil, Play, Plus } from 'lucide-react';
import type { HomeTask } from '../lib/model';
import { describeSchedule } from '@huishouden/pwa-kit/schedule';
import { SOON_DAYS, activeJobs, byDue, dueState, dueText, isPaused, lastDoneText } from '../lib/upkeep';
import { shortDate, toYmd, type Ymd } from '@huishouden/pwa-kit/time';
import type { HomeStore } from '../data/types';
import { CategoryTile, WhoLine } from '../components/bits';
import { CompleteButton, cardClass, iconButton, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { RoleNote } from '@huishouden/pwa-kit/react/roles';
import { mayChange } from '../data/types';
import { AddToCalendar } from '@huishouden/pwa-kit/react/calendar';
import { jobEntry } from '../lib/agenda';
import { useT } from '../i18n';
import { compareText } from '@huishouden/pwa-kit/i18n';

/** Every recurring job, soonest first, grouped by how soon. */
export function Upkeep({ store, today, onAdd, onEdit, onDone, onResume }: {
  store: HomeStore;
  today: Ymd;
  onAdd: () => void;
  onEdit: (t: HomeTask) => void;
  onDone: (t: HomeTask) => void;
  onResume: (t: HomeTask) => void;
}) {
  const t = useT();
  const { tasks, contacts } = store.data;
  const sorted = byDue(activeJobs(tasks));
  const paused = tasks.filter(isPaused).sort((a, b) => compareText(a.title, b.title));
  const groups: { id: string; label: string; items: HomeTask[] }[] = [
    { id: 'overdue', label: t('common.overdue'), items: sorted.filter((x) => dueState(x.due, today).state === 'overdue') },
    { id: 'soon', label: t('upkeep.nextTwoWeeks'), items: sorted.filter((x) => ['today', 'soon'].includes(dueState(x.due, today, SOON_DAYS).state)) },
    { id: 'later', label: t('upkeep.later'), items: sorted.filter((x) => dueState(x.due, today).state === 'later') },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 lg:h-full lg:overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 className="text-2xl font-semibold text-ink">{t('tab.upkeep')}</h2>
        <button type="button" className={primaryButton} onClick={onAdd}>
          <Plus size={20} /> {t('upkeep.addJob')}
        </button>
      </div>
      {store.helping && <RoleNote action="edit-others" />}
      {tasks.length === 0 && (
        <p className={`${cardClass} p-6 text-lg text-muted`}>{t('upkeep.empty')}</p>
      )}
      {groups.map((g) => (
        <section key={g.id} aria-label={g.label}>
          <h3 className={`${overline} mb-2 ${g.id === 'overdue' ? 'text-attention' : ''}`}>{g.label}</h3>
          <ul className={cardClass}>
            {g.items.map((job) => {
              const contact = job.contactId ? contacts.find((c) => c.id === job.contactId) : undefined;
              const late = dueState(job.due, today).state === 'overdue';
              return (
                <li key={job.id} className="flex items-start gap-4 border-b border-line p-4 last:border-b-0 sm:p-5" aria-label={job.title}>
                  <CategoryTile category={job.category} attention={late} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <button type="button" className="-mx-1 min-h-11 rounded-xl px-1 text-left text-xl font-semibold text-ink hover:bg-sunken" onClick={() => onEdit(job)}>
                        {job.title}
                      </button>
                      <p className={`text-base ${late ? 'font-semibold text-attention' : 'font-medium text-link'}`}>
                        {dueText(job.due, today)} <span className="font-normal text-muted">· {shortDate(job.due, today)}</span>
                      </p>
                    </div>
                    <p className="mt-0.5 text-base text-muted">
                      {describeSchedule(job.schedule)} · {lastDoneText(job.lastDone, today)}
                    </p>
                    <WhoLine contact={contact} compact />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <AddToCalendar entry={jobEntry(job, contacts)} compact />
                    <CompleteButton done={false} name={job.title} onDone={() => onDone(job)} compact />
                    {mayChange(store, job) && (
                      <button type="button" className={iconButton.replace('inline-flex', 'hidden sm:inline-flex')} onClick={() => onEdit(job)} aria-label={t('a11y.edit', { name: job.title })}>
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
        <section aria-label={t('upkeep.paused')}>
          <h3 className={`${overline} mb-2`}>{t('upkeep.paused')}</h3>
          <ul className={cardClass}>
            {paused.map((job) => (
              <li key={job.id} className="flex items-start gap-4 border-b border-line p-4 last:border-b-0 sm:p-5" aria-label={job.title}>
                <CategoryTile category={job.category} />
                <div className="min-w-0 flex-1">
                  <button type="button" className="-mx-1 min-h-11 rounded-xl px-1 text-left text-xl font-semibold text-muted hover:bg-sunken" onClick={() => onEdit(job)}>
                    {job.title}
                  </button>
                  <p className="mt-0.5 text-base text-muted">
                    {t('upkeep.pausedOn', { date: shortDate(toYmd(job.pausedAt!), today) })} · {describeSchedule(job.schedule)} · {lastDoneText(job.lastDone, today)}
                  </p>
                </div>
                {mayChange(store, job) && (
                  <button type="button" className={`${secondaryButton} shrink-0`} onClick={() => onResume(job)} aria-label={t('upkeep.resumeName', { name: job.title })}>
                    <Play size={18} /> <span className="hidden sm:inline">{t('upkeep.resume')}</span>
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
