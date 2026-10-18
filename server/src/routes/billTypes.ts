import { Router } from 'express';
import { billTypeCreate, billTypeUpdate } from '@bill/shared';
import type { Db } from '../db/client';
import { idParam } from '../http/params';
import {
  createBillType,
  deleteBillType,
  getBillType,
  listBillTypes,
  updateBillType,
} from '../services/billTypes';

export function billTypesRouter(db: Db) {
  const r = Router();
  r.get('/homes/:homeId/bill-types', (req, res) => {
    res.json(listBillTypes(db, idParam(req, 'homeId')));
  });
  r.post('/homes/:homeId/bill-types', (req, res) => {
    res.status(201).json(createBillType(db, idParam(req, 'homeId'), billTypeCreate.parse(req.body)));
  });
  r.get('/bill-types/:id', (req, res) => {
    res.json(getBillType(db, idParam(req, 'id')));
  });
  r.patch('/bill-types/:id', (req, res) => {
    res.json(updateBillType(db, idParam(req, 'id'), billTypeUpdate.parse(req.body)));
  });
  r.delete('/bill-types/:id', (req, res) => {
    deleteBillType(db, idParam(req, 'id'));
    res.status(204).end();
  });
  return r;
}
