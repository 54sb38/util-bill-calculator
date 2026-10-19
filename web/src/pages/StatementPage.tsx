import { SPLIT_METHOD_LABELS, type StatementDto, type StatementLineDto } from '@bill/shared';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { qs } from '../api/client';
import { useStatement } from '../api/hooks';
import { DateRangeFilter, useDateRangeParams } from '../components/DateRangeFilter';
import { Badge, Button, Card, EmptyState, ErrorMessage, Loading } from '../components/ui';
import { formatDate, formatRange, todayIso } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { useHomeContext, useIdParam } from './HomeLayout';

const formatWeight = (w: number | null) => String(Number((w ?? 0).toFixed(3)));

/** How this person's share was worked out, e.g. "21 of 31 days". */
function basis(line: StatementLineDto): string | null {
  switch (line.splitMethod) {
    case 'by_days':
      return `${line.daysCounted ?? 0} of ${line.days} days`;
    case 'weights':
      return `weight ${formatWeight(line.weightUsed)} of ${formatWeight(line.totalWeight)}`;
    case 'equal':
      return `1 of ${line.participantCount} ${line.participantCount === 1 ? 'person' : 'people'}`;
    case 'custom':
      return null;
  }
}

function period({ from, to }: Pick<StatementDto, 'from' | 'to'>) {
  if (from && to) return formatRange(from, to);
  if (from) return `From ${formatDate(from)}`;
  if (to) return `Up to ${formatDate(to)}`;
  return 'All bills';
}

/**
 * A per-person statement laid out for printing; "Download PDF" opens the browser's print
 * dialog, where it can be saved as a PDF.
 */
export function StatementPage() {
  const { home } = useHomeContext();
  const personId = useIdParam('personId')!;
  const [range] = useDateRangeParams();
  const statement = useStatement(personId, range);

  // Browsers suggest the page title as the PDF's file name.
  const name = statement.data?.person.name;
  useEffect(() => {
    if (!name) return;
    const previous = document.title;
    const span = range.from || range.to ? `${range.from ?? 'start'} to ${range.to ?? 'today'}` : 'all bills';
    document.title = `Statement – ${name} – ${span}`;
    return () => {
      document.title = previous;
    };
  }, [name, range.from, range.to]);

  return (
    <div className="space-y-4">
      <div className="space-y-4 print:hidden">
        <Link to={`/homes/${home.id}/summary${qs(range)}`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Summary
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <DateRangeFilter />
          <div className="text-right">
            <Button variant="primary" onClick={() => window.print()} disabled={!statement.data}>
              Download PDF
            </Button>
            <p className="mt-1 text-xs text-slate-500">
              Opens your browser’s print dialog. Choose <em>Save as PDF</em>.
            </p>
          </div>
        </div>
      </div>

      {statement.isPending ? (
        <Loading />
      ) : statement.isError ? (
        <ErrorMessage error={statement.error} />
      ) : (
        <Statement data={statement.data} />
      )}
    </div>
  );
}

function Statement({ data }: { data: StatementDto }) {
  const stale = data.lines.filter((l) => l.isStale);
  return (
    <>
      {stale.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 print:hidden">
          {stale.length === 1 ? '1 bill needs' : `${stale.length} bills need`} recalculation, so the amounts may
          change:{' '}
          {stale.map((l, i) => (
            <span key={l.billId}>
              {i > 0 && ', '}
              <Link to={`/homes/${data.home.id}/bills/${l.billId}`} className="font-medium underline">
                {l.billTypeName} {formatDate(l.startDate)}
              </Link>
            </span>
          ))}
        </div>
      )}

      <Card className="p-6 print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Statement for {data.person.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{period(data)}</p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p className="font-medium text-slate-800">{data.home.name}</p>
            {data.home.address && <p>{data.home.address}</p>}
            <p className="mt-1 text-xs text-slate-500">Prepared {formatDate(todayIso())}</p>
          </div>
        </header>

        {data.lines.length === 0 ? (
          <div className="mt-6">
            <EmptyState title={`No bills for ${data.person.name} in this period`} />
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-300 text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-4 text-left font-medium">Bill</th>
                  <th className="py-2 pr-4 text-left font-medium">Period</th>
                  <th className="py-2 pr-4 text-left font-medium">Split</th>
                  <th className="py-2 pr-4 text-right font-medium">Bill total</th>
                  <th className="py-2 text-right font-medium">Your share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.lines.map((l) => (
                  <tr key={l.billId} className="break-inside-avoid">
                    <td className="py-2 pr-4 font-medium text-slate-800">
                      {l.billTypeName}{' '}
                      {l.isStale && (
                        <span className="print:hidden">
                          <Badge tone="amber">needs recalculation</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-600">{formatRange(l.startDate, l.endDate)}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {SPLIT_METHOD_LABELS[l.splitMethod]}
                      {basis(l) && <span className="block text-xs text-slate-500">{basis(l)}</span>}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-600 tabular-nums">{formatMoney(l.billAmountCents)}</td>
                    <td className="py-2 text-right font-medium text-slate-900 tabular-nums">{formatMoney(l.shareCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300">
                <tr className="break-inside-avoid">
                  <td colSpan={4} className="py-2 pr-4 font-semibold text-slate-900">
                    Total due · {data.lines.length} {data.lines.length === 1 ? 'bill' : 'bills'}
                  </td>
                  <td className="py-2 text-right text-base font-semibold text-slate-900 tabular-nums">
                    {formatMoney(data.totalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
