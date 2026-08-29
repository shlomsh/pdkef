import { describe, expect, it } from 'vitest';
import { uniqueId, seedUniqueId } from './ids.ts';

// Moved from sign.js's own test file (TODO.md ARCH-01): these two only ever
// tested ID bookkeeping, not anything PDF-specific.
describe('uniqueId', () => {
  it('should generate sequential string IDs', () => {
    seedUniqueId([]); // reset max
    const id1 = uniqueId();
    const id2 = uniqueId();
    expect(id1).toMatch(/^el-\d+$/);
    expect(id2).toMatch(/^el-\d+$/);
    expect(id1).not.toBe(id2);
  });

  it('should respect seedUniqueId to prevent collisions', () => {
    seedUniqueId([{ id: 'el-10' }, { id: 'el-5' }]);
    const newId = uniqueId();
    expect(newId).toBe('el-11');
    const nextId = uniqueId();
    expect(nextId).toBe('el-12');
  });
});
