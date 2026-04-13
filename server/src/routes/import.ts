import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { getDb } from '../db.js';
import { computeDurationSecs } from '../utils/duration.js';
import type { Pause } from '../types.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.xlsx') &&
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    cb(null, ok || file.mimetype === 'application/octet-stream'); // allow octet-stream fallback
  },
});

type CellValue = string | number | boolean | Date | null | undefined;

/** Parse a cell value to a YYYY-MM-DD string, or null if unrecognised. */
function parseDate(value: CellValue): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    // Use local date components — SheetJS Date objects represent calendar dates in local TZ
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  if (!str) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // MM/DD/YYYY or M/D/YYYY
  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, mo, d, y] = mdyMatch;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Let JS Date parse common English formats ("Apr 10, 2026", etc.)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/** Parse a cell value into an ISO timestamp given the date string for that row. */
function parseTime(value: CellValue, dateStr: string): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    // SheetJS creates time-only cells using the local-time Date constructor, so the
    // time fraction (e.g. 0.34375 = 8:15 AM) is stored in local clock hours.
    // Use getHours/getMinutes (local), not getUTCHours, to read the correct value.
    const h = value.getHours();
    const m = value.getMinutes();
    const s = value.getSeconds();
    // Building the ISO string from a local-time template is intentional: in Electron
    // the server runs in the same process as the OS, so local TZ === user's TZ.
    return new Date(
      `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    ).toISOString();
  }

  // Numeric time fraction (e.g. 0.34375 = 8:15 AM) — fallback if cellDates didn't convert
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const totalMins = Math.round(value * 24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
  }

  const str = String(value).trim();
  if (!str) return null;

  // HH:MM, H:MM, HH:MM:SS, with optional AM/PM
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const secs = match[3] ? parseInt(match[3], 10) : 0;
    const ampm = match[4]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return new Date(
      `${dateStr}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    ).toISOString();
  }

  return null;
}

router.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Ensure the file is a valid .xlsx under 10 MB.' });
  }

  const isPreview = req.query.preview === 'true';

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  } catch {
    return res.status(400).json({ error: 'Could not parse file. Ensure it is a valid .xlsx file.' });
  }

  if (workbook.SheetNames.length === 0) {
    return res.status(400).json({ error: 'Spreadsheet has no worksheets.' });
  }

  // Read headers from row 1 of the first sheet (SheetJS rows/cols are 0-based)
  const firstWs = workbook.Sheets[workbook.SheetNames[0]];
  const firstRows = XLSX.utils.sheet_to_json<CellValue[]>(firstWs, {
    header: 1, raw: true, defval: null,
  });
  const headers = ((firstRows[0] as CellValue[]) ?? [])
    .map(v => String(v ?? '').trim())
    .filter(Boolean);

  if (isPreview) return res.json(headers);

  // Column indices are 0-based from client
  const dateColIdx   = parseInt(String(req.body.dateCol    ?? '0'), 10);
  const clockInColIdx  = parseInt(String(req.body.clockInCol  ?? '1'), 10);
  const clockOutColIdx = parseInt(String(req.body.clockOutCol ?? '2'), 10);
  const breakColIdx = req.body.breakCol !== undefined && req.body.breakCol !== ''
    ? parseInt(String(req.body.breakCol), 10)
    : null;

  const db = getDb();
  let imported = 0;
  let skipped = 0;

  const insertStmt = db.prepare(
    'INSERT INTO sessions (date, clock_in, clock_out, duration_secs, pauses) VALUES (?, ?, ?, ?, ?)'
  );
  const existsStmt = db.prepare('SELECT id FROM sessions WHERE clock_in = ?');

  // Wrap all inserts in a single transaction — partial imports won't be committed on error
  const runImport = db.transaction(() => {
    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
        header: 1, raw: true, defval: null,
      });

      rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return; // skip header row

        const dateCell = (row as CellValue[])[dateColIdx];
        const rawDate = String(dateCell ?? '').trim().toUpperCase();
        if (rawDate === 'TOTAL' || rawDate === '') return;

        const dateStr = parseDate(dateCell);
        if (!dateStr) return;

        const clockInISO = parseTime((row as CellValue[])[clockInColIdx], dateStr);
        if (!clockInISO) return;

        const clockOutISO = parseTime((row as CellValue[])[clockOutColIdx], dateStr);

        // Deduplicate by clock_in
        if (existsStmt.get(clockInISO)) {
          skipped++;
          return;
        }

        const pauses: Pause[] = [];
        if (breakColIdx !== null) {
          const breakText = String((row as CellValue[])[breakColIdx] ?? '').trim();
          if (breakText) {
            // Zero-duration pause stores the comment without affecting duration calculation
            pauses.push({ start: clockInISO, end: clockInISO, comment: breakText });
          }
        }

        const durationSecs = clockOutISO
          ? computeDurationSecs(clockInISO, clockOutISO, pauses)
          : 0;

        insertStmt.run(dateStr, clockInISO, clockOutISO ?? null, durationSecs, JSON.stringify(pauses));
        imported++;
      });
    }
  });

  runImport();
  res.json({ imported, skipped });
});

export default router;
