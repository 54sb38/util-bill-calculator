import type { CalcErrorCode, SplitMethod } from '@bill/shared';
import { overlapDays } from './dates';

/*
 * Pure bill-splitting engine (no database access).
 *
 * 1. Participants = people whose stays overlap the bill period,
 *    plus overrides with included=true, minus overrides with included=false.
 * 2. Each participant gets a basis depending on the method (days, 1, weight), or a custom amount.
 * 3. The amount is allocated proportionally with the largest-remainder method in integer cents,
 *    so shares always sum exactly to the bill amount. Ties go to the lowest person id.
 */

export interface CalcStay {
  startDate: string;
  endDate: string | null;
}

export interface CalcPerson {
  id: number;
  defaultWeight: number;
  stays: CalcStay[];
}

export interface CalcOverride {
  included?: boolean;
  weight?: number | null;
  customAmountCents?: number | null;
}

export interface CalcInput {
  startDate: string;
  endDate: string;
  amountCents: number;
  splitMethod: SplitMethod;
  /** Everyone in the home, including archived people. */
  people: CalcPerson[];
  overrides?: ReadonlyMap<number, CalcOverride>;
}

export interface CalcShare {
  personId: number;
  amountCents: number;
  daysCounted: number | null;
  weightUsed: number | null;
}

export interface CalcParticipant {
  person: CalcPerson;
  days: number;
  override: CalcOverride | undefined;
}

export class CalcError extends Error {
  constructor(
    readonly code: CalcErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CalcError';
  }
}

/** Weights are converted to integer milli-units so allocation stays exact. */
const WEIGHT_SCALE = 1000;

export function daysPresent(stays: CalcStay[], startDate: string, endDate: string): number {
  // Stays never overlap each other (enforced by the stays service), so summing is safe.
  return stays.reduce((sum, s) => sum + overlapDays(s.startDate, s.endDate, startDate, endDate), 0);
}

/** Resolves who takes part in the bill, sorted by person id. */
export function resolveParticipants(input: CalcInput): CalcParticipant[] {
  return input.people
    .map((person) => ({
      person,
      days: daysPresent(person.stays, input.startDate, input.endDate),
      override: input.overrides?.get(person.id),
    }))
    .filter(({ days, override }) => override?.included ?? days > 0)
    .sort((a, b) => a.person.id - b.person.id);
}

export function calculateShares(input: CalcInput): CalcShare[] {
  const participants = resolveParticipants(input);
  if (participants.length === 0) {
    throw new CalcError('NO_PARTICIPANTS', 'Nobody takes part in this bill.');
  }

  switch (input.splitMethod) {
    case 'by_days': {
      const bases = participants.map((p) => p.days);
      if (bases.every((d) => d === 0)) {
        throw new CalcError(
          'NO_DAYS',
          'Nobody stayed during this bill period. Add stays or choose another split method.',
        );
      }
      const amounts = allocate(input.amountCents, bases);
      return participants.map((p, i) => ({
        personId: p.person.id,
        amountCents: amounts[i]!,
        daysCounted: p.days,
        weightUsed: null,
      }));
    }

    case 'equal': {
      const amounts = allocate(
        input.amountCents,
        participants.map(() => 1),
      );
      return participants.map((p, i) => ({
        personId: p.person.id,
        amountCents: amounts[i]!,
        daysCounted: null,
        weightUsed: null,
      }));
    }

    case 'weights': {
      const weights = participants.map((p) => p.override?.weight ?? p.person.defaultWeight);
      const amounts = allocate(
        input.amountCents,
        weights.map((w) => Math.max(1, Math.round(w * WEIGHT_SCALE))),
      );
      return participants.map((p, i) => ({
        personId: p.person.id,
        amountCents: amounts[i]!,
        daysCounted: null,
        weightUsed: weights[i]!,
      }));
    }

    case 'custom': {
      const missing = participants
        .filter((p) => p.override?.customAmountCents == null)
        .map((p) => p.person.id);
      if (missing.length > 0) {
        throw new CalcError('CUSTOM_MISSING', 'Enter an amount for every participant.', {
          personIds: missing,
        });
      }
      const amounts = participants.map((p) => p.override!.customAmountCents!);
      const actual = amounts.reduce((a, b) => a + b, 0);
      if (actual !== input.amountCents) {
        throw new CalcError(
          'CUSTOM_SUM_MISMATCH',
          `Custom amounts add up to ${formatCents(actual)}, but the bill is ${formatCents(input.amountCents)}.`,
          { expectedCents: input.amountCents, actualCents: actual },
        );
      }
      return participants.map((p, i) => ({
        personId: p.person.id,
        amountCents: amounts[i]!,
        daysCounted: null,
        weightUsed: null,
      }));
    }
  }
}

/**
 * Splits `amount` proportionally to non-negative integer `bases` (at least one > 0) using the
 * largest-remainder method. Results sum exactly to `amount`; ties favour earlier indices.
 */
export function allocate(amount: number, bases: number[]): number[] {
  const total = BigInt(bases.reduce((a, b) => a + b, 0));
  if (total === 0n) throw new RangeError('allocate: bases must not all be zero');
  const amt = BigInt(amount);

  const parts = bases.map((b, index) => {
    const numerator = amt * BigInt(b);
    return { index, floor: numerator / total, remainder: numerator % total };
  });

  let leftover = amt - parts.reduce((sum, p) => sum + p.floor, 0n);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const p of byRemainder) {
    if (leftover === 0n) break;
    p.floor += 1n;
    leftover -= 1n;
  }
  return parts.map((p) => Number(p.floor));
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
