import { describe, expect, it } from 'vitest';
import { setup } from '../helpers';

describe('homes', () => {
  it('supports CRUD', async () => {
    const { api } = setup();
    const created = await api.post('/homes', { name: ' Flat 1 ', address: '1 Main St' }).expect(201);
    expect(created.body).toMatchObject({
      name: 'Flat 1',
      address: '1 Main St',
      peopleCount: 0,
      billCount: 0,
    });
    const id = created.body.id;

    await api.patch(`/homes/${id}`, { name: 'Flat 2', address: null }).expect(200);
    const fetched = await api.get(`/homes/${id}`).expect(200);
    expect(fetched.body).toMatchObject({ name: 'Flat 2', address: null });

    expect((await api.get('/homes').expect(200)).body).toHaveLength(1);
    await api.delete(`/homes/${id}`).expect(204);
    await api.get(`/homes/${id}`).expect(404);
  });

  it('validates input', async () => {
    const { api } = setup();
    const res = await api.post('/homes', { name: '' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details[0].path).toBe('name');
  });

  it('returns 404 for unknown ids and endpoints', async () => {
    const { api } = setup();
    await api.get('/homes/999').expect(404);
    await api.get('/homes/abc').expect(404);
    const res = await api.get('/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON', async () => {
    const { app } = setup();
    const { default: request } = await import('supertest');
    const res = await request(app)
      .post('/api/homes')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('people and stays', () => {
  it('supports CRUD with stays embedded', async () => {
    const { api, seedHome } = setup();
    const { homeId } = await seedHome({});
    const alice = (await api.post(`/homes/${homeId}/people`, { name: 'Alice', defaultWeight: 2 }).expect(201))
      .body;
    expect(alice).toMatchObject({ name: 'Alice', defaultWeight: 2, archivedAt: null, stays: [] });

    const stay = (
      await api.post(`/people/${alice.id}/stays`, { startDate: '2025-01-01', endDate: null }).expect(201)
    ).body;
    await api.patch(`/stays/${stay.id}`, { endDate: '2025-03-31', note: 'moved out' }).expect(200);

    const list = (await api.get(`/homes/${homeId}/people`).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0].stays).toEqual([
      { id: stay.id, personId: alice.id, startDate: '2025-01-01', endDate: '2025-03-31', note: 'moved out' },
    ]);

    await api.patch(`/people/${alice.id}`, { name: 'Alicia' }).expect(200);
    await api.delete(`/stays/${stay.id}`).expect(204);
    await api.delete(`/people/${alice.id}`).expect(204);
    expect((await api.get(`/homes/${homeId}/people`).expect(200)).body).toHaveLength(0);
  });

  it('archives and unarchives people', async () => {
    const { api, seedHome } = setup();
    const { homeId, people } = await seedHome({ people: { Alice: [], Bob: [] } });

    const archived = (await api.patch(`/people/${people.Bob}`, { archived: true }).expect(200)).body;
    expect(archived.archivedAt).toEqual(expect.any(String));

    expect((await api.get(`/homes/${homeId}/people`)).body.map((p: { name: string }) => p.name)).toEqual([
      'Alice',
    ]);
    expect((await api.get(`/homes/${homeId}/people?includeArchived=true`)).body).toHaveLength(2);
    expect((await api.get(`/homes/${homeId}`)).body.peopleCount).toBe(1);

    const restored = (await api.patch(`/people/${people.Bob}`, { archived: false }).expect(200)).body;
    expect(restored.archivedAt).toBeNull();
  });

  it('rejects duplicate names within a home', async () => {
    const { api, seedHome } = setup();
    const { homeId } = await seedHome({ people: { Alice: [] } });
    const res = await api.post(`/homes/${homeId}/people`, { name: 'Alice' }).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE');
  });

  it('rejects stays that end before they start', async () => {
    const { api, seedHome } = setup();
    const { people } = await seedHome({ people: { Alice: [['2025-01-10', '2025-01-20']] } });
    await api
      .post(`/people/${people.Alice}/stays`, { startDate: '2025-02-10', endDate: '2025-02-01' })
      .expect(400);

    const stay = (await api.get(`/people/${people.Alice}`)).body.stays[0];
    const res = await api.patch(`/stays/${stay.id}`, { endDate: '2025-01-01' }).expect(400);
    expect(res.body.error.details[0].path).toBe('endDate');
  });

  it('rejects overlapping stays, including a second open-ended stay', async () => {
    const { api, seedHome } = setup();
    const { people } = await seedHome({
      people: {
        Alice: [
          ['2025-01-01', '2025-01-31'],
          ['2025-03-01', null],
        ],
      },
    });
    const url = `/people/${people.Alice}/stays`;

    const res = await api.post(url, { startDate: '2025-01-31', endDate: '2025-02-10' }).expect(409);
    expect(res.body.error.code).toBe('STAY_OVERLAP');
    await api.post(url, { startDate: '2026-01-01', endDate: null }).expect(409);

    // Filling the holiday gap exactly is fine.
    await api.post(url, { startDate: '2025-02-01', endDate: '2025-02-28' }).expect(201);

    // Extending a stay into a neighbour is caught on update too.
    const first = (await api.get(`/people/${people.Alice}`)).body.stays[0];
    await api.patch(`/stays/${first.id}`, { endDate: '2025-02-05' }).expect(409);
  });
});

describe('bill types', () => {
  it('supports CRUD and rejects duplicates and bad methods', async () => {
    const { api, seedHome } = setup();
    const { homeId } = await seedHome({});
    const t = (await api.post(`/homes/${homeId}/bill-types`, { name: 'Electricity' }).expect(201)).body;
    expect(t).toMatchObject({ name: 'Electricity', defaultSplitMethod: 'by_days', billCount: 0 });

    await api.patch(`/bill-types/${t.id}`, { defaultSplitMethod: 'equal' }).expect(200);
    expect((await api.get(`/homes/${homeId}/bill-types`)).body[0].defaultSplitMethod).toBe('equal');

    expect(
      (await api.post(`/homes/${homeId}/bill-types`, { name: 'Electricity' }).expect(409)).body.error.code,
    ).toBe('DUPLICATE');
    await api.post(`/homes/${homeId}/bill-types`, { name: 'Gas', defaultSplitMethod: 'foo' }).expect(400);

    await api.delete(`/bill-types/${t.id}`).expect(204);
  });

  it('keeps bill type lists separate per home', async () => {
    const { api, seedHome } = setup();
    const a = await seedHome({ types: { Water: 'equal' } });
    const b = await seedHome({ types: { Water: 'by_days' } });
    expect((await api.get(`/homes/${a.homeId}/bill-types`)).body).toHaveLength(1);
    expect((await api.get(`/homes/${b.homeId}/bill-types`)).body).toHaveLength(1);
  });
});
