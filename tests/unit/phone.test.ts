import { describe, expect, it } from 'vitest';
import { toE164US } from '@/lib/phone';

describe('toE164US', () => {
  it('normalises a bare 10-digit US number', () => {
    expect(toE164US('9131234567')).toBe('+19131234567');
  });

  it('strips punctuation and spaces', () => {
    expect(toE164US('(913) 123-4567')).toBe('+19131234567');
    expect(toE164US('913.123.4567')).toBe('+19131234567');
  });

  it('accepts an 11-digit number with a leading 1', () => {
    expect(toE164US('1 913 123 4567')).toBe('+19131234567');
  });

  it('passes through an already-E.164 number', () => {
    expect(toE164US('+19131234567')).toBe('+19131234567');
  });

  it('keeps international numbers that arrive with a +', () => {
    expect(toE164US('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('rejects garbage', () => {
    expect(toE164US('12345')).toBeNull();
    expect(toE164US('not a phone')).toBeNull();
    // 11 digits that don't start with 1 and no leading +
    expect(toE164US('29131234567')).toBeNull();
  });
});
