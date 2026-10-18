import { describe, expect, it } from 'vitest';
import { billParticipants, billShares, bills, people, stays } from '../../src/db/schema';
import { setup } from '../helpers';

const JAN = { startDate: '2025-01-01', endDate: '2025-01-31' };

/** Alice lives there all month; Bob takes a 10-day holiday (Jan 10–19). */
async function household() {
  const ctx = setup();
  const seeded = await ctx.seedHome({
    people: {
      Alice: [['2024-06-01', null]],
      Bob: [
        ['2024-06-01', '2025-01-09'],
        ['2025-01-20', null],
      ],
    },
    types: { Electricity: 'by_days', Internet: 'equal' },
  });
  return { ...ctx, ...seeded };
}

const amounts = (bill: { shares: { personName: string; amountCents: number }[] }) =>
  Object.fromEntries(bill.shares.map((s) => [s.personName, s.amountCents]));

describe('bills', () => {
  it('creates a by-days bill using the type default and stores shares', async () => {
    const { api, homeId, types } = await household();
    const res = await api
      .post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: types.Electricity, amountCents: 520_00 })
      .expect(201);

    expect(res.body).toMatchObject({
      billTypeName: 'Electricity',
      splitMethod: 'by_days',
      days: 31,
      isStale: false,
      staleReason: null,
      participants: [],
    });
    expect(res.body.calculatedAt).toEqual(expect.any(String));
    // 31 vs 21 days of 52.
    expect(res.body.shares).toEqual([
      { personId: expect.any(Number), personName: 'Alice', amountCents: 310_00, daysCounted: 31, weightUsed: null },
      { personId: expect.any(Number), personName: 'Bob', amountCents: 210_00, daysCounted: 21, weightUsed: null },
    ]);
  });

  it('allows the split method to be overridden per bill', async () => {
    const { api, homeId, types } = await household();
    const res = await api
      .post(`/homes/${homeId}/bills`, {
        ...JAN,
        billTypeId: types.Electricity,
        amountCents: 100_01,
        splitMethod: 'equal',
      })
      .expect(201);
    expect(res.body.splitMethod).toBe('equal');
    expect(amounts(res.body)).toEqual({ Alice: 5001, Bob: 5000 });
  });

  it('stores custom amounts and weights as participant overrides', async () => {
    const { api, homeId, types, people: p } = await household();
    const custom = await api
      .post(`/homes/${homeId}/bills`, {
        ...JAN,
        billTypeId: types.Internet,
        amountCents: 80_00,
        splitMethod: 'custom',
        participants: [
          { personId: p.Alice, customAmountCents: 50_00 },
          { personId: p.Bob, customAmountCents: 30_00 },
        ],
      })
      .expect(201);
    expect(amounts(custom.body)).toEqual({ Alice: 50_00, Bob: 30_00 });
    expect(custom.body.participants).toHaveLength(2);

    const weighted = await api
      .post(`/homes/${homeId}/bills`, {
        ...JAN,
        billTypeId: types.Internet,
        amountCents: 90_00,
        splitMethod: 'weights',
        participants: [{ personId: p.Alice, weight: 2 }],
      })
      .expect(201);
    expect(amounts(weighted.body)).toEqual({ Alice: 60_00, Bob: 30_00 });
  });

  it('lists bills newest first with filters', async () => {
    const { api, homeId, types } = await household();
    const make = (billTypeId: number, startDate: string, endDate: string) =>
      api.post(`/homes/${homeId}/bills`, { billTypeId, startDate, endDate, amountCents: 10_00 }).expect(201);
    await make(types.Electricity, '2025-01-01', '2025-01-31');
    await make(types.Electricity, '2025-02-01', '2025-02-28');
    await make(types.Internet, '2025-01-15', '2025-02-14');

    const all = (await api.get(`/homes/${homeId}/bills`).expect(200)).body;
    expect(all.map((b: { startDate: string }) => b.startDate)).toEqual([
      '2025-02-01',
      '2025-01-15',
      '2025-01-01',
    ]);
    expect(all[0].participants).toBeUndefined();

    const elec = (await api.get(`/homes/${homeId}/bills?typeId=${types.Electricity}`)).body;
    expect(elec).toHaveLength(2);

    // Overlapping 2025-02-10..2025-02-20.
    const feb = (await api.get(`/homes/${homeId}/bills?from=2025-02-10&to=2025-02-20`)).body;
    expect(feb).toHaveLength(2);

    await api.get(`/homes/${homeId}/bills?from=garbage`).expect(400);
  });

  it('updates, recalculates and deletes a bill', async () => {
    const { api, homeId, types, people: p } = await household();
    const bill = (
      await api
        .post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: types.Electricity, amountCents: 52_00 })
        .expect(201)
    ).body;

    const updated = (
      await api.patch(`/bills/${bill.id}`, { amountCents: 104_00, notes: 'corrected' }).expect(200)
    ).body;
    expect(amounts(updated)).toEqual({ Alice: 62_00, Bob: 42_00 });
    expect(updated.notes).toBe('corrected');

    const excluded = (
      await api.patch(`/bills/${bill.id}`, { participants: [{ personId: p.Bob, included: false }] }).expect(200)
    ).body;
    expect(amounts(excluded)).toEqual({ Alice: 104_00 });

    // An empty participants array clears overrides.
    const cleared = (await api.patch(`/bills/${bill.id}`, { participants: [] }).expect(200)).body;
    expect(cleared.participants).toEqual([]);
    expect(Object.keys(amounts(cleared))).toEqual(['Alice', 'Bob']);

    await api.delete(`/bills/${bill.id}`).expect(204);
    await api.get(`/bills/${bill.id}`).expect(404);
  });
});

describe('counts', () => {
  it('reports people and bill counts on homes and bill types', async () => {
    const { api, homeId, types } = await household();
    for (const startDate of ['2025-01-01', '2025-02-01']) {
      await api.post(`/homes/${homeId}/bills`, {
        billTypeId: types.Internet,
        startDate,
        endDate: startDate.replace(/01$/, '28'),
        amountCents: 10_00,
      });
    }
    const carol = (await api.post(`/homes/${homeId}/people`, { name: 'Carol' })).body;
    await api.patch(`/people/${carol.id}`, { archived: true });

    // Archived people are not counted.
    expect((await api.get(`/homes/${homeId}`)).body).toMatchObject({ peopleCount: 2, billCount: 2 });
    const billTypes = (await api.get(`/homes/${homeId}/bill-types`)).body;
    expect(billTypes.map((t: { name: string; billCount: number }) => [t.name, t.billCount])).toEqual([
      ['Electricity', 0],
      ['Internet', 2],
    ]);
  });
});

describe('bill constraints', () => {
  it("rejects a bill type from another home (service and database)", async () => {
    const { api, db, homeId } = await household();
    const other = (await api.post('/homes', { name: 'Other' })).body;
    const otherType = (await api.post(`/homes/${other.id}/bill-types`, { name: 'Gas' })).body;

    const res = await api
      .post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: otherType.id, amountCents: 10_00 })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_BILL_TYPE');

    // The composite foreign key also blocks it at the database level.
    expect(() =>
      db
        .insert(bills)
        .values({ homeId, billTypeId: otherType.id, ...JAN, amountCents: 1, splitMethod: 'equal' })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('rejects invalid dates, amounts and methods', async () => {
    const { api, homeId, types } = await household();
    const base = { ...JAN, billTypeId: types.Electricity, amountCents: 10_00 };
    const url = `/homes/${homeId}/bills`;

    const backwards = await api.post(url, { ...base, endDate: '2024-12-31' }).expect(400);
    expect(backwards.body.error.details[0].path).toBe('endDate');
    await api.post(url, { ...base, startDate: '2025-02-30' }).expect(400);
    await api.post(url, { ...base, amountCents: 0 }).expect(400);
    await api.post(url, { ...base, amountCents: 10.5 }).expect(400);
    await api.post(url, { ...base, splitMethod: 'foo' }).expect(400);

    const bill = (await api.post(url, base).expect(201)).body;
    await api.patch(`/bills/${bill.id}`, { startDate: '2025-02-15' }).expect(400);
  });

  it('enforces CHECK constraints in the database', async () => {
    const { db, homeId, types, people: p } = await household();
    expect(() =>
      db
        .insert(bills)
        .values({ homeId, billTypeId: types.Electricity, ...JAN, amountCents: 1, splitMethod: 'foo' as 'equal' })
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db.insert(stays).values({ personId: p.Alice, startDate: '2025-05-02', endDate: '2025-05-01' }).run(),
    ).toThrow(/CHECK/);
  });

  it('rejects participants from another home and duplicates', async () => {
    const { api, homeId, types, people: p } = await household();
    const other = (await api.post('/homes', { name: 'Other' })).body;
    const stranger = (await api.post(`/homes/${other.id}/people`, { name: 'Zed' })).body;
    const base = { ...JAN, billTypeId: types.Electricity, amountCents: 10_00 };

    const res = await api
      .post(`/homes/${homeId}/bills`, { ...base, participants: [{ personId: stranger.id, included: true }] })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_PERSON');

    await api
      .post(`/homes/${homeId}/bills`, {
        ...base,
        participants: [{ personId: p.Alice }, { personId: p.Alice }],
      })
      .expect(400);
  });

  it('returns 422 and saves nothing when the calculation fails', async () => {
    const { api, db, homeId, types, people: p } = await household();
    const url = `/homes/${homeId}/bills`;

    const noDays = await api
      .post(url, { billTypeId: types.Electricity, startDate: '2020-01-01', endDate: '2020-01-31', amountCents: 10_00, participants: [{ personId: p.Alice, included: true }] })
      .expect(422);
    expect(noDays.body.error.code).toBe('NO_DAYS');

    const nobody = await api
      .post(url, { billTypeId: types.Electricity, startDate: '2020-01-01', endDate: '2020-01-31', amountCents: 10_00 })
      .expect(422);
    expect(nobody.body.error.code).toBe('NO_PARTICIPANTS');

    const mismatch = await api
      .post(url, {
        ...JAN,
        billTypeId: types.Internet,
        amountCents: 80_00,
        splitMethod: 'custom',
        participants: [
          { personId: p.Alice, customAmountCents: 50_00 },
          { personId: p.Bob, customAmountCents: 20_00 },
        ],
      })
      .expect(422);
    expect(mismatch.body.error).toMatchObject({
      code: 'CUSTOM_SUM_MISMATCH',
      details: { expectedCents: 80_00, actualCents: 70_00 },
    });

    expect(db.select().from(bills).all()).toHaveLength(0);
    expect(db.select().from(billParticipants).all()).toHaveLength(0);
    expect(db.select().from(billShares).all()).toHaveLength(0);
  });

  it('rolls back a failed update', async () => {
    const { api, homeId, types } = await household();
    const bill = (
      await api.post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: types.Electricity, amountCents: 52_00 })
    ).body;
    await api.patch(`/bills/${bill.id}`, { amountCents: 99_00, splitMethod: 'custom' }).expect(422);
    const after = (await api.get(`/bills/${bill.id}`)).body;
    expect(after).toMatchObject({ amountCents: 52_00, splitMethod: 'by_days' });
  });

  it('blocks deleting a person or bill type with bill history, but allows archiving', async () => {
    const { api, homeId, types, people: p } = await household();
    await api.post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: types.Electricity, amountCents: 52_00 });

    const person = await api.delete(`/people/${p.Bob}`).expect(409);
    expect(person.body.error).toMatchObject({ code: 'IN_USE', message: expect.stringContaining('Archive') });
    await api.patch(`/people/${p.Bob}`, { archived: true }).expect(200);

    const type = await api.delete(`/bill-types/${types.Electricity}`).expect(409);
    expect(type.body.error).toMatchObject({ code: 'IN_USE', message: expect.stringContaining('1 bill') });
    await api.delete(`/bill-types/${types.Internet}`).expect(204);
  });

  it('cascades a home delete through everything', async () => {
    const { api, db, homeId, types, people: p } = await household();
    await api.post(`/homes/${homeId}/bills`, {
      ...JAN,
      billTypeId: types.Electricity,
      amountCents: 52_00,
      participants: [{ personId: p.Alice, weight: 2 }],
    });
    await api.delete(`/homes/${homeId}`).expect(204);
    for (const table of [people, stays, bills, billParticipants, billShares]) {
      expect(db.select().from(table).all()).toHaveLength(0);
    }
  });
});

describe('snapshots and staleness', () => {
  it('keeps stored shares when stays change, flags the bill stale, and recalculates on request', async () => {
    const { api, homeId, types, people: p } = await household();
    const bill = (
      await api.post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: types.Electricity, amountCents: 52_00 })
    ).body;
    expect(amounts(bill)).toEqual({ Alice: 31_00, Bob: 21_00 });

    // Bob's holiday turns out to have ended a day earlier.
    const bobStays = (await api.get(`/people/${p.Bob}`)).body.stays;
    await api.patch(`/stays/${bobStays[1].id}`, { startDate: '2025-01-19' }).expect(200);

    const stale = (await api.get(`/bills/${bill.id}`)).body;
    expect(stale.isStale).toBe(true);
    expect(amounts(stale)).toEqual({ Alice: 31_00, Bob: 21_00 });
    expect((await api.get(`/homes/${homeId}/bills`)).body[0].isStale).toBe(true);

    const recalculated = (await api.post(`/bills/${bill.id}/recalculate`).expect(200)).body;
    expect(recalculated.isStale).toBe(false);
    expect(recalculated.shares.map((s: { daysCounted: number }) => s.daysCounted)).toEqual([31, 22]);
  });

  it('detects deleted stays and weight changes', async () => {
    const { api, homeId, types, people: p } = await household();
    const weighted = (
      await api.post(`/homes/${homeId}/bills`, {
        ...JAN,
        billTypeId: types.Internet,
        amountCents: 30_00,
        splitMethod: 'weights',
      })
    ).body;
    await api.patch(`/people/${p.Alice}`, { defaultWeight: 2 });
    expect((await api.get(`/bills/${weighted.id}`)).body.isStale).toBe(true);

    const byDays = (
      await api.post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: types.Electricity, amountCents: 52_00 })
    ).body;
    const bobStays = (await api.get(`/people/${p.Bob}`)).body.stays;
    await api.delete(`/stays/${bobStays[1].id}`).expect(204);
    expect((await api.get(`/bills/${byDays.id}`)).body.isStale).toBe(true);
  });

  it('reports a reason when recalculation would fail, and recalculate leaves the bill untouched', async () => {
    const { api, homeId, types, people: p } = await household();
    const bill = (
      await api.post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: types.Electricity, amountCents: 52_00 })
    ).body;
    for (const name of ['Alice', 'Bob'] as const) {
      for (const s of (await api.get(`/people/${p[name]}`)).body.stays) {
        await api.delete(`/stays/${s.id}`).expect(204);
      }
    }
    const stale = (await api.get(`/bills/${bill.id}`)).body;
    expect(stale).toMatchObject({ isStale: true, staleReason: expect.stringContaining('Nobody') });

    await api.post(`/bills/${bill.id}/recalculate`).expect(422);
    expect(amounts((await api.get(`/bills/${bill.id}`)).body)).toEqual({ Alice: 31_00, Bob: 21_00 });
  });

  it('keeps archived people in old bills', async () => {
    const { api, homeId, types, people: p } = await household();
    const bill = (
      await api.post(`/homes/${homeId}/bills`, { ...JAN, billTypeId: types.Internet, amountCents: 50_00 })
    ).body;
    await api.patch(`/people/${p.Bob}`, { archived: true });
    const after = (await api.get(`/bills/${bill.id}`)).body;
    expect(after.isStale).toBe(false);
    expect(amounts(after)).toEqual({ Alice: 25_00, Bob: 25_00 });
  });
});

describe('preview', () => {
  it('returns candidates and shares without saving', async () => {
    const { api, db, homeId, types, people: p } = await household();
    const res = await api
      .post(`/homes/${homeId}/bills/preview`, {
        ...JAN,
        billTypeId: types.Electricity,
        amountCents: 52_00,
        participants: [{ personId: p.Bob, included: false }],
      })
      .expect(200);

    expect(res.body).toMatchObject({ splitMethod: 'by_days', days: 31, error: null });
    expect(res.body.candidates).toEqual([
      expect.objectContaining({ name: 'Alice', daysPresent: 31, autoIncluded: true, participating: true }),
      expect.objectContaining({ name: 'Bob', daysPresent: 21, autoIncluded: true, participating: false }),
    ]);
    expect(amounts(res.body)).toEqual({ Alice: 52_00 });
    expect(db.select().from(bills).all()).toHaveLength(0);
  });

  it('returns calc errors in the body and works before a type is chosen', async () => {
    const { api, homeId } = await household();
    const res = await api
      .post(`/homes/${homeId}/bills/preview`, {
        startDate: '2020-01-01',
        endDate: '2020-01-31',
        amountCents: 10_00,
      })
      .expect(200);
    expect(res.body).toMatchObject({ splitMethod: 'by_days', shares: null, error: { code: 'NO_PARTICIPANTS' } });
  });

  it('hides archived people unless they stayed during the period', async () => {
    const { api, homeId, people: p } = await household();
    const carol = (await api.post(`/homes/${homeId}/people`, { name: 'Carol' })).body;
    await api.post(`/people/${carol.id}/stays`, { startDate: '2023-01-01', endDate: '2023-12-31' });
    await api.patch(`/people/${carol.id}`, { archived: true });
    await api.patch(`/people/${p.Bob}`, { archived: true });

    const res = await api
      .post(`/homes/${homeId}/bills/preview`, { ...JAN, amountCents: 10_00, splitMethod: 'equal' })
      .expect(200);
    expect(res.body.candidates.map((c: { name: string }) => c.name)).toEqual(['Alice', 'Bob']);
  });
});

describe('summary', () => {
  it('totals shares per person and type for bills starting in the range', async () => {
    const { api, homeId, types } = await household();
    const post = (billTypeId: number, startDate: string, endDate: string, amountCents: number) =>
      api.post(`/homes/${homeId}/bills`, { billTypeId, startDate, endDate, amountCents }).expect(201);
    await post(types.Electricity, '2025-01-01', '2025-01-31', 52_00);
    await post(types.Internet, '2025-01-01', '2025-01-31', 60_00);
    await post(types.Internet, '2025-02-01', '2025-02-28', 60_00);

    const jan = (await api.get(`/homes/${homeId}/summary?from=2025-01-01&to=2025-01-31`).expect(200)).body;
    expect(jan).toMatchObject({ billCount: 2, totalCents: 112_00 });
    expect(jan.types.map((t: { name: string; totalCents: number }) => [t.name, t.totalCents])).toEqual([
      ['Electricity', 52_00],
      ['Internet', 60_00],
    ]);
    expect(jan.people).toEqual([
      expect.objectContaining({
        name: 'Alice',
        totalCents: 61_00,
        byType: { [types.Electricity]: 31_00, [types.Internet]: 30_00 },
      }),
      expect.objectContaining({ name: 'Bob', totalCents: 51_00 }),
    ]);

    const all = (await api.get(`/homes/${homeId}/summary`)).body;
    expect(all).toMatchObject({ billCount: 3, totalCents: 172_00, from: null, to: null });
  });
});
