/*
 * Sample data: one home with a housemate who took a 10-day holiday, one who moved in mid-way,
 * and one former housemate (archived). Re-running replaces the sample home.
 */
import { eq } from 'drizzle-orm';
import type { SplitMethod } from '@bill/shared';
import { createBill } from '../services/bills';
import { createBillType } from '../services/billTypes';
import { createHome } from '../services/homes';
import { createPerson, updatePerson } from '../services/people';
import { createStay } from '../services/stays';
import { DEFAULT_DB_PATH, openDb, runMigrations } from './client';
import { homes } from './schema';

const HOME_NAME = 'Sample house';

const db = openDb();
runMigrations(db);
db.delete(homes).where(eq(homes.name, HOME_NAME)).run();

const home = createHome(db, { name: HOME_NAME, address: '12 Example St' });

const person = (name: string, stays: [string, string | null][], defaultWeight?: number) => {
  const p = createPerson(db, home.id, { name, defaultWeight });
  for (const [startDate, endDate] of stays) createStay(db, p.id, { startDate, endDate });
  return p.id;
};

const alice = person('Alice', [['2025-01-01', null]], 1.5); // bigger room
const bob = person('Bob', [
  ['2025-03-01', '2026-07-09'],
  ['2026-07-20', null], // away on holiday 10–19 July
]);
const carol = person('Carol', [['2026-08-15', null]]);
const dan = person('Dan', [['2025-01-01', '2026-06-30']]);

const type = (name: string, defaultSplitMethod: SplitMethod) =>
  createBillType(db, home.id, { name, defaultSplitMethod }).id;

const electricity = type('Electricity', 'by_days');
const gas = type('Gas', 'by_days');
const water = type('Water', 'weights');
const internet = type('Internet', 'equal');

createBill(db, home.id, {
  billTypeId: electricity,
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  amountCents: 412_35,
  notes: 'Q2 – Dan still living here',
});
createBill(db, home.id, {
  billTypeId: electricity,
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  amountCents: 186_00,
  notes: 'Bob away 10–19 July',
});
createBill(db, home.id, {
  billTypeId: water,
  startDate: '2026-07-01',
  endDate: '2026-09-30',
  amountCents: 240_00,
});
createBill(db, home.id, {
  billTypeId: gas,
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  amountCents: 95_50,
  splitMethod: 'custom',
  notes: 'Agreed amounts',
  participants: [
    { personId: alice, customAmountCents: 40_00 },
    { personId: bob, customAmountCents: 30_00 },
    { personId: carol, customAmountCents: 25_50 },
  ],
});
createBill(db, home.id, {
  billTypeId: internet,
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  amountCents: 79_99,
});

updatePerson(db, dan, { archived: true });

db.$client.close();
console.log(`Seeded "${HOME_NAME}" into ${DEFAULT_DB_PATH}`);
