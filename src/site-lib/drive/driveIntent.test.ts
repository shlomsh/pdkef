import { describe, expect, it } from 'vitest';
import { DRIVE_HOME_HANDOFF, driveOpenHref, parseDriveIntent, safeReturnPath } from './driveIntent.ts';

describe('driveOpenHref', () => {
  it('encodes the return path', () => {
    expect(driveOpenHref({ returnTo: '/sign/?a=1' })).toBe('/drive/?pick=1&return=%2Fsign%2F%3Fa%3D1');
  });
  it('adds the tool when given', () => {
    expect(driveOpenHref({ returnTo: '/sign/', tool: 'sign' })).toBe('/drive/?pick=1&return=%2Fsign%2F&tool=sign');
  });
  it('exports the handoff key', () => {
    expect(DRIVE_HOME_HANDOFF).toBe('drive-home');
  });
});

describe('safeReturnPath', () => {
  it.each([
    ['/sign/', '/sign/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com/', '/'],
    ['javascript:alert(1)', '/'],
    ['/a\nb', '/'],
    ['sign/', '/'],
    ['', '/'],
  ])('%s -> %s', (raw, out) => expect(safeReturnPath(raw)).toBe(out));
  it('null falls back', () => expect(safeReturnPath(null)).toBe('/'));
});

describe('parseDriveIntent', () => {
  it('pick with tool and return', () => {
    expect(parseDriveIntent('?pick=1&return=%2Fsign%2F&tool=sign')).toEqual({ kind: 'pick', tool: 'sign', returnTo: '/sign/' });
  });
  it('pick with bad tool and bad return', () => {
    expect(parseDriveIntent('?pick=1&return=//x&tool=Bad_Tool')).toEqual({ kind: 'pick', tool: null, returnTo: '/' });
  });
  it('open-with carries the Drive userId', () => {
    const state = JSON.stringify({ ids: ['abcdefghij1'], action: 'open', userId: '42' });
    expect(parseDriveIntent(`?state=${encodeURIComponent(state)}`)).toEqual({ kind: 'open-with', fileId: 'abcdefghij1', userId: '42' });
  });
  it('open-with from state', () => {
    const state = JSON.stringify({ ids: ['abcdefghij1'], action: 'open' });
    expect(parseDriveIntent(`?state=${encodeURIComponent(state)}`)).toEqual({ kind: 'open-with', fileId: 'abcdefghij1' });
  });
  it('none otherwise', () => {
    expect(parseDriveIntent('')).toEqual({ kind: 'none' });
    expect(parseDriveIntent('?state=nope')).toEqual({ kind: 'none' });
  });
});

describe('parseDriveIntent save', () => {
  it('reads ?save=<id>', () => {
    expect(parseDriveIntent('?save=abc-123')).toEqual({ kind: 'save', id: 'abc-123' });
  });
  it('comes before the state parsing', () => {
    expect(parseDriveIntent('?save=abc&state=%7B%7D')).toEqual({ kind: 'save', id: 'abc' });
  });
  it('rejects ids with other characters', () => {
    expect(parseDriveIntent('?save=A/b')).toEqual({ kind: 'none' });
    expect(parseDriveIntent('?save=')).toEqual({ kind: 'none' });
  });
});
