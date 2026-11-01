import { describe, it, expect } from 'vitest';
import { createPageGeometry } from './coords.ts';
import { turnElement } from './pageTurn.ts';
import type { EditorElement } from '../model/editorModel.ts';
import { clearPage, rotatePage, stepHistory, turnPage, type PageEditState } from './pageEdits.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });
const rect = (id: string, pageIndex = 0): EditorElement => (
  { id, type: 'rectangle', pageIndex, left: 10, top: 20, width: 30, height: 10 } as EditorElement
);
const base: PageEditState = {
  elements: [], activeElementId: null, editingElementId: null,
  actionHistory: [], redoHistory: [], pageTurns: {}, documentRevision: 3,
};
const start: PageEditState = { ...base, elements: [rect('a'), rect('b', 1)] };
const rotate = (state: PageEditState) => rotatePage(state, { pageIndex: 0, geometry, description: 'Rotated page 1' });

describe('rotatePage', () => {
  it('turns only that page, records the turn and one history entry, and bumps the revision', () => {
    const next = rotate(start);
    expect(next.pageTurns).toEqual({ 0: 1 });
    expect(next.elements[0]).toEqual(turnElement(start.elements[0], geometry, 1));
    expect(next.elements[1]).toBe(start.elements[1]);
    expect(next.actionHistory).toHaveLength(1);
    expect(next.actionHistory[0]).toMatchObject({ operation: 'turn-page', type: 'ROTATE_PAGE', pageIndex: 0, geometry, description: 'Rotated page 1' });
    expect(next.documentRevision).toBe(4);
  });

  it('clears redo and the selection', () => {
    const redo = { id: 'r', type: 'X', operation: 'delete' as const, pageIndex: 0, description: '', timestamp: 0, elements: [] };
    const next = rotate({ ...start, activeElementId: 'a', editingElementId: 'a', redoHistory: [redo] });
    expect(next.redoHistory).toEqual([]);
    expect(next.activeElementId).toBeNull();
    expect(next.editingElementId).toBeNull();
  });

  it('stores measured text widths on the entry', () => {
    const next = rotatePage(start, { pageIndex: 0, geometry, textWidths: { a: 30 }, description: 'x' });
    expect(next.actionHistory[0]).toMatchObject({ textWidths: { a: 30 } });
  });
});

describe('turnPage', () => {
  it('by -1 turns back what by 1 turned', () => {
    const back = turnPage(turnPage(start, 0, geometry, 1), 0, geometry, -1);
    expect(back.pageTurns).toEqual({});
    expect((back.elements[0] as { left: number }).left).toBeCloseTo(10, 9);
    expect((back.elements[0] as { top: number }).top).toBeCloseTo(20, 9);
  });
});

describe('stepHistory', () => {
  it('undo restores elements and pageTurns, redo re-applies the turn', () => {
    const turned = rotate(start);
    const undone = stepHistory(turned, 'undo');
    expect(undone.pageTurns).toEqual({});
    expect(undone.actionHistory).toEqual([]);
    expect(undone.redoHistory).toHaveLength(1);
    expect(undone.documentRevision).toBeGreaterThan(turned.documentRevision);
    expect(undone.elements[1]).toBe(start.elements[1]);

    const redone = stepHistory(undone, 'redo');
    expect(redone.pageTurns).toEqual({ 0: 1 });
    expect(redone.actionHistory).toHaveLength(1);
  });
});

describe('clearPage', () => {
  it('removes only the elements on the given page', () => {
    const next = clearPage({ ...base, elements: [rect('1'), rect('2', 1), rect('3')] }, 0);
    expect(next.elements.map((e) => e.id)).toEqual(['2']);
  });

  it('drops the selection when the active element was on the cleared page', () => {
    const next = clearPage({ ...base, elements: [rect('1')], activeElementId: '1', editingElementId: '1' }, 0);
    expect(next.activeElementId).toBeNull();
    expect(next.editingElementId).toBeNull();
  });

  it('keeps the selection when the active element is on another page', () => {
    const next = clearPage({ ...base, elements: [rect('1'), rect('2', 1)], activeElementId: '2' }, 0);
    expect(next.activeElementId).toBe('2');
  });

  it('is a no-op when the page has nothing on it', () => {
    const state = { ...base, elements: [rect('1', 1)] };
    expect(clearPage(state, 0)).toBe(state);
  });

  it('clears the redo future and bumps the revision', () => {
    const redo = { id: 'r', type: 'X', operation: 'delete' as const, pageIndex: 0, description: '', timestamp: 0, elements: [] };
    const next = clearPage({ ...base, elements: [rect('1')], redoHistory: [redo] }, 0);
    expect(next.redoHistory).toEqual([]);
    expect(next.documentRevision).toBe(4);
  });
});
