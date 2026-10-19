import { Router } from 'express';
import { peopleQuery, personCreate, personUpdate, stayCreate, stayUpdate, summaryQuery } from '@bill/shared';
import type { Db } from '../db/client';
import { idParam } from '../http/params';
import { createPerson, deletePerson, getPerson, listPeople, updatePerson } from '../services/people';
import { getStatement } from '../services/statement';
import { createStay, deleteStay, updateStay } from '../services/stays';

export function peopleRouter(db: Db) {
  const r = Router();

  r.get('/homes/:homeId/people', (req, res) => {
    const { includeArchived } = peopleQuery.parse(req.query);
    res.json(listPeople(db, idParam(req, 'homeId'), includeArchived));
  });
  r.post('/homes/:homeId/people', (req, res) => {
    res.status(201).json(createPerson(db, idParam(req, 'homeId'), personCreate.parse(req.body)));
  });
  r.get('/people/:personId', (req, res) => {
    res.json(getPerson(db, idParam(req, 'personId')));
  });
  r.patch('/people/:personId', (req, res) => {
    res.json(updatePerson(db, idParam(req, 'personId'), personUpdate.parse(req.body)));
  });
  r.delete('/people/:personId', (req, res) => {
    deletePerson(db, idParam(req, 'personId'));
    res.status(204).end();
  });
  r.get('/people/:personId/statement', (req, res) => {
    res.json(getStatement(db, idParam(req, 'personId'), summaryQuery.parse(req.query)));
  });

  r.post('/people/:personId/stays', (req, res) => {
    res.status(201).json(createStay(db, idParam(req, 'personId'), stayCreate.parse(req.body)));
  });
  r.patch('/stays/:stayId', (req, res) => {
    res.json(updateStay(db, idParam(req, 'stayId'), stayUpdate.parse(req.body)));
  });
  r.delete('/stays/:stayId', (req, res) => {
    deleteStay(db, idParam(req, 'stayId'));
    res.status(204).end();
  });

  return r;
}
