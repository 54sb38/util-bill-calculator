import { describe, expect, it } from 'vitest';
import {
  daysInclusive,
  fromDayNumber,
  overlapDays,
  rangesOverlap,
  toDayNumber,
} from '../src/calc/dates';
import {
  allocate,
  CalcError,
  calculateShares,
  type CalcInput,
  type CalcOverride,
  type CalcPerson,
} from '../src/calc/split';

const person = (
  id: number,
  stays: [string, string | null][],
  defaultWeight = 1,
): CalcPerson => ({
  id,
  defaultWeight,
  stays: stays.map(([startDate, endDate]) => ({ startDate, endDate })),
});

const bill = (overrides: Partial<CalcInput> = {}): CalcInput => ({
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  amountCents: 31_00,
  splitMethod: 'by_days',
  people: [],
  ...overrides,
});

const expectCalcError = (input: CalcInput, code: string) => {
  try {
    calculateShares(input);
  } catch (e) {
    expect(e).toBeInstanceOf(CalcError);
    expect((e as CalcError).code).toBe(code);
    return e as CalcError;
  }
  throw new Error(`expected CalcError ${code}`);
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('dates', () => {
  it('round-trips day numbers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(fromDayNumber(toDayNumber('2024-02-29'))).toBe('2024-02-29');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => toDayNumber('2025-02-30')).toThrow(RangeError);
    expect(() => toDayNumber('2025-1-01')).toThrow(RangeError);
    expect(() => toDayNumber('not a date')).toThrow(RangeError);
  });

  it('counts inclusive days, including leap years and DST-crossing ranges', () => {
    expect(daysInclusive('2025-01-01', '2025-01-01')).toBe(1);
    expect(daysInclusive('2025-01-01', '2025-01-31')).toBe(31);
    expect(daysInclusive('2024-02-01', '2024-02-29')).toBe(29);
    expect(daysInclusive('2025-03-01', '2025-04-30')).toBe(61);
    expect(daysInclusive('2025-01-01', '2025-12-31')).toBe(365);
  });

  it('computes overlap with inclusive boundaries', () => {
    const [bs, be] = ['2025-01-01', '2025-01-31'];
    expect(overlapDays('2024-12-01', '2025-01-01', bs, be)).toBe(1); // ends on bill start
    expect(overlapDays('2025-01-31', '2025-02-15', bs, be)).toBe(1); // starts on bill end
    expect(overlapDays('2025-01-10', '2025-01-19', bs, be)).toBe(10); // inside
    expect(overlapDays('2024-06-01', null, bs, be)).toBe(31); // open-ended, covers all
    expect(overlapDays('2025-01-20', null, bs, be)).toBe(12); // open-ended, starts mid-bill
    expect(overlapDays('2024-01-01', '2024-12-31', bs, be)).toBe(0); // before
    expect(overlapDays('2025-02-01', null, bs, be)).toBe(0); // after
  });

  it('detects overlapping ranges, treating null as open-ended', () => {
    expect(rangesOverlap('2025-01-01', null, '2025-06-01', null)).toBe(true);
    expect(rangesOverlap('2025-01-01', '2025-01-10', '2025-01-10', null)).toBe(true);
    expect(rangesOverlap('2025-01-01', '2025-01-10', '2025-01-11', null)).toBe(false);
  });
});

describe('allocate', () => {
  it('uses largest remainder and breaks ties by order', () => {
    expect(allocate(100_00, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(5, [1, 2])).toEqual([2, 3]);
  });

  it('gives the leftover cent to the largest remainder, not the first index', () => {
    // 100 * [1, 2] / 3 = 33.33.., 66.66.. → the second person has the larger remainder.
    expect(allocate(100, [1, 2])).toEqual([33, 67]);
  });

  it('handles zero bases', () => {
    expect(allocate(100, [0, 1, 0])).toEqual([0, 100, 0]);
  });

  it('always sums to the amount (randomised)', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % n;
    };
    for (let i = 0; i < 2000; i++) {
      const amount = 1 + rand(10_000_000);
      const bases = Array.from({ length: 1 + rand(8) }, () => rand(5000));
      if (!bases.some((b) => b > 0)) bases[0] = 1;
      const result = allocate(amount, bases);
      expect(sum(result)).toBe(amount);
      result.forEach((r, j) => {
        const exact = (amount * bases[j]!) / sum(bases);
        expect(Math.abs(r - exact)).toBeLessThan(1);
      });
    }
  });
});

describe('calculateShares', () => {
  describe('by_days', () => {
    it('splits proportionally to days present', () => {
      const shares = calculateShares(
        bill({
          amountCents: 300_00,
          people: [person(1, [['2024-01-01', null]]), person(2, [['2025-01-17', null]])],
        }),
      );
      // 31 days vs 15 days.
      expect(shares).toEqual([
        { personId: 1, amountCents: 20217, daysCounted: 31, weightUsed: null },
        { personId: 2, amountCents: 9783, daysCounted: 15, weightUsed: null },
      ]);
      expect(sum(shares.map((s) => s.amountCents))).toBe(300_00);
    });

    it('accounts for a 10-day holiday as a gap between stays', () => {
      const shares = calculateShares(
        bill({
          people: [
            person(1, [['2024-01-01', null]]),
            person(2, [
              ['2024-01-01', '2025-01-09'],
              ['2025-01-20', null],
            ]),
          ],
        }),
      );
      expect(shares.map((s) => s.daysCounted)).toEqual([31, 21]);
      expect(shares[0]!.daysCounted! - shares[1]!.daysCounted!).toBe(10);
    });

    it('excludes people with no overlapping stays', () => {
      const shares = calculateShares(
        bill({
          people: [person(1, [['2024-01-01', null]]), person(2, [['2025-03-01', null]])],
        }),
      );
      expect(shares.map((s) => s.personId)).toEqual([1]);
      expect(shares[0]!.amountCents).toBe(31_00);
    });

    it('rejects a bill where nobody stayed', () => {
      expectCalcError(
        bill({
          people: [person(1, [['2025-03-01', null]])],
          overrides: new Map([[1, { included: true }]]),
        }),
        'NO_DAYS',
      );
    });

    it('gives a forced-in participant with no days a zero share', () => {
      const shares = calculateShares(
        bill({
          people: [person(1, [['2024-01-01', null]]), person(2, [])],
          overrides: new Map([[2, { included: true }]]),
        }),
      );
      expect(shares.map((s) => [s.personId, s.amountCents])).toEqual([
        [1, 31_00],
        [2, 0],
      ]);
    });
  });

  describe('equal', () => {
    it('splits evenly with deterministic rounding', () => {
      const shares = calculateShares(
        bill({
          splitMethod: 'equal',
          amountCents: 100_00,
          // Supplied out of order: output is sorted by id and the extra cent goes to the lowest id.
          people: [
            person(3, [['2025-01-30', null]]),
            person(1, [['2024-01-01', null]]),
            person(2, [['2024-01-01', '2025-01-02']]),
          ],
        }),
      );
      expect(shares.map((s) => [s.personId, s.amountCents])).toEqual([
        [1, 3334],
        [2, 3333],
        [3, 3333],
      ]);
      expect(shares.every((s) => s.daysCounted === null)).toBe(true);
    });
  });

  describe('weights', () => {
    it('uses default weights, overridden per bill', () => {
      const people = [person(1, [['2024-01-01', null]], 2), person(2, [['2024-01-01', null]], 1)];
      const byDefault = calculateShares(bill({ splitMethod: 'weights', amountCents: 90_00, people }));
      expect(byDefault.map((s) => [s.amountCents, s.weightUsed])).toEqual([
        [60_00, 2],
        [30_00, 1],
      ]);

      const overridden = calculateShares(
        bill({
          splitMethod: 'weights',
          amountCents: 90_00,
          people,
          overrides: new Map([[1, { weight: 0.5 }]]),
        }),
      );
      expect(overridden.map((s) => [s.amountCents, s.weightUsed])).toEqual([
        [30_00, 0.5],
        [60_00, 1],
      ]);
    });

    it('handles fractional weights exactly', () => {
      const shares = calculateShares(
        bill({
          splitMethod: 'weights',
          amountCents: 100_00,
          people: [
            person(1, [['2024-01-01', null]], 1.5),
            person(2, [['2024-01-01', null]], 1.25),
            person(3, [['2024-01-01', null]], 0.25),
          ],
        }),
      );
      expect(shares.map((s) => s.amountCents)).toEqual([50_00, 4167, 833]);
    });
  });

  describe('custom', () => {
    const people = [person(1, [['2024-01-01', null]]), person(2, [['2024-01-01', null]])];
    const custom = (entries: [number, CalcOverride][], amountCents = 100_00) =>
      bill({ splitMethod: 'custom', amountCents, people, overrides: new Map(entries) });

    it('uses the entered amounts', () => {
      const shares = calculateShares(
        custom([
          [1, { customAmountCents: 70_00 }],
          [2, { customAmountCents: 30_00 }],
        ]),
      );
      expect(shares.map((s) => s.amountCents)).toEqual([70_00, 30_00]);
    });

    it('requires an amount for every participant', () => {
      const err = expectCalcError(custom([[1, { customAmountCents: 100_00 }]]), 'CUSTOM_MISSING');
      expect(err.details).toEqual({ personIds: [2] });
    });

    it('requires amounts to add up to the bill', () => {
      const err = expectCalcError(
        custom([
          [1, { customAmountCents: 70_00 }],
          [2, { customAmountCents: 20_00 }],
        ]),
        'CUSTOM_SUM_MISMATCH',
      );
      expect(err.details).toEqual({ expectedCents: 100_00, actualCents: 90_00 });
    });

    it('ignores amounts for excluded people', () => {
      const shares = calculateShares(
        custom([
          [1, { customAmountCents: 100_00 }],
          [2, { included: false, customAmountCents: 50_00 }],
        ]),
      );
      expect(shares.map((s) => [s.personId, s.amountCents])).toEqual([[1, 100_00]]);
    });
  });

  describe('participants', () => {
    it('honours exclusions', () => {
      const shares = calculateShares(
        bill({
          people: [person(1, [['2024-01-01', null]]), person(2, [['2024-01-01', null]])],
          overrides: new Map([[2, { included: false }]]),
        }),
      );
      expect(shares.map((s) => s.personId)).toEqual([1]);
    });

    it('throws when everybody is excluded', () => {
      expectCalcError(
        bill({
          people: [person(1, [['2024-01-01', null]])],
          overrides: new Map([[1, { included: false }]]),
        }),
        'NO_PARTICIPANTS',
      );
    });

    it('throws when the home has nobody staying', () => {
      expectCalcError(bill({ splitMethod: 'equal', people: [person(1, [])] }), 'NO_PARTICIPANTS');
    });

    it('treats an override without `included` as not changing participation', () => {
      const shares = calculateShares(
        bill({
          splitMethod: 'weights',
          people: [person(1, [['2024-01-01', null]]), person(2, [])],
          overrides: new Map([[2, { weight: 3 }]]),
        }),
      );
      expect(shares.map((s) => s.personId)).toEqual([1]);
    });
  });
});
