import type { HomeDto } from '@bill/shared';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { useHome } from '../api/hooks';
import { cx, ErrorMessage, Loading } from '../components/ui';

const tabs = [
  { to: '', label: 'Bills', end: true },
  { to: 'people', label: 'People' },
  { to: 'bill-types', label: 'Bill types' },
  { to: 'summary', label: 'Summary' },
  { to: 'settings', label: 'Settings' },
];

export interface HomeContext {
  home: HomeDto;
}

/** The current home, provided by HomeLayout to every tab. */
export const useHomeContext = () => useOutletContext<HomeContext>();

/** Reads a numeric route param, e.g. `useIdParam('billId')`. */
export function useIdParam(name: string): number | undefined {
  const value = useParams()[name];
  return value === undefined ? undefined : Number(value);
}

export function HomeLayout() {
  const homeId = useIdParam('homeId')!;
  const home = useHome(homeId);

  if (home.isPending) return <Loading />;
  if (home.isError) {
    return (
      <div className="space-y-4">
        <ErrorMessage error={home.error} />
        <Link to="/" className="text-sm font-medium text-emerald-700 hover:underline">
          ← All homes
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Printed pages (statements) carry their own heading, so the home's chrome isn't printed. */}
      <div className="print:hidden">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← All homes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{home.data.name}</h1>
        {home.data.address && <p className="text-sm text-slate-500">{home.data.address}</p>}
      </div>

      <nav className="mt-4 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cx(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
                isActive
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ home: home.data } satisfies HomeContext} />
    </div>
  );
}
