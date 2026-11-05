import { describe, expect, it } from 'vitest';
import { DRIVE_TOKEN_KEY, driveFileLink, hasDriveConnection } from './driveSaveLink.ts';

const store = (value: string | null) => ({ getItem: (key: string) => (key === DRIVE_TOKEN_KEY ? value : null) });

describe('hasDriveConnection', () => {
  it('is true for a stored token, expired or not', () => {
    expect(hasDriveConnection(store(JSON.stringify({ token: 't', until: Date.now() + 3_600_000 })))).toBe(true);
    expect(hasDriveConnection(store(JSON.stringify({ token: 't', until: 1 })))).toBe(true);
  });
  it('is false when missing or malformed', () => {
    expect(hasDriveConnection(store(null))).toBe(false);
    expect(hasDriveConnection(store('nope'))).toBe(false);
    expect(hasDriveConnection(store('null'))).toBe(false);
    expect(hasDriveConnection(store(JSON.stringify({ token: 5 })))).toBe(false);
  });
  it('never throws', () => {
    expect(hasDriveConnection({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});

describe('driveFileLink', () => {
  it('keeps an https link on drive.google.com or docs.google.com', () => {
    expect(driveFileLink('https://drive.google.com/file/d/1/view')).toBe('https://drive.google.com/file/d/1/view');
    expect(driveFileLink('https://docs.google.com/document/d/1/edit')).toBe('https://docs.google.com/document/d/1/edit');
  });
  it('drops anything else', () => {
    expect(driveFileLink('http://drive.google.com/x')).toBeNull();
    expect(driveFileLink('https://evil.example/drive.google.com')).toBeNull();
    expect(driveFileLink('https://drive.google.com.evil.example/x')).toBeNull();
    expect(driveFileLink('javascript:alert(1)')).toBeNull();
    expect(driveFileLink('nope')).toBeNull();
    expect(driveFileLink(null)).toBeNull();
    expect(driveFileLink(5)).toBeNull();
  });
});
