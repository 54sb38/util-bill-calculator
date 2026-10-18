import { Router } from 'express';
import { homeCreate, homeUpdate } from '@bill/shared';
import type { Db } from '../db/client';
import { idParam } from '../http/params';
import { createHome, deleteHome, getHome, listHomes, updateHome } from '../services/homes';

export function homesRouter(db: Db) {
  const r = Router();
  r.get('/homes', (_req, res) => {
    res.json(listHomes(db));
  });
  r.post('/homes', (req, res) => {
    res.status(201).json(createHome(db, homeCreate.parse(req.body)));
  });
  r.get('/homes/:homeId', (req, res) => {
    res.json(getHome(db, idParam(req, 'homeId')));
  });
  r.patch('/homes/:homeId', (req, res) => {
    res.json(updateHome(db, idParam(req, 'homeId'), homeUpdate.parse(req.body)));
  });
  r.delete('/homes/:homeId', (req, res) => {
    deleteHome(db, idParam(req, 'homeId'));
    res.status(204).end();
  });
  return r;
}
