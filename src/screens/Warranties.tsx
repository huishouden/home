import { BookOpen, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import type { Warranty } from '../lib/model';
import { byExpiry, warrantyState, warrantyText } from '../lib/warranty';
import { formatShort, type Ymd } from '../lib/ymd';
import type { HomeStore } from '../data/types';
import { WhoLine } from '../components/bits';
import { cardClass, iconButton, linkClass, primaryButton } from '../components/ui';

/** Appliances and systems with their warranty end, ending soonest first, and the receipt and manual one tap away. */
export function Warranties({ store, today, onAdd, onEdit, notify }: {
  store: HomeStore;
  today: Ymd;
  onAdd: () => void;
  onEdit: (w: Warranty) => void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { warranties, contacts } = store.data;
  const sorted = byExpiry(warranties, today);
  return (
    <div className="space-y-6 lg:h-full lg:overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-stone-800">Warranties and manuals</h2>
        <button type="button" className={primaryButton} onClick={onAdd}>
          <Plus size={20} /> Add item
        </button>
      </div>
      {sorted.length === 0 && (
        <p className={`${cardClass} p-6 text-lg text-stone-600`}>No appliances yet. Add the fridge, water heater and the rest with their receipts, so the warranty is easy to find.</p>
      )}
      <div className="grid items-start gap-6 md:grid-cols-2">
        {sorted.map((w) => {
          const { state } = warrantyState(w.warrantyEnd, today);
          const contact = w.contactId ? contacts.find((c) => c.id === w.contactId) : undefined;
          const tone = state === 'expiring' ? 'text-terracotta-dark font-semibold' : state === 'covered' ? 'text-forest-700 font-medium' : 'text-stone-600';
          return (
            <section key={w.id} className={`${cardClass} p-5`} aria-label={w.item}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold text-stone-800 [overflow-wrap:anywhere]">{w.item}</h3>
                  {w.details && <p className="text-base text-stone-600 [overflow-wrap:anywhere]">{w.details}</p>}
                </div>
                <button type="button" className={iconButton} onClick={() => onEdit(w)} aria-label={`Edit ${w.item}`}>
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  onClick={() => {
                    store.actions.deleteWarranty(w.id);
                    notify(`Deleted ${w.item}`, () => store.actions.restoreWarranty(w));
                  }}
                  aria-label={`Delete ${w.item}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <p className={`mt-2 text-lg ${tone}`}>{warrantyText(w.warrantyEnd, today)}</p>
              <p className="text-base text-stone-600">
                {[w.purchaseDate && `Bought ${formatShort(w.purchaseDate)}`, w.warrantyEnd && `warranty to ${formatShort(w.warrantyEnd)}`].filter(Boolean).join(', ') || 'No dates yet'}
              </p>
              {(w.receiptUrl || w.manualUrl) && (
                <div className="mt-1 flex flex-wrap gap-x-5">
                  {w.receiptUrl && (
                    <a className={linkClass} href={w.receiptUrl} target="_blank" rel="noopener noreferrer" aria-label={`Receipt for ${w.item}`}>
                      <Receipt size={18} aria-hidden="true" /> Receipt
                    </a>
                  )}
                  {w.manualUrl && (
                    <a className={linkClass} href={w.manualUrl} target="_blank" rel="noopener noreferrer" aria-label={`Manual for ${w.item}`}>
                      <BookOpen size={18} aria-hidden="true" /> Manual
                    </a>
                  )}
                </div>
              )}
              <WhoLine contact={contact} compact />
              {w.notes && <p className="mt-1 text-base whitespace-pre-line text-stone-600">{w.notes}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
