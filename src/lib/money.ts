// Amounts are whole cents (integers) in storage so sums never drift. Plain US dollars, no currency choice.

export const MAX_CENTS = 100_000_000; // $1,000,000.00

/** "120", "120.5", "$1,200.00" → cents; empty → undefined; anything else → null. */
export function parseMoney(text: string): number | undefined | null {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (!t) return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents <= MAX_CENTS ? cents : null;
}

const exact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** "$1,234.50"; the headline figure rounds to whole dollars: "$1,235" (DESIGN.md). */
export function formatMoney(cents: number, options?: { headline?: boolean }): string {
  return (options?.headline ? whole : exact).format(cents / 100);
}

/** Cents back to what the amount field shows: 12050 → "120.50". */
export const centsToInput = (cents: number | undefined) => (cents === undefined ? '' : (cents / 100).toFixed(2));
