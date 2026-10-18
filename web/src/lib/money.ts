const amountFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats integer cents as dollars, e.g. 123456 → "$1,234.56" and -500 → "-$5.00". */
export const formatMoney = (cents: number) => `${cents < 0 ? '-' : ''}$${amountFormat.format(Math.abs(cents) / 100)}`;

/** Parses user input like "1,234.5" or "$12" into cents; null if it isn't a valid amount. */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** Cents → plain input value, e.g. 12340 → "123.40". */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2);

export const percent = (part: number, whole: number) =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`;
