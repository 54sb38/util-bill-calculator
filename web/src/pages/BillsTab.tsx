import { SPLIT_METHOD_LABELS } from '@bill/shared';
import { Link, useSearchParams } from 'react-router';
import { useBills, useBillTypes, usePeople, type BillFilters } from '../api/hooks';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  LinkButton,
  Loading,
  SectionHeader,
  Select,
} from '../components/ui';
import { formatRange } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { useHomeContext } from './HomeLayout';

export function BillsTab() {
  const { home } = useHomeContext();
  const [params, setParams] = useSearchParams();
  const filters: BillFilters = {
    typeId: params.get('typeId') ? Number(params.get('typeId')) : undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
  };
  const types = useBillTypes(home.id);
  const people = usePeople(home.id);
  const bills = useBills(home.id, filters);

  const setFilter = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const hasFilters = params.size > 0;
  const noTypes = types.data?.length === 0;
  const noPeople = people.data?.length === 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Bills"
        actions={
          noTypes ? (
            <Button variant="primary" disabled title="Add a bill type first">
              + New bill
            </Button>
          ) : (
            <LinkButton to="bills/new" variant="primary">
              + New bill
            </LinkButton>
          )
        }
      />

      {(noTypes || noPeople) && (
        <Card className="space-y-1 bg-sky-50 p-4 text-sm text-sky-900 ring-sky-200">
          <p className="font-medium">Getting started</p>
          {noPeople && (
            <p>
              1. <Link to="people" className="underline">Add the people</Link> who live here and when they stay.
            </p>
          )}
          {noTypes && (
            <p>
              {noPeople ? '2.' : '1.'} <Link to="bill-types" className="underline">Add bill types</Link> such as
              Electricity or Internet.
            </p>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Type">
          <Select value={filters.typeId ?? ''} onChange={(e) => setFilter('typeId', e.target.value)} className="w-44">
            <option value="">All types</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={filters.from ?? ''} onChange={(e) => setFilter('from', e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={filters.to ?? ''} onChange={(e) => setFilter('to', e.target.value)} />
        </Field>
        {hasFilters && (
          <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </Button>
        )}
      </div>

      {bills.isPending ? (
        <Loading />
      ) : bills.isError ? (
        <ErrorMessage error={bills.error} />
      ) : bills.data.length === 0 ? (
        <EmptyState title={hasFilters ? 'No bills match these filters' : 'No bills yet'} />
      ) : (
        <>
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {bills.data.map((b) => (
              <Link key={b.id} to={`bills/${b.id}`} className="block p-3 hover:bg-slate-50">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium text-slate-900">{b.billTypeName}</span>
                  <span className="text-sm text-slate-500">
                    {formatRange(b.startDate, b.endDate)} · {b.days} days
                  </span>
                  {b.isStale && (
                    <Badge tone="amber" title={b.staleReason ?? 'Stays or weights changed since it was calculated'}>
                      ⚠ needs recalculation
                    </Badge>
                  )}
                  <span className="ml-auto font-semibold text-slate-900 tabular-nums">
                    {formatMoney(b.amountCents)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge tone="sky">{SPLIT_METHOD_LABELS[b.splitMethod]}</Badge>
                  {b.shares.map((s) => (
                    <span key={s.personId} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                      {s.personName}{' '}
                      <span className="font-medium text-slate-800 tabular-nums">
                        {formatMoney(s.amountCents)}
                      </span>
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </Card>
          <p className="text-right text-sm text-slate-500">
            {bills.data.length} {bills.data.length === 1 ? 'bill' : 'bills'} · total{' '}
            <span className="font-medium text-slate-700">
              {formatMoney(bills.data.reduce((sum, b) => sum + b.amountCents, 0))}
            </span>
          </p>
        </>
      )}
    </div>
  );
}
