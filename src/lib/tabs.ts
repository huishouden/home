/** The app's screens, addressable as `#upkeep`, `#history` and so on (agenda deep links use them). */
export const TAB_IDS = ['overview', 'upkeep', 'regular', 'history', 'warranties', 'contacts'] as const;
export type TabId = (typeof TAB_IDS)[number];

/** The screen a URL hash names; the overview for an empty or unknown one. */
export function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, '');
  return (TAB_IDS as readonly string[]).includes(id) ? (id as TabId) : 'overview';
}
