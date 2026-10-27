import { describe, expect, it } from 'vitest';
import { FULL_QUAD } from './quad.ts';
import {
  afterRemoval, exportKeyFor, failedPositions, isCurrentKey, newPage, nextUnreviewed, partitionFiles, partitionTurned,
  patchPage, resultKey, shownAspect, shownPhoto, tileDelta, turnKeyOf, turnPage, withInspection,
} from './scanPages.ts';

const photo = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const key = { altKey: false, metaKey: false, ctrlKey: false, shiftKey: false };

describe('scanPages', () => {
  it('makes pages with fresh ids, the whole photo as corners and the look given', () => {
    const a = newPage(photo(), 'grayscale');
    const b = newPage(photo(), 'document');
    expect(b.id).toBe(a.id + 1);
    expect(a).toMatchObject({ filter: 'grayscale', quad: FULL_QUAD, turns: 0, guessed: false, edited: false, found: null, preview: null });
  });

  it('keys a result by id, corners, look and turns, and knows when a key is still current', () => {
    const page = newPage(photo(), 'document');
    const k = resultKey(page);
    expect(k.startsWith(`${page.id}|`)).toBe(true);
    expect(isCurrentKey([page], k)).toBe(true);
    expect(isCurrentKey([turnPage([page], page.id)[0]], k)).toBe(false);
    expect(isCurrentKey([], k)).toBe(false);
  });

  it('splits a pick into photos and the names of what is skipped', () => {
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });
    expect(partitionFiles([photo('a.jpg'), text], ['image/jpeg'])).toEqual({ accepted: [expect.any(File)], rejectedNames: ['notes.txt'] });
  });

  describe('withInspection', () => {
    const guess = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }] as typeof FULL_QUAD;
    it('adopts the guessed corners and the photo size', () => {
      const page = newPage(photo(), 'document');
      const [next] = withInspection([page], page.id, { quad: guess, width: 200, height: 100 }, 'blob:p');
      expect(next).toMatchObject({ guessed: true, found: true, quad: guess, preview: 'blob:p', aspect: 2 });
    });
    it('keeps corners the person moved', () => {
      const page = { ...newPage(photo(), 'document'), edited: true };
      expect(withInspection([page], page.id, { quad: guess, width: 1, height: 1 }, null)[0].quad).toBe(page.quad);
    });
    it('marks an unreadable photo guessed with no preview and no aspect', () => {
      const page = newPage(photo(), 'document');
      expect(withInspection([page], page.id, null, null)[0]).toMatchObject({ guessed: true, found: false, preview: null, aspect: null });
    });
    it('leaves other pages alone', () => {
      const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
      expect(withInspection([a, b], a.id, null, null)[1]).toBe(b);
    });
  });

  it('patches and turns one page only', () => {
    const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
    expect(patchPage([a, b], a.id, { reviewed: true }).map((p) => p.reviewed)).toEqual([true, false]);
    expect(turnPage([{ ...a, turns: 3 }, b], a.id).map((p) => p.turns)).toEqual([0, 0]);
    expect(turnPage([a, b], b.id).map((p) => p.turns)).toEqual([0, 1]);
  });

  it('reads arrows as moves, and nothing with a modifier', () => {
    expect(tileDelta({ ...key, key: 'ArrowLeft' })).toBe(-1);
    expect(tileDelta({ ...key, key: 'ArrowUp' })).toBe(-1);
    expect(tileDelta({ ...key, key: 'ArrowRight' })).toBe(1);
    expect(tileDelta({ ...key, key: 'ArrowDown' })).toBe(1);
    expect(tileDelta({ ...key, key: 'a' })).toBe(0);
    expect(tileDelta({ ...key, key: 'ArrowLeft', shiftKey: true })).toBe(0);
  });

  it('keys turned previews only for turned pages, and shows the photo as it should be seen', () => {
    const page = { ...newPage(photo(), 'document'), preview: 'blob:p', aspect: 2 };
    expect(turnKeyOf(page)).toBeNull();
    expect(turnKeyOf(undefined)).toBeNull();
    expect(shownPhoto(page, {})).toBe('blob:p');
    const turned = { ...page, turns: 1 };
    expect(turnKeyOf(turned)).toBe(`${page.id}|1`);
    expect(shownPhoto(turned, {})).toBeNull();
    expect(shownPhoto(turned, { [`${page.id}|1`]: 'blob:t' })).toBe('blob:t');
    expect(shownAspect(page)).toBe(2);
    expect(shownAspect(turned)).toBe(0.5);
    expect(shownAspect(undefined)).toBe(0.75);
  });

  it('splits the turned previews by a key test', () => {
    expect(partitionTurned({ '1|1': 'a', '2|1': 'b' }, (k) => k.startsWith('1|'))).toEqual({ kept: { '2|1': 'b' }, dropped: ['a'] });
  });

  it('counts failed pages from one, in list order', () => {
    const pages = [newPage(photo(), 'document'), newPage(photo(), 'document'), newPage(photo(), 'document')];
    expect(failedPositions(pages, [pages[2].id, pages[0].id])).toBe('1, 3');
  });

  describe('afterRemoval', () => {
    const pages = [newPage(photo(), 'document'), newPage(photo(), 'document'), newPage(photo(), 'document')];
    it('lands on the page that takes its place, or the one before at the end', () => {
      expect(afterRemoval(pages, pages[1].id, 'result').neighbour).toBe(pages[2]);
      expect(afterRemoval(pages, pages[2].id, 'result').neighbour).toBe(pages[1]);
    });
    it('offers the next new photo only from the corners', () => {
      expect(afterRemoval(pages, pages[0].id, 'result').nextNew).toBeUndefined();
      expect(afterRemoval(pages, pages[0].id, 'corners').nextNew).toBe(pages[1]);
    });
    it('finds nothing for an unknown id', () => {
      expect(afterRemoval(pages, -1, 'result').removed).toBeUndefined();
    });
  });

  it('finds the next page still waiting for its corners to be used', () => {
    const [a, b] = [newPage(photo(), 'document'), { ...newPage(photo(), 'document'), reviewed: true }];
    expect(nextUnreviewed([a, b], a.id)).toBeUndefined();
    expect(nextUnreviewed([a, b], b.id)).toBe(a);
  });

  describe('exportKeyFor', () => {
    const [a, b] = [{ ...newPage(photo(), 'document'), guessed: true }, newPage(photo(), 'document')];
    it('waits until every page has been inspected and none failed', () => {
      expect(exportKeyFor([], [], 'fit', 'none')).toBeNull();
      expect(exportKeyFor([a, b], [], 'fit', 'none')).toBeNull();
      expect(exportKeyFor([a], [a.id], 'fit', 'none')).toBeNull();
    });
    it('joins the result keys and the settings', () => {
      expect(exportKeyFor([a], [], 'a4', 'small')).toBe(`${resultKey(a)}|a4|small`);
    });
  });
});
