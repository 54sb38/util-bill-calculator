import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type {
  BillCreate,
  BillDetailDto,
  BillDto,
  BillListQuery,
  BillPreview,
  BillUpdate,
  ParticipantDto,
  ParticipantInput,
  PreviewCandidateDto,
  PreviewDto,
  ShareDto,
  SplitMethod,
} from '@bill/shared';
import { daysInclusive } from '../calc/dates';
import {
  CalcError,
  calculateShares,
  daysPresent,
  type CalcOverride,
  type CalcPerson,
  type CalcShare,
} from '../calc/split';
import type { Db, Executor } from '../db/client';
import { billParticipants, bills, billShares, billTypes, people, stays } from '../db/schema';
import { AppError, notFound, validationError } from '../http/errors';
import { getBillTypeInHome } from './billTypes';
import { assertHome } from './homes';
import { definedOnly, isEmpty } from './util';

type BillRow = typeof bills.$inferSelect;
type ShareRow = typeof billShares.$inferSelect;

interface HomePerson extends CalcPerson {
  name: string;
  archived: boolean;
}

// ---------- Loading ----------

/** Everyone in the home (archived included) with their stays: the input the calc engine needs. */
function loadHomePeople(ex: Executor, homeId: number): HomePerson[] {
  const rows = ex
    .select({
      id: people.id,
      name: people.name,
      defaultWeight: people.defaultWeight,
      archivedAt: people.archivedAt,
    })
    .from(people)
    .where(eq(people.homeId, homeId))
    .orderBy(asc(people.id))
    .all();
  const stayRows = ex
    .select({ personId: stays.personId, startDate: stays.startDate, endDate: stays.endDate })
    .from(stays)
    .innerJoin(people, eq(stays.personId, people.id))
    .where(eq(people.homeId, homeId))
    .all();
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    defaultWeight: p.defaultWeight,
    archived: p.archivedAt !== null,
    stays: stayRows.filter((s) => s.personId === p.id),
  }));
}

function groupByBill<T extends { billId: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) map.set(row.billId, [...(map.get(row.billId) ?? []), row]);
  return map;
}

function loadParticipants(ex: Executor, billIds: number[]) {
  if (billIds.length === 0) return new Map<number, (typeof billParticipants.$inferSelect)[]>();
  return groupByBill(
    ex.select().from(billParticipants).where(inArray(billParticipants.billId, billIds)).all(),
  );
}

function loadShares(ex: Executor, billIds: number[]) {
  if (billIds.length === 0) return new Map<number, ShareRow[]>();
  return groupByBill(
    ex
      .select()
      .from(billShares)
      .where(inArray(billShares.billId, billIds))
      .orderBy(asc(billShares.personId))
      .all(),
  );
}

function getBillRow(ex: Executor, billId: number): BillRow {
  const row = ex.select().from(bills).where(eq(bills.id, billId)).get();
  if (!row) throw notFound('Bill');
  return row;
}

const toOverrideMap = (rows: ParticipantInput[]) =>
  new Map<number, CalcOverride>(rows.map((p) => [p.personId, p]));

// ---------- Calculation & staleness ----------

interface BillCalcFields {
  startDate: string;
  endDate: string;
  amountCents: number;
  splitMethod: SplitMethod;
}

const calc = (bill: BillCalcFields, homePeople: HomePerson[], overrides: Map<number, CalcOverride>) =>
  calculateShares({
    startDate: bill.startDate,
    endDate: bill.endDate,
    amountCents: bill.amountCents,
    splitMethod: bill.splitMethod,
    people: homePeople,
    overrides,
  });

const sameShares = (a: CalcShare[], b: CalcShare[]) =>
  a.length === b.length &&
  a.every((s, i) => {
    const t = b[i]!;
    return (
      s.personId === t.personId &&
      s.amountCents === t.amountCents &&
      s.daysCounted === t.daysCounted &&
      s.weightUsed === t.weightUsed
    );
  });

/** A bill is stale when recalculating it with current stays/weights would change its shares. */
function staleness(
  bill: BillRow,
  homePeople: HomePerson[],
  overrides: Map<number, CalcOverride>,
  stored: ShareRow[],
): { isStale: boolean; staleReason: string | null } {
  try {
    return { isStale: !sameShares(calc(bill, homePeople, overrides), stored), staleReason: null };
  } catch (err) {
    if (err instanceof CalcError) return { isStale: true, staleReason: err.message };
    throw err;
  }
}

/** Recomputes the bill's shares from current data and stores them. Throws CalcError on failure. */
function computeAndStore(tx: Executor, billId: number) {
  const bill = getBillRow(tx, billId);
  const overrides = toOverrideMap(loadParticipants(tx, [billId]).get(billId) ?? []);
  const shares = calc(bill, loadHomePeople(tx, bill.homeId), overrides);
  tx.delete(billShares).where(eq(billShares.billId, billId)).run();
  tx.insert(billShares)
    .values(shares.map((s) => ({ billId, ...s })))
    .run();
  tx.update(bills)
    .set({ calculatedAt: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(bills.id, billId))
    .run();
}

// ---------- DTOs ----------

function toShareDtos(shares: CalcShare[], homePeople: HomePerson[]): ShareDto[] {
  const names = new Map(homePeople.map((p) => [p.id, p.name]));
  return shares.map((s) => ({
    personId: s.personId,
    personName: names.get(s.personId) ?? `#${s.personId}`,
    amountCents: s.amountCents,
    daysCounted: s.daysCounted,
    weightUsed: s.weightUsed,
  }));
}

export function toBillDtos(ex: Executor, homeId: number, rows: { bill: BillRow; billTypeName: string }[]) {
  const ids = rows.map((r) => r.bill.id);
  const homePeople = loadHomePeople(ex, homeId);
  const participants = loadParticipants(ex, ids);
  const shares = loadShares(ex, ids);

  return rows.map(({ bill, billTypeName }): BillDetailDto => {
    const billParticipantRows = participants.get(bill.id) ?? [];
    const stored = shares.get(bill.id) ?? [];
    return {
      id: bill.id,
      homeId: bill.homeId,
      billTypeId: bill.billTypeId,
      billTypeName,
      startDate: bill.startDate,
      endDate: bill.endDate,
      days: daysInclusive(bill.startDate, bill.endDate),
      amountCents: bill.amountCents,
      splitMethod: bill.splitMethod,
      notes: bill.notes,
      calculatedAt: bill.calculatedAt,
      shares: toShareDtos(stored, homePeople),
      ...staleness(bill, homePeople, toOverrideMap(billParticipantRows), stored),
      participants: billParticipantRows.map(
        (p): ParticipantDto => ({
          personId: p.personId,
          included: p.included,
          weight: p.weight,
          customAmountCents: p.customAmountCents,
        }),
      ),
    };
  });
}

export const billWithType = (ex: Executor) =>
  ex
    .select({ bill: bills, billTypeName: billTypes.name })
    .from(bills)
    .innerJoin(billTypes, eq(bills.billTypeId, billTypes.id));

// ---------- Validation helpers ----------

/** Every override must refer to a person in the bill's home. */
function assertParticipantsInHome(ex: Executor, homeId: number, participants?: ParticipantInput[]) {
  if (!participants?.length) return;
  const ids = participants.map((p) => p.personId);
  const found = new Set(
    ex
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.homeId, homeId), inArray(people.id, ids)))
      .all()
      .map((r) => r.id),
  );
  const unknown = ids.filter((id) => !found.has(id));
  if (unknown.length > 0) {
    throw new AppError(400, 'INVALID_PERSON', 'Participants must be people in this home.', {
      personIds: unknown,
    });
  }
}

function replaceParticipants(tx: Executor, billId: number, participants: ParticipantInput[]) {
  tx.delete(billParticipants).where(eq(billParticipants.billId, billId)).run();
  if (participants.length === 0) return;
  tx.insert(billParticipants)
    .values(
      participants.map((p) => ({
        billId,
        personId: p.personId,
        included: p.included ?? true,
        weight: p.weight ?? null,
        customAmountCents: p.customAmountCents ?? null,
      })),
    )
    .run();
}

// ---------- Public API ----------

export function listBills(db: Db, homeId: number, query: BillListQuery): BillDto[] {
  assertHome(db, homeId);
  const rows = billWithType(db)
    .where(
      and(
        eq(bills.homeId, homeId),
        query.typeId ? eq(bills.billTypeId, query.typeId) : undefined,
        // Bills overlapping the [from, to] range.
        query.from ? gte(bills.endDate, query.from) : undefined,
        query.to ? lte(bills.startDate, query.to) : undefined,
      ),
    )
    .orderBy(desc(bills.startDate), desc(bills.id))
    .all();
  return toBillDtos(db, homeId, rows).map(({ participants: _, ...bill }) => bill);
}

export function getBill(db: Executor, billId: number): BillDetailDto {
  const row = billWithType(db).where(eq(bills.id, billId)).get();
  if (!row) throw notFound('Bill');
  return toBillDtos(db, row.bill.homeId, [row])[0]!;
}

/** Creates the bill, its participant overrides and its shares atomically. */
export function createBill(db: Db, homeId: number, input: BillCreate): BillDetailDto {
  const billId = db.transaction((tx) => {
    assertHome(tx, homeId);
    const type = getBillTypeInHome(tx, input.billTypeId, homeId);
    assertParticipantsInHome(tx, homeId, input.participants);
    const { id } = tx
      .insert(bills)
      .values({
        homeId,
        billTypeId: type.id,
        startDate: input.startDate,
        endDate: input.endDate,
        amountCents: input.amountCents,
        splitMethod: input.splitMethod ?? type.defaultSplitMethod,
        notes: input.notes ?? null,
      })
      .returning({ id: bills.id })
      .get();
    replaceParticipants(tx, id, input.participants ?? []);
    computeAndStore(tx, id);
    return id;
  });
  return getBill(db, billId);
}

/**
 * Updates the bill and re-snapshots its shares with current data.
 * A `participants` array, when present, replaces all existing overrides.
 */
export function updateBill(db: Db, billId: number, input: BillUpdate): BillDetailDto {
  db.transaction((tx) => {
    const existing = getBillRow(tx, billId);
    const { participants, ...fields } = input;
    const patch = definedOnly(fields);
    const merged = { ...existing, ...patch };
    if (merged.endDate < merged.startDate) {
      throw validationError('endDate', 'End date must be on or after the start date');
    }
    if (patch.billTypeId !== undefined) getBillTypeInHome(tx, patch.billTypeId, existing.homeId);
    assertParticipantsInHome(tx, existing.homeId, participants);

    if (!isEmpty(patch)) tx.update(bills).set(patch).where(eq(bills.id, billId)).run();
    if (participants !== undefined) replaceParticipants(tx, billId, participants);
    computeAndStore(tx, billId);
  });
  return getBill(db, billId);
}

/** Re-snapshots shares with current stays and weights. The bill is unchanged if this fails. */
export function recalculateBill(db: Db, billId: number): BillDetailDto {
  db.transaction((tx) => computeAndStore(tx, billId));
  return getBill(db, billId);
}

export function deleteBill(db: Db, billId: number) {
  getBillRow(db, billId);
  db.delete(bills).where(eq(bills.id, billId)).run();
}

/** Calculates shares for an unsaved bill. Calc errors are returned, not thrown. */
export function previewBill(db: Db, homeId: number, input: BillPreview): PreviewDto {
  assertHome(db, homeId);
  assertParticipantsInHome(db, homeId, input.participants);
  const splitMethod =
    input.splitMethod ??
    (input.billTypeId !== undefined
      ? getBillTypeInHome(db, input.billTypeId, homeId).defaultSplitMethod
      : 'by_days');

  const homePeople = loadHomePeople(db, homeId);
  const overrides = toOverrideMap(input.participants ?? []);
  const bill = { ...input, splitMethod };

  const candidates = homePeople
    .map((p): PreviewCandidateDto => {
      const days = daysPresent(p.stays, input.startDate, input.endDate);
      return {
        personId: p.id,
        name: p.name,
        archived: p.archived,
        defaultWeight: p.defaultWeight,
        daysPresent: days,
        autoIncluded: days > 0,
        participating: overrides.get(p.id)?.included ?? days > 0,
      };
    })
    // Hide archived people unless they are relevant to this bill.
    .filter((c) => !c.archived || c.daysPresent > 0 || overrides.has(c.personId))
    .sort((a, b) => a.name.localeCompare(b.name));

  const base = { splitMethod, days: daysInclusive(input.startDate, input.endDate), candidates };
  try {
    return { ...base, shares: toShareDtos(calc(bill, homePeople, overrides), homePeople), error: null };
  } catch (err) {
    if (!(err instanceof CalcError)) throw err;
    return {
      ...base,
      shares: null,
      error: { code: err.code, message: err.message, details: err.details },
    };
  }
}
