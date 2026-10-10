import { Bell } from 'lucide-react';
import type { User } from 'firebase/auth';
import { NotificationsCard as KitNotificationsCard } from '@huishouden/pwa-kit/react/push';
import { overline, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { db } from '../data/firebase';
import { AGENDA_APP } from '../lib/agenda';
import { useT } from '../i18n';

/** The VAPID key the shared sender signs with; the signed-in card is hidden until the repo sets it. */
export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

/**
 * "Notifications on this device": the things to do before an event and the house jobs that are
 * due, as notifications on this phone or tablet for the signed-in member. The kit's card keeps one
 * subscription per device for the whole suite; `app` is the string Home's reminders carry, so
 * muting matches them. Signed out, the sample shows the card with a note instead of a switch.
 */
export function NotificationsCard({ live }: { live?: { householdId: string; user: User } }) {
  const t = useT();
  if (live)
    return (
      <KitNotificationsCard
        db={db}
        householdId={live.householdId}
        user={live.user}
        app={AGENDA_APP}
        vapidKey={VAPID_PUBLIC_KEY}
        offText={t('push.offText')}
        onText={t('push.onText')}
        plain
      />
    );
  return (
    <section aria-label={t('push.title')}>
      <h3 className={overline}>{t('push.title')}</h3>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-base text-muted">{t('push.offText')}</p>
        <button type="button" className={primaryButton} disabled>
          <Bell size={18} /> {t('push.turnOn')}
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">{t('push.sampleNote')}</p>
    </section>
  );
}
