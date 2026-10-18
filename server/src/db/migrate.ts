import { DEFAULT_DB_PATH, openDb, runMigrations } from './client';

const db = openDb();
runMigrations(db);
db.$client.close();
console.log(`Migrations applied to ${DEFAULT_DB_PATH}`);
