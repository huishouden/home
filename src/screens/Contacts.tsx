import { ExternalLink, Globe, Mail, MapPin, Pencil, Phone, Trash2, UserPlus } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { mapsSearchUrl, telHref } from '@huishouden/pwa-kit/places';
import { displayWebsite, groupContacts } from '../lib/contacts';
import type { HomeStore } from '../data/types';
import { cardClass, iconButton, linkClass, overline, primaryButton } from '../components/ui';

/** The service providers: everyone the house may need, one tap from a call or a map. */
export function Contacts({ store, onAdd, onEdit, notify }: {
  store: HomeStore;
  onAdd: () => void;
  onEdit: (c: Contact) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const groups = groupContacts(store.data.contacts);

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

function ContactCard({ contact: c, role, onEdit, onDelete }: { contact: Contact; role: string; onEdit: () => void; onDelete: () => void }) {
  const maps = c.mapsUrl || (c.address ? mapsSearchUrl(`${c.name}, ${c.address}`) : null);
  return (
    <section className={`${cardClass} p-5`} aria-label={c.name}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={overline}>{role}</p>
          <h3 className="mt-0.5 text-xl font-semibold text-stone-800 [overflow-wrap:anywhere]">{c.name}</h3>
        </div>
        <button type="button" className={iconButton} onClick={onEdit} aria-label={`Edit ${c.name}`}>
          <Pencil size={18} />
        </button>
        <button type="button" className={iconButton} onClick={onDelete} aria-label={`Delete ${c.name}`}>
          <Trash2 size={18} />
        </button>
      </div>
      <div className="mt-2 flex flex-col items-start">
        {c.phone && (
          <a className={`${linkClass} text-lg tabular-nums`} href={telHref(c.phone)} aria-label={`Call ${c.name}, ${c.phone}`}>
            <Phone size={18} aria-hidden="true" /> {c.phone}
          </a>
        )}
        {c.email && (
          <a className={`${linkClass} [overflow-wrap:anywhere]`} href={`mailto:${c.email}`}>
            <Mail size={18} aria-hidden="true" /> {c.email}
          </a>
        )}
        {c.website && (
          <a className={`${linkClass} [overflow-wrap:anywhere]`} href={c.website} target="_blank" rel="noopener noreferrer">
            <Globe size={18} aria-hidden="true" /> {displayWebsite(c.website)}
          </a>
        )}
      </div>
      {c.address && (
        <div className="mt-1 text-base text-stone-700">
          <p className="flex items-start gap-1.5">
            <MapPin size={18} className="mt-0.5 shrink-0 text-stone-600" aria-hidden="true" /> <span className="[overflow-wrap:anywhere]">{c.address}</span>
          </p>
          {maps && (
            <a className={linkClass} href={maps} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={18} aria-hidden="true" /> Open in Google Maps
            </a>
          )}
        </div>
      )}
      {c.notes && <p className="mt-2 text-base whitespace-pre-line text-stone-600">{c.notes}</p>}
    </section>
  );
}
