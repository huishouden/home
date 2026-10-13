/** The app's screens, addressable as `?tab=upkeep` (`#upkeep`, which published agenda links use, still opens one). */
export const TAB_IDS = ['overview', 'upkeep', 'regular', 'history', 'warranties', 'contacts'] as const;
export type TabId = (typeof TAB_IDS)[number];
