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
