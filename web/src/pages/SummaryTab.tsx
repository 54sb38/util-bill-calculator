import { Link } from 'react-router';
import { qs } from '../api/client';
import { useSummary } from '../api/hooks';
import { DateRangeFilter, useDateRangeParams } from '../components/DateRangeFilter';
import { Badge, Card, EmptyState, ErrorMessage, Loading, SectionHeader } from '../components/ui';
import { formatMoney } from '../lib/money';
import { useHomeContext } from './HomeLayout';

export function SummaryTab() {
  const { home } = useHomeContext();
  const [range] = useDateRangeParams();
  const summary = useSummary(home.id, range);

  return (
    <div className="space-y-4">
      <SectionHeader title="Summary" />
      <p className="-mt-2 text-sm text-slate-500">
        Totals of the saved shares for bills that <em>start</em> in the selected period. Click a name for a
        printable statement.
      </p>

      <DateRangeFilter />

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
                    <Link
                      to={`/homes/${home.id}/people/${p.personId}/statement${qs(range)}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {p.name}
                    </Link>{' '}
                    {p.archived && <Badge>archived</Badge>}
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
