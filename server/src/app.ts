import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Db } from './db/client';
import { AppError, errorHandler } from './http/errors';
import { billsRouter } from './routes/bills';
import { billTypesRouter } from './routes/billTypes';
import { homesRouter } from './routes/homes';
import { peopleRouter } from './routes/people';

export interface AppOptions {
  /** Directory of the built web app to serve (production). */
  staticDir?: string;
}

export function createApp(db: Db, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const api = express.Router();
  api.use(homesRouter(db), peopleRouter(db), billTypesRouter(db), billsRouter(db));
  api.use(() => {
    throw new AppError(404, 'NOT_FOUND', 'Unknown API endpoint.');
  });
  app.use('/api', api);

  const { staticDir } = options;
  if (staticDir) {
    const indexHtml = path.join(staticDir, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      throw new Error(`Web build not found at ${staticDir}. Run "npm run build" first.`);
    }
    app.use(express.static(staticDir));
    // SPA fallback: client-side routes all load index.html.
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(indexHtml) : next()));
  }

  app.use(errorHandler);
  return app;
}
