import { describe, expect, it } from 'vitest';
import { coverAllQueueStep } from './coverAllQueue.ts';

describe('coverAllQueueStep', () => {
  it('does nothing when not queued', () => {
    expect(coverAllQueueStep({ queued: false, reading: false, failed: false, open: 3 })).toBe('idle');
  });
  it('waits while pages are still being read, however many matches so far', () => {
    expect(coverAllQueueStep({ queued: true, reading: true, failed: false, open: 4 })).toBe('wait');
  });
  it('delivers once reading completes', () => {
    expect(coverAllQueueStep({ queued: true, reading: false, failed: false, open: 20 })).toBe('deliver');
  });
  it('drops when nothing is left to cover or reading failed', () => {
    expect(coverAllQueueStep({ queued: true, reading: false, failed: false, open: 0 })).toBe('drop');
    expect(coverAllQueueStep({ queued: true, reading: false, failed: true, open: 2 })).toBe('drop');
  });
});
