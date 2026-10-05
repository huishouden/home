import { ExternalLink, MapPin } from 'lucide-react';
import { useHome } from '@huishouden/pwa-kit/react/home';
import { linkClass } from '@huishouden/pwa-kit/react/ui';
import { homeMapUrl } from '../lib/address';
import { PORTAL_URL } from '../lib/portal';
import { useT } from '../i18n';

/**
 * The household's own address at the foot of the overview's upkeep card: one calm line and a link
 * to the map. Without one,
 * admins and members get a link to set it in the portal's Household panel; helpers and kids, who
 * can't, see nothing.
 */
export function HomeAddress({ canSetHome }: { canSetHome: boolean }) {
  const t = useT();
  const home = useHome();
  if (!home)
    return canSetHome ? (
      <p className="flex items-center gap-1.5 border-t border-line pt-3 text-base text-muted">
        <MapPin size={18} className="shrink-0" aria-hidden="true" />
        <a className={linkClass} href={`${PORTAL_URL}apps#household`}>
          {t('address.setInPortal')}
        </a>
      </p>
    ) : null;
  return (
    <section className="flex items-center gap-3 border-t border-line pt-3" aria-label={t('address.title')}>
      <MapPin size={20} className="shrink-0 text-muted" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-lg text-ink [overflow-wrap:anywhere]" data-testid="home-address">
        {home.address}
        {home.approximate && <span className="text-muted"> · {t('address.approximate')}</span>}
      </p>
      <a
        className={`${linkClass} shrink-0`}
        href={homeMapUrl(home)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('address.openMap', { address: home.address })}
      >
        <ExternalLink size={18} aria-hidden="true" /> {t('address.map')}
      </a>
    </section>
  );
}
