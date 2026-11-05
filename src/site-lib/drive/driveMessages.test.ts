import { describe, expect, it } from 'vitest';
import { canRetry, driveMessage, pickerLabels, type DriveFailure } from './driveMessages.ts';

const ALL: DriveFailure[] = ['denied', 'blocked', 'script', 'unauthorized', 'not-found', 'not-pdf', 'network'];

describe('driveMessages', () => {
  it('gives every failure one plain line without dashes', () => {
    for (const failure of ALL) {
      expect(driveMessage(failure)).toMatch(/\S/);
      expect(driveMessage(failure)).not.toContain('—');
    }
  });
  it('treats a denied sign-in and a blocked popup alike', () => {
    expect(driveMessage('blocked')).toBe(driveMessage('denied'));
  });
  it('offers a retry only where trying again can help', () => {
    expect(canRetry('denied')).toBe(true);
    expect(canRetry('network')).toBe(true);
    expect(canRetry('not-found')).toBe(false);
    expect(canRetry('not-pdf')).toBe(false);
  });
});

describe('pickerLabels', () => {
  it('is English by default', () => {
    expect(pickerLabels('/sign/')).toEqual({ labels: { title: 'Choose a file', recent: 'Recent', myDrive: 'My Drive', shared: 'Shared with me', starred: 'Starred' }, locale: undefined });
    expect(pickerLabels('/hello/').locale).toBeUndefined();
  });
  it('is Hebrew under /he', () => {
    for (const path of ['/he', '/he/', '/he/sign/']) {
      const out = pickerLabels(path);
      expect(out.locale).toBe('he');
      expect(out.labels.title).toBe('בחירת קובץ');
      expect(out.labels.myDrive).toBe('האחסון שלי');
    }
  });
});
