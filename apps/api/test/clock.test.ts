import { describe, expect, it } from 'vitest';
import { createClock } from '../src/clock';

describe('clock', () => {
  it('returns a frozen string exactly as sent', () => {
    const c = createClock();
    const s = c.freeze('2026-01-01T00:00:00Z');
    expect(s).toEqual({ iso: '2026-01-01T00:00:00Z', ms: Date.UTC(2026, 0, 1) });
    expect(c.now().iso).toBe('2026-01-01T00:00:00Z');
    expect(c.now().iso).toBe('2026-01-01T00:00:00Z');
  });
  it('formats a frozen number as millisecond ISO', () => {
    const c = createClock();
    expect(c.freeze(1767225600000).iso).toBe('2026-01-01T00:00:00.000Z');
  });
  it('returns to real time after unfreeze', () => {
    const c = createClock();
    c.freeze('2020-01-01T00:00:00Z');
    c.unfreeze();
    const s = c.now();
    expect(s.iso).toMatch(/Z$/);
    expect(Math.abs(s.ms - Date.now())).toBeLessThan(5000);
    expect(Math.abs(Date.parse(s.iso) - Date.now())).toBeLessThan(5000);
  });
  it('is real time initially', () => {
    expect(Math.abs(createClock().now().ms - Date.now())).toBeLessThan(5000);
  });
  it('throws on an unparsable freeze value', () => {
    expect(() => createClock().freeze('banana')).toThrow();
    expect(() => createClock().freeze(1.5)).toThrow();
  });
});
