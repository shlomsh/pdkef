import { describe, expect, it } from 'vitest';
import { elementDefaultsFor } from './elementDefaults.ts';
import type { DocumentStyle } from './documentStyle.ts';

// Mirrors today's constants.js/SignDefaultsContext fallbacks (DEFAULT_FONT_FAMILY,
// DEFAULT_FONT_SIZE_PT, DEFAULT_COLOR_BLUE, DEFAULT_STROKE_WIDTH,
// DEFAULT_SYMBOL_WIDTH_PCT, DEFAULT_START_WIDTH_PCT, DEFAULT_WHITEOUT_COLOR,
// the 'locale'/'check' initial values useWorkspaceGestures.ts defaults to) -
// this file cannot import src/constants/signGeometry.js itself
// (test:editor-dependency-directions), so the values are copied once, here,
// as the fixture every case below is checked against. textAlign/bold/italic
// have no prior remembered value at all (SIGN-33's own premise) - 'left'/
// false/false is the plain-English/LTR baseline the tool already renders
// unset fields as.
const DEFAULTS: DocumentStyle = {
  font: 'Arimo',
  fontSize: 12,
  direction: 'ltr',
  color: '#1463ff',
  textAlign: 'left',
  bold: false,
  italic: false,
  dateFormat: 'locale',
  symbolMark: 'check',
  symbolWidth: 5,
  strokeWidth: 3,
  whiteoutColor: '#ffffff',
  signatureWidth: 20,
};

describe('elementDefaultsFor', () => {
  it('text: {} returns today\'s defaults exactly', () => {
    expect(elementDefaultsFor({}, 'text', DEFAULTS)).toEqual({
      fontFamily: 'Arimo',
      // No size, direction or alignment until the document carries one: the
      // caller's contextual fallbacks decide (see elementDefaults.ts).
      fontSize: undefined,
      textDirection: undefined,
      color: '#1463ff',
      textAlign: undefined,
      fontWeight: 'normal',
      fontStyle: 'normal',
      dateFormatId: 'locale',
    });
  });

  it('text: every carried key overrides its default', () => {
    const carried: Partial<DocumentStyle> = {
      font: 'Noto Sans Hebrew',
      fontSize: 18,
      direction: 'rtl',
      color: '#00aa00',
      textAlign: 'right',
      bold: true,
      italic: true,
      dateFormat: 'DDMMYYYY',
    };
    expect(elementDefaultsFor(carried, 'text', DEFAULTS)).toEqual({
      fontFamily: 'Noto Sans Hebrew',
      fontSize: 18,
      textDirection: 'rtl',
      color: '#00aa00',
      textAlign: 'right',
      fontWeight: 'bold',
      fontStyle: 'italic',
      dateFormatId: 'DDMMYYYY',
    });
  });

  it('text: unrelated carried keys are ignored', () => {
    const carried: Partial<DocumentStyle> = { symbolMark: 'x', strokeWidth: 9, whiteoutColor: '#000000', signatureWidth: 40 };
    expect(elementDefaultsFor(carried, 'text', DEFAULTS)).toEqual({
      fontFamily: 'Arimo',
      // No size, direction or alignment until the document carries one: the
      // caller's contextual fallbacks decide (see elementDefaults.ts).
      fontSize: undefined,
      textDirection: undefined,
      color: '#1463ff',
      textAlign: undefined,
      fontWeight: 'normal',
      fontStyle: 'normal',
      dateFormatId: 'locale',
    });
  });

  it('symbol: {} returns today\'s defaults exactly', () => {
    expect(elementDefaultsFor({}, 'symbol', DEFAULTS)).toEqual({
      mark: 'check',
      width: 5,
      color: '#1463ff',
    });
  });

  it('symbol: carried keys override', () => {
    const carried: Partial<DocumentStyle> = { symbolMark: 'dot', symbolWidth: 8, color: '#ff0000' };
    expect(elementDefaultsFor(carried, 'symbol', DEFAULTS)).toEqual({
      mark: 'dot',
      width: 8,
      color: '#ff0000',
    });
  });

  it('symbol: unrelated carried keys are ignored', () => {
    const carried: Partial<DocumentStyle> = { fontSize: 30, whiteoutColor: '#000000', signatureWidth: 40 };
    expect(elementDefaultsFor(carried, 'symbol', DEFAULTS)).toEqual({
      mark: 'check',
      width: 5,
      color: '#1463ff',
    });
  });

  for (const type of ['rectangle', 'ellipse', 'line'] as const) {
    it(`${type}: {} returns today's defaults exactly`, () => {
      expect(elementDefaultsFor({}, type, DEFAULTS)).toEqual({
        strokeWidth: 3,
        color: '#1463ff',
      });
    });

    it(`${type}: carried keys override`, () => {
      const carried: Partial<DocumentStyle> = { strokeWidth: 7, color: '#123456' };
      expect(elementDefaultsFor(carried, type, DEFAULTS)).toEqual({
        strokeWidth: 7,
        color: '#123456',
      });
    });

    it(`${type}: unrelated carried keys are ignored`, () => {
      const carried: Partial<DocumentStyle> = { symbolMark: 'x', fontSize: 40, whiteoutColor: '#000000' };
      expect(elementDefaultsFor(carried, type, DEFAULTS)).toEqual({
        strokeWidth: 3,
        color: '#1463ff',
      });
    });
  }

  it('whiteout: {} returns today\'s default color exactly', () => {
    expect(elementDefaultsFor({}, 'whiteout', DEFAULTS)).toEqual({ color: '#ffffff' });
  });

  it('whiteout: carried whiteoutColor overrides', () => {
    expect(elementDefaultsFor({ whiteoutColor: '#fdf6e3' }, 'whiteout', DEFAULTS)).toEqual({ color: '#fdf6e3' });
  });

  it('whiteout: ignores carried color (the text/shape color, not the fill)', () => {
    expect(elementDefaultsFor({ color: '#ff0000' }, 'whiteout', DEFAULTS)).toEqual({ color: '#ffffff' });
  });

  it('whiteout: ignores unrelated carried keys', () => {
    const carried: Partial<DocumentStyle> = { color: '#ff0000', strokeWidth: 9, symbolMark: 'x', signatureWidth: 40 };
    expect(elementDefaultsFor(carried, 'whiteout', DEFAULTS)).toEqual({ color: '#ffffff' });
  });

  it('signature: {} returns today\'s default width exactly', () => {
    expect(elementDefaultsFor({}, 'signature', DEFAULTS)).toEqual({ width: 20 });
  });

  it('signature: carried signatureWidth overrides', () => {
    expect(elementDefaultsFor({ signatureWidth: 35 }, 'signature', DEFAULTS)).toEqual({ width: 35 });
  });

  it('signature: unrelated carried keys are ignored', () => {
    const carried: Partial<DocumentStyle> = { color: '#ff0000', whiteoutColor: '#000000', fontSize: 40 };
    expect(elementDefaultsFor(carried, 'signature', DEFAULTS)).toEqual({ width: 20 });
  });

  it('blackout/blur (Redact-only types) carry no document style', () => {
    expect(elementDefaultsFor({ color: '#ff0000' }, 'blackout', DEFAULTS)).toEqual({});
    expect(elementDefaultsFor({ color: '#ff0000' }, 'blur', DEFAULTS)).toEqual({});
  });
});
