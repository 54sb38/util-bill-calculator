import { useSearchParams } from 'react-router';
import { useSummary } from '../api/hooks';
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Loading, SectionHeader } from '../components/ui';
import { addDays, todayIso } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { useHomeContext } from './HomeLayout';

function presets() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  return [
    { label: 'This year', from: `${year}-01-01`, to: `${year}-12-31` },
    { label: 'Last year', from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
    { label: 'Last 12 months', from: addDays(today, -364), to: today },
    { label: 'All time', from: '', to: '' },
  ];
}

export function SummaryTab() {
  const { home } = useHomeContext();
  const [params, setParams] = useSearchParams();
  const range = { from: params.get('from') || undefined, to: params.get('to') || undefined };
  const summary = useSummary(home.id, range);

  const setRange = (from: string, to: string) => {
    const next = new URLSearchParams();
    if (from) next.set('from', from);
    if (to) next.set('to', to);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Summary" />
      <p className="-mt-2 text-sm text-slate-500">
        Totals of the saved shares for bills that <em>start</em> in the selected period.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="From">
          <Input type="date" value={range.from ?? ''} onChange={(e) => setRange(e.target.value, range.to ?? '')} />
        </Field>
        <Field label="To">
          <Input type="date" value={range.to ?? ''} onChange={(e) => setRange(range.from ?? '', e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1">
          {presets().map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant={(range.from ?? '') === p.from && (range.to ?? '') === p.to ? 'primary' : 'ghost'}
              onClick={() => setRange(p.from, p.to)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {summary.isPending ? (
        <Loading />
      ) : summary.isError ? (
        <ErrorMessage error={summary.error} />
      ) : summary.data.billCount === 0 ? (
        <EmptyState title="No bills in this period" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Person</th>
                {summary.data.types.map((t) => (
                  <th key={t.billTypeId} className="px-4 py-2 text-right font-medium whitespace-nowrap">
                    {t.name}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.data.people.map((p) => (
                <tr key={p.personId}>
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {p.name} {p.archived && <Badge>archived</Badge>}
                  </td>
                  {summary.data.types.map((t) => (
                    <td key={t.billTypeId} className="px-4 py-2 text-right text-slate-600 tabular-nums">
                      {p.byType[t.billTypeId] ? formatMoney(p.byType[t.billTypeId]!) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums">
                    {formatMoney(p.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 text-slate-500">
              <tr>
                <td className="px-4 py-2">
                  {summary.data.billCount} {summary.data.billCount === 1 ? 'bill' : 'bills'}
                </td>
                {summary.data.types.map((t) => (
                  <td key={t.billTypeId} className="px-4 py-2 text-right tabular-nums">
                    {formatMoney(t.totalCents)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums">
                  {formatMoney(summary.data.totalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
