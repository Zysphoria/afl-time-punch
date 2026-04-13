import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  getWeekStart,
  getWeekLabel,
  getWeekDays,
  computeElapsedSecs,
} from './time.js';

describe('formatDuration', () => {
  it('formats 0 as 00:00:00', () => expect(formatDuration(0)).toBe('00:00:00'));
  it('formats 3661 as 01:01:01', () => expect(formatDuration(3661)).toBe('01:01:01'));
  it('formats 3600 as 01:00:00', () => expect(formatDuration(3600)).toBe('01:00:00'));
});

describe('getWeekStart', () => {
  it('returns the same day for a Saturday', () => {
    expect(getWeekStart('2026-04-04')).toBe('2026-04-04'); // Saturday
  });
  it('returns the previous Saturday for a Wednesday', () => {
    expect(getWeekStart('2026-04-08')).toBe('2026-04-04');
  });
  it('returns the previous Saturday for a Sunday', () => {
    expect(getWeekStart('2026-04-05')).toBe('2026-04-04');
  });
  it('returns the previous Saturday for a Friday', () => {
    expect(getWeekStart('2026-04-10')).toBe('2026-04-04');
  });
});

describe('getWeekLabel', () => {
  it('produces a correct label for a known week', () => {
    expect(getWeekLabel('2026-04-04')).toBe('Apr 4–10 2026');
  });
  it('spans months correctly', () => {
    expect(getWeekLabel('2026-03-28')).toBe('Mar 28 – Apr 3 2026');
  });
});

describe('getWeekDays', () => {
  it('returns 7 days starting from Saturday', () => {
    const days = getWeekDays('2026-04-04');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-04-04'); // Saturday
    expect(days[6]).toBe('2026-04-10'); // Friday
  });
});

describe('computeElapsedSecs', () => {
  it('returns 0 for no time passed', () => {
    const clockIn = new Date(Date.now() - 0).toISOString();
    expect(computeElapsedSecs(clockIn, [])).toBe(0);
  });

  it('subtracts completed pause time', () => {
    const base = Date.now() - 7200_000; // 2 hours ago
    const clockIn = new Date(base).toISOString();
    const pauses = [
      {
        start: new Date(base + 1800_000).toISOString(), // 30 min in
        end: new Date(base + 3600_000).toISOString(),   // 30 min break
      },
    ];
    const elapsed = computeElapsedSecs(clockIn, pauses);
    // 2 hours total - 30 min pause = 90 min = 5400 secs (approx, within 2s)
    expect(elapsed).toBeGreaterThan(5390);
    expect(elapsed).toBeLessThan(5410);
  });

  it('freezes at pause start when pause is open', () => {
    const base = Date.now() - 3600_000;
    const clockIn = new Date(base).toISOString();
    const pauseStart = new Date(base + 1800_000).toISOString(); // 30 min in
    const pauses = [{ start: pauseStart }]; // open pause

    const elapsed = computeElapsedSecs(clockIn, pauses);
    // Should be frozen at 30 min = 1800 secs
    expect(elapsed).toBeGreaterThan(1790);
    expect(elapsed).toBeLessThan(1810);
  });
});
