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
  const rate = parseFloat(hourly_rate);
  if (!hourly_rate || isNaN(rate) || rate < 0) {
    return res.status(400).json({ error: 'Invalid hourly_rate value.' });
  }
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('hourly_rate', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(hourly_rate);
  res.json({ hourly_rate });
});

export default router;
