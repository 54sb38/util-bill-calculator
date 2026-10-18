/*
 * Calendar-date arithmetic on `YYYY-MM-DD` strings.
 * Dates are converted to whole UTC day numbers, so there are no timezone or DST surprises.
 * All ranges are inclusive on both ends; an `end` of `null` means open-ended.
 */

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 (UTC). Throws on malformed or impossible dates such as 2025-02-30. */
export function toDayNumber(iso: string): number {
  const m = ISO_DATE.exec(iso);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d) {
      return date.getTime() / DAY_MS;
    }
  }
  throw new RangeError(`Invalid date: ${iso}`);
}

export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Number of days in an inclusive range, e.g. 2025-01-01..2025-01-31 → 31. */
export function daysInclusive(start: string, end: string): number {
  return toDayNumber(end) - toDayNumber(start) + 1;
}

/** Days shared by two inclusive ranges; 0 if they don't overlap. */
export function overlapDays(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): number {
  const start = Math.max(toDayNumber(aStart), toDayNumber(bStart));
  const end = Math.min(
    aEnd === null ? Infinity : toDayNumber(aEnd),
    bEnd === null ? Infinity : toDayNumber(bEnd),
  );
  if (end === Infinity) return Infinity;
  return Math.max(0, end - start + 1);
}

export function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  return overlapDays(aStart, aEnd, bStart, bEnd) > 0;
}
