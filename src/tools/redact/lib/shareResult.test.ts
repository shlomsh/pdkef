import { describe, expect, it, vi } from 'vitest';
import { englishRedactMessages as t } from '../messages.ts';
import { announceShareResult } from './shareResult.ts';

describe('announceShareResult', () => {
  it('says each answer of the share sheet', () => {
    const say = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    announceShareResult({ status: 'shared' }, say);
    announceShareResult({ status: 'canceled' }, say);
    announceShareResult({ status: 'error', error: new Error('no') }, say);
    expect(say.mock.calls.map(([text]) => text)).toEqual([t.shared, t.shareCanceled, t.shareError]);
  });

  it('says nothing when there was nothing to share', () => {
    const say = vi.fn();
    announceShareResult({ status: 'unavailable' }, say);
    expect(say).not.toHaveBeenCalled();
  });
});
