import { spanWords } from './upkeep';
import { daysBetween, type Ymd } from './ymd';

/** Warranties ending within this many days are highlighted. */
export const EXPIRING_DAYS = 90;

export type WarrantyState = 'none' | 'expired' | 'expiring' | 'covered';

export function warrantyState(end: Ymd | undefined, today: Ymd): { state: WarrantyState; days: number | null } {
  if (!end) return { state: 'none', days: null };
  const days = daysBetween(today, end);
  if (days < 0) return { state: 'expired', days };
  return { state: days <= EXPIRING_DAYS ? 'expiring' : 'covered', days };
}

/** "Expires in 46 days", "Expires today", "Expires in 7 months", "Expired 3 months ago", "No warranty date". */
export function warrantyText(end: Ymd | undefined, today: Ymd): string {
  const { days } = warrantyState(end, today);
  if (days === null) return 'No warranty end date';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days === -1) return 'Expired yesterday';
  if (days < 0) return `Expired ${spanWords(days, EXPIRING_DAYS)} ago`;
  return `Expires in ${spanWords(days, EXPIRING_DAYS)}`;
}

/** Ending soonest first; still covered before expired; no end date last; ties by name. */
export function byExpiry<T extends { item: string; warrantyEnd?: Ymd }>(items: T[], today: Ymd): T[] {
  const rank = (w: T) => {
    const { state, days } = warrantyState(w.warrantyEnd, today);
    if (state === 'none') return [2, 0];
    if (state === 'expired') return [1, -(days ?? 0)];
    return [0, days ?? 0];
  };
  return [...items].sort((a, b) => {
    const [ra, da] = rank(a);
    const [rb, db] = rank(b);
    return ra - rb || da - db || a.item.localeCompare(b.item);
  });
}
