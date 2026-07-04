import { describe, expect, it } from 'vitest';
import { formatDate, formatPhone, formatTime } from '@/lib/format';

describe('formatDate', () => {
  it('renders the calendar date with no timezone shift', () => {
    // A UTC-naive parse of 2026-07-05 in a negative-offset timezone would
    // render Jul 4 — the whole point of this helper is that it must not.
    const out = formatDate('2026-07-05');
    expect(out).toContain('Jul');
    expect(out).toContain('5');
    expect(out).toContain('Sun');
  });
});

describe('formatPhone', () => {
  it('renders E.164 US numbers as (XXX) XXX-XXXX', () => {
    expect(formatPhone('+19131234567')).toBe('(913) 123-4567');
  });

  it('returns anything else as-is', () => {
    expect(formatPhone('+442079460958')).toBe('+442079460958');
    expect(formatPhone('9131234567')).toBe('9131234567');
  });
});

describe('formatTime', () => {
  it('renders afternoon times as 12-hour', () => {
    expect(formatTime('16:00:00')).toMatch(/4:00/);
  });

  it('renders morning times', () => {
    expect(formatTime('09:30')).toMatch(/9:30/);
  });
});
