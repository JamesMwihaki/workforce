import { describe, expect, it } from 'vitest';
import { shiftHours, formatMoney, incentiveOwed } from '@/lib/incentives';

describe('shiftHours', () => {
  it('computes a plain daytime shift', () => {
    expect(shiftHours('09:00', '17:00')).toBe(8);
  });

  it('accepts HH:MM:SS strings (Postgres time columns)', () => {
    expect(shiftHours('16:00:00', '22:30:00')).toBe(6.5);
  });

  it('treats end 00:00 as a midnight close', () => {
    expect(shiftHours('16:00', '00:00')).toBe(8);
    expect(shiftHours('16:00:00', '00:00:00')).toBe(8);
  });

  it('never goes negative on bad input', () => {
    expect(shiftHours('17:00', '09:00')).toBe(0);
  });
});

describe('formatMoney', () => {
  it('renders whole dollars without cents', () => {
    expect(formatMoney(2)).toBe('$2');
    expect(formatMoney(0)).toBe('$0');
  });

  it('renders fractional amounts with two decimals', () => {
    expect(formatMoney(2.5)).toBe('$2.50');
    expect(formatMoney(1.339)).toBe('$1.34');
  });
});

describe('incentiveOwed', () => {
  it('is rate × hours', () => {
    expect(incentiveOwed(2, '16:00', '00:00')).toBe(16); // $2/hr × 8h
    expect(incentiveOwed(1, '09:00', '17:30')).toBe(8.5);
  });

  it('handles fractional rates and hours', () => {
    expect(incentiveOwed(1.5, '09:00', '16:30')).toBe(11.25); // 1.5 × 7.5h
  });

  it('owes nothing for a zero rate', () => {
    expect(incentiveOwed(0, '09:00', '17:00')).toBe(0);
  });
});
