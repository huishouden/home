import { Contact as ContactIcon, History as HistoryIcon, House, Repeat, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { useUrlTab } from '@huishouden/pwa-kit/react/url-state';
import type { Tab } from '@huishouden/pwa-kit/react/ui';
import { TAB_IDS, type TabId } from '../lib/tabs';
import type { useT } from '../i18n';

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
