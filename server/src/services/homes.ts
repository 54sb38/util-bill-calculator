import { asc, eq, sql } from 'drizzle-orm';
import type { HomeCreate, HomeDto, HomeUpdate } from '@bill/shared';
import type { Db, Executor } from '../db/client';
import { bills, homes, people } from '../db/schema';
import { notFound } from '../http/errors';
import { definedOnly, isEmpty } from './util';

const homeColumns = {
  id: homes.id,
  name: homes.name,
  address: homes.address,
  notes: homes.notes,
  createdAt: homes.createdAt,
  updatedAt: homes.updatedAt,
  // Column names are written out qualified: drizzle renders columns unqualified in single-table
  // selects, which would make "id" resolve to the subquery's own table.
  peopleCount: sql<number>`(SELECT count(*) FROM ${people} p
    WHERE p.home_id = ${homes}.id AND p.archived_at IS NULL)`.mapWith(Number),
  billCount: sql<number>`(SELECT count(*) FROM ${bills} b WHERE b.home_id = ${homes}.id)`.mapWith(
    Number,
  ),
};

export function assertHome(ex: Executor, homeId: number) {
  const row = ex.select({ id: homes.id }).from(homes).where(eq(homes.id, homeId)).get();
  if (!row) throw notFound('Home');
}

export function listHomes(db: Db): HomeDto[] {
  return db.select(homeColumns).from(homes).orderBy(asc(homes.name), asc(homes.id)).all();
}

export function getHome(db: Executor, homeId: number): HomeDto {
  const row = db.select(homeColumns).from(homes).where(eq(homes.id, homeId)).get();
  if (!row) throw notFound('Home');
  return row;
}

export function createHome(db: Db, input: HomeCreate): HomeDto {
  const { id } = db.insert(homes).values(definedOnly(input) as HomeCreate).returning({ id: homes.id }).get();
  return getHome(db, id);
}

export function updateHome(db: Db, homeId: number, input: HomeUpdate): HomeDto {
  assertHome(db, homeId);
  const patch = definedOnly(input);
  if (!isEmpty(patch)) db.update(homes).set(patch).where(eq(homes.id, homeId)).run();
  return getHome(db, homeId);
}

/** Deletes the home and, by cascade, all of its people, stays, bill types and bills. */
export function deleteHome(db: Db, homeId: number) {
  assertHome(db, homeId);
  db.delete(homes).where(eq(homes.id, homeId)).run();
}
