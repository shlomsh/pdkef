import { describe, it, expect } from 'vitest';
import { parsePdfDate } from './pdfDate.js';

describe('parsePdfDate', () => {
  it('reads the full form with an offset', () => {
    expect(parsePdfDate("D:20260307141502+03'00'")).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 180 });
    expect(parsePdfDate("D:20260307141502-05'30'")).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: -330 });
  });

  it('reads truncations, defaulting month and day to 1 and the time to 0', () => {
    expect(parsePdfDate('D:2026')).toEqual({ iso: '2026-01-01T00:00:00', offsetMinutes: null });
    expect(parsePdfDate('D:202603')).toEqual({ iso: '2026-03-01T00:00:00', offsetMinutes: null });
    expect(parsePdfDate('D:20260307141502')).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: null });
  });

  it('reads Z as offset 0', () => {
    expect(parsePdfDate('D:20260307141502Z')).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 0 });
    expect(parsePdfDate("D:20260307141502Z00'00'")).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 0 });
  });

  it('accepts an offset with hours only', () => {
    expect(parsePdfDate("D:20260307141502+02'")).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 120 });
  });

  it('accepts a plain ISO-like string', () => {
    expect(parsePdfDate('2026-03-07T14:15:02Z')).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 0 });
    expect(parsePdfDate('2026-03-07T14:15:02+03:00')).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 180 });
    expect(parsePdfDate('2026-03-07T14:15:02.123Z')).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 0 });
  });

  it('returns null for garbage', () => {
    expect(parsePdfDate('yesterday')).toBeNull();
    expect(parsePdfDate('')).toBeNull();
    expect(parsePdfDate('D:20261399')).toBeNull();
    expect(parsePdfDate(undefined)).toBeNull();
  });
});
