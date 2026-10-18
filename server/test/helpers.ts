import request from 'supertest';
import { createApp } from '../src/app';
import { openDb, runMigrations } from '../src/db/client';

/** A fresh app on an in-memory database with migrations applied. */
export function setup() {
  const db = openDb(':memory:');
  runMigrations(db);
  const app = createApp(db);
  const api = {
    get: (url: string) => request(app).get(`/api${url}`),
    post: (url: string, body?: object) => request(app).post(`/api${url}`).send(body),
    patch: (url: string, body: object) => request(app).patch(`/api${url}`).send(body),
    delete: (url: string) => request(app).delete(`/api${url}`),
  };

  /** Creates a home with the given people (and their stays) and bill types. */
  async function seedHome<P extends string = never, T extends string = never>(spec: {
    people?: Record<P, [string, string | null][]>;
    types?: Record<T, string>;
  }) {
    const home = (await api.post('/homes', { name: 'Test home' }).expect(201)).body;
    const people = {} as Record<P, number>;
    for (const [name, stays] of Object.entries(spec.people ?? {}) as [P, [string, string | null][]][]) {
      const p = (await api.post(`/homes/${home.id}/people`, { name }).expect(201)).body;
      people[name] = p.id;
      for (const [startDate, endDate] of stays) {
        await api.post(`/people/${p.id}/stays`, { startDate, endDate }).expect(201);
      }
    }
    const types = {} as Record<T, number>;
    for (const [name, defaultSplitMethod] of Object.entries(spec.types ?? {}) as [T, string][]) {
      const t = (await api.post(`/homes/${home.id}/bill-types`, { name, defaultSplitMethod }).expect(201))
        .body;
      types[name] = t.id;
    }
    return { homeId: home.id as number, people, types };
  }

  return { db, app, api, seedHome };
}
