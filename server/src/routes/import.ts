import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
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

/** Parse a cell value to a YYYY-MM-DD string, or null if unrecognised. */
function parseDate(value: ExcelJS.CellValue): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (!str) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // MM/DD/YYYY or M/D/YYYY
  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Let JS Date parse common English formats ("Apr 10, 2026", etc.)
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}

/** Parse a cell value into an ISO timestamp given the date string for that row. */
function parseTime(value: ExcelJS.CellValue, dateStr: string): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    // Excel time-only cells come back as Date objects anchored to 1899-12-30.
    // Extract UTC hours/minutes to avoid timezone drift.
    const h = value.getUTCHours();
    const m = value.getUTCMinutes();
    const s = value.getUTCSeconds();
    // Constructing with a local-time string is intentional: in Electron the server
    // runs in the same process as the user's OS, so local TZ === user's TZ.
    return new Date(
      `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    ).toISOString();
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

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Ensure the file is a valid .xlsx under 10 MB.' });
  }

  const isPreview = req.query.preview === 'true';

  const workbook = new ExcelJS.Workbook();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(req.file.buffer as any);
  } catch {
    return res.status(400).json({ error: 'Could not parse file. Ensure it is a valid .xlsx file.' });
  }

  const firstSheet = workbook.worksheets[0];
  if (!firstSheet) {
    return res.status(400).json({ error: 'Spreadsheet has no worksheets.' });
  }

  // Collect header names from row 1
  const headers: string[] = [];
  const headerRow = firstSheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, cell => {
    headers.push(String(cell.value ?? '').trim());
  });

  if (isPreview) return res.json(headers);

  // Column indices (0-based from client, convert to 1-based for ExcelJS)
  const dateColIdx = parseInt(String(req.body.dateCol ?? '0'), 10) + 1;
  const clockInColIdx = parseInt(String(req.body.clockInCol ?? '1'), 10) + 1;
  const clockOutColIdx = parseInt(String(req.body.clockOutCol ?? '2'), 10) + 1;
  const breakColIdx = req.body.breakCol !== undefined && req.body.breakCol !== ''
    ? parseInt(String(req.body.breakCol), 10) + 1
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
    for (const sheet of workbook.worksheets) {
      sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
        if (rowNum === 1) return; // skip header

        const dateCell = row.getCell(dateColIdx).value;
        const dateStr = parseDate(dateCell);
        if (!dateStr) return;

        const rawDate = String(dateCell ?? '').trim().toUpperCase();
        if (rawDate === 'TOTAL' || rawDate === '') return;

        const clockInISO = parseTime(row.getCell(clockInColIdx).value, dateStr);
        if (!clockInISO) return;

        const clockOutISO = parseTime(row.getCell(clockOutColIdx).value, dateStr);

        // Deduplicate by clock_in
        if (existsStmt.get(clockInISO)) {
          skipped++;
          return;
        }

        const pauses: Pause[] = [];
        if (breakColIdx !== null) {
          const breakText = String(row.getCell(breakColIdx).value ?? '').trim();
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
