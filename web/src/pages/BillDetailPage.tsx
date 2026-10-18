import { SPLIT_METHOD_LABELS } from '@bill/shared';
import { Link, useNavigate } from 'react-router';
import { useBill, useDeleteBill, useRecalculateBill } from '../api/hooks';
import { Badge, Button, Card, ErrorMessage, LinkButton, Loading } from '../components/ui';
import { formatRange } from '../lib/dates';
import { formatMoney, percent } from '../lib/money';
import { useHomeContext, useIdParam } from './HomeLayout';

/** SQLite CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC) → local date-time. */
const formatTimestamp = (ts: string) => new Date(`${ts.replace(' ', 'T')}Z`).toLocaleString();

export function BillDetailPage() {
  const { home } = useHomeContext();
  const billId = useIdParam('billId')!;
  const navigate = useNavigate();
  const bill = useBill(billId);
  const recalc = useRecalculateBill();
  const remove = useDeleteBill();
  const backTo = `/homes/${home.id}`;

  if (bill.isPending) return <Loading />;
  if (bill.isError) return <ErrorMessage error={bill.error} />;
  const b = bill.data;
  const showDays = b.splitMethod === 'by_days';
  const showWeights = b.splitMethod === 'weights';

  const onDelete = () => {
    if (!window.confirm(`Delete this ${b.billTypeName} bill?`)) return;
    remove.mutate(b.id, { onSuccess: () => navigate(backTo) });
  };

  return (
    <div className="space-y-4">
      <Link to={backTo} className="text-sm text-slate-500 hover:text-slate-700">
        ← Bills
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-slate-900">{b.billTypeName}</h2>
          <p className="text-sm text-slate-500">
            {formatRange(b.startDate, b.endDate)} · {b.days} days
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="sky">{SPLIT_METHOD_LABELS[b.splitMethod]}</Badge>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">{formatMoney(b.amountCents)}</p>
          <div className="mt-2 flex justify-end gap-2">
            <LinkButton to="edit" size="sm">
              Edit
            </LinkButton>
            <Button size="sm" variant="danger" onClick={onDelete} disabled={remove.isPending}>
              Delete
            </Button>
          </div>
        </div>
      </div>
      <ErrorMessage error={remove.error} />

      {b.isStale && (
        <Card className="flex flex-wrap items-center gap-3 bg-amber-50 p-4 ring-amber-200">
          <div className="flex-1 text-sm text-amber-900">
            <p className="font-medium">⚠ This bill may be outdated</p>
            <p>
              {b.staleReason ??
                'Stays, weights or people have changed since it was calculated. The shares below are the saved ones.'}
            </p>
          </div>
          <Button variant="primary" onClick={() => recalc.mutate(b.id)} disabled={recalc.isPending}>
            Recalculate
          </Button>
          <ErrorMessage error={recalc.error} className="w-full" />
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Person</th>
              {showDays && <th className="px-4 py-2 text-right font-medium">Days</th>}
              {showWeights && <th className="px-4 py-2 text-right font-medium">Weight</th>}
              <th className="px-4 py-2 text-right font-medium">Share</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {b.shares.map((s) => (
              <tr key={s.personId}>
                <td className="px-4 py-2 font-medium text-slate-800">{s.personName}</td>
                {showDays && (
                  <td className="px-4 py-2 text-right text-slate-600 tabular-nums">
                    {s.daysCounted} / {b.days}
                  </td>
                )}
                {showWeights && <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{s.weightUsed}</td>}
                <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{percent(s.amountCents, b.amountCents)}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums">{formatMoney(s.amountCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200">
            <tr>
              <td className="px-4 py-2 text-slate-500" colSpan={1 + Number(showDays) + Number(showWeights) + 1}>
                Total
              </td>
              <td className="px-4 py-2 text-right font-semibold text-slate-900 tabular-nums">
                {formatMoney(b.shares.reduce((sum, s) => sum + s.amountCents, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {b.notes && (
        <Card className="p-4 text-sm whitespace-pre-wrap text-slate-700">
          <p className="mb-1 text-xs font-medium text-slate-500">Notes</p>
          {b.notes}
        </Card>
      )}
      {b.calculatedAt && <p className="text-xs text-slate-400">Calculated {formatTimestamp(b.calculatedAt)}</p>}
    </div>
  );
}
