import { describe, expect, it } from 'vitest';
import { carriedPatchFor } from './carriedPatch.ts';
import type { EditorElement, TextElement } from './editorModel.ts';

// SIGN-33: one case per DocumentStyle key, mirroring PdfWorkspace.tsx's
// makeOnChange field by field.

const noDetect = () => null;

const textElement: TextElement = {
  id: 'el-1',
  type: 'text',
  pageIndex: 0,
  left: 10,
  top: 10,
  text: 'hello',
};

const whiteoutElement: EditorElement = {
  id: 'el-2',
  type: 'whiteout',
  pageIndex: 0,
  left: 10,
  top: 10,
  width: 20,
  height: 10,
};

const symbolElement: EditorElement = {
  id: 'el-3',
  type: 'symbol',
  pageIndex: 0,
  left: 10,
  top: 10,
  width: 20,
  height: 20,
};

const signatureElement: EditorElement = {
  id: 'el-4',
  type: 'signature',
  pageIndex: 0,
  left: 10,
  top: 10,
  width: 30,
  height: 10,
  dataUrl: 'data:image/png;base64,',
};

describe('carriedPatchFor', () => {
  it('carries a text colour to color', () => {
    expect(carriedPatchFor(textElement, { color: '#ff0000' }, noDetect)).toEqual({ color: '#ff0000' });
  });

  it('carries a whiteout colour to whiteoutColor, not color', () => {
    expect(carriedPatchFor(whiteoutElement, { color: '#fff9e6' }, noDetect)).toEqual({ whiteoutColor: '#fff9e6' });
  });

  it('carries fontFamily to font', () => {
    expect(carriedPatchFor(textElement, { fontFamily: 'Great Vibes' }, noDetect)).toEqual({ font: 'Great Vibes' });
  });

  it('carries fontSize to fontSize', () => {
    expect(carriedPatchFor(textElement, { fontSize: 18 }, noDetect)).toEqual({ fontSize: 18 });
  });

  it('carries strokeWidth to strokeWidth', () => {
    expect(carriedPatchFor(symbolElement, { strokeWidth: 3 }, noDetect)).toEqual({ strokeWidth: 3 });
  });

  it('carries a resized symbol width to symbolWidth', () => {
    expect(carriedPatchFor(symbolElement, { width: 25 }, noDetect)).toEqual({ symbolWidth: 25 });
  });

  it('carries a symbol mark change to symbolMark', () => {
    expect(carriedPatchFor(symbolElement, { mark: 'x' }, noDetect)).toEqual({ symbolMark: 'x' });
  });

  it('carries a resized signature width to signatureWidth', () => {
    expect(carriedPatchFor(signatureElement, { width: 40 }, noDetect)).toEqual({ signatureWidth: 40 });
  });

  it('carries an explicit direction toggle to direction', () => {
    expect(carriedPatchFor(textElement, { textDirection: 'rtl' }, noDetect)).toEqual({ direction: 'rtl' });
  });

  it('carries the detected typing direction exactly as makeOnChange does today', () => {
    const detect = (text: string) => (text === 'שלום' ? 'rtl' as const : null);
    expect(carriedPatchFor(textElement, { text: 'שלום' }, detect)).toEqual({ direction: 'rtl' });
  });

  it('carries nothing when the detector finds no direction', () => {
    expect(carriedPatchFor(textElement, { text: '123' }, noDetect)).toEqual({});
  });

  it('carries dateFormatId to dateFormat', () => {
    expect(carriedPatchFor(textElement, { dateFormatId: 'MMDDYYYY' }, noDetect)).toEqual({ dateFormat: 'MMDDYYYY' });
  });

  it('carries textAlign to its own key', () => {
    expect(carriedPatchFor(textElement, { textAlign: 'right' }, noDetect)).toEqual({ textAlign: 'right' });
  });

  it('carries fontWeight to bold, true and false', () => {
    expect(carriedPatchFor(textElement, { fontWeight: 'bold' }, noDetect)).toEqual({ bold: true });
    expect(carriedPatchFor(textElement, { fontWeight: 'normal' }, noDetect)).toEqual({ bold: false });
  });

  it('carries fontStyle to italic, true and false', () => {
    expect(carriedPatchFor(textElement, { fontStyle: 'italic' }, noDetect)).toEqual({ italic: true });
    expect(carriedPatchFor(textElement, { fontStyle: 'normal' }, noDetect)).toEqual({ italic: false });
  });

  it('a date\'s generated text never carries a direction (SIGN-34)', () => {
    const detectLtr = () => 'ltr' as const;
    const date: TextElement = { ...textElement, dateValue: '2026-09-26', dateFormatId: 'locale' };
    expect(carriedPatchFor(date, { text: 'September 26, 2026' }, detectLtr)).toEqual({});
    expect(carriedPatchFor(textElement, { text: 'September 26, 2026', dateFormatId: 'long' }, detectLtr))
      .toEqual({ dateFormat: 'long' });
  });

  it('a move patch (geometry only) carries nothing', () => {
    expect(carriedPatchFor(textElement, { left: 50, top: 60 }, noDetect)).toEqual({});
  });

  it('a height-only resize carries nothing', () => {
    expect(carriedPatchFor(whiteoutElement, { height: 40 }, noDetect)).toEqual({});
  });
});
