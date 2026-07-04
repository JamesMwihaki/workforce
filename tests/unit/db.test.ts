import { describe, expect, it } from 'vitest';
import { one } from '@/lib/db';

describe('one', () => {
  it('unwraps a single-element array', () => {
    expect(one([{ name: 'a' }])).toEqual({ name: 'a' });
  });

  it('takes the first element of a longer array', () => {
    expect(one([1, 2, 3])).toBe(1);
  });

  it('returns null for an empty array', () => {
    expect(one([])).toBeNull();
  });

  it('passes plain objects through', () => {
    expect(one({ name: 'a' })).toEqual({ name: 'a' });
  });

  it('normalises null and undefined to null', () => {
    expect(one(null)).toBeNull();
    expect(one(undefined)).toBeNull();
  });
});
