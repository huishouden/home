import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { clearSharedContact, readSharedContact, type Contact, type ParsedContact } from '@huishouden/pwa-kit/contacts';
import type { EventInput, HomeEvent, HomeTask, ServiceEntry, ServiceInput, Warranty } from './lib/model';
import { CalendarSync, Contact as ContactIcon, History as HistoryIcon, House, Repeat, ShieldCheck, Wrench } from 'lucide-react';
import { shortDate, toYmd } from '@huishouden/pwa-kit/time';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { isImported, type CalendarMatch, type CalendarSeries } from '@huishouden/pwa-kit/calendar';
import { atClock } from '@huishouden/pwa-kit/time';
import { useT } from './i18n';
import { describeRule, type Occurrence } from '@huishouden/pwa-kit/schedule';
import { SuggestionsCard } from '@huishouden/pwa-kit/react/suggestions';
import { CalendarSuggestions, calendarAvailable, useCalendarSuggestions } from '@huishouden/pwa-kit/react/calendar';
import { ContactDialog } from '@huishouden/pwa-kit/react/contacts';
import { Toast, type ToastState } from '@huishouden/pwa-kit/react/ui';
import { refusal } from '@huishouden/pwa-kit/roles';
import type { RoleState } from '@huishouden/pwa-kit/react/roles';
import { mayChange, type HomeStore } from './data/types';
import { Header, type Tab } from './components/Header';
import { TaskDialog } from './components/TaskDialog';
import { EntryDialog } from './components/EntryDialog';
import { WarrantyDialog } from './components/WarrantyDialog';
import { EventDialog } from './components/EventDialog';
import { OccurrenceDialog } from './components/OccurrenceDialog';
import { fromSeries, hasEventNamed, prepTasks, splitRegular, type PrepOffer, type PrepTask } from './lib/events';
import { APP, ROLES, roleLabel } from './lib/contacts';
import { maySetHome } from './lib/address';
import { calendarWords, fromCalendar } from './lib/calendarImport';
import { auth } from './data/firebase';
import { tabFromHash } from './lib/tabs';
import { Overview, type TabId } from './screens/Overview';
import { Upkeep } from './screens/Upkeep';
import { History } from './screens/History';
import { Warranties } from './screens/Warranties';
import { Regular } from './screens/Regular';
import { Contacts } from './screens/Contacts';

interface Props {
  store: HomeStore;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
  toast: ToastState | null;
  notify: (message: string, undo?: () => void) => void;
  clearToast: () => void;
  /** Shown above the content: the sample-data banner. */
  banner?: ReactNode;
  /** The signed-in person's role; the demo has none (everything allowed). */
  role?: RoleState;
}

// On phones the four primaries sit in the bottom bar; Warranties and Contacts are under More.
const tabs = (t: ReturnType<typeof useT>): Tab[] => [
  { id: 'overview', label: t('tab.overview'), icon: House, primary: true },
  { id: 'upkeep', label: t('tab.upkeep'), icon: Wrench, primary: true },
  { id: 'regular', label: t('tab.regular'), icon: Repeat, primary: true },
  { id: 'history', label: t('tab.history'), icon: HistoryIcon, primary: true },
  { id: 'warranties', label: t('tab.warranties'), icon: ShieldCheck },
  { id: 'contacts', label: t('tab.contacts'), icon: ContactIcon },
];

/** A "Looks regular" offer: a new regular event, or (with `prep`) the thing to do before one the household has. */
type RegularOffer = { series: CalendarSeries; prep?: PrepOffer };

type Editing<T> = { item: T | null; initial?: Partial<ServiceInput> } | null;

/** Everything inside the frame once there is data to show (live or sample). */
export function HomeApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner, role }: Props) {
  const t = useT();
  const { now, read } = useClock();
  const today = toYmd(now);
  // Agenda links open a screen: #upkeep, #history, #warranties.
  const [tab, setTab] = useState<TabId>(() => tabFromHash(window.location.hash));
  const [task, setTask] = useState<Editing<HomeTask>>(null);
  const [entry, setEntry] = useState<Editing<ServiceEntry>>(null);
  const [warranty, setWarranty] = useState<Editing<Warranty>>(null);
  const [contact, setContact] = useState<{ item: Contact | null; shared?: ParsedContact[] } | null>(null);
  const [regular, setRegular] = useState<{ item: HomeEvent | null; initial?: Partial<EventInput> } | null>(null);
  const [occurrence, setOccurrence] = useState<{ event: HomeEvent; occurrence: Occurrence } | null>(null);
  const calendar = calendarAvailable(user);
  const { data, actions } = store;
  const suggested = useCalendarSuggestions({
    auth,
    words: calendarWords(),
    // Occurrences of a regular event the household already has are not new.
    isImported: (m) => isImported(m, data.log) || hasEventNamed(data.events, m.title),
    app: 'Home',
    limit: 50,
  });
  // Garbage, recycling and lawn events that repeat are offered as one regular event, a reminder
  // before one the household has as its thing to do before; the rest as visits.
  const { offers, prepOffers, visits } = splitRegular(suggested.suggestions, data.events);
  const regularOffers: RegularOffer[] = [...prepOffers.map((p) => ({ series: p.series, prep: p })), ...offers.map((series) => ({ series }))];
  const prep = prepTasks(data.events, data.prep, now);

  /** Ticks the thing to do before off, or (when done) undoes it; a tick comes with Undo. */
  const togglePrep = (p: PrepTask) => {
    if (p.tick) {
      actions.untickPrep(p.event, p.occurrence.original);
      return;
    }
    actions.tickPrep(p.event, p.occurrence.original);
    notify(t('toast.prepDone', { title: p.prep.title }), () => actions.untickPrep(p.event, p.occurrence.original));
  };

  /** Not needed this time: shown as skipped (tap to undo), with Undo. */
  const skipPrep = (p: PrepTask) => {
    actions.skipPrep(p.event, p.occurrence.original);
    notify(t('toast.prepSkipped', { title: p.prep.title }), () => actions.untickPrep(p.event, p.occurrence.original));
  };



  /** Calendar events into the history as visits: Import from calendar and the new-in-your-calendar card. */
  const importEvents = (list: CalendarMatch[]) => {
    for (const m of list) actions.saveEntry(null, fromCalendar(m, data.tasks, data.events));
    notify(list.length === 1 ? t('common.added', { name: list[0].title }) : t('toast.addedVisits', { count: list.length }));
  };

  // Opened from the Share menu with a contact card (Contacts → Share → Home): a new contact, filled in.
  useEffect(() => {
    void readSharedContact().then((cards) => {
      if (!cards) return;
      clearSharedContact();
      setTab('contacts');
      setContact({ item: null, shared: cards });
    });
  }, []);

  useEffect(() => {
    document.title = t('app.documentTitle');
    const follow = () => {
      if (window.location.hash) setTab(tabFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [t]);

  // A helper or kid opening someone else's record is told who can change it rather than given a form.
  const open =
    <T extends { by?: string }>(show: (item: T) => void) =>
    (item: T) =>
      mayChange(store, item) ? show(item) : notify(refusal('edit-others'));

  const markDone = (task: HomeTask) => {
    const doneOn = toYmd(read());
    const { entryId, next } = actions.markDone(task, doneOn);
    notify(t('toast.jobDone', { title: task.title, date: shortDate(next, doneOn) }), () => actions.undoDone(task, entryId));
  };

  const resumeTask = (task: HomeTask) => {
    actions.resumeTask(task);
    notify(t('toast.resumed', { title: task.title }), () => actions.restoreTask(task));
  };

  let content: ReactNode;
  if (!store.ready) content = <p className="p-2 text-lg text-muted">{t('app.loading')}</p>;
  else if (tab === 'upkeep')
    content = <Upkeep store={store} today={today} onAdd={() => setTask({ item: null })} onEdit={open((x: HomeTask) => setTask({ item: x }))} onDone={markDone} onResume={resumeTask} />;
  else if (tab === 'history')
    content = (
      <History
        store={store}
        today={today}
        calendarAvailable={calendar}
        onAdd={() => setEntry({ item: null })}
        onEdit={open((e: ServiceEntry) => setEntry({ item: e }))}
        onImport={importEvents}
        onMakeRegular={(s) => setRegular({ item: null, initial: fromSeries(s) })}
      />
    );
  else if (tab === 'warranties')
    content = <Warranties store={store} today={today} onAdd={() => setWarranty({ item: null })} onEdit={open((w: Warranty) => setWarranty({ item: w }))} notify={notify} />;
  else if (tab === 'regular')
    content = (
      <Regular
        store={store}
        today={today}
        onAdd={() => setRegular({ item: null })}
        onEdit={open((e: HomeEvent) => setRegular({ item: e }))}
        onOpen={(event, o) => setOccurrence({ event, occurrence: o })}
      />
    );
  else if (tab === 'contacts')
    content = <Contacts store={store} notify={notify} onAdd={() => setContact({ item: null })} onEdit={(c) => setContact({ item: c })} />;
  else
    content = (
      <Overview
        store={store}
        today={today}
        onDone={markDone}
        onEditTask={open((x: HomeTask) => setTask({ item: x }))}
        onAddTask={() => setTask({ item: null })}
        onEditEntry={open((e: ServiceEntry) => setEntry({ item: e }))}
        onEditWarranty={open((w: Warranty) => setWarranty({ item: w }))}
        onOpen={setTab}
        prep={prep}
        now={now}
        onTogglePrep={togglePrep}
        onSkipPrep={skipPrep}
        canSetHome={maySetHome(role, store.helping)}
        onOpenOccurrence={(event, o) => setOccurrence({ event, occurrence: o })}
      />
    );

  return (
    <div className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased lg:h-dvh lg:overflow-hidden">
      <Header tabs={tabs(t)} tab={tab} onTab={(id) => setTab(id as TabId)} user={user} onSignIn={onSignIn} onSignOut={onSignOut} signingIn={signingIn} />
      <main className="mx-auto flex w-full max-w-[1200px] min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
        {banner}
        {tab === 'overview' && store.ready && (
          <>
            <SuggestionsCard
              suggestions={regularOffers}
              idOf={(o) => o.series.key}
              titleOf={(o) => o.series.title}
              detailOf={({ series: s, prep: p }) => {
                const rule = s.time ? t('regular.ruleAt', { rule: describeRule(s.rule), at: atClock(s.time) }) : describeRule(s.rule);
                return p ? t('suggest.ruleBefore', { rule, event: p.event.title }) : rule;
              }}
              lead={t('suggest.lead')}
              label={t('suggest.label')}
              moreLabel={t('suggest.more')}
              icon={<CalendarSync size={20} className="shrink-0 text-link" aria-hidden="true" />}
              addAs={({ series: s, prep: p }) => (p ? { label: t('suggest.usePrep'), ariaLabel: t('suggest.usePrepFor', { title: s.title, event: p.event.title }) } : null)}
              onAdd={({ series: s, prep: p }) => setRegular(p ? { item: p.event, initial: { prep: p.prep } } : { item: null, initial: fromSeries(s) })}
              onDismiss={(o) => o.series.matches.forEach(suggested.dismiss)}
            />
            <CalendarSuggestions suggestions={visits} now={now} onAdd={(m) => importEvents([m])} onDismiss={suggested.dismiss} />
          </>
        )}
        <div className="min-h-0 flex-1">{content}</div>
      </main>

      {task && (
        <TaskDialog
          task={task.item}
          today={today}
          contacts={data.contacts}
          calendarAvailable={calendar}
          onClose={() => setTask(null)}
          onSave={(input) => {
            actions.saveTask(task.item?.id ?? null, input);
            if (!task.item) notify(t('common.added', { name: input.title.trim() }));
          }}
          onDelete={
            task.item
              ? () => {
                  const gone = task.item!;
                  actions.deleteTask(gone.id);
                  notify(t('common.deleted', { name: gone.title }), () => actions.restoreTask(gone));
                }
              : undefined
          }
          onPause={
            task.item && task.item.pausedAt === undefined
              ? () => {
                  const was = task.item!;
                  actions.pauseTask(was);
                  notify(t('toast.paused', { title: was.title }), () => actions.restoreTask(was));
                }
              : undefined
          }
        />
      )}
      {entry && (
        <EntryDialog
          entry={entry.item}
          initial={entry.initial}
          today={today}
          tasks={data.tasks}
          contacts={data.contacts}
          calendarAvailable={calendar}
          onClose={() => setEntry(null)}
          onSave={(input) => {
            actions.saveEntry(entry.item?.id ?? null, input);
            if (!entry.item) notify(t('common.added', { name: input.title.trim() }));
          }}
          onDelete={
            entry.item
              ? () => {
                  const gone = entry.item!;
                  actions.deleteEntry(gone.id);
                  notify(t('common.deleted', { name: gone.title }), () => actions.restoreEntry(gone));
                }
              : undefined
          }
        />
      )}
      {warranty && (
        <WarrantyDialog
          warranty={warranty.item}
          today={today}
          contacts={data.contacts}
          onClose={() => setWarranty(null)}
          onSave={(input) => {
            actions.saveWarranty(warranty.item?.id ?? null, input);
            if (!warranty.item) notify(t('common.added', { name: input.item.trim() }));
          }}
          onDelete={
            warranty.item
              ? () => {
                  const gone = warranty.item!;
                  actions.deleteWarranty(gone.id);
                  notify(t('common.deleted', { name: gone.item }), () => actions.restoreWarranty(gone));
                }
              : undefined
          }
        />
      )}
      {regular && (
        <EventDialog
          event={regular.item}
          initial={regular.initial}
          today={today}
          contacts={data.contacts}
          onClose={() => setRegular(null)}
          onSave={(input) => {
            actions.saveEvent(regular.item?.id ?? null, input);
            if (!regular.item) notify(t('common.added', { name: input.title.trim() }));
            else if (regular.initial?.prep && input.prep) notify(t('toast.prepBefore', { prep: input.prep.title.trim(), event: input.title.trim() }));
          }}
          onDelete={
            regular.item
              ? () => {
                  const gone = regular.item!;
                  actions.deleteEvent(gone.id);
                  notify(t('common.deleted', { name: gone.title }), () => actions.restoreEvent(gone));
                }
              : undefined
          }
        />
      )}
      {occurrence && (
        <OccurrenceDialog
          event={occurrence.event}
          occurrence={occurrence.occurrence}
          today={today}
          canChange={mayChange(store, occurrence.event)}
          onClose={() => setOccurrence(null)}
          onEditSchedule={() => (mayChange(store, occurrence.event) ? setRegular({ item: occurrence.event }) : notify(refusal('edit-others')))}
          onChange={(change) => {
            const { event, occurrence: o } = occurrence;
            actions.changeOccurrence(event, o.original, change);
            // Undo writes back what this occurrence had before, on the event as it was.
            const restore = () => actions.changeOccurrence(event, o.original, event.exceptions?.[o.original] ?? null);
            notify(change?.skipped ? t('toast.skippedOnce', { title: event.title }) : change ? t('toast.moved', { title: event.title }) : t('toast.backOnDay', { title: event.title }), restore);
          }}
        />
      )}
      {contact && (
        <ContactDialog
          contact={contact.item}
          app={APP}
          roles={ROLES}
          roleLabel={roleLabel}
          namePlaceholder={t('contacts.namePlaceholder')}
          auth={auth}
          sharedContacts={contact.shared}
          canMarkPrivate={!role || role.can('see-private')}
          onClose={() => setContact(null)}
          onSave={(input) => {
            actions.saveContact(contact.item?.id ?? null, input);
            if (!contact.item) notify(t('common.added', { name: input.name }));
          }}
          onDelete={
            contact.item
              ? () => {
                  const gone = contact.item!;
                  actions.deleteContact(gone.id);
                  notify(t('common.deleted', { name: gone.name }), () => actions.restoreContact(gone));
                }
              : undefined
          }
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

