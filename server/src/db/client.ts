import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { RunResult } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

export const DEFAULT_DB_PATH =
  process.env.DB_PATH ?? path.resolve(import.meta.dirname, '../../../data/app.db');

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../drizzle');

/** Opens a SQLite database (file path or `:memory:`) with foreign keys enforced. */
export function openDb(file: string = DEFAULT_DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');
  if (file !== ':memory:') sqlite.pragma('journal_mode = WAL');
  return drizzle({ client: sqlite, schema });
}

export type Db = ReturnType<typeof openDb>;

/** Either the database or a transaction handle; services accept both. */
export type Executor = BaseSQLiteDatabase<'sync', RunResult, typeof schema>;

export function runMigrations(db: Db) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
