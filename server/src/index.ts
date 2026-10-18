import path from 'node:path';
import { createApp } from './app';
import { DEFAULT_DB_PATH, openDb, runMigrations } from './db/client';

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
// No login: listen on localhost only unless explicitly told otherwise.
const host = process.env.HOST ?? '127.0.0.1';

const db = openDb();
runMigrations(db);

const app = createApp(db, {
  staticDir: isProduction ? path.resolve(import.meta.dirname, '../../web/dist') : undefined,
});

app.listen(port, host, () => {
  console.log(`Bill calculator API on http://${host}:${port} (db: ${DEFAULT_DB_PATH})`);
});
