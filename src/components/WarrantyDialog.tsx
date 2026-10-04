import { useState } from 'react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { LIMITS, httpsUrl, type Warranty, type WarrantyInput } from '../lib/model';
import { addMonths, isYmd, type Ymd } from '@huishouden/pwa-kit/time';
import { ContactSelect, DeleteButton } from './bits';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { useT } from '../i18n';

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
  const t = useT();
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
      title={warranty ? t('warrantyDialog.titleEdit') : t('warrantyDialog.titleAdd')}
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
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            {t('common.save')}
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
        <Field label={t('warrantyDialog.item')}>
          <input className={inputClass} value={item} maxLength={LIMITS.item} onChange={(e) => setItem(e.target.value)} placeholder={t('warrantyDialog.itemPlaceholder')} />
        </Field>
        <Field label={t('warrantyDialog.details')}>
          <input className={inputClass} value={details} maxLength={LIMITS.details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('warrantyDialog.bought')}>
            <input className={inputClass} type="date" value={purchaseDate} max={today} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>
          <Field label={t('warrantyDialog.ends')}>
            <input className={inputClass} type="date" value={warrantyEnd} onChange={(e) => setWarrantyEnd(e.target.value)} />
          </Field>
        </div>
        {isYmd(purchaseDate) && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('warrantyDialog.length')}>
            <span className="text-sm text-muted">{t('warrantyDialog.coveredFor')}</span>
            {LENGTHS.map((years) => {
              const end = addMonths(purchaseDate, 12 * years);
              return (
                <Chip key={years} active={warrantyEnd === end} onClick={() => setWarrantyEnd(end)}>
                  {t('warrantyDialog.years', { count: years })}
                </Chip>
              );
            })}
          </div>
        )}
        <Field label={t('warrantyDialog.receipt')} hint={badLink(receiptUrl) ? t('warrantyDialog.badLink') : t('warrantyDialog.receiptHint')}>
          <input className={inputClass} inputMode="url" value={receiptUrl} maxLength={LIMITS.url} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label={t('warrantyDialog.manual')} hint={badLink(manualUrl) ? t('warrantyDialog.badLink') : undefined}>
          <input className={inputClass} inputMode="url" value={manualUrl} maxLength={LIMITS.url} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://" />
        </Field>
        {(contacts.length > 0 || contactId) && (
          <Field label={t('warrantyDialog.who')}>
            <ContactSelect value={contactId} contacts={contacts} onChange={setContactId} />
          </Field>
        )}
        <Field label={t('form.notesOptional')}>
          <textarea className={`${inputClass} min-h-20`} maxLength={LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
