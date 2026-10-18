import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 shadow-sm',
  danger: 'bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

interface ButtonStyle {
  variant?: Variant;
  size?: 'sm' | 'md';
}

const buttonClass = ({ variant = 'secondary', size = 'md' }: ButtonStyle, className?: string) =>
  cx(
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
    size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3.5 py-2 text-sm',
    variants[variant],
    className,
  );

export const Button = ({ variant, size, className, ...props }: ComponentProps<'button'> & ButtonStyle) => (
  <button type="button" className={buttonClass({ variant, size }, className)} {...props} />
);

/** A router link styled as a button. */
export const LinkButton = ({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) => (
  <Link className={buttonClass({ variant, size }, className)} {...props} />
);

// ---------- Form controls ----------

const control =
  'block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm ring-1 ring-slate-300 ' +
  'placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600 focus:outline-none disabled:bg-slate-100 ' +
  'aria-[invalid=true]:ring-red-400';

export const Input = ({ className, ...props }: ComponentProps<'input'>) => (
  <input className={cx(control, className)} {...props} />
);

export const Select = ({ className, ...props }: ComponentProps<'select'>) => (
  <select className={cx(control, 'pr-8', className)} {...props} />
);

export const Textarea = ({ className, ...props }: ComponentProps<'textarea'>) => (
  <textarea className={cx(control, className)} rows={2} {...props} />
);

export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  // Hint and error sit outside the <label> so they don't become part of the control's name.
  return (
    <div className={className}>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
        {children}
      </label>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------- Layout & feedback ----------

export const Card = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cx('rounded-lg bg-white shadow-sm ring-1 ring-slate-200', className)} {...props} />
);

export function SectionHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorMessage({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  // Accepts ApiError/Error as well as plain `{ message }` objects such as react-hook-form field errors.
  const message =
    error instanceof ApiError || error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : 'Something went wrong.';
  return (
    <div role="alert" className={cx('rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200', className)}>
      {message}
    </div>
  );
}

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <p className="py-8 text-center text-sm text-slate-500">{label}</p>
);

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-slate-200 px-6 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

type Tone = 'slate' | 'amber' | 'emerald' | 'sky';
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-100 text-amber-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  sky: 'bg-sky-100 text-sky-800',
};

export const Badge = ({ tone = 'slate', children, title }: { tone?: Tone; children: ReactNode; title?: string }) => (
  <span title={title} className={cx('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', tones[tone])}>
    {children}
  </span>
);

export { cx };
