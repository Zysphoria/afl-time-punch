/**
 * Compute pay from duration in seconds and hourly rate string.
 * Returns a number (not rounded — caller decides display precision).
 */
export function computePay(durationSecs: number, hourlyRate: string): number {
  const rate = parseFloat(hourlyRate);
  if (isNaN(rate)) return 0;
  return (durationSecs / 3600) * rate;
}

/** Format a pay number as "$1,234.56" */
export function formatPay(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
