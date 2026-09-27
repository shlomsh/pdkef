import { describe, expect, it } from 'vitest';
import { repeatOnEveryPage, type RepeatableElement } from './repeatOnEveryPage.ts';

function makeElement(overrides: Partial<RepeatableElement> = {}): RepeatableElement {
  return {
    id: 'source',
    pageIndex: 0,
    type: 'blackout',
    left: 10,
    top: 20,
    width: 30,
    height: 5,
    ...overrides,
  };
}

describe('repeatOnEveryPage', () => {
  it('adds nothing on a single-page document', () => {
    const source = makeElement();
    const result = repeatOnEveryPage(source, [source], 1, () => 'new-id');
    expect(result).toEqual([]);
  });

  it('adds a copy to every other page on a 4-page document', () => {
    const source = makeElement();
    let counter = 0;
    const result = repeatOnEveryPage(source, [source], 4, () => `new-${counter++}`);
    expect(result).toHaveLength(3);
    expect(result.map((el) => el.pageIndex).sort()).toEqual([1, 2, 3]);
    // The source's own page never gets a second copy.
    expect(result.some((el) => el.pageIndex === source.pageIndex)).toBe(false);
  });

  it('skips a page that already carries an equivalent box, so pressing it twice adds nothing', () => {
    const source = makeElement();
    let counter = 0;
    const makeId = () => `new-${counter++}`;
    const firstPass = repeatOnEveryPage(source, [source], 4, makeId);
    expect(firstPass).toHaveLength(3);

    const afterFirstPass = [source, ...firstPass];
    const secondPass = repeatOnEveryPage(source, afterFirstPass, 4, makeId);
    expect(secondPass).toEqual([]);
  });

  it('does not skip a page whose existing box has different geometry or type', () => {
    const source = makeElement();
    const differentGeometry = makeElement({ id: 'other', pageIndex: 1, left: 50 });
    const result = repeatOnEveryPage(source, [source, differentGeometry], 2, () => 'new-id');
    expect(result).toHaveLength(1);
    expect(result[0].pageIndex).toBe(1);
  });

  it('preserves color and strength on every copy', () => {
    const source = makeElement({ type: 'blur', color: undefined, strength: 'medium' });
    const result = repeatOnEveryPage(source, [source], 2, () => 'new-id');
    expect(result).toHaveLength(1);
    expect(result[0].strength).toBe('medium');

    const colored = makeElement({ type: 'whiteout', color: '#123456' });
    const coloredResult = repeatOnEveryPage(colored, [colored], 2, () => 'new-id-2');
    expect(coloredResult[0].color).toBe('#123456');
  });

  it('gives every added element a unique id', () => {
    const source = makeElement();
    let counter = 0;
    const result = repeatOnEveryPage(source, [source], 5, () => `new-${counter++}`);
    const ids = new Set(result.map((el) => el.id));
    expect(ids.size).toBe(result.length);
    expect(ids.has(source.id)).toBe(false);
  });
});
