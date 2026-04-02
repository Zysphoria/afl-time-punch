import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  getWeekMonday,
  getWeekLabel,
  getWeekDays,
  computeElapsedSecs,
} from './time.js';

describe('formatDuration', () => {
  it('formats 0 as 00:00:00', () => expect(formatDuration(0)).toBe('00:00:00'));
  it('formats 3661 as 01:01:01', () => expect(formatDuration(3661)).toBe('01:01:01'));
  it('formats 3600 as 01:00:00', () => expect(formatDuration(3600)).toBe('01:00:00'));
});

describe('getWeekMonday', () => {
  it('returns the same day for a Monday', () => {
    expect(getWeekMonday('2026-03-30')).toBe('2026-03-30'); // Monday
  });
  it('returns the previous Monday for a Wednesday', () => {
    expect(getWeekMonday('2026-04-01')).toBe('2026-03-30');
  });
  it('returns the previous Monday for a Sunday', () => {
    expect(getWeekMonday('2026-04-05')).toBe('2026-03-30');
  });
});

describe('getWeekLabel', () => {
  it('produces a correct label for a known week', () => {
    expect(getWeekLabel('2026-03-30')).toBe('Mar 30–5 2026');
  });
});

describe('getWeekDays', () => {
  it('returns 7 days starting from Monday', () => {
    const days = getWeekDays('2026-03-30');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-03-30');
    expect(days[6]).toBe('2026-04-05');
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
