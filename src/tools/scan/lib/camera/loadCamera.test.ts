import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/Viewfinder.tsx', () => ({ default: 'Viewfinder' }));

import { loadViewfinder, onceUntilFailed } from './loadCamera.ts';

describe('loadViewfinder', () => {
  it('resolves to the viewfinder module', async () => {
    const mod = await loadViewfinder();
    expect(mod.default).toBe('Viewfinder');
  });

  it('is memoised: the second call returns the same promise', () => {
    expect(loadViewfinder()).toBe(loadViewfinder());
  });
});

describe('onceUntilFailed', () => {
  it('shares one promise across calls', () => {
    const load = vi.fn(() => Promise.resolve(1));
    const once = onceUntilFailed(load);
    expect(once()).toBe(once());
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a rejection so the next call loads again', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('chunk')).mockResolvedValueOnce(2);
    const once = onceUntilFailed(load);
    await expect(once()).rejects.toThrow('chunk');
    await expect(once()).resolves.toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
