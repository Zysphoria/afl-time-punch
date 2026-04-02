# AFL Time Punch — Design Spec
_Created: 2026-04-02_

## Context

A personal time-tracking web app to replace manual logging. Needs to auto-calculate hours worked, support breaks with comments, compute pay based on an editable hourly rate, and export to Excel. Single-user, runs locally with data persisted in SQLite.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React + Vite (TypeScript) |
| Backend | Express (Node.js) |
| Database | SQLite via `better-sqlite3` |
| Excel export | `exceljs` |
| Dev runner | `concurrently` (one `npm run dev` starts both) |

---

## Architecture

```
afl-time-punch/
├── client/               # Vite + React (TypeScript)
│   └── src/
│       ├── components/   # UI components (see below)
│       ├── hooks/        # useTimer, useSessions, useSettings
│       └── api.ts        # typed fetch wrappers for Express routes
├── server/               # Express API
│   ├── db.ts             # SQLite init + schema migration
│   ├── routes/
│   │   ├── sessions.ts   # CRUD for sessions
│   │   ├── settings.ts   # hourly rate
│   │   └── export.ts     # XLSX generation
│   └── index.ts          # app entry, mounts routes
├── package.json          # root: scripts.dev = concurrently client + server
└── .gitignore            # includes .superpowers/
```

---

## Data Model (SQLite)

### `sessions` table

```sql
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,           -- YYYY-MM-DD (Mon–Sun week boundary)
  clock_in      TEXT NOT NULL,           -- ISO 8601 datetime
  clock_out     TEXT,                    -- ISO 8601 datetime, NULL if active
  duration_secs INTEGER NOT NULL DEFAULT 0,
  pauses        TEXT NOT NULL DEFAULT '[]', -- JSON: [{start, end, comment}]
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Pauses JSON shape:**
```json
[
  { "start": "2026-04-02T12:00:00.000Z", "end": "2026-04-02T12:43:00.000Z", "comment": "Lunch break" }
]
```

- `duration_secs` = total active time (clock_out - clock_in, minus all pause durations). Recomputed on every PATCH.
- A session with `clock_out = NULL` is the active session. At most one can exist at a time.
- Pauses stored as JSON on the session row — avoids a join for what is always a small list.

### `settings` table

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Seed: INSERT OR IGNORE INTO settings VALUES ('hourly_rate', '15.00');
```

---

## API Routes

All routes under `/api`. Server runs on port **3001** in dev.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | All sessions. Optional `?week=YYYY-Www` filter. |
| POST | `/api/sessions` | Clock in — creates session with `clock_in = now`. |
| PATCH | `/api/sessions/:id` | Update session: clock out, add/close pause, or edit clock_in/clock_out times. |
| DELETE | `/api/sessions/:id` | Delete a session. |
| GET | `/api/settings` | Returns `{ hourly_rate: string }`. |
| PUT | `/api/settings` | Updates hourly rate. Body: `{ hourly_rate: string }`. |
| GET | `/api/export` | Download `.xlsx`. Optional `?week=YYYY-Www` for single week. |

**PATCH `/api/sessions/:id` actions (discriminated by body field):**
- `{ clock_out: ISO }` — clock out
- `{ pause_start: ISO }` — begin a pause
- `{ pause_end: ISO, comment?: string }` — end the active pause, attach comment
- `{ clock_in: ISO, clock_out?: ISO }` — manual time edit (inline edit UI); `clock_out` omitted for active sessions

---

## UI Layout

**Top Bar (sticky):**
- App name
- Live timer (`HH:MM:SS`, driven by `useTimer`)
- Clock In / Clock Out / Pause / Resume buttons (state-driven: only relevant action shown)
- Today's pay (`hours × rate`, updates live)
- This week's pay (sum of all sessions in current Mon–Sun week)
- Hourly rate input (editable inline, saved on blur/enter)
- Export XLSX button (downloads current week; full history if no week selected)

**Left Sidebar:**
- "Current Week" section: current Mon–Sun week expanded by default, days listed with hours worked. Today highlighted.
- "Past Weeks" section: prior weeks collapsed as `▶ Apr 1–7  38.5h` rows, click to expand/collapse.
- Clicking a day loads it in the Detail Panel.

**Detail Panel (main area):**
- Header: day name, total hours, total pay for that day.
- Session rows — one per clock-in/clock-out entry:
  - Green left border: completed session
  - Blue left border: active (in-progress) session
  - Yellow left border: pause entry (read-only, shows comment if set)
  - ✏ pencil icon on session rows (not pauses): click to enter inline edit mode
- **Inline edit mode:** times become `<input type="time">` fields; duration recalculates live; ✓ save / ✕ cancel buttons.
- Week Summary bar at bottom: total hours, total earned, rate, days worked this week.

**Pause → Resume flow:**
1. User clicks Pause → session's active pause starts, timer pauses.
2. User clicks Resume → `PauseModal` appears with optional comment field.
3. On confirm → pause closed with comment, timer resumes.

---

## Components

| Component | Responsibility |
|-----------|---------------|
| `TopBar` | Timer, action buttons, pay display, rate input, export trigger |
| `Sidebar` | Week/day tree, expand/collapse, day selection |
| `DetailPanel` | Day header, session log, week summary bar |
| `SessionRow` | Single session entry; owns inline edit state |
| `PauseModal` | Resume dialog with optional comment |
| `WeekSummary` | Hours/pay/rate/days summary strip |

## Hooks

| Hook | Responsibility |
|------|---------------|
| `useTimer` | `setInterval` tick; computes elapsed from `clock_in` ISO string. Resumes correctly after page refresh. |
| `useSessions` | Fetches sessions from API, exposes mutators (clockIn, clockOut, pause, resume, editTimes, deleteSession). |
| `useSettings` | Reads/writes `hourly_rate` via API. |

---

## Excel Export Format

One `.xlsx` file. One sheet per week (tab named `Apr 1–7 2026`). One row per session:

| Date | Clock In | Clock Out | Duration (hrs) | Pauses | Break Comments | Pay ($) |
|------|----------|-----------|----------------|--------|----------------|---------|

- Pauses column: count of breaks.
- Break Comments column: all comments joined by `;`.
- Pay column: `duration_hrs × hourly_rate` at time of export.
- Final row per sheet: totals for hours and pay.

---

## Pay Calculation Rules

- **Straight hourly rate only** — no overtime multiplier.
- `duration_secs` excludes all pause time.
- `pay = (duration_secs / 3600) × hourly_rate`
- Rate is read from `settings` at display/export time. Changing the rate updates all displayed values immediately (no historical rate locking).
- Week boundary: **Monday 00:00 → Sunday 23:59** (local time).

---

## Verification

1. `npm run dev` starts both Vite (`:5173`) and Express (`:3001`) via concurrently.
2. Clock in → timer increments live in top bar.
3. Pause → timer stops; Resume → modal appears, comment saved, timer resumes.
4. Clock out → session row appears in detail panel with correct duration.
5. Click ✏ on a session row → times become editable; change a time → duration updates live → save → detail panel reflects new values, pay recalculates.
6. Change hourly rate → today's pay and week pay update immediately.
7. Sidebar: current week shows today's hours; past week collapses/expands.
8. Export XLSX → file downloads; open in Excel → correct rows, correct totals.
9. Restart server → active session resumes (timer picks up from stored `clock_in`).
