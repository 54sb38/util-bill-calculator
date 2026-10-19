import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { StatementDto, StatementLineDto, SummaryQuery } from '@bill/shared';
import type { Db } from '../db/client';
import { bills, billShares } from '../db/schema';
import { billWithType, toBillDtos } from './bills';
import { getHome } from './homes';
import { getPersonRow } from './people';

/**
 * One person's stored shares, for bills that *start* within the range — the same rule as the
 * summary, so a statement's total always matches that person's summary total.
 */
export function getStatement(db: Db, personId: number, query: SummaryQuery): StatementDto {
  const person = getPersonRow(db, personId);
  const home = getHome(db, person.homeId);

  const rows = billWithType(db)
    .innerJoin(billShares, and(eq(billShares.billId, bills.id), eq(billShares.personId, personId)))
    .where(
      and(
        eq(bills.homeId, home.id),
        query.from ? gte(bills.startDate, query.from) : undefined,
        query.to ? lte(bills.startDate, query.to) : undefined,
      ),
    )
    .orderBy(asc(bills.startDate), asc(bills.id))
    .all();

  const lines = toBillDtos(db, home.id, rows).map((bill): StatementLineDto => {
    const share = bill.shares.find((s) => s.personId === personId)!;
    return {
      billId: bill.id,
      billTypeName: bill.billTypeName,
      startDate: bill.startDate,
      endDate: bill.endDate,
      days: bill.days,
      splitMethod: bill.splitMethod,
      billAmountCents: bill.amountCents,
      participantCount: bill.shares.length,
      shareCents: share.amountCents,
      daysCounted: share.daysCounted,
      weightUsed: share.weightUsed,
      totalWeight:
        bill.splitMethod === 'weights' ? bill.shares.reduce((sum, s) => sum + (s.weightUsed ?? 0), 0) : null,
      isStale: bill.isStale,
    };
  });

  return {
    home: { id: home.id, name: home.name, address: home.address },
    person: { id: person.id, name: person.name, archived: person.archivedAt !== null },
    from: query.from ?? null,
    to: query.to ?? null,
    lines,
    totalCents: lines.reduce((sum, l) => sum + l.shareCents, 0),
    staleCount: lines.filter((l) => l.isStale).length,
  };
}
