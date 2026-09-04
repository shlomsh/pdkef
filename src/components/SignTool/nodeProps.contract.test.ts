import { describe, expect, it } from 'vitest';
import type { EditorElementPatch, LineElement, TextElement } from '../../editor/model/editorModel.ts';
import type { ElementNodeChange, ElementNodeProps } from './nodeProps.ts';

describe('SignTool node-prop contracts', () => {
  it('keeps a node mutation inside its element variant', () => {
    const changeText: ElementNodeChange<TextElement> = (changes) => {
      expect(changes.text).toBe('Updated');
    };

    changeText({ text: 'Updated', fontSize: 14 });

    // @ts-expect-error a text node cannot submit line endpoints
    const invalidTextPatch: EditorElementPatch<TextElement> = { x1: 10 };
    expect(invalidTextPatch).toBeDefined();
  });

  it('requires the complete element geometry the rendered node consumes', () => {
    const lineProps: ElementNodeProps<LineElement> = {
      element: {
        id: 'line-1',
        type: 'line',
        pageIndex: 0,
        x1: 10,
        y1: 20,
        x2: 30,
        y2: 40,
      },
      isActive: false,
      onResizeStart: () => {},
    };

    expect(lineProps.element.x2).toBe(30);
  });
});
