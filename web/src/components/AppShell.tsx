import { Link, Outlet } from 'react-router';

export function AppShell() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span aria-hidden>🧾</span> Bill Calculator
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:p-0">
        <Outlet />
      </main>
    </div>
  );
}
