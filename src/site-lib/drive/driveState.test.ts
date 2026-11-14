import { describe, expect, it } from 'vitest';
import { parseDriveState } from './driveState.ts';

const ID = '1AbCdEfGhIjKlMnOp';
const search = (state: unknown) => `?state=${encodeURIComponent(typeof state === 'string' ? state : JSON.stringify(state))}`;

describe('parseDriveState', () => {
  it('reads the file id from an open action', () => {
    expect(parseDriveState(search({ ids: [ID], action: 'open', userId: '123' }))).toEqual({ ok: true, fileId: ID, userId: '123' });
  });

  it('leaves out a userId that is not a string', () => {
    expect(parseDriveState(search({ ids: [ID], userId: 123 }))).toEqual({ ok: true, fileId: ID });
  });
  it('accepts a search string without the leading question mark', () => {
    expect(parseDriveState(search({ ids: [ID], action: 'open' }).slice(1))).toEqual({ ok: true, fileId: ID });
  });

  it('decodes a url-encoded state with a resource key', () => {
    const raw = `?state=%7B%22ids%22%3A%5B%22${ID}%22%5D%2C%22action%22%3A%22open%22%2C%22resourceKeys%22%3A%7B%22${ID}%22%3A%220-xyz%22%7D%7D`;
    expect(parseDriveState(raw)).toEqual({ ok: true, fileId: ID, resourceKey: '0-xyz' });
  });

  it('treats a missing action as open', () => {
    expect(parseDriveState(search({ ids: [ID] }))).toEqual({ ok: true, fileId: ID });
  });

  it('uses only the first id', () => {
    expect(parseDriveState(search({ ids: [ID, 'ZZZZZZZZZZZZ'], action: 'open' }))).toEqual({ ok: true, fileId: ID });
  });

  it('omits a resource key that is not a string', () => {
    expect(parseDriveState(search({ ids: [ID], resourceKeys: { [ID]: 5 } }))).toEqual({ ok: true, fileId: ID });
  });

  it('reports missing when there is no state', () => {
    expect(parseDriveState('')).toEqual({ ok: false, reason: 'missing' });
    expect(parseDriveState('?foo=bar')).toEqual({ ok: false, reason: 'missing' });
    expect(parseDriveState('?state=')).toEqual({ ok: false, reason: 'missing' });
  });

  it('reports malformed for bad JSON or the wrong shape', () => {
    expect(parseDriveState(search('{not json'))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseDriveState(search('"text"'))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseDriveState(search('null'))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseDriveState(search({ ids: [] }))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseDriveState(search({ ids: ID }))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseDriveState(search({ ids: [42] }))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reports malformed for an id with unexpected characters or a short id', () => {
    expect(parseDriveState(search({ ids: ['../etc/passwd'] }))).toEqual({ ok: false, reason: 'malformed' });
    expect(parseDriveState(search({ ids: ['short'] }))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reports not-open for any other action', () => {
    expect(parseDriveState(search({ ids: [ID], action: 'create' }))).toEqual({ ok: false, reason: 'not-open' });
  });
});
