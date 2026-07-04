export type IncentiveStatus = 'none' | 'pending' | 'approved' | 'declined';

// Duration of a shift in hours. An end of "00:00" means a midnight close
// (same convention as the shift-creation validation). Also the canonical
// hours helper for the weekly-cap math in lib/schedule.ts — this module is
// client-safe, schedule.ts is not.
export function shiftHours(startTime: string, endTime: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMin(startTime);
  const end = toMin(endTime);
  const endAdj = end === 0 ? 24 * 60 : end;
  return Math.max(0, (endAdj - start) / 60);
}

// "$2" for whole dollars, "$2.50" otherwise.
export function formatMoney(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

// What the owner owes for one confirmed worker on one incentivised shift.
export function incentiveOwed(rate: number, startTime: string, endTime: string): number {
  return Math.round(rate * shiftHours(startTime, endTime) * 100) / 100;
}
