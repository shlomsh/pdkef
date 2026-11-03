import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/Viewfinder.tsx', () => ({ default: 'Viewfinder' }));

import { loadViewfinder } from './loadCamera.ts';

describe('loadViewfinder', () => {
  it('resolves to the viewfinder module', async () => {
    const mod = await loadViewfinder();
    expect(mod.default).toBe('Viewfinder');
  });

  it('is memoised: the second call returns the same promise', () => {
    expect(loadViewfinder()).toBe(loadViewfinder());
  });
});
