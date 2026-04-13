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

/** Returned by preview — headers plus auto-detected column index suggestions (-1 = not found). */
export interface PreviewResult {
  headers: HeaderEntry[];
  dateCol: number | null;
  clockInCol: number | null;
  clockOutCol: number | null;
  breakCol: number | null;
  lunchStartCol: number | null;
  lunchEndCol: number | null;
}

/** Validates and returns a non-negative integer column index, or throws on bad input. */
function parseColIdx(raw: unknown, fallback: number): number {
  const n = parseInt(String(raw ?? fallback), 10);
  if (isNaN(n) || n < 0) throw new Error(`Invalid column index: ${JSON.stringify(raw)}`);
  return n;
}

/** Parse optional column index — returns null when absent or empty, throws on invalid. */
function parseOptColIdx(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  if (isNaN(n) || n < 0) throw new Error(`Invalid column index: ${JSON.stringify(raw)}`);
  return n;
}

/** Returns true if the YYYY-MM-DD string represents a real calendar date. */
function isValidDateStr(s: string): boolean {
  const parts = s.split('-').map(Number);
  if (parts.length !== 3) return false;
  const [y, m, d] = parts;
  const date = new Date(`${s}T12:00:00`);
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
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    const result = `${y}-${m}-${d}`;
    return isValidDateStr(result) ? result : null;
  }
  const str = String(value).trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return isValidDateStr(str) ? str : null;
  }

  const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, mo, d, y] = mdyMatch;
    const result = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return isValidDateStr(result) ? result : null;
  }

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
    const h = value.getHours();
    const m = value.getMinutes();
    const s = value.getSeconds();
    return new Date(
      `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    ).toISOString();
  }

  if (typeof value === 'number' && value >= 0 && value < 1) {
    const totalMins = Math.round(value * 24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
  }

  const str = String(value).trim();
  if (!str) return null;

  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const secs = match[3] ? parseInt(match[3], 10) : 0;
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

/**
 * Find the header row by looking for the first row that contains at least one
 * time-tracking keyword. This handles spreadsheets with decorative title rows
 * or summary tables above the actual data (e.g. AFL timesheets).
 */
function findHeaderRow(rows: CellValue[][]): CellValue[] {
  const timeKeywords = ['date', 'day', 'time', 'start', 'end', 'clock', 'break', 'lunch', 'in', 'out'];
  for (const row of rows) {
    const cells = row.map(v => String(v ?? '').trim().toLowerCase()).filter(v => v !== '');
    if (cells.length >= 2 && cells.some(v => timeKeywords.some(kw => v === kw || v.startsWith(kw + ' ') || v.endsWith(' ' + kw) || v.includes(' ' + kw + ' ')))) {
      return row;
    }
  }
  // Fallback: first row with ≥2 non-empty cells
  for (const row of rows) {
    if (row.filter(v => v != null && String(v).trim() !== '').length >= 2) return row;
  }
  return [];
}

/** Categorise a single header name into a semantic field, most-specific patterns first. */
function categoriseHeader(name: string): 'date' | 'clockIn' | 'clockOut' | 'lunchStart' | 'lunchEnd' | 'break' | null {
  const n = name.toLowerCase();
  // Lunch sub-columns must be matched before generic 'start'/'end'/'break' patterns
  if (n.includes('lunch start') || n.includes('break start') || n.includes('lunch out')) return 'lunchStart';
  if (n.includes('lunch end') || n.includes('break end') || n.includes('lunch in') || n.includes('lunch return')) return 'lunchEnd';
  if (n.includes('date') || n === 'day') return 'date';
  if (n.includes('time in') || n.includes('time-in') || n.includes('clock in') || n.includes('clock-in')) return 'clockIn';
  if (n.includes('time out') || n.includes('time-out') || n.includes('clock out') || n.includes('clock-out')) return 'clockOut';
  if (n === 'start' || n.includes('arrival') || (n.includes('start') && !n.includes('lunch'))) return 'clockIn';
  if (n === 'end' || n.includes('finish') || n.includes('departure') || (n.includes('end') && !n.includes('lunch'))) return 'clockOut';
  if (n.includes('break') || n.includes('lunch') || n.includes('unpaid') || n.includes('pause') || n.includes('comment') || n.includes('note')) return 'break';
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

  const firstWs = workbook.Sheets[workbook.SheetNames[0]];
  const firstRows = XLSX.utils.sheet_to_json<CellValue[]>(firstWs, {
    header: 1, raw: true, defval: null,
  }) as CellValue[][];

  const headerRowData = findHeaderRow(firstRows);

  const headers: HeaderEntry[] = headerRowData
    .map((v, i) => ({ name: String(v ?? '').trim(), index: i }))
    .filter(h => h.name !== '');

  if (isPreview) {
    // Auto-detect columns from header names
    const suggestions: Record<string, number | null> = {
      dateCol: null, clockInCol: null, clockOutCol: null,
      breakCol: null, lunchStartCol: null, lunchEndCol: null,
    };
    for (const h of headers) {
      const cat = categoriseHeader(h.name);
      if (cat === 'date'       && suggestions.dateCol       === null) suggestions.dateCol       = h.index;
      if (cat === 'clockIn'    && suggestions.clockInCol    === null) suggestions.clockInCol    = h.index;
      if (cat === 'clockOut'   && suggestions.clockOutCol   === null) suggestions.clockOutCol   = h.index;
      if (cat === 'break'      && suggestions.breakCol      === null) suggestions.breakCol      = h.index;
      if (cat === 'lunchStart' && suggestions.lunchStartCol === null) suggestions.lunchStartCol = h.index;
      if (cat === 'lunchEnd'   && suggestions.lunchEndCol   === null) suggestions.lunchEndCol   = h.index;
    }
    const result: PreviewResult = { headers, ...suggestions } as PreviewResult;
    return res.json(result);
  }

  // ── Full import ────────────────────────────────────────────────────────────
  let dateColIdx: number, clockInColIdx: number, clockOutColIdx: number;
  let breakColIdx: number | null, lunchStartColIdx: number | null, lunchEndColIdx: number | null;
  try {
    dateColIdx     = parseColIdx(req.body.dateCol,    0);
    clockInColIdx  = parseColIdx(req.body.clockInCol,  1);
    clockOutColIdx = parseColIdx(req.body.clockOutCol, 2);
    breakColIdx      = parseOptColIdx(req.body.breakCol);
    lunchStartColIdx = parseOptColIdx(req.body.lunchStartCol);
    lunchEndColIdx   = parseOptColIdx(req.body.lunchEndCol);
  } catch (e: unknown) {
    return res.status(400).json({ error: (e as Error).message });
  }

  const db = getDb();
  const insertStmt = db.prepare(
    'INSERT INTO sessions (date, clock_in, clock_out, duration_secs, pauses) VALUES (?, ?, ?, ?, ?)'
  );
  const existsStmt = db.prepare('SELECT id FROM sessions WHERE clock_in = ?');

  const runImport = db.transaction(() => {
    let imported = 0;
    let skipped = 0;

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
        header: 1, raw: true, defval: null,
      });

      rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return; // skip header / title row

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

        // Prefer explicit lunch start/end columns (accurate break deduction)
        if (lunchStartColIdx !== null && lunchEndColIdx !== null) {
          const lunchStartISO = parseTime((row as CellValue[])[lunchStartColIdx], dateStr);
          const lunchEndISO   = parseTime((row as CellValue[])[lunchEndColIdx],   dateStr);
          if (lunchStartISO && lunchEndISO) {
            pauses.push({ start: lunchStartISO, end: lunchEndISO, comment: 'Lunch' });
          }
        } else if (breakColIdx !== null) {
          const breakText = String((row as CellValue[])[breakColIdx] ?? '').trim();
          if (breakText) {
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
