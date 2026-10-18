import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@bill/shared';
import { CalcError } from '../calc/split';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found.`);

export const validationError = (path: string, message: string) =>
  new AppError(400, 'VALIDATION', message, [{ path, message }]);

type ConstraintKind = 'UNIQUE' | 'PRIMARYKEY' | 'FOREIGNKEY' | 'CHECK' | 'NOTNULL';

/** better-sqlite3 error code (e.g. SQLITE_CONSTRAINT_UNIQUE), unwrapping drizzle's query errors. */
function sqliteCode(err: unknown): string | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.code === 'string' && e.code.startsWith('SQLITE_')) return e.code;
  }
  return undefined;
}

export const isConstraintError = (err: unknown, kind: ConstraintKind) =>
  sqliteCode(err) === `SQLITE_CONSTRAINT_${kind}`;

function toResponse(err: unknown): { status: number; body: ApiErrorBody } {
  const body = (code: string, message: string, details?: unknown): ApiErrorBody => ({
    error: details === undefined ? { code, message } : { code, message, details },
  });

  if (err instanceof AppError) {
    return { status: err.status, body: body(err.code, err.message, err.details) };
  }
  if (err instanceof CalcError) {
    return { status: 422, body: body(err.code, err.message, err.details) };
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : 'Invalid input';
    return { status: 400, body: body('VALIDATION', message, details) };
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    return { status: 400, body: body('INVALID_JSON', 'Request body is not valid JSON.') };
  }
  if (isConstraintError(err, 'UNIQUE') || isConstraintError(err, 'PRIMARYKEY')) {
    return { status: 409, body: body('DUPLICATE', 'A record with the same name already exists.') };
  }
  if (isConstraintError(err, 'FOREIGNKEY')) {
    return { status: 409, body: body('IN_USE', 'This record is still referenced by other data.') };
  }
  if (isConstraintError(err, 'CHECK') || isConstraintError(err, 'NOTNULL')) {
    return { status: 400, body: body('VALIDATION', 'A value is out of the allowed range.') };
  }
  return { status: 500, body: body('INTERNAL', 'Something went wrong.') };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, body } = toResponse(err);
  if (status >= 500) console.error(err);
  res.status(status).json(body);
};
