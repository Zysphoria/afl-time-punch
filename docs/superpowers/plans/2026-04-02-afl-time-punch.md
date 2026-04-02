# AFL Time Punch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal local-first time punch web app with live timer, pause/resume with comments, pay calculation, weekly sidebar navigation, inline session time editing, and Excel export.

**Architecture:** React + Vite (TypeScript) frontend proxies to an Express backend on port 3001. SQLite via better-sqlite3 stores sessions and settings locally in data/timepunch.db. A root npm workspace with concurrently starts both servers with one command.

**Tech Stack:** React 18, Vite 5, Express 4, better-sqlite3 9, exceljs 4, TypeScript 5, vitest, supertest, @testing-library/react

---

This plan covers every file that must be created to build the application from scratch, in dependency order. Each task includes the full file content to write.

---

## Overview of Build Order

1. Root scaffold (package.json, .gitignore)
2. Server scaffold (package.json, tsconfig, vitest config)
3. Server core (db, types, utils)
4. Server routes (sessions, settings, export)
5. Server entry points (app.ts, index.ts)
6. Client scaffold (package.json, tsconfig, vite config, index.html)
7. Client foundation (types, api, index.css, main.tsx)
8. Client utilities (time.ts, pay.ts)
9. Client hooks (useSettings, useSessions, useTimer)
10. Client components (WeekSummary, SessionRow, PauseModal, Sidebar, DetailPanel, TopBar)
11. Client App.tsx (wires everything)
12. Test files (server integration tests)

---

- [ ] **Task 1: Root Package.json**

**File:** `package.json`

```json
{
  "name": "afl-time-punch",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "client",
    "server"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace=server\" \"npm run dev --workspace=client\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

**Why:** Root workspace glue. `concurrently` is the only root-level devDep since client and server each manage their own dependencies. The workspace paths must match the directory names exactly.

---

- [ ] **Task 2: Root .gitignore**

**File:** `.gitignore`

```
node_modules/
data/
dist/
.env
*.db
.superpowers/
```

**Why:** Excludes the SQLite DB in `data/`, build artifacts, and the `.superpowers/` tooling directory which is already present.

---

- [ ] **Task 3: Server Package.json**

**File:** `server/package.json`

```json
{
  "name": "afl-time-punch-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "exceljs": "^4.4.0",
    "express": "^4.18.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.30",
    "@types/supertest": "^6.0.2",
    "supertest": "^6.3.4",
    "tsx": "^4.7.1",
    "typescript": "^5.4.3",
    "vitest": "^1.4.0"
  }
}
```

**Why:** `"type": "module"` enables ES module syntax throughout. `tsx watch` gives hot-reload without a separate build step during development. `supertest` is kept as a devDep since it is only used in tests.

---

- [ ] **Task 4: Server tsconfig.json**

**File:** `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Why:** `NodeNext` module resolution is required for ESM in Node.js. `strict: true` catches the class of bugs (undefined, null) most likely to occur in time arithmetic.

---

- [ ] **Task 5: Server vitest.config.ts**

**File:** `server/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
  },
});
```

**Why:** Minimal config. Tests set `process.env.DB_PATH` themselves before calling `resetDb()` so no global setup file is needed at the vitest config level.

---

- [ ] **Task 6: Server Types**

**File:** `server/src/types.ts`

```typescript
export interface Pause {
  start: string;       // ISO 8601
  end?: string;        // ISO 8601, absent while pause is open
  comment?: string;
}

export interface SessionRow {
  id: number;
  date: string;        // YYYY-MM-DD
  clock_in: string;    // ISO 8601
  clock_out: string | null;
  duration_secs: number;
  pauses: string;      // raw JSON string from SQLite
  created_at: string;
}
```

**Why:** `SessionRow` mirrors the raw DB row exactly (pauses as a JSON string). Callers parse it to `Pause[]` after fetch. Keeping the raw shape separate from the parsed shape avoids silent double-parse bugs.

---

- [ ] **Task 7: Server DB Module**

**File:** `server/src/db.ts`

```typescript
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

function getDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  // Resolve relative to the server package root (two levels up from src/)
  return path.resolve(__dirname, '../../data/timepunch.db');
}

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(getDbPath());
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          TEXT NOT NULL,
      clock_in      TEXT NOT NULL,
      clock_out     TEXT,
      duration_secs INTEGER NOT NULL DEFAULT 0,
      pauses        TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings VALUES ('hourly_rate', '15.00');
  `);
}

/** Drop and recreate schema. Call in tests only. */
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
  const db = new Database(getDbPath());
  db.exec(`
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS settings;
  `);
  migrate(db);
  db.close();
  _db = null;
}
```

**Why:** The singleton pattern prevents multiple connections. `resetDb()` fully closes and nulls out the singleton so the next `getDb()` call in a test starts fresh. The `:memory:` path set via `DB_PATH` env var gives in-memory isolation per test file.

**Important note for the data directory:** The `data/` directory at the project root must exist before the server first runs in production mode. Add `mkdir -p data` to a postinstall or document it — or create the directory as part of the initial setup step.

---

- [ ] **Task 8: Server Duration Utility**

**File:** `server/src/utils/duration.ts`

```typescript
import type { Pause } from '../types.js';

/**
 * Compute duration in seconds, excluding all completed pauses.
 * Returns 0 if clockOut is null (active session — caller should pass null check).
 */
export function computeDurationSecs(
  clockIn: string,
  clockOut: string | null,
  pauses: Pause[]
): number {
  if (!clockOut) return 0;

  const totalMs = new Date(clockOut).getTime() - new Date(clockIn).getTime();

  const pauseMs = pauses.reduce((sum, p) => {
    if (!p.end) return sum; // open pause not counted
    return sum + (new Date(p.end).getTime() - new Date(p.start).getTime());
  }, 0);

  return Math.max(0, Math.floor((totalMs - pauseMs) / 1000));
}
```

**Why:** Pure function — easy to unit test in isolation. Ignores open pauses (no `end`) per spec. `Math.max(0, ...)` guards against negative values from bad data.

---

- [ ] **Task 9: Sessions Route**

**File:** `server/src/routes/sessions.ts`

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db.js';
import type { Pause, SessionRow } from '../types.js';
import { computeDurationSecs } from '../utils/duration.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseSession(row: SessionRow) {
  return {
    ...row,
    pauses: JSON.parse(row.pauses) as Pause[],
  };
}

/** Return the Monday of the week containing the given YYYY-MM-DD date string. */
function weekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun,1=Mon,...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for 6 days after Monday */
function weekSunday(monday: string): string {
  const d = new Date(monday + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ─── GET /api/sessions ───────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const week = req.query.week as string | undefined;

  if (week) {
    // week = YYYY-MM-DD (Monday)
    const monday = week;
    const sunday = weekSunday(monday);
    const rows = db
      .prepare('SELECT * FROM sessions WHERE date >= ? AND date <= ? ORDER BY clock_in ASC')
      .all(monday, sunday) as SessionRow[];
    return res.json(rows.map(parseSession));
  }

  const rows = db
    .prepare('SELECT * FROM sessions ORDER BY clock_in ASC')
    .all() as SessionRow[];
  res.json(rows.map(parseSession));
});

// ─── POST /api/sessions (clock in) ──────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const db = getDb();

  // Reject if there is already an active session
  const active = db
    .prepare('SELECT id FROM sessions WHERE clock_out IS NULL')
    .get();
  if (active) {
    return res.status(409).json({ error: 'An active session already exists.' });
  }

  const now = new Date().toISOString();
  const date = now.slice(0, 10); // YYYY-MM-DD local... see note below

  const result = db
    .prepare(
      'INSERT INTO sessions (date, clock_in, clock_out, duration_secs, pauses) VALUES (?, ?, NULL, 0, ?)'
    )
    .run(date, now, '[]');

  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(result.lastInsertRowid) as SessionRow;

  res.status(201).json(parseSession(row));
});

// ─── PATCH /api/sessions/:id ─────────────────────────────────────────────────

router.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = Number(req.params.id);
  const body = req.body as Record<string, string>;

  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;

  if (!row) return res.status(404).json({ error: 'Session not found.' });

  let pauses: Pause[] = JSON.parse(row.pauses);

  // ── Action: clock_out ────────────────────────────────────────────────────
  if ('clock_out' in body && !('clock_in' in body)) {
    const clockOut = body.clock_out;
    // Close any open pause first
    pauses = pauses.map(p =>
      !p.end ? { ...p, end: clockOut } : p
    );
    const durationSecs = computeDurationSecs(row.clock_in, clockOut, pauses);

    db.prepare(
      'UPDATE sessions SET clock_out = ?, duration_secs = ?, pauses = ? WHERE id = ?'
    ).run(clockOut, durationSecs, JSON.stringify(pauses), id);
  }

  // ── Action: pause_start ──────────────────────────────────────────────────
  else if ('pause_start' in body) {
    const openPause = pauses.find(p => !p.end);
    if (openPause) {
      return res.status(409).json({ error: 'A pause is already open.' });
    }
    pauses.push({ start: body.pause_start });

    db.prepare('UPDATE sessions SET pauses = ? WHERE id = ?').run(
      JSON.stringify(pauses),
      id
    );
  }

  // ── Action: pause_end ────────────────────────────────────────────────────
  else if ('pause_end' in body) {
    const openIndex = pauses.findIndex(p => !p.end);
    if (openIndex === -1) {
      return res.status(409).json({ error: 'No open pause to close.' });
    }
    pauses[openIndex] = {
      ...pauses[openIndex],
      end: body.pause_end,
      ...(body.comment ? { comment: body.comment } : {}),
    };

    const durationSecs = computeDurationSecs(row.clock_in, row.clock_out, pauses);
    db.prepare(
      'UPDATE sessions SET pauses = ?, duration_secs = ? WHERE id = ?'
    ).run(JSON.stringify(pauses), durationSecs, id);
  }

  // ── Action: manual time edit (clock_in + optional clock_out) ─────────────
  else if ('clock_in' in body) {
    const newClockIn = body.clock_in;
    const newClockOut = body.clock_out ?? row.clock_out ?? null;
    const newDate = newClockIn.slice(0, 10);
    const durationSecs = computeDurationSecs(newClockIn, newClockOut, pauses);

    db.prepare(
      'UPDATE sessions SET date = ?, clock_in = ?, clock_out = ?, duration_secs = ? WHERE id = ?'
    ).run(newDate, newClockIn, newClockOut, durationSecs, id);
  }

  else {
    return res.status(400).json({ error: 'Unrecognized PATCH action.' });
  }

  const updated = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow;

  res.json(parseSession(updated));
});

// ─── DELETE /api/sessions/:id ────────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = Number(req.params.id);

  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  res.status(204).send();
});

export default router;
```

**Key design notes:**
- Clock in uses `new Date().toISOString()` which returns UTC. The `date` column stores the ISO date string slice `[0,10]`. Because the server is local (same machine as the user), this is fine for a personal app, but if there is a timezone concern, the client could pass the local date in the POST body instead. This is a known trade-off.
- Manual edit recalculates `duration_secs` but does not alter existing pauses — the inline edit UI only changes clock_in/clock_out, not individual pause times.

---

- [ ] **Task 10: Settings Route**

**File:** `server/src/routes/settings.ts`

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'hourly_rate'")
    .get() as { value: string } | undefined;

  res.json({ hourly_rate: row?.value ?? '15.00' });
});

router.put('/', (req: Request, res: Response) => {
  const { hourly_rate } = req.body as { hourly_rate: string };

  if (!hourly_rate || isNaN(parseFloat(hourly_rate))) {
    return res.status(400).json({ error: 'Invalid hourly_rate value.' });
  }

  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('hourly_rate', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(hourly_rate);

  res.json({ hourly_rate });
});

export default router;
```

---

- [ ] **Task 11: Export Route**

**File:** `server/src/routes/export.ts`

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { getDb } from '../db.js';
import type { Pause, SessionRow } from '../types.js';

const router = Router();

interface ParsedSession {
  id: number;
  date: string;
  clock_in: string;
  clock_out: string | null;
  duration_secs: number;
  pauses: Pause[];
  created_at: string;
}

function weekSunday(monday: string): string {
  const d = new Date(monday + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function weekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Format a Monday date string as "Apr 1–7 2026" */
function weekLabel(monday: string): string {
  const start = new Date(monday + 'T00:00:00');
  const end = new Date(monday + 'T00:00:00');
  end.setDate(end.getDate() + 6);

  const monthName = start.toLocaleString('en-US', { month: 'short' });
  return `${monthName} ${start.getDate()}–${end.getDate()} ${start.getFullYear()}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

router.get('/', async (req: Request, res: Response) => {
  const db = getDb();
  const weekParam = req.query.week as string | undefined;

  // Fetch hourly rate
  const rateRow = db
    .prepare("SELECT value FROM settings WHERE key = 'hourly_rate'")
    .get() as { value: string } | undefined;
  const hourlyRate = parseFloat(rateRow?.value ?? '15.00');

  // Fetch sessions
  let rows: SessionRow[];
  if (weekParam) {
    const sunday = weekSunday(weekParam);
    rows = db
      .prepare(
        'SELECT * FROM sessions WHERE date >= ? AND date <= ? ORDER BY clock_in ASC'
      )
      .all(weekParam, sunday) as SessionRow[];
  } else {
    rows = db
      .prepare('SELECT * FROM sessions ORDER BY clock_in ASC')
      .all() as SessionRow[];
  }

  const sessions: ParsedSession[] = rows.map(r => ({
    ...r,
    pauses: JSON.parse(r.pauses) as Pause[],
  }));

  // Group sessions by week (Monday key)
  const weekMap = new Map<string, ParsedSession[]>();
  for (const s of sessions) {
    const monday = weekMonday(s.date);
    if (!weekMap.has(monday)) weekMap.set(monday, []);
    weekMap.get(monday)!.push(s);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AFL Time Punch';
  workbook.created = new Date();

  const sortedWeeks = [...weekMap.keys()].sort();

  for (const monday of sortedWeeks) {
    const weekSessions = weekMap.get(monday)!;
    const sheetName = weekLabel(monday).replace(/[:\\\/\?\*\[\]]/g, '-');
    const sheet = workbook.addWorksheet(sheetName);

    // Header row
    sheet.columns = [
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Clock In', key: 'clock_in', width: 12 },
      { header: 'Clock Out', key: 'clock_out', width: 12 },
      { header: 'Duration (hrs)', key: 'duration', width: 16 },
      { header: 'Pauses', key: 'pauses', width: 10 },
      { header: 'Break Comments', key: 'comments', width: 30 },
      { header: 'Pay ($)', key: 'pay', width: 12 },
    ];

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFE5E7EB' } };

    let totalDurationHrs = 0;
    let totalPay = 0;

    for (const s of weekSessions) {
      const durationHrs = s.duration_secs / 3600;
      const pay = durationHrs * hourlyRate;
      const completedPauses = s.pauses.filter(p => p.end);
      const comments = completedPauses
        .map(p => p.comment)
        .filter(Boolean)
        .join('; ');

      totalDurationHrs += durationHrs;
      totalPay += pay;

      sheet.addRow({
        date: formatDate(s.date),
        clock_in: formatTime(s.clock_in),
        clock_out: formatTime(s.clock_out),
        duration: parseFloat(durationHrs.toFixed(4)),
        pauses: completedPauses.length,
        comments,
        pay: parseFloat(pay.toFixed(2)),
      });
    }

    // Total row
    const totalRow = sheet.addRow({
      date: 'TOTAL',
      clock_in: '',
      clock_out: '',
      duration: parseFloat(totalDurationHrs.toFixed(4)),
      pauses: '',
      comments: '',
      pay: parseFloat(totalPay.toFixed(2)),
    });
    totalRow.font = { bold: true };
    totalRow.getCell('duration').numFmt = '0.00';
    totalRow.getCell('pay').numFmt = '"$"#,##0.00';

    // Number format for data rows
    sheet.eachRow((row, rowNum) => {
      if (rowNum > 1) {
        row.getCell('duration').numFmt = '0.00';
        row.getCell('pay').numFmt = '"$"#,##0.00';
      }
    });
  }

  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet('No Data');
  }

  const filename = weekParam
    ? `timepunch-${weekParam}.xlsx`
    : 'timepunch-all.xlsx';

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
});

export default router;
```

---

- [ ] **Task 12: Express App (app.ts)**

**File:** `server/src/app.ts`

```typescript
import express from 'express';
import sessionsRouter from './routes/sessions.js';
import settingsRouter from './routes/settings.js';
import exportRouter from './routes/export.js';

const app = express();

app.use(express.json());

app.use('/api/sessions', sessionsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/export', exportRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
```

**Why:** No `listen` call here — `app.ts` is the pure Express instance used by both `index.ts` (production) and Supertest (tests). This is the standard pattern for testable Express apps.

---

- [ ] **Task 13: Server Entry Point (index.ts)**

**File:** `server/src/index.ts`

```typescript
import app from './app.js';

const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`AFL Time Punch server running on http://localhost:${PORT}`);
});
```

---

- [ ] **Task 14: Server Integration Tests**

**File:** `server/src/routes/sessions.test.ts`

```typescript
import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { resetDb } from '../db.js';

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDb();
});

describe('POST /api/sessions (clock in)', () => {
  it('creates a new active session', async () => {
    const res = await request(app).post('/api/sessions').send();
    expect(res.status).toBe(201);
    expect(res.body.clock_out).toBeNull();
    expect(res.body.pauses).toEqual([]);
    expect(res.body.id).toBeDefined();
  });

  it('rejects a second clock-in when one is active', async () => {
    await request(app).post('/api/sessions').send();
    const res = await request(app).post('/api/sessions').send();
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/sessions/:id — clock out', () => {
  it('closes the session and computes duration', async () => {
    const created = await request(app).post('/api/sessions').send();
    const id = created.body.id;
    const clockOut = new Date(Date.now() + 3600_000).toISOString();

    const res = await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ clock_out: clockOut });

    expect(res.status).toBe(200);
    expect(res.body.clock_out).toBe(clockOut);
    expect(res.body.duration_secs).toBeGreaterThan(0);
  });
});

describe('PATCH /api/sessions/:id — pause/resume', () => {
  it('opens and closes a pause with a comment', async () => {
    const created = await request(app).post('/api/sessions').send();
    const id = created.body.id;

    const pauseStart = new Date(Date.now() + 1000).toISOString();
    await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ pause_start: pauseStart });

    const pauseEnd = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ pause_end: pauseEnd, comment: 'Lunch' });

    expect(res.status).toBe(200);
    expect(res.body.pauses[0].comment).toBe('Lunch');
    expect(res.body.pauses[0].end).toBe(pauseEnd);
  });
});

describe('PATCH /api/sessions/:id — manual edit', () => {
  it('updates clock_in and recalculates duration', async () => {
    const created = await request(app).post('/api/sessions').send();
    const id = created.body.id;

    const newIn = new Date(Date.now() - 7200_000).toISOString();
    const newOut = new Date(Date.now() - 3600_000).toISOString();

    const res = await request(app)
      .patch(`/api/sessions/${id}`)
      .send({ clock_in: newIn, clock_out: newOut });

    expect(res.status).toBe(200);
    expect(res.body.clock_in).toBe(newIn);
    expect(res.body.duration_secs).toBeCloseTo(3600, -2);
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('deletes an existing session', async () => {
    const created = await request(app).post('/api/sessions').send();
    const id = created.body.id;

    const res = await request(app).delete(`/api/sessions/${id}`);
    expect(res.status).toBe(204);

    const list = await request(app).get('/api/sessions');
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for a non-existent session', async () => {
    const res = await request(app).delete('/api/sessions/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/sessions?week filter', () => {
  it('filters sessions to the given week', async () => {
    // Create a session — it will use today's date
    await request(app).post('/api/sessions').send();
    const allRes = await request(app).get('/api/sessions');
    expect(allRes.body.length).toBeGreaterThan(0);

    // Query for a past week with no data
    const pastWeek = '2020-01-06'; // A Monday far in the past
    const res = await request(app).get(`/api/sessions?week=${pastWeek}`);
    expect(res.body).toHaveLength(0);
  });
});
```

**File:** `server/src/routes/settings.test.ts`

```typescript
import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { resetDb } from '../db.js';

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  resetDb();
});

describe('GET /api/settings', () => {
  it('returns the default hourly rate', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.hourly_rate).toBe('15.00');
  });
});

describe('PUT /api/settings', () => {
  it('updates the hourly rate', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ hourly_rate: '25.00' });
    expect(res.status).toBe(200);
    expect(res.body.hourly_rate).toBe('25.00');

    const check = await request(app).get('/api/settings');
    expect(check.body.hourly_rate).toBe('25.00');
  });

  it('rejects an invalid hourly rate', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ hourly_rate: 'abc' });
    expect(res.status).toBe(400);
  });
});
```

---

- [ ] **Task 15: Client Package.json**

**File:** `client/package.json`

```json
{
  "name": "afl-time-punch-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^15.0.2",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.2.73",
    "@types/react-dom": "^18.2.23",
    "@vitejs/plugin-react": "^4.2.1",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.3",
    "vite": "^5.2.6",
    "vitest": "^1.4.0"
  }
}
```

---

- [ ] **Task 16: Client tsconfig.json**

**File:** `client/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**File:** `client/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

---

- [ ] **Task 17: Vite Config**

**File:** `client/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

**Why:** The `/api` proxy means the React dev server transparently forwards all `/api/*` requests to Express on port 3001. No CORS configuration needed in Express during development. The `test` block in vite.config.ts is the idiomatic way to configure Vitest for a Vite project.

---

- [ ] **Task 18: Client index.html**

**File:** `client/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AFL Time Punch</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

- [ ] **Task 19: Client test-setup.ts**

**File:** `client/src/test-setup.ts`

```typescript
import '@testing-library/jest-dom';
```

---

- [ ] **Task 20: Client Types**

**File:** `client/src/types.ts`

```typescript
export interface Pause {
  start: string;      // ISO 8601
  end?: string;       // ISO 8601, absent for open pause
  comment?: string;
}

export interface Session {
  id: number;
  date: string;       // YYYY-MM-DD
  clock_in: string;   // ISO 8601
  clock_out: string | null;
  duration_secs: number;
  pauses: Pause[];
  created_at: string;
}

export interface Settings {
  hourly_rate: string;
}
```

---

- [ ] **Task 21: Client API Module**

**File:** `client/src/api.ts`

```typescript
import type { Session, Settings } from './types.js';

const BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function fetchSessions(week?: string): Promise<Session[]> {
  const url = week ? `${BASE}/sessions?week=${week}` : `${BASE}/sessions`;
  const res = await fetch(url);
  return handleResponse<Session[]>(res);
}

export async function clockIn(): Promise<Session> {
  const res = await fetch(`${BASE}/sessions`, { method: 'POST' });
  return handleResponse<Session>(res);
}

export async function clockOut(id: number): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clock_out: new Date().toISOString() }),
  });
  return handleResponse<Session>(res);
}

export async function pauseSession(id: number): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pause_start: new Date().toISOString() }),
  });
  return handleResponse<Session>(res);
}

export async function resumeSession(id: number, comment?: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pause_end: new Date().toISOString(),
      ...(comment ? { comment } : {}),
    }),
  });
  return handleResponse<Session>(res);
}

export async function editSessionTimes(
  id: number,
  clockIn: string,
  clockOut?: string
): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clock_in: clockIn,
      ...(clockOut ? { clock_out: clockOut } : {}),
    }),
  });
  return handleResponse<Session>(res);
}

export async function deleteSession(id: number): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${BASE}/settings`);
  return handleResponse<Settings>(res);
}

export async function updateSettings(hourlyRate: string): Promise<Settings> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hourly_rate: hourlyRate }),
  });
  return handleResponse<Settings>(res);
}

// ── Export ────────────────────────────────────────────────────────────────────

export function exportUrl(week?: string): string {
  return week ? `${BASE}/export?week=${week}` : `${BASE}/export`;
}
```

---

- [ ] **Task 22: Client Time Utilities**

**File:** `client/src/utils/time.ts`

```typescript
import type { Pause, Session } from '../types.js';

/** Format a number of seconds as HH:MM:SS */
export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

/**
 * Return the Monday date string (YYYY-MM-DD) for the week containing dateStr.
 * Handles Sunday (day=0) as the previous Monday.
 */
export function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD → Monday-based week key */
export function getWeekKey(dateStr: string): string {
  return getWeekMonday(dateStr);
}

/** "Apr 1–7 2026" label for a given Monday date string */
export function getWeekLabel(monday: string): string {
  const start = new Date(monday + 'T00:00:00');
  const end = new Date(monday + 'T00:00:00');
  end.setDate(end.getDate() + 6);
  const monthName = start.toLocaleString('en-US', { month: 'short' });
  return `${monthName} ${start.getDate()}–${end.getDate()} ${start.getFullYear()}`;
}

/** Returns array of 7 YYYY-MM-DD strings from Monday to Sunday */
export function getWeekDays(monday: string): string[] {
  const days: string[] = [];
  const d = new Date(monday + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Group an array of sessions by their week Monday key */
export function groupByWeek(sessions: Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = getWeekKey(s.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return map;
}

/**
 * Compute elapsed active seconds for a running (or paused) session.
 *
 * - If there is an open pause (no end), time is frozen at pause.start.
 * - Otherwise, time is computed relative to Date.now().
 * - Completed pauses are subtracted.
 */
export function computeElapsedSecs(clockIn: string, pauses: Pause[]): number {
  const openPause = pauses.find(p => !p.end);
  const effectiveNow = openPause
    ? new Date(openPause.start).getTime()
    : Date.now();

  const totalMs = effectiveNow - new Date(clockIn).getTime();

  const pauseMs = pauses.reduce((sum, p) => {
    if (!p.end) return sum;
    return sum + (new Date(p.end).getTime() - new Date(p.start).getTime());
  }, 0);

  return Math.max(0, Math.floor((totalMs - pauseMs) / 1000));
}

/** Format an ISO datetime string as "HH:MM" for display */
export function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Format a date string as "Wednesday, Apr 2" */
export function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/** Today's date as YYYY-MM-DD */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
```

---

- [ ] **Task 23: Client Pay Utilities**

**File:** `client/src/utils/pay.ts`

```typescript
/**
 * Compute pay from duration in seconds and hourly rate string.
 * Returns a number (not rounded — caller decides display precision).
 */
export function computePay(durationSecs: number, hourlyRate: string): number {
  const rate = parseFloat(hourlyRate);
  if (isNaN(rate)) return 0;
  return (durationSecs / 3600) * rate;
}

/** Format a pay number as "$1,234.56" */
export function formatPay(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
```

---

- [ ] **Task 24: useSettings Hook**

**File:** `client/src/hooks/useSettings.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { fetchSettings, updateSettings } from '../api.js';
import type { Settings } from '../types.js';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({ hourly_rate: '15.00' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then(setSettings)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const saveRate = useCallback(async (rate: string) => {
    try {
      const updated = await updateSettings(rate);
      setSettings(updated);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return { settings, loading, error, saveRate };
}
```

---

- [ ] **Task 25: useSessions Hook**

**File:** `client/src/hooks/useSessions.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import {
  fetchSessions,
  clockIn as apiClockIn,
  clockOut as apiClockOut,
  pauseSession as apiPause,
  resumeSession as apiResume,
  editSessionTimes as apiEdit,
  deleteSession as apiDelete,
} from '../api.js';
import type { Session } from '../types.js';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  /** The single session without a clock_out, if any */
  const activeSession = sessions.find(s => s.clock_out === null) ?? null;

  const clockIn = useCallback(async () => {
    const created = await apiClockIn();
    setSessions(prev => [...prev, created]);
    return created;
  }, []);

  const clockOut = useCallback(async (id: number) => {
    const updated = await apiClockOut(id);
    setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const pause = useCallback(async (id: number) => {
    const updated = await apiPause(id);
    setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const resume = useCallback(async (id: number, comment?: string) => {
    const updated = await apiResume(id, comment);
    setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const editTimes = useCallback(async (id: number, clockInISO: string, clockOutISO?: string) => {
    const updated = await apiEdit(id, clockInISO, clockOutISO);
    setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const removeSession = useCallback(async (id: number) => {
    await apiDelete(id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  return {
    sessions,
    activeSession,
    loading,
    error,
    refresh,
    clockIn,
    clockOut,
    pause,
    resume,
    editTimes,
    deleteSession: removeSession,
  };
}
```

---

- [ ] **Task 26: useTimer Hook**

**File:** `client/src/hooks/useTimer.ts`

```typescript
import { useState, useEffect } from 'react';
import type { Session } from '../types.js';
import { computeElapsedSecs } from '../utils/time.js';

/**
 * Returns elapsed seconds for the active session.
 * Updates every second unless the session is paused.
 * Returns 0 when there is no active session.
 */
export function useTimer(activeSession: Session | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeSession) {
      setElapsed(0);
      return;
    }

    // Compute immediately (handles page refresh correctly)
    setElapsed(computeElapsedSecs(activeSession.clock_in, activeSession.pauses));

    // Check if session is paused (has an open pause with no end)
    const isPaused = activeSession.pauses.some(p => !p.end);
    if (isPaused) return; // Do not tick while paused

    const id = setInterval(() => {
      setElapsed(computeElapsedSecs(activeSession.clock_in, activeSession.pauses));
    }, 1000);

    return () => clearInterval(id);
  }, [activeSession]);

  return elapsed;
}
```

**Why:** Re-runs the effect whenever `activeSession` changes (identity). Because `useSessions` returns a new object reference when the session is updated (via `.map`), the effect correctly restarts when a pause is opened or closed. The immediate `setElapsed` call before the interval prevents a 1-second flash of stale time on mount.

---

- [ ] **Task 27: index.css (Dark Theme)**

**File:** `client/src/index.css`

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg-main:      #0d1117;
  --bg-panel:     #111827;
  --bg-card:      #1f2937;
  --green:        #4ade80;
  --blue:         #60a5fa;
  --yellow:       #facc15;
  --red:          #f87171;
  --text-primary: #e5e7eb;
  --text-secondary: #9ca3af;
  --text-muted:   #6b7280;
  --border:       #374151;
  --radius:       6px;
  --font:         'Inter', system-ui, -apple-system, sans-serif;
}

html, body, #root {
  height: 100%;
  background: var(--bg-main);
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.5;
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

.app-layout {
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 260px 1fr;
  grid-template-areas:
    "topbar topbar"
    "sidebar detail";
  height: 100vh;
  overflow: hidden;
}

.top-bar {
  grid-area: topbar;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
  height: 60px;
  position: sticky;
  top: 0;
  z-index: 10;
  flex-wrap: wrap;
}

.sidebar {
  grid-area: sidebar;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 12px 0;
}

.detail-panel {
  grid-area: detail;
  overflow-y: auto;
  padding: 24px;
}

/* ── Top Bar elements ─────────────────────────────────────────────────────── */

.app-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}

.timer-display {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--green);
  min-width: 90px;
}

.timer-display.paused {
  color: var(--yellow);
}

.timer-display.inactive {
  color: var(--text-muted);
}

.pay-display {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-secondary);
}

.pay-display strong {
  font-size: 14px;
  color: var(--green);
}

.rate-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.rate-input {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  padding: 4px 8px;
  width: 72px;
  font-size: 13px;
}

.rate-input:focus {
  outline: none;
  border-color: var(--blue);
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */

.btn {
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px;
  transition: opacity 0.15s;
}

.btn:hover { opacity: 0.85; }
.btn:active { opacity: 0.7; }

.btn-green  { background: var(--green);  color: #0d1117; }
.btn-red    { background: var(--red);    color: #0d1117; }
.btn-yellow { background: var(--yellow); color: #0d1117; }
.btn-blue   { background: var(--blue);   color: #0d1117; }
.btn-ghost  { background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); }

/* ── Sidebar ──────────────────────────────────────────────────────────────── */

.sidebar-section-label {
  padding: 8px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.sidebar-week-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  user-select: none;
}

.sidebar-week-header:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.sidebar-week-header.current {
  color: var(--text-primary);
  font-weight: 600;
}

.sidebar-day-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 16px 5px 28px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  border-radius: 0;
}

.sidebar-day-row:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.sidebar-day-row.selected {
  background: var(--bg-card);
  color: var(--blue);
  font-weight: 600;
}

.sidebar-day-row.today .day-name {
  color: var(--green);
}

/* ── Detail Panel ─────────────────────────────────────────────────────────── */

.detail-header {
  margin-bottom: 20px;
}

.detail-header h2 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px;
}

.detail-header .day-totals {
  color: var(--text-secondary);
  font-size: 13px;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}

/* ── Session Row ──────────────────────────────────────────────────────────── */

.session-row {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 12px 16px;
  border-left: 4px solid transparent;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.session-row.completed  { border-left-color: var(--green); }
.session-row.active     { border-left-color: var(--blue); }
.session-row.paused     { border-left-color: var(--yellow); }
.session-row.pause-entry { border-left-color: var(--yellow); opacity: 0.8; }

.session-times {
  flex: 1;
  display: flex;
  gap: 16px;
  align-items: center;
}

.session-duration {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 70px;
}

.session-pay {
  color: var(--green);
  min-width: 60px;
  font-size: 13px;
}

.session-edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 4px;
  border-radius: 4px;
  line-height: 1;
}

.session-edit-btn:hover { color: var(--text-primary); }

.session-row.edit-mode {
  flex-wrap: wrap;
  gap: 8px;
}

.time-input {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  padding: 4px 8px;
  font-size: 13px;
  width: 100px;
}

.time-input:focus { outline: none; border-color: var(--blue); }

/* ── Week Summary ─────────────────────────────────────────────────────────── */

.week-summary {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.summary-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.summary-value.green { color: var(--green); }
.summary-value.blue  { color: var(--blue); }

/* ── Pause Modal ──────────────────────────────────────────────────────────── */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-box {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 28px 32px;
  min-width: 320px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-box h3 {
  font-size: 16px;
  font-weight: 700;
}

.modal-box label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.modal-input {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  padding: 8px 12px;
  font-size: 14px;
}

.modal-input:focus { outline: none; border-color: var(--blue); }

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* ── Utility ──────────────────────────────────────────────────────────────── */

.spacer { flex: 1; }

.text-muted   { color: var(--text-muted); }
.text-green   { color: var(--green); }
.text-blue    { color: var(--blue); }
.text-yellow  { color: var(--yellow); }
```

---

- [ ] **Task 28: WeekSummary Component**

**File:** `client/src/components/WeekSummary.tsx`

```tsx
import type { Session } from '../types.js';
import { computePay, formatPay } from '../utils/pay.js';

interface Props {
  sessions: Session[];
  hourlyRate: string;
}

export function WeekSummary({ sessions, hourlyRate }: Props) {
  const completedSessions = sessions.filter(s => s.clock_out !== null);
  const totalSecs = completedSessions.reduce((sum, s) => sum + s.duration_secs, 0);
  const totalPay = computePay(totalSecs, hourlyRate);
  const totalHrs = (totalSecs / 3600).toFixed(2);

  // Count unique days worked
  const daysWorked = new Set(completedSessions.map(s => s.date)).size;

  return (
    <div className="week-summary">
      <div className="summary-item">
        <span className="summary-label">Week Hours</span>
        <span className="summary-value blue">{totalHrs}h</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Week Earned</span>
        <span className="summary-value green">{formatPay(totalPay)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Rate</span>
        <span className="summary-value">${hourlyRate}/hr</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">Days Worked</span>
        <span className="summary-value">{daysWorked}</span>
      </div>
    </div>
  );
}
```

---

- [ ] **Task 29: SessionRow Component**

**File:** `client/src/components/SessionRow.tsx`

```tsx
import { useState, useMemo } from 'react';
import type { Session, Pause } from '../types.js';
import { formatDuration, formatTime, computeElapsedSecs } from '../utils/time.js';
import { computePay, formatPay } from '../utils/pay.js';

interface Props {
  session: Session;
  hourlyRate: string;
  elapsed: number;           // From useTimer; only relevant when session is active
  onEdit: (id: number, clockIn: string, clockOut?: string) => void;
  onDelete: (id: number) => void;
}

function toLocalTimeValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function localTimeToISO(date: string, localTime: string): string {
  // date = YYYY-MM-DD, localTime = HH:MM
  return new Date(`${date}T${localTime}:00`).toISOString();
}

export function SessionRow({ session, hourlyRate, elapsed, onEdit, onDelete }: Props) {
  const isActive = session.clock_out === null;
  const isPaused = isActive && session.pauses.some((p: Pause) => !p.end);

  const [editMode, setEditMode] = useState(false);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');

  function enterEdit() {
    setEditClockIn(toLocalTimeValue(session.clock_in));
    setEditClockOut(toLocalTimeValue(session.clock_out));
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
  }

  /** Live duration preview in edit mode */
  const previewDurationSecs = useMemo(() => {
    if (!editMode) return 0;
    try {
      const inISO = localTimeToISO(session.date, editClockIn);
      const outISO = editClockOut ? localTimeToISO(session.date, editClockOut) : null;
      if (!outISO) return 0;
      const totalMs = new Date(outISO).getTime() - new Date(inISO).getTime();
      const pauseMs = session.pauses.reduce((sum: number, p: Pause) => {
        if (!p.end) return sum;
        return sum + (new Date(p.end).getTime() - new Date(p.start).getTime());
      }, 0);
      return Math.max(0, Math.floor((totalMs - pauseMs) / 1000));
    } catch {
      return 0;
    }
  }, [editMode, editClockIn, editClockOut, session]);

  async function saveEdit() {
    const inISO = localTimeToISO(session.date, editClockIn);
    const outISO = editClockOut ? localTimeToISO(session.date, editClockOut) : undefined;
    onEdit(session.id, inISO, outISO);
    setEditMode(false);
  }

  const displaySecs = isActive ? elapsed : session.duration_secs;
  const pay = computePay(displaySecs, hourlyRate);

  let rowClass = 'session-row';
  if (isActive && isPaused) rowClass += ' paused';
  else if (isActive) rowClass += ' active';
  else rowClass += ' completed';
  if (editMode) rowClass += ' edit-mode';

  if (!editMode) {
    return (
      <div className={rowClass}>
        <div className="session-times">
          <span>{formatTime(session.clock_in)}</span>
          <span className="text-muted">→</span>
          <span>{isActive ? (isPaused ? 'PAUSED' : 'NOW') : formatTime(session.clock_out)}</span>
        </div>
        <span className="session-duration">{formatDuration(displaySecs)}</span>
        <span className="session-pay">{formatPay(pay)}</span>

        {/* Pause sub-rows */}
        {session.pauses.map((p: Pause, i: number) => (
          <div key={i} className="session-row pause-entry" style={{ marginTop: 4, width: '100%', fontSize: 12 }}>
            <span className="text-yellow">⏸ Pause</span>
            <span className="text-muted" style={{ marginLeft: 8 }}>
              {formatTime(p.start)} → {p.end ? formatTime(p.end) : 'open'}
            </span>
            {p.comment && <span className="text-muted" style={{ marginLeft: 8 }}>"{p.comment}"</span>}
          </div>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="session-edit-btn" onClick={enterEdit} title="Edit times">✏</button>
          <button className="session-edit-btn" onClick={() => onDelete(session.id)} title="Delete">✕</button>
        </div>
      </div>
    );
  }

  // Edit mode
  return (
    <div className={rowClass}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Clock In</label>
      <input
        type="time"
        className="time-input"
        value={editClockIn}
        onChange={e => setEditClockIn(e.target.value)}
      />
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Clock Out</label>
      <input
        type="time"
        className="time-input"
        value={editClockOut}
        placeholder="active"
        onChange={e => setEditClockOut(e.target.value)}
      />
      <span className="session-duration" style={{ marginLeft: 8 }}>
        {editClockOut ? formatDuration(previewDurationSecs) : '--:--:--'}
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button className="btn btn-green" style={{ padding: '4px 10px' }} onClick={saveEdit}>✓</button>
        <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={cancelEdit}>✕</button>
      </div>
    </div>
  );
}
```

---

- [ ] **Task 30: PauseModal Component**

**File:** `client/src/components/PauseModal.tsx`

```tsx
import { useState } from 'react';

interface Props {
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}

export function PauseModal({ onConfirm, onCancel }: Props) {
  const [comment, setComment] = useState('');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Resume Session</h3>
        <label>
          Break comment (optional)
          <input
            className="modal-input"
            type="text"
            placeholder="e.g. Lunch break"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirm(comment)}
            autoFocus
          />
        </label>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-green" onClick={() => onConfirm(comment)}>Resume</button>
        </div>
      </div>
    </div>
  );
}
```

---

- [ ] **Task 31: Sidebar Component**

**File:** `client/src/components/Sidebar.tsx`

```tsx
import { useState, useMemo } from 'react';
import type { Session } from '../types.js';
import {
  groupByWeek,
  getWeekLabel,
  getWeekDays,
  getWeekKey,
  getWeekMonday,
  todayStr,
} from '../utils/time.js';

interface Props {
  sessions: Session[];
  selectedDay: string;           // YYYY-MM-DD
  onSelectDay: (day: string) => void;
}

export function Sidebar({ sessions, selectedDay, onSelectDay }: Props) {
  const today = todayStr();
  const currentWeekMonday = getWeekMonday(today);

  // Weeks that have sessions, sorted descending
  const weekMap = useMemo(() => groupByWeek(sessions), [sessions]);
  const sortedWeeks = useMemo(
    () => [...weekMap.keys()].sort().reverse(),
    [weekMap]
  );

  // Current week always expanded; past weeks collapsed by default
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(
    new Set([currentWeekMonday])
  );

  function toggleWeek(monday: string) {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });
  }

  // Separate current week from past weeks
  const currentWeekSessions = weekMap.get(currentWeekMonday) ?? [];
  const pastWeeks = sortedWeeks.filter(w => w !== currentWeekMonday);

  function renderWeek(monday: string, isCurrent: boolean) {
    const weekSessions = weekMap.get(monday) ?? [];
    const isExpanded = expandedWeeks.has(monday);
    const totalSecs = weekSessions
      .filter(s => s.clock_out !== null)
      .reduce((sum, s) => sum + s.duration_secs, 0);
    const totalHrs = (totalSecs / 3600).toFixed(1);
    const days = getWeekDays(monday);

    return (
      <div key={monday}>
        <div
          className={`sidebar-week-header ${isCurrent ? 'current' : ''}`}
          onClick={() => toggleWeek(monday)}
        >
          <span>{isExpanded ? '▼' : '▶'} {getWeekLabel(monday)}</span>
          <span style={{ fontSize: 12 }}>{totalHrs}h</span>
        </div>
        {isExpanded && days.map(day => {
          const daySessions = weekSessions.filter(s => s.date === day);
          const daySecs = daySessions
            .filter(s => s.clock_out !== null)
            .reduce((sum, s) => sum + s.duration_secs, 0);
          const dayHrs = daySecs > 0 ? `${(daySecs / 3600).toFixed(1)}h` : '';
          const dayName = new Date(day + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });

          return (
            <div
              key={day}
              className={`sidebar-day-row ${selectedDay === day ? 'selected' : ''} ${day === today ? 'today' : ''}`}
              onClick={() => onSelectDay(day)}
            >
              <span className="day-name">{dayName}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayHrs}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-section-label">Current Week</div>
      {renderWeek(currentWeekMonday, true)}

      {pastWeeks.length > 0 && (
        <>
          <div className="sidebar-section-label" style={{ marginTop: 12 }}>Past Weeks</div>
          {pastWeeks.map(w => renderWeek(w, false))}
        </>
      )}
    </div>
  );
}
```

---

- [ ] **Task 32: DetailPanel Component**

**File:** `client/src/components/DetailPanel.tsx`

```tsx
import type { Session } from '../types.js';
import { SessionRow } from './SessionRow.js';
import { WeekSummary } from './WeekSummary.js';
import { formatDayLabel, getWeekKey } from '../utils/time.js';
import { computePay, formatPay } from '../utils/pay.js';

interface Props {
  selectedDay: string;              // YYYY-MM-DD
  sessions: Session[];              // ALL sessions (we filter here)
  hourlyRate: string;
  activeSession: Session | null;
  elapsed: number;                  // from useTimer
  onEdit: (id: number, clockIn: string, clockOut?: string) => void;
  onDelete: (id: number) => void;
}

export function DetailPanel({
  selectedDay,
  sessions,
  hourlyRate,
  activeSession,
  elapsed,
  onEdit,
  onDelete,
}: Props) {
  // Sessions for the selected day
  const daySessions = sessions.filter(s => s.date === selectedDay);

  // Sessions for the week containing selectedDay (for WeekSummary)
  const weekKey = getWeekKey(selectedDay);
  const weekSessions = sessions.filter(s => getWeekKey(s.date) === weekKey);

  // Day totals
  const completedDaySecs = daySessions
    .filter(s => s.clock_out !== null)
    .reduce((sum, s) => sum + s.duration_secs, 0);
  const dayPay = computePay(completedDaySecs, hourlyRate);

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <h2>{formatDayLabel(selectedDay)}</h2>
        <div className="day-totals">
          {(completedDaySecs / 3600).toFixed(2)}h worked &nbsp;·&nbsp; {formatPay(dayPay)} earned
        </div>
      </div>

      <div className="session-list">
        {daySessions.length === 0 && (
          <p className="text-muted">No sessions recorded for this day.</p>
        )}
        {daySessions.map(s => (
          <SessionRow
            key={s.id}
            session={s}
            hourlyRate={hourlyRate}
            elapsed={activeSession?.id === s.id ? elapsed : s.duration_secs}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      <WeekSummary sessions={weekSessions} hourlyRate={hourlyRate} />
    </div>
  );
}
```

---

- [ ] **Task 33: TopBar Component**

**File:** `client/src/components/TopBar.tsx`

```tsx
import { useState } from 'react';
import type { Session } from '../types.js';
import { formatDuration, todayStr, getWeekKey } from '../utils/time.js';
import { computePay, formatPay } from '../utils/pay.js';
import { exportUrl } from '../api.js';

interface Props {
  activeSession: Session | null;
  sessions: Session[];
  elapsed: number;
  hourlyRate: string;
  onClockIn: () => void;
  onClockOut: () => void;
  onPause: () => void;
  onResume: () => void;
  onRateChange: (rate: string) => void;
}

export function TopBar({
  activeSession,
  sessions,
  elapsed,
  hourlyRate,
  onClockIn,
  onClockOut,
  onPause,
  onResume,
  onRateChange,
}: Props) {
  const [rateInput, setRateInput] = useState(hourlyRate);
  const isPaused = activeSession?.pauses.some(p => !p.end) ?? false;

  // Sync external rate changes into local input
  if (rateInput !== hourlyRate && document.activeElement?.className !== 'rate-input') {
    setRateInput(hourlyRate);
  }

  // Today's pay
  const today = todayStr();
  const todaySecs = sessions
    .filter(s => s.date === today && s.clock_out !== null)
    .reduce((sum, s) => sum + s.duration_secs, 0);
  const todayPay = computePay(todaySecs + (activeSession?.date === today ? elapsed : 0), hourlyRate);

  // This week's pay
  const currentWeekKey = getWeekKey(today);
  const weekSecs = sessions
    .filter(s => getWeekKey(s.date) === currentWeekKey && s.clock_out !== null)
    .reduce((sum, s) => sum + s.duration_secs, 0);
  const weekPay = computePay(weekSecs + (activeSession && getWeekKey(activeSession.date) === currentWeekKey ? elapsed : 0), hourlyRate);

  function handleRateBlur() {
    const parsed = parseFloat(rateInput);
    if (!isNaN(parsed) && parsed > 0) {
      onRateChange(parsed.toFixed(2));
    } else {
      setRateInput(hourlyRate);
    }
  }

  function handleExport() {
    window.location.href = exportUrl();
  }

  let timerClass = 'timer-display';
  if (!activeSession) timerClass += ' inactive';
  else if (isPaused) timerClass += ' paused';

  return (
    <div className="top-bar">
      <span className="app-name">AFL Time Punch</span>

      <span className={timerClass}>
        {formatDuration(activeSession ? elapsed : 0)}
      </span>

      {/* Action buttons — state-driven */}
      {!activeSession && (
        <button className="btn btn-green" onClick={onClockIn}>CLOCK IN</button>
      )}
      {activeSession && !isPaused && (
        <>
          <button className="btn btn-red" onClick={onClockOut}>CLOCK OUT</button>
          <button className="btn btn-yellow" onClick={onPause}>PAUSE</button>
        </>
      )}
      {activeSession && isPaused && (
        <button className="btn btn-blue" onClick={onResume}>RESUME</button>
      )}

      <div className="spacer" />

      {/* Pay displays */}
      <div className="pay-display">
        <span>Today</span>
        <strong>{formatPay(todayPay)}</strong>
      </div>
      <div className="pay-display">
        <span>This Week</span>
        <strong>{formatPay(weekPay)}</strong>
      </div>

      {/* Rate input */}
      <div className="rate-input-wrap">
        <span>$/hr</span>
        <input
          className="rate-input"
          type="number"
          min="0"
          step="0.50"
          value={rateInput}
          onChange={e => setRateInput(e.target.value)}
          onBlur={handleRateBlur}
          onKeyDown={e => e.key === 'Enter' && handleRateBlur()}
        />
      </div>

      {/* Export */}
      <button className="btn btn-ghost" onClick={handleExport}>Export XLSX</button>
    </div>
  );
}
```

---

- [ ] **Task 34: App.tsx (Root Orchestrator)**

**File:** `client/src/App.tsx`

```tsx
import { useState } from 'react';
import { useSessions } from './hooks/useSessions.js';
import { useSettings } from './hooks/useSettings.js';
import { useTimer } from './hooks/useTimer.js';
import { TopBar } from './components/TopBar.js';
import { Sidebar } from './components/Sidebar.js';
import { DetailPanel } from './components/DetailPanel.js';
import { PauseModal } from './components/PauseModal.js';
import { todayStr } from './utils/time.js';

export default function App() {
  const {
    sessions,
    activeSession,
    clockIn,
    clockOut,
    pause,
    resume,
    editTimes,
    deleteSession,
  } = useSessions();

  const { settings, saveRate } = useSettings();
  const elapsed = useTimer(activeSession);

  const [selectedDay, setSelectedDay] = useState(todayStr());
  const [showPauseModal, setShowPauseModal] = useState(false);

  async function handleClockIn() {
    await clockIn();
    setSelectedDay(todayStr());
  }

  async function handleClockOut() {
    if (!activeSession) return;
    await clockOut(activeSession.id);
  }

  async function handlePause() {
    if (!activeSession) return;
    await pause(activeSession.id);
  }

  function handleResumeClick() {
    setShowPauseModal(true);
  }

  async function handleResumeConfirm(comment: string) {
    if (!activeSession) return;
    await resume(activeSession.id, comment || undefined);
    setShowPauseModal(false);
  }

  function handleResumeCancel() {
    setShowPauseModal(false);
  }

  return (
    <div className="app-layout">
      <TopBar
        activeSession={activeSession}
        sessions={sessions}
        elapsed={elapsed}
        hourlyRate={settings.hourly_rate}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
        onPause={handlePause}
        onResume={handleResumeClick}
        onRateChange={saveRate}
      />

      <Sidebar
        sessions={sessions}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <DetailPanel
        selectedDay={selectedDay}
        sessions={sessions}
        hourlyRate={settings.hourly_rate}
        activeSession={activeSession}
        elapsed={elapsed}
        onEdit={editTimes}
        onDelete={deleteSession}
      />

      {showPauseModal && (
        <PauseModal
          onConfirm={handleResumeConfirm}
          onCancel={handleResumeCancel}
        />
      )}
    </div>
  );
}
```

---

- [ ] **Task 35: main.tsx**

**File:** `client/src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

- [ ] **Task 36: Client Unit Tests**

**File:** `client/src/utils/time.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  getWeekMonday,
  getWeekKey,
  getWeekLabel,
  getWeekDays,
  computeElapsedSecs,
} from './time.js';

describe('formatDuration', () => {
  it('formats 0 as 00:00:00', () => expect(formatDuration(0)).toBe('00:00:00'));
  it('formats 3661 as 01:01:01', () => expect(formatDuration(3661)).toBe('01:01:01'));
  it('formats 3600 as 01:00:00', () => expect(formatDuration(3600)).toBe('01:00:00'));
});

describe('getWeekMonday', () => {
  it('returns the same day for a Monday', () => {
    expect(getWeekMonday('2026-03-30')).toBe('2026-03-30'); // Monday
  });
  it('returns the previous Monday for a Wednesday', () => {
    expect(getWeekMonday('2026-04-01')).toBe('2026-03-30');
  });
  it('returns the previous Monday for a Sunday', () => {
    expect(getWeekMonday('2026-04-05')).toBe('2026-03-30');
  });
});

describe('getWeekLabel', () => {
  it('produces a correct label for a known week', () => {
    expect(getWeekLabel('2026-03-30')).toBe('Mar 30–5 2026');
  });
});

describe('getWeekDays', () => {
  it('returns 7 days starting from Monday', () => {
    const days = getWeekDays('2026-03-30');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-03-30');
    expect(days[6]).toBe('2026-04-05');
  });
});

describe('computeElapsedSecs', () => {
  it('returns 0 for no time passed', () => {
    const clockIn = new Date(Date.now() - 0).toISOString();
    expect(computeElapsedSecs(clockIn, [])).toBe(0);
  });

  it('subtracts completed pause time', () => {
    const base = Date.now() - 7200_000; // 2 hours ago
    const clockIn = new Date(base).toISOString();
    const pauses = [
      {
        start: new Date(base + 1800_000).toISOString(), // 30 min in
        end: new Date(base + 3600_000).toISOString(),   // 30 min break
      },
    ];
    const elapsed = computeElapsedSecs(clockIn, pauses);
    // 2 hours total - 30 min pause = 90 min = 5400 secs (approx, within 2s)
    expect(elapsed).toBeGreaterThan(5390);
    expect(elapsed).toBeLessThan(5410);
  });

  it('freezes at pause start when pause is open', () => {
    const base = Date.now() - 3600_000;
    const clockIn = new Date(base).toISOString();
    const pauseStart = new Date(base + 1800_000).toISOString(); // 30 min in
    const pauses = [{ start: pauseStart }]; // open pause

    const elapsed = computeElapsedSecs(clockIn, pauses);
    // Should be frozen at 30 min = 1800 secs
    expect(elapsed).toBeGreaterThan(1790);
    expect(elapsed).toBeLessThan(1810);
  });
});
```

**File:** `client/src/utils/pay.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { computePay, formatPay } from './pay.js';

describe('computePay', () => {
  it('computes pay correctly', () => {
    expect(computePay(3600, '20.00')).toBeCloseTo(20);
    expect(computePay(1800, '20.00')).toBeCloseTo(10);
    expect(computePay(0, '20.00')).toBe(0);
  });

  it('returns 0 for invalid rate', () => {
    expect(computePay(3600, 'abc')).toBe(0);
  });
});

describe('formatPay', () => {
  it('formats as USD currency', () => {
    expect(formatPay(20)).toBe('$20.00');
    expect(formatPay(1234.5)).toBe('$1,234.50');
  });
});
```

---

- [ ] **Task 37: data/ Directory**

The `data/` directory must exist at the project root before the server starts in production mode. It is gitignored. Create it manually after cloning, or add a `postinstall` script at the root level:

```json
"postinstall": "node -e \"require('fs').mkdirSync('data', { recursive: true })\""
```

This should be added to the root `package.json` scripts block. It runs after `npm install` and is safe to re-run.

---

## Dependency & Sequencing Summary

The build must be executed in this order to avoid import errors or missing type references:

1. Root `package.json` + `.gitignore`
2. `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`
3. `server/src/types.ts`
4. `server/src/db.ts`
5. `server/src/utils/duration.ts`
6. `server/src/routes/sessions.ts`, `settings.ts`, `export.ts`
7. `server/src/app.ts`, `server/src/index.ts`
8. `server/src/routes/sessions.test.ts`, `settings.test.ts`
9. `client/package.json`, `client/tsconfig.json`, `client/tsconfig.node.json`, `client/vite.config.ts`
10. `client/index.html`
11. `client/src/test-setup.ts`, `client/src/types.ts`
12. `client/src/api.ts`
13. `client/src/utils/time.ts`, `client/src/utils/pay.ts`
14. `client/src/hooks/useSettings.ts`, `client/src/hooks/useSessions.ts`, `client/src/hooks/useTimer.ts`
15. `client/src/components/WeekSummary.tsx`
16. `client/src/components/SessionRow.tsx`
17. `client/src/components/PauseModal.tsx`
18. `client/src/components/Sidebar.tsx`
19. `client/src/components/DetailPanel.tsx`
20. `client/src/components/TopBar.tsx`
21. `client/src/App.tsx`
22. `client/src/main.tsx`
23. `client/src/index.css`
24. `client/src/utils/time.test.ts`, `client/src/utils/pay.test.ts`
25. Root `data/` directory creation

---

## Known Trade-offs and Implementation Notes

**Timezone on POST /api/sessions:** `new Date().toISOString()` produces UTC. The `date` column is derived by slicing the first 10 characters of that UTC string. For a user in UTC-5, a session clocked in at 11pm local time will have `date = next-day-UTC`. For a personal local app, the simplest fix is to pass the local date from the client in the POST body. The current plan documents this as a known issue — the simplest production fix is to add `date` as an optional POST body field and default to the server's UTC date only if omitted.

**`useTimer` reference stability:** `useSessions` returns a new `Session` object reference from `.map()` on every mutation. This means `useEffect` in `useTimer` correctly detects pause state changes via the `activeSession` dependency. This is intentional.

**ExcelJS async write:** `await workbook.xlsx.write(res)` streams directly to the HTTP response. No temp file is created. This is correct for single-user local usage.

**`better-sqlite3` and ESM:** `better-sqlite3` v9 ships CommonJS only. With `"type": "module"` in `server/package.json`, the import `import Database from 'better-sqlite3'` works because Node.js allows CJS default imports in ESM context when `esModuleInterop` is enabled in `tsconfig`. The `tsx` runtime handles this transparently.

---

### Critical Files for Implementation

- `/c/Users/hunte/afl-time-punch/server/src/db.ts`
- `/c/Users/hunte/afl-time-punch/server/src/routes/sessions.ts`
- `/c/Users/hunte/afl-time-punch/client/src/App.tsx`
- `/c/Users/hunte/afl-time-punch/client/src/hooks/useSessions.ts`
- `/c/Users/hunte/afl-time-punch/client/src/utils/time.ts`
