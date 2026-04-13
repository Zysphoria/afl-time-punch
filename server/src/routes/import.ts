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
    // Always require .xlsx extension — MIME type can vary (octet-stream, zip) across browsers.
    const hasXlsxExt = file.originalname.toLowerCase().endsWith('.xlsx');
    const hasValidMime =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === 'application/zip';
    cb(null, hasXlsxExt && hasValidMime);
  },
});

type CellValue = string | number | boolean | Date | null | undefined;

/** Sent to the client in preview mode so the UI can show column names with raw sheet indices. */
export interface HeaderEntry { name: string; index: number; }

/** Validates and returns a non-negative integer column index, or throws on bad input. */
function parseColIdx(raw: unknown, fallback: number): number {
  const n = parseInt(String(raw ?? fallback), 10);
  if (isNaN(n) || n < 0) throw new Error(`Invalid column index: ${JSON.stringify(raw)}`);
  return n;
}

/** Returns true if the YYYY-MM-DD string represents a real calendar date. */
function isValidDateStr(s: string): boolean {
  const parts = s.split('-').map(Number);
  if (parts.length !== 3) return false;
  const [y, m, d] = parts;
  const date = new Date(`${s}T12:00:00`); // noon local avoids DST edge cases
  return (
    !isNaN(date.getTime()) &&
    date.getFullYear() === y &&
    date.getMonth() + 1 === m &&
    date.getDate() === d
  );
}

/** Parse a cell value to a YYYY-MM-DD string, or null if unrecognised or invalid. */
function parseDate(value: CellValue): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    // Use local date components — SheetJS Date objects represent calendar dates in local TZ.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    const result = `${y}-${m}-${d}`;
    return isValidDateStr(result) ? result : null;
  }
  const str = String(value).trim();
  if (!str) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return isValidDateStr(str) ? str : null;
  }

  // MM/DD/YYYY or M/D/YYYY
  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, mo, d, y] = mdyMatch;
    const result = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return isValidDateStr(result) ? result : null;
  }

  // Fallback for English date strings ("Apr 10, 2026" etc.).
  // new Date(str) treats the input as UTC midnight — use .toISOString().slice(0,10) to read
  // the UTC date, which matches the intended calendar date for these named-month formats.
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const iso = parsed.toISOString().slice(0, 10);
    return isValidDateStr(iso) ? iso : null;
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
    // Building from a local-time template is intentional: in Electron the server
    // runs in the same process as the OS, so local TZ === user's TZ.
    return new Date(
      `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    ).toISOString();
  }

  // Numeric time fraction (e.g. 0.34375 = 8:15 AM) — fallback if cellDates didn't convert.
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
    // Reject out-of-range values — would produce an invalid Date and throw RangeError
    if (mins > 59 || secs > 59 || hours > 23) return null;
    const ampm = match[4]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    if (hours > 23) return null;
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
    workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true, sheetRows: 10000 });
  } catch (err) {
    console.error('[import] XLSX.read() failed:', err);
    return res.status(400).json({ error: 'Could not parse file. Ensure it is a valid .xlsx file.' });
  }

  if (workbook.SheetNames.length === 0) {
    return res.status(400).json({ error: 'Spreadsheet has no worksheets.' });
  }

  // Read the first sheet to find the header row
  const firstWs = workbook.Sheets[workbook.SheetNames[0]];
  const firstRows = XLSX.utils.sheet_to_json<CellValue[]>(firstWs, {
    header: 1, raw: true, defval: null,
  });

  // Find the first row with ≥3 non-empty cells — handles spreadsheets with decorative title rows
  let headerRowData: CellValue[] = [];
  for (const row of firstRows as CellValue[][]) {
    if (row.filter(v => v != null && String(v).trim() !== '').length >= 3) {
      headerRowData = row;
      break;
    }
  }

  // Return {name, index} pairs so the client maps column names to their raw sheet column indices
  // without relying on indexOf on a filtered array (which would be off when blank columns exist).
  const headers: HeaderEntry[] = headerRowData
    .map((v, i) => ({ name: String(v ?? '').trim(), index: i }))
    .filter(h => h.name !== '');

  if (isPreview) return res.json(headers);

  // Validate column indices — reject NaN / negative values with a clear error
  let dateColIdx: number, clockInColIdx: number, clockOutColIdx: number, breakColIdx: number | null;
  try {
    dateColIdx     = parseColIdx(req.body.dateCol,    0);
    clockInColIdx  = parseColIdx(req.body.clockInCol,  1);
    clockOutColIdx = parseColIdx(req.body.clockOutCol, 2);
    breakColIdx    = req.body.breakCol !== undefined && req.body.breakCol !== ''
      ? parseColIdx(req.body.breakCol, -1)
      : null;
  } catch (e: unknown) {
    return res.status(400).json({ error: (e as Error).message });
  }

  const db = getDb();

  const insertStmt = db.prepare(
    'INSERT INTO sessions (date, clock_in, clock_out, duration_secs, pauses) VALUES (?, ?, ?, ?, ?)'
  );
  // Note: existsStmt sees in-progress writes within this transaction (same SQLite connection,
  // read-your-own-writes semantics) — so intra-file deduplication works correctly.
  const existsStmt = db.prepare('SELECT id FROM sessions WHERE clock_in = ?');

  // Wrap all inserts in a single transaction — partial imports won't be committed on error.
  // Counters live inside the closure so they can't become stale on a rollback.
  const runImport = db.transaction(() => {
    let imported = 0;
    let skipped = 0;

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
        header: 1, raw: true, defval: null,
      });

      rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return; // skip first row (header / decorative)

        const dateCell = (row as CellValue[])[dateColIdx];
        const rawDate = String(dateCell ?? '').trim().toUpperCase();
        if (rawDate === 'TOTAL' || rawDate === '') return;

        const dateStr = parseDate(dateCell);
        if (!dateStr) return;

        const clockInISO = parseTime((row as CellValue[])[clockInColIdx], dateStr);
        if (!clockInISO) return;

        const clockOutISO = parseTime((row as CellValue[])[clockOutColIdx], dateStr);

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

    return { imported, skipped };
  });

  try {
    const { imported, skipped } = runImport() as { imported: number; skipped: number };
    res.json({ imported, skipped });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Import failed: ' + ((err as Error)?.message ?? 'unknown error') });
  }
});

export default router;
