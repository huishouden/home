import { osmMapUrl, type HouseholdHome } from '@huishouden/pwa-kit/home';
import type { RoleAction } from '@huishouden/pwa-kit/roles';

// The household's own address on the overview (`@huishouden/pwa-kit/home`, set in the portal).

/** The home on openstreetmap.org: the house, or the neighbourhood for an approximate home. */
export const homeMapUrl = (home: Pick<HouseholdHome, 'lat' | 'lng' | 'approximate'>): string => osmMapUrl(home, home.approximate ? 14 : 17);

/**
 * Whether to offer "Set your home address in the portal": admins and members, who can set it
 * (`can(role, 'change-settings')`). The signed-out sample has no role: everyone but its helper view.
 */
export const maySetHome = (role: { can: (action: RoleAction) => boolean } | undefined, helping?: boolean): boolean =>
  role ? role.can('change-settings') : !helping;
