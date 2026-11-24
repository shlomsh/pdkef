import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { mountRedactEditor, type MountedRedactEditor } from './redactEditor.test-helper.tsx';
import type { FindMatch } from '../lib/find/types.ts';

const match = (id: string, boxCount: number): FindMatch => ({
  id, pageIndex: 0, start: 0, end: 8, text: 'Jane Doe',
  boxes: Array.from({ length: boxCount }, (_, i) => ({ left: 10, top: 10 + i * 5, width: 20, height: 3 })),
});

describe('useRedactFind redactMatches', () => {
  let mounted: MountedRedactEditor;
  afterEach(() => mounted.unmount());

  const findSetIds = () => mounted.state().edits.elements.map((el) => (el as { findSetId?: string }).findSetId);

  it('gives every box added by one Redact all the same findSetId', () => {
    mounted = mountRedactEditor();
    act(() => mounted.editor().findKit.redactMatches([match('0:0', 1), match('0:20', 1)]));

    const ids = findSetIds();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
  });

  it('puts the two boxes of one match that wraps onto a second line in a set', () => {
    mounted = mountRedactEditor();
    act(() => mounted.editor().findKit.redactMatches([match('0:0', 2)]));

    const ids = findSetIds();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
  });

  it('leaves a single box in no set', () => {
    mounted = mountRedactEditor();
    act(() => mounted.editor().findKit.redactMatches([match('0:0', 1)]));

    expect(findSetIds()).toEqual([undefined]);
  });
});
