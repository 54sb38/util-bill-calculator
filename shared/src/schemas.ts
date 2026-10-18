import { z } from 'zod';
import { SPLIT_METHODS } from './splitMethods';

/** Calendar date as `YYYY-MM-DD`. All date ranges in the app are inclusive on both ends. */
export const isoDate = z.iso.date({ error: 'Must be a valid date (YYYY-MM-DD)' });

export const splitMethod = z.enum(SPLIT_METHODS);

/** Weights are stored as reals but calculated in milli-units, so 0.001 is the smallest meaningful value. */
export const weight = z.number().min(0.001, 'Weight must be at least 0.001').max(1000);

const name = z.string().trim().min(1, 'Required').max(100);
const optionalText = (max: number) => z.string().trim().max(max).nullish();
const id = z.number().int().positive();
const cents = z.number().int().max(1_000_000_000_00);

const endNotBeforeStart = {
  message: 'End date must be on or after the start date',
  path: ['endDate'],
};

// ---------- Homes ----------

export const homeCreate = z.object({
  name,
  address: optionalText(500),
  notes: optionalText(2000),
});
export const homeUpdate = homeCreate.partial();

// ---------- People ----------

export const personCreate = z.object({
  name,
  defaultWeight: weight.optional(),
});
export const personUpdate = personCreate.partial().extend({
  archived: z.boolean().optional(),
});

export const peopleQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

// ---------- Stays ----------

const stayBase = z.object({
  startDate: isoDate,
  /** `null` means the person still lives there. */
  endDate: isoDate.nullable(),
  note: optionalText(500),
});
export const stayCreate = stayBase.refine(
  (s) => s.endDate === null || s.endDate >= s.startDate,
  endNotBeforeStart,
);
/** Date order for partial updates is checked against the merged row in the service. */
export const stayUpdate = stayBase.partial();

// ---------- Bill types ----------

export const billTypeCreate = z.object({
  name,
  defaultSplitMethod: splitMethod.optional(),
});
export const billTypeUpdate = billTypeCreate.partial();

// ---------- Bills ----------

export const participantInput = z.object({
  personId: id,
  /** `false` excludes someone whose stays overlap the bill; `true` forces someone in. */
  included: z.boolean().optional(),
  weight: weight.nullish(),
  customAmountCents: cents.min(0).nullish(),
});

const uniquePeople = (ps: { personId: number }[] | undefined) =>
  !ps || new Set(ps.map((p) => p.personId)).size === ps.length;

const billBase = z.object({
  billTypeId: id,
  startDate: isoDate,
  endDate: isoDate,
  amountCents: cents.min(1, 'Amount must be greater than 0'),
  splitMethod: splitMethod.optional(),
  notes: optionalText(2000),
  participants: z
    .array(participantInput)
    .refine(uniquePeople, 'Each person may appear only once')
    .optional(),
});

export const billCreate = billBase.refine((b) => b.endDate >= b.startDate, endNotBeforeStart);
/** Date order for partial updates is checked against the merged row in the service. */
export const billUpdate = billBase.partial();
/** Same as create, but the bill type is optional so the form can preview before one is chosen. */
export const billPreview = billBase
  .partial({ billTypeId: true })
  .refine((b) => b.endDate >= b.startDate, endNotBeforeStart);

export const billListQuery = z.object({
  typeId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const summaryQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type HomeCreate = z.infer<typeof homeCreate>;
export type HomeUpdate = z.infer<typeof homeUpdate>;
export type PersonCreate = z.infer<typeof personCreate>;
export type PersonUpdate = z.infer<typeof personUpdate>;
export type StayCreate = z.infer<typeof stayCreate>;
export type StayUpdate = z.infer<typeof stayUpdate>;
export type BillTypeCreate = z.infer<typeof billTypeCreate>;
export type BillTypeUpdate = z.infer<typeof billTypeUpdate>;
export type ParticipantInput = z.infer<typeof participantInput>;
export type BillCreate = z.infer<typeof billCreate>;
export type BillUpdate = z.infer<typeof billUpdate>;
export type BillPreview = z.infer<typeof billPreview>;
export type BillListQuery = z.infer<typeof billListQuery>;
export type SummaryQuery = z.infer<typeof summaryQuery>;
