import type { Request } from 'express';
import { AppError } from './errors';

/** Reads a positive integer route parameter; anything else is treated as "not found". */
export function idParam(req: Request, name: string): number {
  const raw = req.params[name];
  const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError(404, 'NOT_FOUND', 'Not found.');
  return id;
}
