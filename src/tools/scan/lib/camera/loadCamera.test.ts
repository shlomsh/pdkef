import { describe, expect, it } from 'vitest';

import Viewfinder from '../../components/Viewfinder.tsx';
import { loadViewfinder, onceUntilFailed } from './loadCamera.ts';

describe('loadViewfinder', () => {
  it('resolves to the viewfinder module', async () => {
    const mod = await loadViewfinder();
    expect(mod.default).toBe(Viewfinder);
  });

  it('is memoised: the second call returns the same promise', () => {
    expect(loadViewfinder()).toBe(loadViewfinder());
  });
});

describe('onceUntilFailed', () => {
  it('shares one promise across calls', () => {
    let loads = 0;
    const once = onceUntilFailed(() => { loads++; return Promise.resolve(1); });
    expect(once()).toBe(once());
    expect(loads).toBe(1);
  });

  it('forgets a rejection so the next call loads again', async () => {
    let loads = 0;
    const once = onceUntilFailed(() => { loads++; return loads === 1 ? Promise.reject(new Error('chunk')) : Promise.resolve(2); });
    await expect(once()).rejects.toThrow('chunk');
    await expect(once()).resolves.toBe(2);
    expect(loads).toBe(2);
  });
});
