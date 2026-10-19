import type { CalcErrorCode, SplitMethod } from './splitMethods';

/** Response DTOs returned by the JSON API. Money is always integer cents. */

export interface HomeDto {
  id: number;
  name: string;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  peopleCount: number;
  billCount: number;
}

export interface StayDto {
  id: number;
  personId: number;
  startDate: string;
  endDate: string | null;
  note: string | null;
}

export interface PersonDto {
  id: number;
  homeId: number;
  name: string;
  defaultWeight: number;
  archivedAt: string | null;
  stays: StayDto[];
}

export interface BillTypeDto {
  id: number;
  homeId: number;
  name: string;
  defaultSplitMethod: SplitMethod;
  billCount: number;
}

export interface ParticipantDto {
  personId: number;
  included: boolean;
  weight: number | null;
  customAmountCents: number | null;
}

export interface ShareDto {
  personId: number;
  personName: string;
  amountCents: number;
  daysCounted: number | null;
  weightUsed: number | null;
}

export interface BillDto {
  id: number;
  homeId: number;
  billTypeId: number;
  billTypeName: string;
  startDate: string;
  endDate: string;
  /** Length of the bill period in days (inclusive). */
  days: number;
  amountCents: number;
  splitMethod: SplitMethod;
  notes: string | null;
  calculatedAt: string | null;
  shares: ShareDto[];
  /** True when recalculating with current stays/weights would give different shares. */
  isStale: boolean;
  /** Set when recalculating with current data would fail (e.g. stays were removed). */
  staleReason: string | null;
}

export interface BillDetailDto extends BillDto {
  participants: ParticipantDto[];
}

export interface CalcErrorDto {
  code: CalcErrorCode;
  message: string;
  details?: unknown;
}

export interface PreviewCandidateDto {
  personId: number;
  name: string;
  archived: boolean;
  defaultWeight: number;
  /** Days present during the bill period, from stays. */
  daysPresent: number;
  /** Whether the person is in the bill before overrides (i.e. daysPresent > 0). */
  autoIncluded: boolean;
  /** Whether the person is in the bill after overrides. */
  participating: boolean;
}

export interface PreviewDto {
  splitMethod: SplitMethod;
  days: number;
  candidates: PreviewCandidateDto[];
  shares: ShareDto[] | null;
  error: CalcErrorDto | null;
}

export interface SummaryTypeDto {
  billTypeId: number;
  name: string;
  billCount: number;
  totalCents: number;
}

export interface SummaryPersonDto {
  personId: number;
  name: string;
  archived: boolean;
  totalCents: number;
  /** Keyed by bill type id. */
  byType: Record<number, number>;
}

export interface SummaryDto {
  from: string | null;
  to: string | null;
  billCount: number;
  totalCents: number;
  types: SummaryTypeDto[];
  people: SummaryPersonDto[];
}

/** One bill on a person's statement, with that person's share of it. */
export interface StatementLineDto {
  billId: number;
  billTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  splitMethod: SplitMethod;
  billAmountCents: number;
  participantCount: number;
  shareCents: number;
  daysCounted: number | null;
  weightUsed: number | null;
  /** Sum of the weights of everyone on the bill (weights bills only). */
  totalWeight: number | null;
  isStale: boolean;
}

export interface StatementDto {
  home: { id: number; name: string; address: string | null };
  person: { id: number; name: string; archived: boolean };
  from: string | null;
  to: string | null;
  lines: StatementLineDto[];
  totalCents: number;
  staleCount: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
