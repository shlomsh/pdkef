import { describe, expect, it } from 'vitest';
import type { EditorElement, EllipseElement, LineElement, RectangleElement, TextElement } from './editorModel.ts';
import type { ElementUpdate } from './actionHistory.ts';
import { UPDATE_ENTRY_TYPES, classifyElementUpdate, createUpdateEntry } from './updateKind.ts';

const line: LineElement = {
  id: 'line-1', type: 'line', pageIndex: 0, x1: 10, y1: 10, x2: 30, y2: 30,
};

const text: TextElement = {
  id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 10, text: 'Hello',
};

const rect: RectangleElement = {
  id: 'rect-1', type: 'rectangle', pageIndex: 0, left: 10, top: 10, width: 20, height: 20,
};

const ellipse: EllipseElement = {
  id: 'ellipse-1', type: 'ellipse', pageIndex: 0, left: 10, top: 10, width: 20, height: 20,
};

function update<TElement extends EditorElement>(
  element: TElement,
  before: Partial<TElement>,
  after: Partial<TElement>,
): ElementUpdate {
  return { id: element.id, before, after } as unknown as ElementUpdate;
}

describe('classifyElementUpdate', () => {
  it('classifies {left, top} as move', () => {
    expect(classifyElementUpdate(update(rect, { left: 10, top: 10 }, { left: 20, top: 25 }))).toBe('move');
  });

  it('classifies only {top} as move', () => {
    expect(classifyElementUpdate(update(rect, { top: 10 }, { top: 25 }))).toBe('move');
  });

  it('classifies a line whose endpoints shifted equally as move', () => {
    expect(classifyElementUpdate(update(
      line,
      { x1: 10, y1: 10, x2: 30, y2: 30 },
      { x1: 15, y1: 15, x2: 35, y2: 35 },
    ))).toBe('move');
  });

  it('classifies a line with only x2/y2 changed as resize', () => {
    expect(classifyElementUpdate(update(
      line,
      { x2: 30, y2: 30 },
      { x2: 40, y2: 20 },
    ))).toBe('resize');
  });

  it('classifies {left, top, width, height} as resize', () => {
    expect(classifyElementUpdate(update(
      rect,
      { left: 10, top: 10, width: 20, height: 20 },
      { left: 5, top: 5, width: 30, height: 30 },
    ))).toBe('resize');
  });

  it('classifies {text} as text', () => {
    expect(classifyElementUpdate(update(text, { text: 'Hello' }, { text: 'Hi' }))).toBe('text');
  });

  it('classifies {text, fontFamily} as text', () => {
    expect(classifyElementUpdate(update(
      text,
      { text: 'Hello', fontFamily: 'Arial' },
      { text: 'Hi', fontFamily: 'Caveat' },
    ))).toBe('text');
  });

  it('classifies {text, dateFormatId: undefined, dateValue: undefined} as text', () => {
    expect(classifyElementUpdate(update(
      text,
      { text: 'Hello', dateFormatId: 'iso', dateValue: '2026-01-01' },
      { text: 'Hi', dateFormatId: undefined, dateValue: undefined },
    ))).toBe('text');
  });

  it('classifies {dateFormatId: "x", text} as style', () => {
    expect(classifyElementUpdate(update(
      text,
      { text: 'Hello', dateFormatId: undefined },
      { text: '01/01/2026', dateFormatId: 'us' },
    ))).toBe('style');
  });

  it('classifies {color} as style', () => {
    expect(classifyElementUpdate(update(rect, { color: '#000000' }, { color: '#ff0000' }))).toBe('style');
  });

  it('classifies {fontSize} as style', () => {
    expect(classifyElementUpdate(update(text, { fontSize: 12 }, { fontSize: 18 }))).toBe('style');
  });

  it('classifies {type: "ellipse", left, top, width, height} as style', () => {
    expect(classifyElementUpdate(update(
      ellipse,
      { left: 10, top: 10, width: 20, height: 20 },
      { type: 'ellipse', left: 10, top: 10, width: 20, height: 20 } as unknown as Partial<EditorElement>,
    ))).toBe('style');
  });
});

describe('createUpdateEntry', () => {
  const describe_ = (kind: string) => `Did a ${kind}`;

  it('returns null for a no-op', () => {
    expect(createUpdateEntry(rect, { left: rect.left }, describe_)).toBeNull();
  });

  it('sets operation "update", type from UPDATE_ENTRY_TYPES, label from describe(kind), and pageIndex from the element', () => {
    const entry = createUpdateEntry(rect, { left: 20 }, describe_);
    expect(entry?.operation).toBe('update');
    expect(entry?.type).toBe(UPDATE_ENTRY_TYPES.move);
    expect(entry?.description).toBe('Did a move');
    expect(entry?.pageIndex).toBe(rect.pageIndex);
  });

  it('sets group only when the kind is text and an editSession is given', () => {
    const textEntry = createUpdateEntry(text, { text: 'Hi' }, describe_, 'session-1');
    expect(textEntry?.group).toBe('session-1');

    const textNoSession = createUpdateEntry(text, { text: 'Hi' }, describe_);
    expect(textNoSession?.group).toBeUndefined();

    const moveEntry = createUpdateEntry(rect, { left: 20 }, describe_, 'session-1');
    expect(moveEntry?.group).toBeUndefined();
  });
});
