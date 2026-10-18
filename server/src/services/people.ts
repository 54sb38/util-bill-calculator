import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { PersonCreate, PersonDto, PersonUpdate, StayDto } from '@bill/shared';
import type { Db, Executor } from '../db/client';
import { people, stays } from '../db/schema';
import { AppError, isConstraintError, notFound } from '../http/errors';
import { assertHome } from './homes';
import { definedOnly, isEmpty } from './util';

type PersonRow = typeof people.$inferSelect;
type StayRow = typeof stays.$inferSelect;

export const toStayDto = (s: StayRow): StayDto => ({
  id: s.id,
  personId: s.personId,
  startDate: s.startDate,
  endDate: s.endDate,
  note: s.note,
});

function withStays(ex: Executor, rows: PersonRow[]): PersonDto[] {
  const ids = rows.map((p) => p.id);
  const stayRows = ids.length
    ? ex.select().from(stays).where(inArray(stays.personId, ids)).orderBy(asc(stays.startDate)).all()
    : [];
  return rows.map((p) => ({
    id: p.id,
    homeId: p.homeId,
    name: p.name,
    defaultWeight: p.defaultWeight,
    archivedAt: p.archivedAt,
    stays: stayRows.filter((s) => s.personId === p.id).map(toStayDto),
  }));
}

export function getPersonRow(ex: Executor, personId: number): PersonRow {
  const row = ex.select().from(people).where(eq(people.id, personId)).get();
  if (!row) throw notFound('Person');
  return row;
}

export function listPeople(db: Db, homeId: number, includeArchived = false): PersonDto[] {
  assertHome(db, homeId);
  const rows = db
    .select()
    .from(people)
    .where(and(eq(people.homeId, homeId), includeArchived ? undefined : isNull(people.archivedAt)))
    .orderBy(asc(people.name))
    .all();
  return withStays(db, rows);
}

export function getPerson(db: Executor, personId: number): PersonDto {
  return withStays(db, [getPersonRow(db, personId)])[0]!;
}

export function createPerson(db: Db, homeId: number, input: PersonCreate): PersonDto {
  assertHome(db, homeId);
  const { id } = db
    .insert(people)
    .values({ homeId, name: input.name, defaultWeight: input.defaultWeight })
    .returning({ id: people.id })
    .get();
  return getPerson(db, id);
}

export function updatePerson(db: Db, personId: number, input: PersonUpdate): PersonDto {
  const existing = getPersonRow(db, personId);
  const { archived, ...fields } = input;
  const patch: Partial<PersonRow> = definedOnly(fields);
  if (archived !== undefined) {
    patch.archivedAt = archived ? (existing.archivedAt ?? new Date().toISOString()) : null;
  }
  if (!isEmpty(patch)) db.update(people).set(patch).where(eq(people.id, personId)).run();
  return getPerson(db, personId);
}

/** Hard delete; only allowed when the person has no bill history. Their stays are removed too. */
export function deletePerson(db: Db, personId: number) {
  const person = getPersonRow(db, personId);
  try {
    db.delete(people).where(eq(people.id, personId)).run();
  } catch (err) {
    if (isConstraintError(err, 'FOREIGNKEY')) {
      throw new AppError(
        409,
        'IN_USE',
        `${person.name} has bill history and can't be deleted. Archive them instead.`,
      );
    }
    throw err;
  }
}
