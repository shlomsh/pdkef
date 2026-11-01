import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '#editor/geometry/coords.ts';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { clearPageActions, rotatePageAction } from './pageEditActions.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });
const mark = (id: string, pageIndex: number): HighlightElement => ({
  id, type: 'highlight', pageIndex, left: 10, top: 10, width: 20, height: 2,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
});

describe('pageEditActions', () => {
  it('rotatePageAction names the page and carries its geometry', () => {
    const action = rotatePageAction(2, geometry);
    expect(action.type).toBe('ROTATE_PAGE');
    expect(action).toMatchObject({ payload: { pageIndex: 2, geometry } });
    expect((action as { payload: { description: string } }).payload.description).toContain('3');
  });

  it('clearPageActions is empty for a page without marks', () => {
    expect(clearPageActions([mark('a', 0)], 1)).toEqual([]);
  });

  it('clearPageActions clears the page, then logs one step holding exactly that page', () => {
    const actions = clearPageActions([mark('a', 0), mark('b', 1)], 1);
    expect(actions.map((a) => a.type)).toEqual(['CLEAR_PAGE', 'ADD_ACTION_HISTORY']);
    expect(actions[0]).toEqual({ type: 'CLEAR_PAGE', payload: 1 });
    const entry = JSON.stringify((actions[1] as { payload: unknown }).payload);
    expect(entry).toContain('"b"');
    expect(entry).not.toContain('"a"');
  });
});
