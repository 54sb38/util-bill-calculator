import { zodResolver } from '@hookform/resolvers/zod';
import {
  isoDate,
  splitMethod,
  SPLIT_METHOD_LABELS,
  SPLIT_METHODS,
  type BillCreate,
  type BillDetailDto,
  type BillTypeDto,
  type HomeDto,
  type ParticipantInput,
  type PreviewCandidateDto,
  type SplitMethod,
} from '@bill/shared';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { useBill, useBillPreview, useBillTypes, useCreateBill, useUpdateBill } from '../api/hooks';
import { Badge, Button, Card, cx, EmptyState, ErrorMessage, Field, Input, Loading, Select, Textarea } from '../components/ui';
import { addDays, isIsoDate, todayIso } from '../lib/dates';
import { centsToInput, formatMoney, parseMoney } from '../lib/money';
import { useHomeContext, useIdParam } from './HomeLayout';

export function BillFormPage() {
  const { home } = useHomeContext();
  const billId = useIdParam('billId');
  const bill = useBill(billId);
  const types = useBillTypes(home.id);

  if (types.isPending || (billId !== undefined && bill.isPending)) return <Loading />;
  if (types.isError) return <ErrorMessage error={types.error} />;
  if (bill.isError) return <ErrorMessage error={bill.error} />;
  if (types.data.length === 0) {
    return (
      <EmptyState title="Add a bill type first">
        <Link to={`/homes/${home.id}/bill-types`} className="text-emerald-700 underline">
          Go to bill types
        </Link>
      </EmptyState>
    );
  }
  return <BillForm key={billId ?? 'new'} home={home} types={types.data} bill={bill.data} />;
}

// ---------- Form model ----------

const formSchema = z
  .object({
    billTypeId: z.string().min(1, 'Choose a bill type'),
    startDate: isoDate,
    endDate: isoDate,
    amount: z.string().refine((s) => (parseMoney(s) ?? 0) > 0, 'Enter an amount greater than 0'),
    splitMethod,
    notes: z.string().max(2000),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof formSchema>;

/** Per-person overrides as typed in the participants table (strings until parsed). */
interface Override {
  included?: boolean;
  weight?: string;
  custom?: string;
}

const parseWeight = (s: string) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n >= 0.001 && n <= 1000 ? n : null;
};

/** Converts table overrides into the API payload, keeping only what the chosen method uses. */
function toParticipants(overrides: Record<number, Override>, method: SplitMethod): ParticipantInput[] {
  return Object.entries(overrides).flatMap(([id, o]) => {
    const p: ParticipantInput = { personId: Number(id) };
    if (o.included !== undefined) p.included = o.included;
    if (method === 'weights' && o.weight?.trim()) p.weight = parseWeight(o.weight) ?? undefined;
    if (method === 'custom' && o.custom?.trim()) p.customAmountCents = parseMoney(o.custom) ?? undefined;
    return p.included !== undefined || p.weight !== undefined || p.customAmountCents !== undefined ? [p] : [];
  });
}

function fromBill(bill: BillDetailDto): Record<number, Override> {
  return Object.fromEntries(
    bill.participants.map((p) => [
      p.personId,
      {
        included: p.included,
        weight: p.weight?.toString() ?? '',
        custom: p.customAmountCents !== null ? centsToInput(p.customAmountCents) : '',
      },
    ]),
  );
}

/** Previous calendar month: bills are usually entered after the period ends. */
function lastMonth() {
  const firstOfThisMonth = `${todayIso().slice(0, 8)}01`;
  const end = addDays(firstOfThisMonth, -1);
  return { startDate: `${end.slice(0, 8)}01`, endDate: end };
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
    // Keyed on content rather than identity, so re-renders don't restart the timer.
  }, [key, ms]);
  return debounced;
}

// ---------- Form ----------

function BillForm({ home, types, bill }: { home: HomeDto; types: BillTypeDto[]; bill?: BillDetailDto }) {
  const navigate = useNavigate();
  const create = useCreateBill(home.id);
  const update = useUpdateBill();
  const save = bill ? update : create;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: bill
      ? {
          billTypeId: String(bill.billTypeId),
          startDate: bill.startDate,
          endDate: bill.endDate,
          amount: centsToInput(bill.amountCents),
          splitMethod: bill.splitMethod,
          notes: bill.notes ?? '',
        }
      : {
          billTypeId: String(types[0]!.id),
          ...lastMonth(),
          amount: '',
          splitMethod: types[0]!.defaultSplitMethod,
          notes: '',
        },
  });
  const { errors } = form.formState;
  const values = useWatch({ control: form.control });
  const [overrides, setOverrides] = useState<Record<number, Override>>(() => (bill ? fromBill(bill) : {}));
  // Once the method is chosen by hand (or when editing), changing the type no longer resets it.
  const methodChosen = useRef(!!bill);

  const method = values.splitMethod ?? 'by_days';
  const amountCents = parseMoney(values.amount ?? '');
  const participants = useMemo(() => toParticipants(overrides, method), [overrides, method]);

  // ----- Live preview -----
  const previewBody = useMemo(() => {
    const { startDate, endDate } = values;
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate || !amountCents) return null;
    return {
      billTypeId: values.billTypeId ? Number(values.billTypeId) : undefined,
      startDate,
      endDate,
      amountCents,
      splitMethod: method,
      participants,
    };
  }, [values, amountCents, method, participants]);
  const debouncedBody = useDebounced(previewBody, 300);
  const preview = useBillPreview(home.id, debouncedBody);
  const previewIsCurrent =
    !!previewBody && JSON.stringify(previewBody) === JSON.stringify(debouncedBody) && !preview.isFetching;
  const previewError = previewIsCurrent ? preview.data?.error : null;

  const setOverride = (personId: number, patch: Partial<Override>) =>
    setOverrides((prev) => ({ ...prev, [personId]: { ...prev[personId], ...patch } }));

  const isParticipating = (c: PreviewCandidateDto) => overrides[c.personId]?.included ?? c.autoIncluded;

  const candidates = previewBody ? (preview.data?.candidates ?? []) : [];
  // While a new preview loads, the previous shares stay visible.
  const shareFor = (personId: number) => preview.data?.shares?.find((s) => s.personId === personId);

  // ----- Inline validation of table inputs -----
  const invalidInputs = candidates.filter((c) => {
    if (!isParticipating(c)) return false;
    const o = overrides[c.personId];
    if (method === 'weights' && o?.weight?.trim()) return parseWeight(o.weight) === null;
    if (method === 'custom' && o?.custom?.trim()) return parseMoney(o.custom) === null;
    return false;
  });
  const customTotal =
    method === 'custom'
      ? candidates
          .filter(isParticipating)
          .reduce((sum, c) => sum + (parseMoney(overrides[c.personId]?.custom ?? '') ?? 0), 0)
      : 0;

  const onSubmit = form.handleSubmit((v) => {
    if (invalidInputs.length > 0) return;
    const body: BillCreate = {
      billTypeId: Number(v.billTypeId),
      startDate: v.startDate,
      endDate: v.endDate,
      amountCents: parseMoney(v.amount)!,
      splitMethod: v.splitMethod,
      notes: v.notes.trim() || null,
      participants,
    };
    const onSuccess = (saved: BillDetailDto) => navigate(`/homes/${home.id}/bills/${saved.id}`);
    if (bill) update.mutate({ id: bill.id, ...body }, { onSuccess });
    else create.mutate(body, { onSuccess });
  });

  const typeField = form.register('billTypeId', {
    onChange: (e: ChangeEvent<HTMLSelectElement>) => {
      const type = types.find((t) => String(t.id) === e.target.value);
      if (type && !methodChosen.current) form.setValue('splitMethod', type.defaultSplitMethod);
    },
  });
  const methodField = form.register('splitMethod', {
    onChange: () => {
      methodChosen.current = true;
    },
  });

  const backTo = bill ? `/homes/${home.id}/bills/${bill.id}` : `/homes/${home.id}`;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Link to={backTo} className="text-sm text-slate-500 hover:text-slate-700">
        ← {bill ? 'Back to bill' : 'Bills'}
      </Link>
      <h2 className="text-xl font-semibold text-slate-900">{bill ? 'Edit bill' : 'New bill'}</h2>

      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Bill type" error={errors.billTypeId?.message}>
          <Select {...typeField}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" error={errors.startDate?.message}>
          <Input type="date" {...form.register('startDate')} aria-invalid={!!errors.startDate} />
        </Field>
        <Field label="To (inclusive)" error={errors.endDate?.message}>
          <Input type="date" {...form.register('endDate')} aria-invalid={!!errors.endDate} />
        </Field>
        <Field label="Amount ($)" error={errors.amount?.message}>
          <Input inputMode="decimal" placeholder="0.00" {...form.register('amount')} aria-invalid={!!errors.amount} />
        </Field>
        <Field label="Split method" hint={methodHint[method]}>
          <Select {...methodField}>
            {SPLIT_METHODS.map((m) => (
              <option key={m} value={m}>
                {SPLIT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes (optional)" className="sm:col-span-2 lg:col-span-1">
          <Textarea {...form.register('notes')} rows={1} />
        </Field>
      </Card>

      <Card className="overflow-x-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h3 className="font-medium text-slate-900">Who pays what</h3>
          {preview.data && previewBody && (
            <span className="text-xs text-slate-500">
              {preview.data.days} day period{preview.isFetching && ' · updating…'}
            </span>
          )}
        </div>
        {!previewBody ? (
          <p className="px-4 py-6 text-sm text-slate-500">Enter the dates and amount to see each person’s share.</p>
        ) : candidates.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">{preview.isPending ? 'Calculating…' : 'No people in this home.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-10 px-4 py-2" />
                <th className="px-2 py-2 font-medium">Person</th>
                <th className="px-2 py-2 text-right font-medium">Days present</th>
                {method === 'weights' && <th className="px-2 py-2 text-right font-medium">Weight</th>}
                {method === 'custom' && <th className="px-2 py-2 text-right font-medium">Amount</th>}
                <th className="px-4 py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c) => {
                const participating = isParticipating(c);
                const o = overrides[c.personId];
                const share = shareFor(c.personId);
                const invalid = invalidInputs.includes(c);
                return (
                  <tr key={c.personId} className={participating ? '' : 'text-slate-400'}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Include ${c.name}`}
                        className="size-4 accent-emerald-600"
                        checked={participating}
                        onChange={(e) =>
                          setOverride(c.personId, {
                            // Only store an override when it differs from what stays imply.
                            included: e.target.checked === c.autoIncluded ? undefined : e.target.checked,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className={cx('font-medium', participating && 'text-slate-800')}>{c.name}</span>{' '}
                      {c.archived && <Badge>archived</Badge>}{' '}
                      {o?.included === true && !c.autoIncluded && <Badge tone="sky">added</Badge>}
                      {o?.included === false && c.autoIncluded && <Badge tone="amber">excluded</Badge>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {c.daysPresent} / {preview.data?.days}
                    </td>
                    {method === 'weights' && (
                      <td className="px-2 py-2 text-right">
                        <Input
                          inputMode="decimal"
                          aria-label={`Weight for ${c.name}`}
                          aria-invalid={invalid}
                          className="ml-auto w-20 text-right"
                          placeholder={String(c.defaultWeight)}
                          disabled={!participating}
                          value={o?.weight ?? ''}
                          onChange={(e) => setOverride(c.personId, { weight: e.target.value })}
                        />
                      </td>
                    )}
                    {method === 'custom' && (
                      <td className="px-2 py-2 text-right">
                        <Input
                          inputMode="decimal"
                          aria-label={`Amount for ${c.name}`}
                          aria-invalid={invalid}
                          className="ml-auto w-28 text-right"
                          placeholder="0.00"
                          disabled={!participating}
                          value={o?.custom ?? ''}
                          onChange={(e) => setOverride(c.personId, { custom: e.target.value })}
                        />
                      </td>
                    )}
                    <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums">
                      {participating && share ? formatMoney(share.amountCents) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {method === 'custom' && previewBody && amountCents && (
          <CustomTotal allocated={customTotal} total={amountCents} />
        )}
        {invalidInputs.length > 0 && (
          <p className="px-4 pb-3 text-sm text-red-600">
            {method === 'weights' ? 'Weights must be numbers of at least 0.001.' : 'Enter amounts like 12.34.'}
          </p>
        )}
        {previewError && (
          <div className="px-4 pb-4">
            <ErrorMessage error={previewError} />
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={save.isPending || !!previewError || invalidInputs.length > 0}
        >
          {bill ? 'Save changes' : 'Save bill'}
        </Button>
        <Link to={backTo} className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
        {bill && (
          <span className="text-xs text-slate-500">Saving recalculates shares with the current stays.</span>
        )}
      </div>
      <ErrorMessage error={save.error} />
    </form>
  );
}

const methodHint: Record<SplitMethod, string> = {
  by_days: 'Proportional to the days each person was present',
  equal: 'Split evenly among participants',
  weights: 'Proportional to each person’s weight',
  custom: 'Enter each person’s amount',
};

function CustomTotal({ allocated, total }: { allocated: number; total: number }) {
  const remaining = total - allocated;
  return (
    <p
      className={cx(
        'border-t border-slate-100 px-4 py-3 text-right text-sm',
        remaining === 0 ? 'text-emerald-700' : 'text-amber-700',
      )}
    >
      Allocated {formatMoney(allocated)} of {formatMoney(total)} ·{' '}
      {remaining === 0
        ? 'fully allocated ✓'
        : remaining > 0
          ? `${formatMoney(remaining)} remaining`
          : `${formatMoney(-remaining)} over`}
    </p>
  );
}
