# Bill Calculator

A small single-user web app for working out how much of each utility bill every housemate should pay.

- **Homes** contain **people**. Each person has one or more **stays** (move-in → move-out). A holiday is a gap between two stays.
- Each home has its own list of **bill types**, such as Electricity or Internet. Each type has a default split method.
- **Bills** have a type, a period and an amount. Each bill uses one of four split methods:
  | Method | How it splits |
  |---|---|
  | **By days stayed** | Proportional to the days each person was present during the period |
  | **Equal split** | Evenly among participants |
  | **By weights** | Proportional to each person's weight (a default per person, overridable per bill) |
  | **Custom amounts** | You enter each share; the shares must add up to the bill |
- Participants are worked out automatically from stays, and you can exclude or add people on a single bill.
- Calculated shares are **saved as a snapshot**. Editing stays or weights later does not silently change old bills. Instead, affected bills are flagged *"needs recalculation"*, and you choose whether to recalculate.

## Getting started

Requires Node 22+ (developed on Node 24).

```bash
npm install
npm run db:migrate    # creates data/app.db
npm run db:seed       # optional: adds a "Sample house" with example people and bills
npm run dev           # API on :3000, web app on http://localhost:5173
```

To run a single production-style server on http://localhost:3000:

```bash
npm run build
npm start
```

The server applies pending migrations on startup. There is no login, so it listens on `127.0.0.1` only. Set `HOST`/`PORT` to change that, and `DB_PATH` to use another database file.

## Running in a container (Apple `container`)

The `Dockerfile` also works with Docker and Podman. Apple's [`container`](https://github.com/apple/container) needs an Apple silicon Mac on macOS 26. Install the signed `.pkg` from its releases page, then:

```bash
container system start                 # first run asks to install the Linux kernel: say yes
container build -t bill-calculator .
container volume create bill-data
mkdir -p ~/bill-calculator-backups
container run -d --name bill-calculator \
  -p 127.0.0.1:3000:3000 \
  -v bill-data:/data \
  -v ~/bill-calculator-backups:/backup \
  bill-calculator
```

Open http://localhost:3000. The database lives in the `bill-data` volume at `/data/app.db`, so it survives rebuilding and deleting the container. Don't run `container volume prune` while the container is deleted, or the data goes with it.

| Task | Command |
|---|---|
| Logs | `container logs -f bill-calculator` |
| Stop / start | `container stop bill-calculator` / `container start bill-calculator` |
| Add sample data | `container exec bill-calculator node --import tsx server/src/db/seed.ts` |
| Back up | `container exec bill-calculator node -e "require('better-sqlite3')('/data/app.db').backup('/backup/app-' + new Date().toISOString().slice(0, 10) + '.db')"` → `~/bill-calculator-backups/` |
| Update | `git pull && container build -t bill-calculator .`, then `container stop bill-calculator && container rm bill-calculator` and repeat the `container run` above |

Inside the container the server listens on all interfaces (`HOST=0.0.0.0`), but the port is published only on `127.0.0.1`, so the app is reachable only from the Mac itself.

**Start at login.** `container` has no restart policy, so use a launch agent. Save this as `~/Library/LaunchAgents/com.bill-calculator.plist`, then run `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bill-calculator.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.bill-calculator</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string><string>-c</string>
    <string>/usr/local/bin/container system start &amp;&amp; /usr/local/bin/container start bill-calculator</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/bill-calculator.log</string>
  <key>StandardErrorPath</key><string>/tmp/bill-calculator.log</string>
</dict>
</plist>
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | API (tsx watch) and web app (Vite) with hot reload |
| `npm run build` | Typecheck everything, then build the web app into `web/dist` |
| `npm start` | Serve the API and the built web app on :3000 |
| `npm test` | Server unit and API tests, plus web UI smoke tests |
| `npm run typecheck` | `tsc` for every workspace |
| `npm run db:generate` | Generate a migration after editing `server/src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` / `db:studio` | Apply migrations / seed sample data / browse the DB in Drizzle Studio |

## Project layout

```
shared/   @bill/shared: zod schemas, split methods and API DTO types (used by server and web)
server/   Express 5 JSON API, SQLite (better-sqlite3) and Drizzle ORM
  src/db/        schema, client, migrations runner, seed
  src/calc/      pure calculation engine (dates.ts, split.ts)
  src/services/  business rules and transactions, one file per resource
  src/routes/    Express routers under /api
  drizzle/       generated SQL migrations
  test/          calc unit tests and API integration tests (in-memory SQLite)
web/      React 19, Vite, React Router, TanStack Query, React Hook Form, Tailwind CSS
  test/          UI smoke tests (happy-dom against a real in-memory API)
data/     app.db (gitignored)
```

## Design notes

### Data model

```
homes 1─* people 1─* stays
homes 1─* bill_types 1─* bills        (composite FK guarantees same home)
homes 1─* bills 1─* bill_participants *─1 people    (per-bill overrides)
                1─* bill_shares       *─1 people    (calculated snapshot)
```

- **Money and dates:** money is stored as integer cents. Dates are `YYYY-MM-DD` text, and every range is **inclusive** on both ends. For example, 1–31 Jan is 31 days, and a stay ending 10 Mar counts 10 Mar.
- **Stays:** a stay's `end_date` is `NULL` while the person still lives there. A person's stays may not overlap; the service layer enforces this.
- **Overrides:** `bill_participants` holds rows only for overrides: `included` (exclude or force in), `weight` and `custom_amount_cents`.
- **Shares invariant:** `bill_shares` always adds up to the bill amount. Allocation uses the largest-remainder method in integer cents, and ties go to the lowest person id. For example, $100 split three ways gives $33.34, $33.33 and $33.33.
- **Deletes:**
  - Deleting a home cascades to everything in it.
  - A person or bill type that is referenced by bills cannot be deleted. Archive former housemates instead; archived people stay on their old bills.
  - Referencing foreign keys use `NO ACTION` rather than `RESTRICT`, so that home cascades work.
- **Staleness:** a bill is marked stale when rerunning the calculation on current data would give different shares, or would fail.

### Calculation errors (HTTP 422)

| Code | Meaning |
|---|---|
| `NO_PARTICIPANTS` | Nobody is included in the bill |
| `NO_DAYS` | A by-days bill where nobody stayed during the period |
| `CUSTOM_MISSING` | A participant has no custom amount |
| `CUSTOM_SUM_MISMATCH` | Custom amounts don't add up to the bill |

### Migrations caveat

SQLite ignores `PRAGMA foreign_keys` inside a transaction. If a future schema change makes drizzle-kit rebuild a table (`__new_*`), check the generated SQL before applying it to a database with real data.
