import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db.js';
import type { Pause, SessionRow } from '../types.js';
import { computeDurationSecs, localDateStr } from '../utils/duration.js';

const router = Router();

function parseSession(row: SessionRow) {
  return {
    ...row,
    pauses: JSON.parse(row.pauses) as Pause[],
  };
}

function weekEnd(saturday: string): string {
  const d = new Date(saturday + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return localDateStr(d);
}

router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const week = req.query.week as string | undefined;

  if (week) {
    const friday = weekEnd(week);
    const rows = db
      .prepare('SELECT * FROM sessions WHERE date >= ? AND date <= ? ORDER BY clock_in ASC')
      .all(week, friday) as SessionRow[];
    return res.json(rows.map(parseSession));
  }

  const rows = db
    .prepare('SELECT * FROM sessions ORDER BY clock_in ASC')
    .all() as SessionRow[];
  res.json(rows.map(parseSession));
});

router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const body = req.body as { clock_in?: string; clock_out?: string } | undefined;
  const isManual = !!(body?.clock_in);

  // Punch mode: block if a session is already open
  // Manual mode with no clock_out: also block — would create a second open session
  const needsActiveCheck = !isManual || (isManual && !body?.clock_out);
  if (needsActiveCheck) {
    const active = db
      .prepare('SELECT id FROM sessions WHERE clock_out IS NULL')
      .get();
    if (active) {
      return res.status(409).json({ error: 'An active session already exists.' });
    }
  }

  const clockIn = isManual ? body!.clock_in! : new Date().toISOString();
  const clockOut = isManual ? (body!.clock_out ?? null) : null;

  if (isManual) {
    if (isNaN(Date.parse(clockIn))) {
      return res.status(400).json({ error: 'Invalid clock_in timestamp.' });
    }
    if (clockOut !== null) {
      if (isNaN(Date.parse(clockOut))) {
        return res.status(400).json({ error: 'Invalid clock_out timestamp.' });
      }
      if (clockOut <= clockIn) {
        return res.status(400).json({ error: 'clock_out must be after clock_in.' });
      }
    }
  }

  const date = clockIn.slice(0, 10);
  const durationSecs = clockOut ? computeDurationSecs(clockIn, clockOut, []) : 0;

  const result = db
    .prepare(
      'INSERT INTO sessions (date, clock_in, clock_out, duration_secs, pauses) VALUES (?, ?, ?, ?, ?)'
    )
    .run(date, clockIn, clockOut, durationSecs, '[]');

  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(result.lastInsertRowid) as SessionRow;

  res.status(201).json(parseSession(row));
});

router.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = Number(req.params.id);
  const body = req.body as Record<string, string>;

  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;

  if (!row) return res.status(404).json({ error: 'Session not found.' });

  let pauses: Pause[] = JSON.parse(row.pauses);

  if ('clock_out' in body && !('clock_in' in body)) {
    if (row.clock_out) {
      return res.status(409).json({ error: 'Session is already clocked out.' });
    }
    const clockOut = body.clock_out;
    pauses = pauses.map(p => (!p.end ? { ...p, end: clockOut } : p));
    const durationSecs = computeDurationSecs(row.clock_in, clockOut, pauses);
    db.prepare(
      'UPDATE sessions SET clock_out = ?, duration_secs = ?, pauses = ? WHERE id = ?'
    ).run(clockOut, durationSecs, JSON.stringify(pauses), id);
  } else if ('pause_start' in body) {
    const openPause = pauses.find(p => !p.end);
    if (openPause) {
      return res.status(409).json({ error: 'A pause is already open.' });
    }
    pauses.push({ start: body.pause_start });
    db.prepare('UPDATE sessions SET pauses = ? WHERE id = ?').run(
      JSON.stringify(pauses),
      id
    );
  } else if ('pause_end' in body) {
    const openIndex = pauses.findIndex(p => !p.end);
    if (openIndex === -1) {
      return res.status(409).json({ error: 'No open pause to close.' });
    }
    pauses[openIndex] = {
      ...pauses[openIndex],
      end: body.pause_end,
      ...(body.comment ? { comment: body.comment } : {}),
    };
    const pausesJson = JSON.stringify(pauses);
    if (row.clock_out) {
      const durationSecs = computeDurationSecs(row.clock_in, row.clock_out, pauses);
      db.prepare(
        'UPDATE sessions SET pauses = ?, duration_secs = ? WHERE id = ?'
      ).run(pausesJson, durationSecs, id);
    } else {
      db.prepare('UPDATE sessions SET pauses = ? WHERE id = ?').run(pausesJson, id);
    }
  } else if ('clock_in' in body) {
    const newClockIn = body.clock_in;
    const newClockOut = body.clock_out ?? row.clock_out ?? null;
    const newDate = newClockIn.slice(0, 10);
    const durationSecs = computeDurationSecs(newClockIn, newClockOut, pauses);
    db.prepare(
      'UPDATE sessions SET date = ?, clock_in = ?, clock_out = ?, duration_secs = ? WHERE id = ?'
    ).run(newDate, newClockIn, newClockOut, durationSecs, id);
  } else {
    return res.status(400).json({ error: 'Unrecognized PATCH action.' });
  }

  const updated = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow;
  res.json(parseSession(updated));
});

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
