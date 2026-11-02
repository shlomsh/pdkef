import { describe, expect, it } from 'vitest';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { activeAfterPick, keyboardInset, paneIndex, paneNotes, snapIndex, type PaneNote } from './notePane.ts';

const mark = (id: string, pageIndex = 0, top = 20, color = '#FFF34D'): HighlightElement => ({ id, type: 'highlight', pageIndex, left: 10, top, width: 30, height: 4, color, bands: [] });
const note = (id: string, on: string, comment = 'hi'): CommentElement => ({ id, type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4, comment, anchor: { kind: 'element', elementId: on } });

describe('paneNotes', () => {
  it('lists page 0 first even when elements are stored out of order', () => {
    const els: EditorElement[] = [mark('m2', 1), note('c2', 'm2', 'second'), mark('m1', 0), note('c1', 'm1', 'first')];
    expect(paneNotes(els, null).map((n) => n.id)).toEqual(['c1', 'c2']);
    expect(paneNotes(els, null).map((n) => n.pageIndex)).toEqual([0, 1]);
  });

  it('includes a blank active comment as new, but not a blank inactive one', () => {
    const els: EditorElement[] = [mark('m1'), note('c1', 'm1', ''), mark('m2', 0, 40), note('c2', 'm2', 'text')];
    expect(paneNotes(els, 'c1').map((n) => [n.id, n.isNew])).toEqual([['c1', true], ['c2', false]]);
    expect(paneNotes(els, null).map((n) => n.id)).toEqual(['c2']);
  });

  it('carries the mark id, the highlight color and the text', () => {
    const els: EditorElement[] = [mark('m1', 0, 20, '#ABCDEF'), note('c1', 'm1', 'hello')];
    expect(paneNotes(els, null)).toEqual([{ id: 'c1', markId: 'm1', pageIndex: 0, comment: 'hello', isNew: false, color: '#ABCDEF' }]);
  });

  it('has no mark and no color for a passage comment', () => {
    const passage: CommentElement = { ...note('c1', 'x'), anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }] } as CommentElement['anchor'] };
    const [n] = paneNotes([passage], null);
    expect(n.markId).toBeNull();
    expect(n.color).toBeNull();
  });
});

describe('paneIndex', () => {
  const notes: PaneNote[] = paneNotes([mark('m1'), note('c1', 'm1'), mark('m2', 0, 40), note('c2', 'm2')], null);
  it('finds the active note, or -1', () => {
    expect(paneIndex(notes, 'c2')).toBe(1);
    expect(paneIndex(notes, 'zzz')).toBe(-1);
    expect(paneIndex(notes, null)).toBe(-1);
  });
});

describe('snapIndex', () => {
  it('rounds to the nearest card', () => {
    expect(snapIndex(0, 100, 5)).toBe(0);
    expect(snapIndex(149, 100, 5)).toBe(1);
    expect(snapIndex(151, 100, 5)).toBe(2);
  });
  it('reads a negative (RTL) scroll the same way', () => {
    expect(snapIndex(-200, 100, 5)).toBe(2);
  });
  it('clamps to the cards', () => {
    expect(snapIndex(9000, 100, 5)).toBe(4);
    expect(snapIndex(-9000, 100, 5)).toBe(4);
  });
  it('is 0 without a step or cards', () => {
    expect(snapIndex(300, 0, 5)).toBe(0);
    expect(snapIndex(300, 100, 0)).toBe(0);
  });
});

describe('activeAfterPick', () => {
  const els: EditorElement[] = [mark('m1'), mark('m2'), mark('m3'), note('c1', 'm1', 'one'), note('c2', 'm2', '   ')];
  it('keeps a note that is already open on the picked mark', () => {
    expect(activeAfterPick(els, 'c1', 'm1')).toBe('c1');
  });
  it('opens the picked mark\'s note when it has text', () => {
    expect(activeAfterPick(els, null, 'm1')).toBe('c1');
    expect(activeAfterPick(els, 'c1', 'm1')).toBe('c1');
    expect(activeAfterPick(els, 'm3', 'm1')).toBe('c1');
  });
  it('switches an open note to the picked mark\'s note', () => {
    const more = [...els, mark('m4'), note('c4', 'm4', 'four')];
    expect(activeAfterPick(more, 'c1', 'm4')).toBe('c4');
  });
  it('closes an open note when the picked mark has no note text', () => {
    expect(activeAfterPick(els, 'c1', 'm3')).toBeNull();
    expect(activeAfterPick(els, 'c1', 'm2')).toBeNull();
  });
  it('leaves a non-note active element alone', () => {
    expect(activeAfterPick(els, 'm1', 'm3')).toBe('m1');
    expect(activeAfterPick(els, null, 'm3')).toBeNull();
  });
});

describe('keyboardInset', () => {
  it('is 0 with no keyboard', () => {
    expect(keyboardInset({ innerHeight: 800, vvHeight: 800, vvPageTop: 0, scrollY: 0 })).toBe(0);
  });
  it('is the keyboard height when it is up', () => {
    expect(keyboardInset({ innerHeight: 800, vvHeight: 500, vvPageTop: 0, scrollY: 0 })).toBe(300);
  });
  it('subtracts how far the visual viewport has scrolled inside the layout viewport', () => {
    expect(keyboardInset({ innerHeight: 800, vvHeight: 500, vvPageTop: 120, scrollY: 100 })).toBe(280);
  });
  it('never goes negative', () => {
    expect(keyboardInset({ innerHeight: 800, vvHeight: 700, vvPageTop: 300, scrollY: 0 })).toBe(0);
  });
});
