import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { clearSharedContact, readSharedContact, type Contact, type ParsedContact } from '@huishouden/pwa-kit/contacts';
import type { EventInput, HomeEvent, HomeTask, ServiceEntry, ServiceInput, Warranty } from './lib/model';
import { CalendarSync, Contact as ContactIcon, History as HistoryIcon, House, Repeat, ShieldCheck, Wrench } from 'lucide-react';
import { shortDate, toYmd } from '@huishouden/pwa-kit/time';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { isImported, type CalendarMatch, type CalendarSeries } from '@huishouden/pwa-kit/calendar';
import { clockWords } from '@huishouden/pwa-kit/time';
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
import { APP, ROLES } from './lib/contacts';
import { CALENDAR_WORDS, fromCalendar } from './lib/calendarImport';
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
const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: House, primary: true },
  { id: 'upkeep', label: 'Upkeep', icon: Wrench, primary: true },
  { id: 'regular', label: 'Regular', icon: Repeat, primary: true },
  { id: 'history', label: 'History', icon: HistoryIcon, primary: true },
  { id: 'warranties', label: 'Warranties', icon: ShieldCheck },
  { id: 'contacts', label: 'Contacts', icon: ContactIcon },
];

/** A "Looks regular" offer: a new regular event, or (with `prep`) the thing to do before one the household has. */
type RegularOffer = { series: CalendarSeries; prep?: PrepOffer };

type Editing<T> = { item: T | null; initial?: Partial<ServiceInput> } | null;

/** Everything inside the frame once there is data to show (live or sample). */
export function HomeApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner, role }: Props) {
  const { now } = useClock();
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
    words: CALENDAR_WORDS,
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
  const togglePrep = (t: PrepTask) => {
    if (t.tick) {
      actions.untickPrep(t.event, t.occurrence.original);
      return;
    }
    actions.tickPrep(t.event, t.occurrence.original);
    notify(`Done: ${t.prep.title}`, () => actions.untickPrep(t.event, t.occurrence.original));
  };



  /** Calendar events into the history as visits: Import from calendar and the new-in-your-calendar card. */
  const importEvents = (list: CalendarMatch[]) => {
    for (const m of list) actions.saveEntry(null, fromCalendar(m, data.tasks, data.events));
    notify(list.length === 1 ? `Added ${list[0].title}` : `Added ${list.length} visits`);
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
    document.title = 'Huishouden Home';
    const follow = () => {
      if (window.location.hash) setTab(tabFromHash(window.location.hash));
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  // A helper or kid opening someone else's record is told who can change it rather than given a form.
  const open =
    <T extends { by?: string }>(show: (item: T) => void) =>
    (item: T) =>
      mayChange(store, item) ? show(item) : notify(refusal('edit-others'));

  const markDone = (t: HomeTask) => {
    const { entryId, next } = actions.markDone(t, today);
    notify(`Done: ${t.title}. Next due ${shortDate(next, today)}.`, () => actions.undoDone(t, entryId));
  };

  let content: ReactNode;
  if (!store.ready) content = <p className="p-2 text-lg text-stone-600">Loading the house</p>;
  else if (tab === 'upkeep')
    content = <Upkeep store={store} today={today} onAdd={() => setTask({ item: null })} onEdit={open((t: HomeTask) => setTask({ item: t }))} onDone={markDone} />;
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
        onEditTask={open((t: HomeTask) => setTask({ item: t }))}
        onAddTask={() => setTask({ item: null })}
        onEditEntry={open((e: ServiceEntry) => setEntry({ item: e }))}
        onEditWarranty={open((w: Warranty) => setWarranty({ item: w }))}
        onOpen={setTab}
        prep={prep}
        now={now}
        onTogglePrep={togglePrep}
        onOpenOccurrence={(event, o) => setOccurrence({ event, occurrence: o })}
      />
    );

  return (
    <div className="flex min-h-dvh flex-col bg-cream font-sans text-stone-800 antialiased lg:h-dvh lg:overflow-hidden">
      <Header tabs={TABS} tab={tab} onTab={(id) => setTab(id as TabId)} user={user} onSignIn={onSignIn} onSignOut={onSignOut} signingIn={signingIn} />
      <main className="mx-auto flex w-full max-w-[1200px] min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
        {banner}
        {tab === 'overview' && store.ready && (
          <>
            <SuggestionsCard
              suggestions={regularOffers}
              idOf={(o) => o.series.key}
              titleOf={(o) => o.series.title}
              detailOf={({ series: s, prep: p }) => `${describeRule(s.rule)}${s.time ? ` at ${clockWords(s.time)}` : ''}${p ? ` · before ${p.event.title}` : ''}`}
              lead="Looks regular"
              label="Regular events in your calendar"
              moreLabel="More regular events in your calendar"
              icon={<CalendarSync size={20} className="shrink-0 text-forest-700" aria-hidden="true" />}
              addAs={({ series: s, prep: p }) => (p ? { label: 'Use as prep', ariaLabel: `Use ${s.title} as prep for ${p.event.title}` } : null)}
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
            if (!task.item) notify(`Added ${input.title.trim()}`);
          }}
          onDelete={
            task.item
              ? () => {
                  const gone = task.item!;
                  actions.deleteTask(gone.id);
                  notify(`Deleted ${gone.title}`, () => actions.restoreTask(gone));
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
            if (!entry.item) notify(`Added ${input.title.trim()}`);
          }}
          onDelete={
            entry.item
              ? () => {
                  const gone = entry.item!;
                  actions.deleteEntry(gone.id);
                  notify(`Deleted ${gone.title}`, () => actions.restoreEntry(gone));
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
            if (!warranty.item) notify(`Added ${input.item.trim()}`);
          }}
          onDelete={
            warranty.item
              ? () => {
                  const gone = warranty.item!;
                  actions.deleteWarranty(gone.id);
                  notify(`Deleted ${gone.item}`, () => actions.restoreWarranty(gone));
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
            if (!regular.item) notify(`Added ${input.title.trim()}`);
            else if (regular.initial?.prep && input.prep) notify(`${input.prep.title.trim()} before ${input.title.trim()}`);
          }}
          onDelete={
            regular.item
              ? () => {
                  const gone = regular.item!;
                  actions.deleteEvent(gone.id);
                  notify(`Deleted ${gone.title}`, () => actions.restoreEvent(gone));
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
            notify(change?.skipped ? `Skipped ${event.title} this time` : change ? `Moved ${event.title}` : `${event.title} is back on its usual day`, restore);
          }}
        />
      )}
      {contact && (
        <ContactDialog
          contact={contact.item}
          app={APP}
          roles={ROLES}
          namePlaceholder="Example Lawn Care"
          auth={auth}
          sharedContacts={contact.shared}
          canMarkPrivate={!role || role.can('see-private')}
          onClose={() => setContact(null)}
          onSave={(input) => {
            actions.saveContact(contact.item?.id ?? null, input);
            if (!contact.item) notify(`Added ${input.name}`);
          }}
          onDelete={
            contact.item
              ? () => {
                  const gone = contact.item!;
                  actions.deleteContact(gone.id);
                  notify(`Deleted ${gone.name}`, () => actions.restoreContact(gone));
                }
              : undefined
          }
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

