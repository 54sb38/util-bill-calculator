import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function ErrorPage({ notFound = false }: { notFound?: boolean }) {
  const error = useRouteError();
  const is404 = notFound || (isRouteErrorResponse(error) && error.status === 404);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold text-slate-900">{is404 ? 'Page not found' : 'Something went wrong'}</h1>
      {!is404 && error instanceof Error && <p className="mt-2 text-sm text-slate-500">{error.message}</p>}
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-emerald-700 hover:underline">
        Back to homes
      </Link>
    </div>
  );
}
