import { describe, expect, it } from 'vitest';
import { parseInstant } from '../src/time';

describe('parseInstant', () => {
  it('treats a string without offset as UTC (not local time)', () => {
    expect(parseInstant('2026-01-01T00:00:00')).toBe(Date.UTC(2026, 0, 1));
    expect(parseInstant('2026-01-01T00:00')).toBe(Date.UTC(2026, 0, 1));
  });
  it('applies offsets', () => {
    expect(parseInstant('2026-01-01T02:00:00+02:00')).toBe(Date.UTC(2026, 0, 1));
    expect(parseInstant('2025-12-31T19:00:00-05:00')).toBe(Date.UTC(2026, 0, 1));
  });
  it('parses Z and fractional seconds', () => {
    expect(parseInstant('2026-11-13T10:00:00.000Z')).toBe(Date.UTC(2026, 10, 13, 10));
    expect(parseInstant('2026-11-13T10:00:00.5Z')).toBe(Date.UTC(2026, 10, 13, 10, 0, 0, 500));
  });
  it('accepts any number of fractional digits, truncating to milliseconds (not rounding)', () => {
    const base = Date.UTC(2026, 2, 1, 10);
    expect(parseInstant('2026-03-01T10:00:00.1234Z')).toBe(base + 123);
    expect(parseInstant('2026-03-01T10:00:00.123456Z')).toBe(base + 123);
    expect(parseInstant('2026-03-01T10:00:00.123456+00:00')).toBe(base + 123);
    expect(parseInstant('2026-03-01T12:00:00.123456+02:00')).toBe(base + 123);
    expect(parseInstant('2026-03-01T10:00:00.123456')).toBe(base + 123);
    expect(parseInstant('2026-03-01T10:00:00.9999999Z')).toBe(base + 999);
    expect(parseInstant('2026-03-01T10:00:00.000000001Z')).toBe(base);
  });
  it('accepts lowercase t and z (RFC 3339)', () => {
    const base = Date.UTC(2026, 2, 1, 10);
    expect(parseInstant('2026-03-01t10:00:00z')).toBe(base);
    expect(parseInstant('2026-03-01t10:00:00.5z')).toBe(base + 500);
    expect(parseInstant('2026-03-01t12:00:00+02:00')).toBe(base);
  });
  it('rejects malformed input', () => {
    for (const s of [
      '2026-01-01',
      'banana',
      '',
      '2026-01-01T00:00:00 Z',
      '2026-01-01T00:00:00.Z',
      '2026-01-01T00:00.5Z',
      '2026-01-01X00:00:00Z',
    ])
      expect(parseInstant(s)).toBeNull();
  });
  it('rejects impossible dates and times', () => {
    for (const s of [
      '2026-02-30T00:00:00Z',
      '2026-13-01T00:00:00Z',
      '2026-00-10T00:00:00Z',
      '2026-01-01T24:00:00Z',
      '2026-01-01T00:60:00Z',
      '2026-01-01T00:00:60Z',
      '2026-01-01T00:00:00+24:00',
      '2026-01-01T00:00:00+02:60',
    ])
      expect(parseInstant(s)).toBeNull();
    expect(parseInstant('2024-02-29T00:00:00Z')).toBe(Date.UTC(2024, 1, 29));
    expect(parseInstant('2026-02-29T00:00:00Z')).toBeNull();
  });
  it('accepts numbers only with allowNumber', () => {
    expect(parseInstant(1767225600000)).toBeNull();
    expect(parseInstant(1767225600000, { allowNumber: true })).toBe(1767225600000);
    expect(parseInstant(1.5, { allowNumber: true })).toBeNull();
    expect(parseInstant(1.5)).toBeNull();
    expect(parseInstant(8.64e15, { allowNumber: true })).toBe(8.64e15);
    expect(parseInstant(8.64e15 + 2, { allowNumber: true })).toBeNull();
    expect(parseInstant(NaN, { allowNumber: true })).toBeNull();
  });
  it('rejects other types', () => {
    for (const v of [null, undefined, {}, [], true]) expect(parseInstant(v, { allowNumber: true })).toBeNull();
  });
});
