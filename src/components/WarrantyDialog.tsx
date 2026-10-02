import { useState } from 'react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { LIMITS, httpsUrl, type Warranty, type WarrantyInput } from '../lib/model';
import { addMonths, isYmd, type Ymd } from '../lib/ymd';
import { ContactSelect, DeleteButton } from './bits';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from './ui';

const LENGTHS = [1, 2, 3, 5, 10];

/** Add or edit an appliance or system: when it was bought, when its warranty ends, where the papers are. */
export function WarrantyDialog({ warranty, today, contacts, onSave, onDelete, onClose }: {
  warranty: Warranty | null;
  today: Ymd;
  contacts: Contact[];
  onSave: (input: WarrantyInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [item, setItem] = useState(warranty?.item ?? '');
  const [details, setDetails] = useState(warranty?.details ?? '');
  const [purchaseDate, setPurchaseDate] = useState(warranty?.purchaseDate ?? '');
  const [warrantyEnd, setWarrantyEnd] = useState(warranty?.warrantyEnd ?? '');
  const [receiptUrl, setReceiptUrl] = useState(warranty?.receiptUrl ?? '');
  const [manualUrl, setManualUrl] = useState(warranty?.manualUrl ?? '');
  const [contactId, setContactId] = useState(warranty?.contactId ?? '');
  const [notes, setNotes] = useState(warranty?.notes ?? '');
  const badLink = (s: string) => s.trim() !== '' && !httpsUrl(s);
  const valid = item.trim().length > 0 && !badLink(receiptUrl) && !badLink(manualUrl);

  const save = () => {
    if (!valid) return;
    onSave({
      item,
      details,
      purchaseDate: isYmd(purchaseDate) ? purchaseDate : undefined,
      warrantyEnd: isYmd(warrantyEnd) ? warrantyEnd : undefined,
      receiptUrl,
      manualUrl,
      contactId: contactId || undefined,
      notes,
    });
    onClose();
  };

  return (
    <Dialog
      title={warranty ? 'Edit warranty' : 'New warranty'}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <DeleteButton
              onClick={() => {
                onDelete();
                onClose();
              }}
            />
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Item">
          <input className={inputClass} value={item} maxLength={LIMITS.item} onChange={(e) => setItem(e.target.value)} placeholder="Dishwasher" />
        </Field>
        <Field label="Brand, model, serial (optional)">
          <input className={inputClass} value={details} maxLength={LIMITS.details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bought">
            <input className={inputClass} type="date" value={purchaseDate} max={today} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field label="Warranty ends">
            <input className={inputClass} type="date" value={warrantyEnd} onChange={(e) => setWarrantyEnd(e.target.value)} />
          </Field>
        </div>
        {isYmd(purchaseDate) && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Warranty length">
            <span className="text-sm text-stone-600">Covered for</span>
            {LENGTHS.map((years) => {
              const end = addMonths(purchaseDate, 12 * years);
              return (
                <Chip key={years} active={warrantyEnd === end} onClick={() => setWarrantyEnd(end)}>
                  {years} {years === 1 ? 'year' : 'years'}
                </Chip>
              );
            })}
          </div>
        )}
        <Field label="Receipt link (optional)" hint={badLink(receiptUrl) ? 'Use a link that starts with https://' : 'A photo or PDF in Drive, Photos or your email.'}>
          <input className={inputClass} inputMode="url" value={receiptUrl} maxLength={LIMITS.url} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Manual link (optional)" hint={badLink(manualUrl) ? 'Use a link that starts with https://' : undefined}>
          <input className={inputClass} inputMode="url" value={manualUrl} maxLength={LIMITS.url} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://" />
        </Field>
        {(contacts.length > 0 || contactId) && (
          <Field label="Who services it (optional)">
            <ContactSelect value={contactId} contacts={contacts} onChange={setContactId} />
          </Field>
        )}
        <Field label="Notes (optional)">
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
