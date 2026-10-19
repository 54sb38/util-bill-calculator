import { useSearchParams } from 'react-router';
import { addDays, todayIso } from '../lib/dates';
import { Button, Field, Input } from './ui';

// A type alias (not an interface) so it can be passed to `qs`.
export type DateRange = { from?: string; to?: string };

export function datePresets() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  return [
    { label: 'This year', from: `${year}-01-01`, to: `${year}-12-31` },
    { label: 'Last year', from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
    { label: 'Last 12 months', from: addDays(today, -364), to: today },
    { label: 'All time', from: '', to: '' },
  ];
}

/** The `from`/`to` search params as a date range, and a setter that replaces them. */
export function useDateRangeParams() {
  const [params, setParams] = useSearchParams();
  const range: DateRange = { from: params.get('from') || undefined, to: params.get('to') || undefined };

  const setRange = (from: string, to: string) => {
    const next = new URLSearchParams();
    if (from) next.set('from', from);
    if (to) next.set('to', to);
    setParams(next, { replace: true });
  };

  return [range, setRange] as const;
}

/** From/To inputs plus quick presets, kept in the URL's search params. */
export function DateRangeFilter() {
  const [range, setRange] = useDateRangeParams();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="From">
        <Input type="date" value={range.from ?? ''} onChange={(e) => setRange(e.target.value, range.to ?? '')} />
      </Field>
      <Field label="To">
        <Input type="date" value={range.to ?? ''} onChange={(e) => setRange(range.from ?? '', e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-1">
        {datePresets().map((p) => (
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
  );
}
