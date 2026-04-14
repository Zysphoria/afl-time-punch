import type { Pause } from '../types.js';

/** Format a Date as YYYY-MM-DD using local calendar (not UTC). */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeDurationSecs(
  clockIn: string,
  clockOut: string | null,
  pauses: Pause[]
): number {
  if (!clockOut) return 0;

  const totalMs = new Date(clockOut).getTime() - new Date(clockIn).getTime();

  const pauseMs = pauses.reduce((sum, p) => {
    if (!p.end) return sum;
    const contribution = new Date(p.end).getTime() - new Date(p.start).getTime();
    return sum + Math.max(0, contribution);
  }, 0);

  return Math.max(0, Math.floor((totalMs - pauseMs) / 1000));
}
