/**
 * UI smoke tests: the real routes rendered in happy-dom, talking to a real API server
 * (in-memory SQLite) over HTTP.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/src/app';
import { openDb, runMigrations } from '../../server/src/db/client';
import { createQueryClient } from '../src/queryClient';
import { routes } from '../src/router';

let server: http.Server;
let base: string;

/** Minimal fetch over node:http, independent of the DOM environment's fetch. */
function nodeFetch(url: string, init: RequestInit = {}) {
  return new Promise<Response>((resolve, reject) => {
    const req = http.request(
      base + url,
      { method: init.method ?? 'GET', headers: init.headers as Record<string, string> },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 500;
          resolve({
            status,
            statusText: res.statusMessage ?? '',
            ok: status >= 200 && status < 300,
            json: async () => JSON.parse(data),
          } as Response);
        });
      },
    );
    req.on('error', reject);
    if (typeof init.body === 'string') req.write(init.body);
    req.end();
  });
}

async function call<T = { id: number }>(method: string, url: string, body?: object): Promise<T> {
  const res = await nodeFetch(`/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Alice lives there; Bob is away 10–19 July 2026. */
async function seed() {
  const home = await call('POST', '/homes', { name: 'Test house' });
  const alice = await call('POST', `/homes/${home.id}/people`, { name: 'Alice' });
  const bob = await call('POST', `/homes/${home.id}/people`, { name: 'Bob' });
  await call('POST', `/people/${alice.id}/stays`, { startDate: '2026-01-01', endDate: null });
  await call('POST', `/people/${bob.id}/stays`, { startDate: '2026-01-01', endDate: '2026-07-09' });
  const bobReturn = await call('POST', `/people/${bob.id}/stays`, { startDate: '2026-07-20', endDate: null });
  const elec = await call('POST', `/homes/${home.id}/bill-types`, {
    name: 'Electricity',
    defaultSplitMethod: 'by_days',
  });
  await call('POST', `/homes/${home.id}/bill-types`, { name: 'Internet', defaultSplitMethod: 'equal' });
  return { homeId: home.id, aliceId: alice.id, bobId: bob.id, bobReturnId: bobReturn.id, elecId: elec.id };
}

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const JULY = { startDate: '2026-07-01', endDate: '2026-07-31' };
const find = { timeout: 5000 };

beforeEach(async () => {
  const db = openDb(':memory:');
  runMigrations(db);
  server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubGlobal('fetch', nodeFetch);
  window.confirm = () => true;
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await new Promise((r) => server.close(r));
});

describe('UI', () => {
  it('navigates from homes to the bill list with shares', async () => {
    const { homeId, elecId } = await seed();
    await call('POST', `/homes/${homeId}/bills`, { ...JULY, billTypeId: elecId, amountCents: 186_00 });
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByText('Test house', {}, find));
    const matches = await screen.findAllByText('Electricity', { selector: 'a span' }, find);
    const row = matches[0]!.closest('a')!;
    // 31 vs 21 days.
    expect(within(row).getByText('$110.88')).toBeTruthy();
    expect(within(row).getByText('$75.12')).toBeTruthy();
    expect(within(row).getByText('By days stayed')).toBeTruthy();
  });

  it('shows stays with the holiday gap on the people tab', async () => {
    const { homeId } = await seed();
    renderApp(`/homes/${homeId}/people`);
    expect(await screen.findByText('↳ away 10 days', {}, find)).toBeTruthy();
    expect(screen.getAllByText('current')).toHaveLength(2);
  });

  it('creates a bill with a live preview', async () => {
    const { homeId } = await seed();
    const user = userEvent.setup();
    const router = renderApp(`/homes/${homeId}/bills/new`);

    fireEvent.change(await screen.findByLabelText('From', {}, find), { target: { value: JULY.startDate } });
    fireEvent.change(screen.getByLabelText('To (inclusive)'), { target: { value: JULY.endDate } });
    await user.type(screen.getByLabelText('Amount ($)'), '186');

    // Preview: Alice 31 days, Bob 21 days.
    expect(await screen.findByText('$110.88', {}, find)).toBeTruthy();
    expect(screen.getByText('$75.12')).toBeTruthy();
    expect(screen.getByText('21 / 31')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/bills\/\d+$/), find);
    expect(await screen.findByText(/Calculated/, {}, find)).toBeTruthy();
    expect(screen.getByText('31 / 31')).toBeTruthy();
  });

  it('excluding someone in the form updates the preview and is saved', async () => {
    const { homeId } = await seed();
    const user = userEvent.setup();
    renderApp(`/homes/${homeId}/bills/new`);

    fireEvent.change(await screen.findByLabelText('From', {}, find), { target: { value: JULY.startDate } });
    fireEvent.change(screen.getByLabelText('To (inclusive)'), { target: { value: JULY.endDate } });
    await user.type(screen.getByLabelText('Amount ($)'), '100');
    await screen.findByText('$59.62', {}, find);

    await user.click(screen.getByLabelText('Include Bob'));
    expect(await screen.findByText('$100.00', {}, find)).toBeTruthy();
    expect(screen.getByText('excluded')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(await screen.findByText(/Calculated/, {}, find)).toBeTruthy();
    const bills = await call<{ shares: unknown[]; participants: unknown[] }[]>('GET', `/homes/${homeId}/bills`);
    expect(bills[0]!.shares).toHaveLength(1);
  });

  it('custom amounts must add up before the bill can be saved', async () => {
    const { homeId } = await seed();
    const user = userEvent.setup();
    renderApp(`/homes/${homeId}/bills/new`);

    fireEvent.change(await screen.findByLabelText('From', {}, find), { target: { value: JULY.startDate } });
    fireEvent.change(screen.getByLabelText('To (inclusive)'), { target: { value: JULY.endDate } });
    await user.type(screen.getByLabelText('Amount ($)'), '50');
    await user.selectOptions(screen.getByLabelText('Split method'), 'custom');

    await user.type(await screen.findByLabelText('Amount for Alice', {}, find), '30');
    await user.type(screen.getByLabelText('Amount for Bob'), '10');
    expect(await screen.findByText(/\$10\.00 remaining/, {}, find)).toBeTruthy();
    expect(await screen.findByText(/add up to 40\.00/, {}, find)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save bill' }).disabled).toBe(true));

    await user.clear(screen.getByLabelText('Amount for Bob'));
    await user.type(screen.getByLabelText('Amount for Bob'), '20');
    expect(await screen.findByText(/fully allocated/, {}, find)).toBeTruthy();
    await waitFor(
      () => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save bill' }).disabled).toBe(false),
      find,
    );
    await user.click(screen.getByRole('button', { name: 'Save bill' }));
    expect(await screen.findByText(/Calculated/, {}, find)).toBeTruthy();
    expect(screen.getByText('$30.00')).toBeTruthy();
  });

  it('flags a stale bill and recalculates it', async () => {
    const { homeId, elecId, bobReturnId } = await seed();
    const bill = await call('POST', `/homes/${homeId}/bills`, { ...JULY, billTypeId: elecId, amountCents: 186_00 });
    // Bob actually came back a day earlier.
    await call('PATCH', `/stays/${bobReturnId}`, { startDate: '2026-07-19' });

    const user = userEvent.setup();
    renderApp(`/homes/${homeId}/bills/${bill.id}`);
    expect(await screen.findByText(/may be outdated/, {}, find)).toBeTruthy();
    expect(screen.getByText('21 / 31')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Recalculate' }));
    await waitFor(() => expect(screen.queryByText(/may be outdated/)).toBeNull(), find);
    expect(screen.getByText('22 / 31')).toBeTruthy();
  });

  it('shows a helpful message when deleting a person with bill history', async () => {
    const { homeId, elecId } = await seed();
    await call('POST', `/homes/${homeId}/bills`, { ...JULY, billTypeId: elecId, amountCents: 186_00 });
    const user = userEvent.setup();
    renderApp(`/homes/${homeId}/people`);

    const bobCard = (await screen.findByText('Bob', {}, find)).closest('div.rounded-lg') as HTMLElement;
    await user.click(within(bobCard).getByRole('button', { name: 'Delete Bob' }));
    expect(await within(bobCard).findByText(/Archive them instead/, {}, find)).toBeTruthy();
  });

  it('summarises totals per person', async () => {
    const { homeId, elecId } = await seed();
    await call('POST', `/homes/${homeId}/bills`, { ...JULY, billTypeId: elecId, amountCents: 186_00 });
    renderApp(`/homes/${homeId}/summary?from=2026-01-01&to=2026-12-31`);
    const aliceRow = (await screen.findByText('Alice', {}, find)).closest('tr')!;
    expect(within(aliceRow).getAllByText('$110.88')).toHaveLength(2);
  });
});
