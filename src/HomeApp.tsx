import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import type { HomeTask, ServiceEntry, ServiceInput, Warranty } from './lib/model';
import { formatShort, toYmd } from './lib/ymd';
import { useClock } from './clock';
import type { HomeStore } from './data/types';
import { calendarAvailable } from './data/calendar';
import { Header, type Tab } from './components/Header';
import { TaskDialog } from './components/TaskDialog';
import { EntryDialog } from './components/EntryDialog';
import { WarrantyDialog } from './components/WarrantyDialog';
import { ContactDialog } from './components/ContactDialog';
import { Toast, type ToastState } from './components/ui';
import { Overview, type TabId } from './screens/Overview';
import { Upkeep } from './screens/Upkeep';
import { History } from './screens/History';
import { Warranties } from './screens/Warranties';
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
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'upkeep', label: 'Upkeep' },
  { id: 'history', label: 'History' },
  { id: 'warranties', label: 'Warranties' },
  { id: 'contacts', label: 'Contacts' },
];

type Editing<T> = { item: T | null; initial?: Partial<ServiceInput> } | null;

/** Everything inside the frame once there is data to show (live or sample). */
export function HomeApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner }: Props) {
  const { now } = useClock();
  const today = toYmd(now);
  const [tab, setTab] = useState<TabId>('overview');
  const [task, setTask] = useState<Editing<HomeTask>>(null);
  const [entry, setEntry] = useState<Editing<ServiceEntry>>(null);
  const [warranty, setWarranty] = useState<Editing<Warranty>>(null);
  const [contact, setContact] = useState<Editing<Contact>>(null);
  const calendar = calendarAvailable(user);
  const { data, actions } = store;

  useEffect(() => {
    document.title = 'Huishouden Home';
  }, []);

  const markDone = (t: HomeTask) => {
    const { entryId, next } = actions.markDone(t, today);
    notify(`Done: ${t.title}. Next due ${formatShort(next, today)}.`, () => actions.undoDone(t, entryId));
  };

  let content: ReactNode;
  if (!store.ready) content = <p className="p-2 text-lg text-stone-600">Loading the house</p>;
  else if (tab === 'upkeep')
    content = <Upkeep store={store} today={today} onAdd={() => setTask({ item: null })} onEdit={(t) => setTask({ item: t })} onDone={markDone} />;
  else if (tab === 'history')
    content = <History store={store} today={today} calendarAvailable={calendar} onAdd={() => setEntry({ item: null })} onEdit={(e) => setEntry({ item: e })} notify={notify} />;
  else if (tab === 'warranties')
    content = <Warranties store={store} today={today} onAdd={() => setWarranty({ item: null })} onEdit={(w) => setWarranty({ item: w })} notify={notify} />;
  else if (tab === 'contacts')
    content = <Contacts store={store} notify={notify} onAdd={() => setContact({ item: null })} onEdit={(c) => setContact({ item: c })} />;
  else
    content = (
      <Overview
        store={store}
        today={today}
        onDone={markDone}
        onEditTask={(t) => setTask({ item: t })}
        onAddTask={() => setTask({ item: null })}
        onEditEntry={(e) => setEntry({ item: e })}
        onEditWarranty={(w) => setWarranty({ item: w })}
        onOpen={setTab}
      />
    );

  return (
    <div className="flex min-h-dvh flex-col bg-cream font-sans text-stone-800 antialiased lg:h-dvh lg:overflow-hidden">
      <Header tabs={TABS} tab={tab} onTab={(id) => setTab(id as TabId)} user={user} onSignIn={onSignIn} onSignOut={onSignOut} signingIn={signingIn} />
      <main className="mx-auto flex w-full max-w-[1200px] min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
        {banner}
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
      {contact && (
        <ContactDialog
          contact={contact.item}
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
