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

function weekFriday(saturday: string): string {
  const d = new Date(saturday + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

function weekSaturday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 6 ? 0 : -(day + 1);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekLabel(saturday: string): string {
  const start = new Date(saturday + 'T00:00:00');
  const end = new Date(saturday + 'T00:00:00');
  end.setDate(end.getDate() + 6);
  const startMonth = start.toLocaleString('en-US', { month: 'short' });
  const endMonth = end.toLocaleString('en-US', { month: 'short' });
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()}–${end.getDate()} ${start.getFullYear()}`;
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()} ${end.getFullYear()}`;
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

  const rateRow = db
    .prepare("SELECT value FROM settings WHERE key = 'hourly_rate'")
    .get() as { value: string } | undefined;
  const hourlyRate = parseFloat(rateRow?.value ?? '15.00');

  let rows: SessionRow[];
  if (weekParam) {
    const friday = weekFriday(weekParam);
    rows = db
      .prepare('SELECT * FROM sessions WHERE date >= ? AND date <= ? ORDER BY clock_in ASC')
      .all(weekParam, friday) as SessionRow[];
  } else {
    rows = db.prepare('SELECT * FROM sessions ORDER BY clock_in ASC').all() as SessionRow[];
  }

  const sessions: ParsedSession[] = rows.map(r => ({
    ...r,
    pauses: JSON.parse(r.pauses) as Pause[],
  }));

  const weekMap = new Map<string, ParsedSession[]>();
  for (const s of sessions) {
    const saturday = weekSaturday(s.date);
    if (!weekMap.has(saturday)) weekMap.set(saturday, []);
    weekMap.get(saturday)!.push(s);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AFL Time Punch';
  workbook.created = new Date();

  const sortedWeeks = [...weekMap.keys()].sort();

  for (const saturday of sortedWeeks) {
    const weekSessions = weekMap.get(saturday)!;
    const sheetName = weekLabel(saturday).replace(/[:\\\/\?\*\[\]]/g, '-');
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = [
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Clock In', key: 'clock_in', width: 12 },
      { header: 'Clock Out', key: 'clock_out', width: 12 },
      { header: 'Duration (hrs)', key: 'duration', width: 16 },
      { header: 'Pauses', key: 'pauses', width: 10 },
      { header: 'Break Comments', key: 'comments', width: 30 },
      { header: 'Pay ($)', key: 'pay', width: 12 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFE5E7EB' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };

    let totalDurationHrs = 0;
    let totalPay = 0;

    for (const s of weekSessions) {
      const durationHrs = s.duration_secs / 3600;
      const pay = durationHrs * hourlyRate;
      const completedPauses = s.pauses.filter(p => p.end);
      const comments = completedPauses.map(p => p.comment).filter(Boolean).join('; ');
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

  const filename = weekParam ? `timepunch-${weekParam}.xlsx` : 'timepunch-all.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  try {
    await workbook.xlsx.write(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Export failed.' });
    }
  }
});

export default router;
