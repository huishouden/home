import { UserPlus } from 'lucide-react';
import { groupContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { ContactCard } from '@huishouden/pwa-kit/react/contacts';
import { ROLES } from '../lib/contacts';
import type { HomeStore } from '../data/types';
import { cardClass, primaryButton } from '@huishouden/pwa-kit/react/ui';

/** The service providers: everyone the house may need, one tap from a call or a map. */
export function Contacts({ store, onAdd, onEdit, notify }: {
  store: HomeStore;
  onAdd: () => void;
  onEdit: (c: Contact) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const groups = groupContacts(store.data.contacts, ROLES);

  return (
    <div className="space-y-6 lg:h-full lg:overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-stone-800">Contacts</h2>
        <button type="button" className={primaryButton} onClick={onAdd}>
          <UserPlus size={20} /> Add contact
        </button>
      </div>
      {groups.length === 0 && (
        <p className={`${cardClass} p-6 text-lg text-stone-600`}>No service providers yet. Add the lawn service, pest control and plumber so their numbers are one tap away.</p>
      )}
      <div className="grid items-start gap-6 md:grid-cols-2">
        {groups.flatMap((g) =>
          g.contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              role={g.role}
              onEdit={() => onEdit(c)}
              onDelete={() => {
                store.actions.deleteContact(c.id);
                notify(`Deleted ${c.name}`, () => store.actions.restoreContact(c));
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}
