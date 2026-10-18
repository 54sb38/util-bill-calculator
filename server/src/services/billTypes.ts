import { and, asc, eq, sql } from 'drizzle-orm';
import type { BillTypeCreate, BillTypeDto, BillTypeUpdate } from '@bill/shared';
import type { Db, Executor } from '../db/client';
import { bills, billTypes } from '../db/schema';
import { AppError, isConstraintError, notFound } from '../http/errors';
import { assertHome } from './homes';
import { definedOnly, isEmpty } from './util';

const billTypeColumns = {
  id: billTypes.id,
  homeId: billTypes.homeId,
  name: billTypes.name,
  defaultSplitMethod: billTypes.defaultSplitMethod,
  // Qualified explicitly; see the note in homes.ts.
  billCount: sql<number>`(SELECT count(*) FROM ${bills} b
    WHERE b.bill_type_id = ${billTypes}.id)`.mapWith(Number),
};

export function getBillType(ex: Executor, id: number): BillTypeDto {
  const row = ex.select(billTypeColumns).from(billTypes).where(eq(billTypes.id, id)).get();
  if (!row) throw notFound('Bill type');
  return row;
}

/** Looks up a bill type that must belong to the given home (400 otherwise). */
export function getBillTypeInHome(ex: Executor, id: number, homeId: number) {
  const row = ex
    .select()
    .from(billTypes)
    .where(and(eq(billTypes.id, id), eq(billTypes.homeId, homeId)))
    .get();
  if (!row) {
    throw new AppError(400, 'INVALID_BILL_TYPE', 'Choose a bill type from this home.', [
      { path: 'billTypeId', message: 'Unknown bill type for this home' },
    ]);
  }
  return row;
}

export function listBillTypes(db: Db, homeId: number): BillTypeDto[] {
  assertHome(db, homeId);
  return db
    .select(billTypeColumns)
    .from(billTypes)
    .where(eq(billTypes.homeId, homeId))
    .orderBy(asc(billTypes.name))
    .all();
}

export function createBillType(db: Db, homeId: number, input: BillTypeCreate): BillTypeDto {
  assertHome(db, homeId);
  const { id } = db
    .insert(billTypes)
    .values({ homeId, name: input.name, defaultSplitMethod: input.defaultSplitMethod })
    .returning({ id: billTypes.id })
    .get();
  return getBillType(db, id);
}

export function updateBillType(db: Db, id: number, input: BillTypeUpdate): BillTypeDto {
  getBillType(db, id);
  const patch = definedOnly(input);
  if (!isEmpty(patch)) db.update(billTypes).set(patch).where(eq(billTypes.id, id)).run();
  return getBillType(db, id);
}

export function deleteBillType(db: Db, id: number) {
  const type = getBillType(db, id);
  try {
    db.delete(billTypes).where(eq(billTypes.id, id)).run();
  } catch (err) {
    if (isConstraintError(err, 'FOREIGNKEY')) {
      throw new AppError(
        409,
        'IN_USE',
        `"${type.name}" is used by ${type.billCount} bill(s). Delete or re-type those bills first.`,
      );
    }
    throw err;
  }
}
