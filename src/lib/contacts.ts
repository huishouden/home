// The service providers: which roles Home offers. Grouping, saving and the dialog are the kit's
// (@huishouden/pwa-kit/contacts, /react/contacts).
import { t } from '../i18n';

export const APP = 'home';

/** Roles offered as one-tap choices, in the order the Contacts tab shows them. Stored in English, shown with `roleLabel`. */
export const ROLES = ['HVAC', 'Pest control', 'Lawn service', 'Plumber', 'Electrician', 'Roofer', 'Pool service', 'Handyman', 'Insurance', 'HOA', 'Landlord'] as const;

const ROLE_KEYS: Record<(typeof ROLES)[number], Parameters<typeof t>[0]> = {
  HVAC: 'role.hvac',
  'Pest control': 'role.pest',
  'Lawn service': 'role.lawn',
  Plumber: 'role.plumber',
  Electrician: 'role.electrician',
  Roofer: 'role.roofer',
  'Pool service': 'role.pool',
  Handyman: 'role.handyman',
  Insurance: 'role.insurance',
  HOA: 'role.hoa',
  Landlord: 'role.landlord',
};

/** A role in the active language: one of `ROLES` (matched ignoring case) translated, any other as typed. */
export function roleLabel(role: string): string {
  const known = ROLES.find((r) => r.toLowerCase() === role.trim().toLowerCase());
  return known ? t(ROLE_KEYS[known]) : role;
}
