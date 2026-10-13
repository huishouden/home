import { Contact as ContactIcon, History as HistoryIcon, House, Repeat, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import type { User } from 'firebase/auth';
import { AppOpening, type AppFrameProps, type OpeningPhase } from '@huishouden/pwa-kit/react/frame';
import { trackView } from '@huishouden/pwa-kit/observability';
import { useUrlTab } from '@huishouden/pwa-kit/react/url-state';
import type { Tab } from '@huishouden/pwa-kit/react/ui';
import { TAB_IDS, type TabId } from '../lib/tabs';
import { PORTAL_URL } from '../lib/portal';
import { useT } from '../i18n';

/** Each screen's icon and whether the phone's bottom bar shows it (the rest go under More). */
const SCREENS: Record<TabId, { icon: LucideIcon; primary?: boolean }> = {
  overview: { icon: House, primary: true },
  upkeep: { icon: Wrench, primary: true },
  regular: { icon: Repeat, primary: true },
  history: { icon: HistoryIcon, primary: true },
  warranties: { icon: ShieldCheck },
  contacts: { icon: ContactIcon },
};

// i18n-dynamic: tab.
/** Home's sections, in TAB_IDS order, for the app bar. */
export const tabs = (t: ReturnType<typeof useT>): Tab[] => TAB_IDS.map((id) => ({ id, label: t(`tab.${id}`), ...SCREENS[id] }));

/**
 * The screen on show and its setter: `?tab=` in the address (Overview when absent), so a reload
 * and Back return to it; `#upkeep` links that agenda items carry still open their screen. The one
 * place Home reads its tab, for the opening frame and the app alike.
 */
export const useHomeTab = () => useUrlTab(TAB_IDS, 'overview', { legacyHash: true });

/** Who is signed in and the app bar's sign-in controls. `user` is undefined while the session restores. */
export interface Account {
  user: User | null | undefined;
  signingIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const VERSION = `${import.meta.env.VITE_APP_VERSION} (${import.meta.env.VITE_BUILD_SHA})`;

/**
 * Home's frame (the kit's `AppFrame`): the same props while the app opens and once it has loaded, so
 * nothing moves between them. Without `tab`, no tabs (a note outside the app's sections).
 */
export function homeFrame(t: ReturnType<typeof useT>, account: Account, tab?: { id: TabId; choose: (id: TabId) => void }): AppFrameProps {
  return {
    app: t('app.name'),
    glyph: 'wrench',
    portalUrl: PORTAL_URL,
    version: VERSION,
    ...account,
    // Counts which tabs are used (anonymous, per visit; see the portal's /privacy page); never while opening.
    onView: trackView,
    layout: 'fit',
    ...(tab && { tabs: tabs(t), tab: tab.id, onTab: (id: string) => tab.choose(id as TabId) }),
  };
}

/** The app while it opens: the kit's opening frame with Home's tabs and the one in the address. */
export function HomeOpening({ phase, ...account }: Account & { phase: OpeningPhase }) {
  const t = useT();
  const [tab, setTab] = useHomeTab();
  return <AppOpening {...homeFrame(t, account, { id: tab, choose: setTab })} phase={phase} />;
}
