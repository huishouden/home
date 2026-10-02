import type { Contact, ContactInput } from '@huishouden/pwa-kit/contacts';

// The service providers: which roles Home offers, and how the Contacts tab groups them.

export const APP = 'home';

/** Roles offered as one-tap choices, in the order the Contacts tab shows them. */
export const ROLES = ['HVAC', 'Pest control', 'Lawn service', 'Plumber', 'Electrician', 'Roofer', 'Pool service', 'Handyman', 'Insurance', 'HOA'] as const;

/** Limits from the household rules for contacts. */
export const CONTACT_LIMITS = { name: 120, role: 60, phone: 40, email: 120, website: 300, address: 300, notes: 1000 } as const;

export interface ContactGroup {
  role: string;
  contacts: Contact[];
}

/** Known roles first in their fixed order, then free-text roles A–Z, then contacts without a role as "Other". */
export function groupContacts(contacts: Contact[]): ContactGroup[] {
  const groups = new Map<string, Contact[]>();
  for (const c of [...contacts].sort((a, b) => a.name.localeCompare(b.name))) {
    const role = (c.role?.trim() && (ROLES.find((r) => r.toLowerCase() === c.role!.trim().toLowerCase()) ?? c.role.trim())) || 'Other';
    groups.set(role, [...(groups.get(role) ?? []), c]);
  }
  const rank = (role: string) => {
    const i = (ROLES as readonly string[]).indexOf(role);
    if (i >= 0) return i;
    return role === 'Other' ? ROLES.length + 2 : ROLES.length + 1;
  };
  return [...groups.entries()]
    .map(([role, list]) => ({ role, contacts: list }))
    .sort((a, b) => rank(a.role) - rank(b.role) || a.role.localeCompare(b.role));
}

/** "example.com" → "https://example.com"; empty stays empty. */
export function normalizeWebsite(url: string | undefined): string | undefined {
  const t = url?.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** "https://www.example.com/lawn/" → "example.com/lawn", for showing a link compactly. */
export function displayWebsite(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

/** What the dialog saves: trimmed to the rules' limits, with the website made a full URL, shown in Home. */
export function contactInput(fields: Omit<ContactInput, 'apps'>, apps: string[]): ContactInput {
  const cut = (s: string | undefined, max: number) => s?.trim().slice(0, max) || undefined;
  return {
    name: fields.name.trim().slice(0, CONTACT_LIMITS.name),
    role: cut(fields.role, CONTACT_LIMITS.role),
    phone: cut(fields.phone, CONTACT_LIMITS.phone),
    email: cut(fields.email, CONTACT_LIMITS.email),
    website: cut(normalizeWebsite(fields.website), CONTACT_LIMITS.website),
    address: cut(fields.address, CONTACT_LIMITS.address),
    mapsUrl: fields.mapsUrl?.trim() || undefined,
    notes: cut(fields.notes, CONTACT_LIMITS.notes),
    apps: apps.includes(APP) ? apps : [...apps, APP],
  };
}
