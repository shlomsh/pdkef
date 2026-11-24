import { describe, expect, it } from 'vitest';
import { shareOutcome } from './shareAnnouncement.ts';

const messages = { shared: 'Shared', canceled: 'Sharing canceled', shareError: 'Sharing failed' };

describe('shareOutcome', () => {
  it('a share that is cancelled says so in the live region and does not count as a share', () => {
    expect(shareOutcome('canceled', messages)).toEqual({ counted: false, announcement: 'Sharing canceled' });
  });

  it('a share that is failed says so in the live region and does not count as a share', () => {
    expect(shareOutcome('error', messages)).toEqual({ counted: false, announcement: 'Sharing failed' });
  });

  it('a completed share is announced and counts as a share', () => {
    expect(shareOutcome('shared', messages)).toEqual({ counted: true, announcement: 'Shared' });
  });

  it('a share that could not start says nothing and does not count as a share', () => {
    expect(shareOutcome('unavailable', messages)).toEqual({ counted: false, announcement: null });
  });
});
