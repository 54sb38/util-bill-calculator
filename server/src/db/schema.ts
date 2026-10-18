import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { SPLIT_METHODS } from '@bill/shared';

/*
 * Conventions
 * - Money is integer cents (`*_cents`).
 * - Dates are TEXT `YYYY-MM-DD`; every start/end range is inclusive on both ends.
 * - Foreign keys that reference people / bill types use NO ACTION (the default) rather than
 *   RESTRICT: SQLite checks NO ACTION at the end of the statement, so deleting a home can
 *   cascade through everything, while deleting a referenced person or bill type directly fails.
 * - `PRAGMA foreign_keys = ON` must be set on every connection (see client.ts).
 * - CHECK constraints use bare column names: drizzle-kit would otherwise qualify them with the
 *   table name, which breaks when a later migration rebuilds the table under a temporary name.
 */

const timestamps = () => ({
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`)
    .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});

const splitMethodList = sql.raw(SPLIT_METHODS.map((m) => `'${m}'`).join(', '));

export const homes = sqliteTable('homes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  address: text('address'),
  notes: text('notes'),
  ...timestamps(),
});

export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    homeId: integer('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    defaultWeight: real('default_weight').notNull().default(1),
    /** Former housemates: hidden from lists but kept for bill history. */
    archivedAt: text('archived_at'),
    ...timestamps(),
  },
  (t) => [
    // Also serves as the index on home_id.
    uniqueIndex('people_home_name_uq').on(t.homeId, t.name),
    check('people_default_weight_ck', sql`default_weight > 0`),
  ],
);

/**
 * Occupancy periods. A holiday is represented as a gap between two stays.
 * Non-overlap per person is enforced in the service layer (SQLite has no exclusion constraints).
 */
export const stays = sqliteTable(
  'stays',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    startDate: text('start_date').notNull(),
    /** NULL = still living there. */
    endDate: text('end_date'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    index('stays_person_start_idx').on(t.personId, t.startDate),
    check('stays_dates_ck', sql`end_date IS NULL OR end_date >= start_date`),
  ],
);

export const billTypes = sqliteTable(
  'bill_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    homeId: integer('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    defaultSplitMethod: text('default_split_method', { enum: SPLIT_METHODS })
      .notNull()
      .default('by_days'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('bill_types_home_name_uq').on(t.homeId, t.name),
    // Target for the composite FK from bills, guaranteeing a bill's type is from the same home.
    unique('bill_types_id_home_uq').on(t.id, t.homeId),
    check('bill_types_split_method_ck', sql`default_split_method IN (${splitMethodList})`),
  ],
);

export const bills = sqliteTable(
  'bills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    homeId: integer('home_id')
      .notNull()
      .references(() => homes.id, { onDelete: 'cascade' }),
    billTypeId: integer('bill_type_id').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** Copied from the bill type's default at creation; editable per bill. */
    splitMethod: text('split_method', { enum: SPLIT_METHODS }).notNull(),
    notes: text('notes'),
    /** When bill_shares was last written. */
    calculatedAt: text('calculated_at'),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'bills_bill_type_home_fk',
      columns: [t.billTypeId, t.homeId],
      foreignColumns: [billTypes.id, billTypes.homeId],
    }),
    index('bills_home_start_idx').on(t.homeId, t.startDate),
    index('bills_bill_type_idx').on(t.billTypeId),
    check('bills_dates_ck', sql`end_date >= start_date`),
    check('bills_amount_ck', sql`amount_cents > 0`),
    check('bills_split_method_ck', sql`split_method IN (${splitMethodList})`),
  ],
);

/** Per-bill inputs/overrides. A row exists only when a person needs one. */
export const billParticipants = sqliteTable(
  'bill_participants',
  {
    billId: integer('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id),
    /** false = exclude despite overlapping stays; true = force in. */
    included: integer('included', { mode: 'boolean' }).notNull().default(true),
    /** Overrides people.default_weight for the `weights` method. */
    weight: real('weight'),
    /** Required for every participant when the method is `custom`. */
    customAmountCents: integer('custom_amount_cents'),
  },
  (t) => [
    primaryKey({ columns: [t.billId, t.personId] }),
    check('bill_participants_weight_ck', sql`weight IS NULL OR weight > 0`),
    check(
      'bill_participants_custom_ck',
      sql`custom_amount_cents IS NULL OR custom_amount_cents >= 0`,
    ),
  ],
);

/** Calculated snapshot. Invariant: SUM(amount_cents) = bills.amount_cents. */
export const billShares = sqliteTable(
  'bill_shares',
  {
    billId: integer('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id),
    amountCents: integer('amount_cents').notNull(),
    /** Filled for `by_days`. */
    daysCounted: integer('days_counted'),
    /** Filled for `weights`. */
    weightUsed: real('weight_used'),
  },
  (t) => [
    primaryKey({ columns: [t.billId, t.personId] }),
    index('bill_shares_person_idx').on(t.personId),
    check('bill_shares_amount_ck', sql`amount_cents >= 0`),
  ],
);
