import { and, eq, gte, lte } from 'drizzle-orm';
import type { SummaryDto, SummaryPersonDto, SummaryQuery, SummaryTypeDto } from '@bill/shared';
import type { Db } from '../db/client';
import { bills, billShares, billTypes, people } from '../db/schema';
import { assertHome } from './homes';

/**
 * Per-person and per-type totals from stored shares, for bills that *start* within the range
 * (so each bill is counted in exactly one period).
 */
export function getSummary(db: Db, homeId: number, query: SummaryQuery): SummaryDto {
  assertHome(db, homeId);
  const inRange = and(
    eq(bills.homeId, homeId),
    query.from ? gte(bills.startDate, query.from) : undefined,
    query.to ? lte(bills.startDate, query.to) : undefined,
  );

  const billRows = db
    .select({ amountCents: bills.amountCents, billTypeId: bills.billTypeId, typeName: billTypes.name })
    .from(bills)
    .innerJoin(billTypes, eq(bills.billTypeId, billTypes.id))
    .where(inRange)
    .all();

  const shareRows = db
    .select({
      personId: billShares.personId,
      name: people.name,
      archivedAt: people.archivedAt,
      billTypeId: bills.billTypeId,
      amountCents: billShares.amountCents,
    })
    .from(billShares)
    .innerJoin(bills, eq(billShares.billId, bills.id))
    .innerJoin(people, eq(billShares.personId, people.id))
    .where(inRange)
    .all();

  const types = new Map<number, SummaryTypeDto>();
  for (const b of billRows) {
    const t = types.get(b.billTypeId) ?? {
      billTypeId: b.billTypeId,
      name: b.typeName,
      billCount: 0,
      totalCents: 0,
    };
    t.billCount += 1;
    t.totalCents += b.amountCents;
    types.set(b.billTypeId, t);
  }

  const persons = new Map<number, SummaryPersonDto>();
  for (const s of shareRows) {
    const p = persons.get(s.personId) ?? {
      personId: s.personId,
      name: s.name,
      archived: s.archivedAt !== null,
      totalCents: 0,
      byType: {},
    };
    p.totalCents += s.amountCents;
    p.byType[s.billTypeId] = (p.byType[s.billTypeId] ?? 0) + s.amountCents;
    persons.set(s.personId, p);
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    from: query.from ?? null,
    to: query.to ?? null,
    billCount: billRows.length,
    totalCents: billRows.reduce((sum, b) => sum + b.amountCents, 0),
    types: [...types.values()].sort(byName),
    people: [...persons.values()].sort(byName),
  };
}
