import { describe, expect, it } from 'vitest';
import config from '../vitest.config.js';

describe('vitest.config.js projects', () => {
  it('can run together: Vitest refuses two projects with different maxWorkers in one group', () => {
    const groups = new Map();
    for (const { test } of config.test.projects) {
      const order = test.sequence?.groupOrder ?? 0;
      groups.set(order, [...(groups.get(order) ?? []), test.maxWorkers]);
    }
    for (const [order, workers] of groups) expect(new Set(workers).size, `group ${order}`).toBe(1);
  });
});
