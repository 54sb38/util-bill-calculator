import { Router } from 'express';
import { billCreate, billListQuery, billPreview, billUpdate, summaryQuery } from '@bill/shared';
import type { Db } from '../db/client';
import { idParam } from '../http/params';
import {
  createBill,
  deleteBill,
  getBill,
  listBills,
  previewBill,
  recalculateBill,
  updateBill,
} from '../services/bills';
import { getSummary } from '../services/summary';

export function billsRouter(db: Db) {
  const r = Router();

  r.get('/homes/:homeId/bills', (req, res) => {
    res.json(listBills(db, idParam(req, 'homeId'), billListQuery.parse(req.query)));
  });
  r.post('/homes/:homeId/bills', (req, res) => {
    res.status(201).json(createBill(db, idParam(req, 'homeId'), billCreate.parse(req.body)));
  });
  r.post('/homes/:homeId/bills/preview', (req, res) => {
    res.json(previewBill(db, idParam(req, 'homeId'), billPreview.parse(req.body)));
  });
  r.get('/bills/:billId', (req, res) => {
    res.json(getBill(db, idParam(req, 'billId')));
  });
  r.patch('/bills/:billId', (req, res) => {
    res.json(updateBill(db, idParam(req, 'billId'), billUpdate.parse(req.body)));
  });
  r.delete('/bills/:billId', (req, res) => {
    deleteBill(db, idParam(req, 'billId'));
    res.status(204).end();
  });
  r.post('/bills/:billId/recalculate', (req, res) => {
    res.json(recalculateBill(db, idParam(req, 'billId')));
  });

  r.get('/homes/:homeId/summary', (req, res) => {
    res.json(getSummary(db, idParam(req, 'homeId'), summaryQuery.parse(req.query)));
  });

  return r;
}
