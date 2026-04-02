import { describe, it, expect } from 'vitest';
import { computePay, formatPay } from './pay.js';

describe('computePay', () => {
  it('computes pay correctly', () => {
    expect(computePay(3600, '20.00')).toBeCloseTo(20);
    expect(computePay(1800, '20.00')).toBeCloseTo(10);
    expect(computePay(0, '20.00')).toBe(0);
  });

  it('returns 0 for invalid rate', () => {
    expect(computePay(3600, 'abc')).toBe(0);
  });
});

describe('formatPay', () => {
  it('formats as USD currency', () => {
    expect(formatPay(20)).toBe('$20.00');
    expect(formatPay(1234.5)).toBe('$1,234.50');
  });
});
