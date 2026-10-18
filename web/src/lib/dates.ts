/** Formatting helpers for `YYYY-MM-DD` dates (always interpreted as calendar dates, in UTC). */

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

const DAY_MS = 86_400_000;

export const isIsoDate = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime()) &&
  toDate(s).toISOString().startsWith(s);

export function formatDate(iso: string | null, fallback = 'ongoing'): string {
  if (!iso) return fallback;
  return toDate(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const formatRange = (start: string, end: string | null) =>
  `${formatDate(start)} – ${formatDate(end)}`;

export const toDayNumber = (iso: string) => toDate(iso).getTime() / DAY_MS;

export const daysInclusive = (start: string, end: string) => toDayNumber(end) - toDayNumber(start) + 1;

export function todayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

export const addDays = (iso: string, days: number) =>
  new Date(toDate(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
