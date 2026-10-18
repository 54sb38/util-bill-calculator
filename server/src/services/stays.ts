import { and, eq, ne } from 'drizzle-orm';
import type { StayCreate, StayDto, StayUpdate } from '@bill/shared';
import { rangesOverlap } from '../calc/dates';
import type { Db, Executor } from '../db/client';
import { stays } from '../db/schema';
import { AppError, notFound, validationError } from '../http/errors';
import { getPersonRow, toStayDto } from './people';
import { definedOnly, isEmpty } from './util';

/** A person's stays must not overlap (which also means at most one open-ended stay). */
function assertNoOverlap(
  ex: Executor,
  personId: number,
  startDate: string,
  endDate: string | null,
  excludeStayId?: number,
) {
  const others = ex
    .select()
    .from(stays)
    .where(
      and(
        eq(stays.personId, personId),
        excludeStayId === undefined ? undefined : ne(stays.id, excludeStayId),
      ),
    )
    .all();
  const clash = others.find((o) => rangesOverlap(o.startDate, o.endDate, startDate, endDate));
  if (clash) {
    throw new AppError(
      409,
      'STAY_OVERLAP',
      `This overlaps another stay (${clash.startDate} – ${clash.endDate ?? 'ongoing'}).`,
      { stayId: clash.id },
    );
  }
}

function getStayRow(ex: Executor, stayId: number) {
  const row = ex.select().from(stays).where(eq(stays.id, stayId)).get();
  if (!row) throw notFound('Stay');
  return row;
}

export function createStay(db: Db, personId: number, input: StayCreate): StayDto {
  return db.transaction((tx) => {
    getPersonRow(tx, personId);
    assertNoOverlap(tx, personId, input.startDate, input.endDate);
    const row = tx
      .insert(stays)
      .values({ personId, startDate: input.startDate, endDate: input.endDate, note: input.note })
      .returning()
      .get();
    return toStayDto(row);
  });
}

export function updateStay(db: Db, stayId: number, input: StayUpdate): StayDto {
  return db.transaction((tx) => {
    const existing = getStayRow(tx, stayId);
    const patch = definedOnly(input);
    const merged = { ...existing, ...patch };
    if (merged.endDate !== null && merged.endDate < merged.startDate) {
      throw validationError('endDate', 'End date must be on or after the start date');
    }
    assertNoOverlap(tx, existing.personId, merged.startDate, merged.endDate, stayId);
    if (!isEmpty(patch)) tx.update(stays).set(patch).where(eq(stays.id, stayId)).run();
    return toStayDto(getStayRow(tx, stayId));
  });
}

export function deleteStay(db: Db, stayId: number) {
  getStayRow(db, stayId);
  db.delete(stays).where(eq(stays.id, stayId)).run();
}
