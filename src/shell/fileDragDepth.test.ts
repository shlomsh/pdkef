import { describe, it, expect } from 'vitest';
import { isFileDrag, nextDragDepth, isDragging } from './fileDragDepth';

describe('isFileDrag', () => {
  it('detects Files in an array', () => {
    expect(isFileDrag({ types: ['text/plain', 'Files'] } as unknown as DataTransfer)).toBe(true);
  });
  it('detects Files in a DOMStringList-like object', () => {
    const types = { length: 1, 0: 'Files', contains: (s: string) => s === 'Files' };
    expect(isFileDrag({ types } as unknown as DataTransfer)).toBe(true);
  });
  it('rejects other drags and null', () => {
    expect(isFileDrag({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false);
    expect(isFileDrag(null)).toBe(false);
  });
});

describe('nextDragDepth', () => {
  it('nests enters', () => {
    expect(nextDragDepth(nextDragDepth(0, 'enter'), 'enter')).toBe(2);
  });
  it('floors leave at zero', () => {
    expect(nextDragDepth(0, 'leave')).toBe(0);
    expect(nextDragDepth(2, 'leave')).toBe(1);
  });
  it('drop and reset return zero', () => {
    expect(nextDragDepth(3, 'drop')).toBe(0);
    expect(nextDragDepth(3, 'reset')).toBe(0);
  });
});

describe('isDragging', () => {
  it('is true only above zero', () => {
    expect(isDragging(0)).toBe(false);
    expect(isDragging(1)).toBe(true);
  });
});
