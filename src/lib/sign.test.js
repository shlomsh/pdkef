import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import {
  signPdf,
  hexToRgbFractions,
  getEffectiveTextDirection,
  uniqueId,
  seedUniqueId
} from './sign.js';

function getFixtureFile(name = 'num-1.pdf') {
  const filePath = path.resolve(__dirname, './__fixtures__', name);
  const buffer = fs.readFileSync(filePath);
  return new File([buffer], name, { type: 'application/pdf' });
}

// Minimal 1×1 transparent PNG (base64) returned by the canvas mock's toDataURL.
const STUB_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// JSDOM doesn't implement HTMLCanvasElement.getContext('2d'). This mock patches
// document.createElement so canvas elements return a working stub ctx, and also
// stubs document.fonts.load (also absent from JSDOM).
function mockCanvas() {
  const originalCreateElement = document.createElement.bind(document);

  const mockCtx = {
    font: '',
    fillStyle: '',
    textBaseline: '',
    direction: '',
    measureText: vi.fn(() => ({ width: 120 })),
    fillText: vi.fn(),
  };

  document.createElement = vi.fn((tag) => {
    if (tag !== 'canvas') return originalCreateElement(tag);
    // Properties must be writable for the renderer to set width/height.
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => mockCtx), toDataURL: vi.fn(() => STUB_PNG) };
    return canvas;
  });

  if (!document.fonts) document.fonts = {};
  document.fonts.load = vi.fn().mockResolvedValue(undefined);

  return () => { document.createElement = originalCreateElement; };
}

describe('sign.js signPdf', () => {
  let restoreCanvas;

  beforeEach(() => { restoreCanvas = mockCanvas(); });
  afterEach(() => { restoreCanvas(); vi.restoreAllMocks(); });

  it('produces a valid PDF Blob for an LTR text element and invokes the canvas path', async () => {
    const file = getFixtureFile();
    const blob = await signPdf(file, [{
      id: 'el-ltr', type: 'text', pageIndex: 0,
      left: 10, top: 10, text: 'Hello', textDirection: 'ltr',
      fontSize: 20, color: '#000000', fontFamily: 'Arimo',
    }]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    // Canvas must have been created (text rendered via browser shaping engine)
    expect(document.createElement).toHaveBeenCalledWith('canvas');
  });

  it('produces a valid PDF Blob for an RTL text element without throwing', async () => {
    const file = getFixtureFile();
    const blob = await signPdf(file, [{
      id: 'el-rtl', type: 'text', pageIndex: 0,
      left: 80, top: 10, text: 'שלום', textDirection: 'rtl',
      fontSize: 20, color: '#000000', fontFamily: 'Heebo',
    }]);
    expect(blob).toBeInstanceOf(Blob);
    expect(document.createElement).toHaveBeenCalledWith('canvas');
  });

  it('skips canvas creation for empty text elements', async () => {
    const file = getFixtureFile();
    const blob = await signPdf(file, [{
      id: 'el-empty', type: 'text', pageIndex: 0,
      left: 10, top: 10, text: '', fontSize: 12, color: '#000000',
    }]);
    expect(blob).toBeInstanceOf(Blob);
    // Canvas must NOT be created when there is nothing to render
    expect(document.createElement).not.toHaveBeenCalledWith('canvas');
  });

  it('calls document.fonts.load with the correct font descriptor so the @font-face is ready', async () => {
    const file = getFixtureFile();
    await signPdf(file, [{
      id: 'el-font', type: 'text', pageIndex: 0,
      left: 10, top: 10, text: 'Test', fontFamily: 'Caveat',
      fontSize: 14, color: '#000000',
    }]);
    // font string must mention the family name and size
    expect(document.fonts.load).toHaveBeenCalledWith(expect.stringContaining('Caveat'));
    expect(document.fonts.load).toHaveBeenCalledWith(expect.stringContaining('42px')); // 14pt × 3 scale
  });
});

describe('sign.js pure functions', () => {
  describe('hexToRgbFractions', () => {
    it('should convert standard hex colors correctly', () => {
      expect(hexToRgbFractions('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgbFractions('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
      expect(hexToRgbFractions('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
    });

    it('should handle hex colors without the # prefix', () => {
      expect(hexToRgbFractions('00ff00')).toEqual({ r: 0, g: 1, b: 0 });
    });

    it('should return black for invalid or undefined input if fallback is not provided', () => {
      expect(hexToRgbFractions(undefined)).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgbFractions(null)).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgbFractions('invalid')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should use the provided fallback color', () => {
      expect(hexToRgbFractions(null, '#0000ff')).toEqual({ r: 0, g: 0, b: 1 });
    });
  });

  describe('getEffectiveTextDirection', () => {
    it('should return ltr by default for empty or latin text', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: '' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: 'Hello world' })).toBe('ltr');
    });

    it('should return rtl for hebrew or arabic text', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: 'שלום' })).toBe('rtl');
      expect(getEffectiveTextDirection({ type: 'text', text: 'مرحبا' })).toBe('rtl');
    });

    it('should respect the textDirection override property', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: 'Hello', textDirection: 'rtl' })).toBe('rtl');
      expect(getEffectiveTextDirection({ type: 'text', text: 'שלום', textDirection: 'ltr' })).toBe('ltr');
    });
  });

  describe('uniqueId', () => {
    it('should generate sequential string IDs', () => {
      seedUniqueId([]); // reset max
      const id1 = uniqueId();
      const id2 = uniqueId();
      expect(id1).toMatch(/^el-\d+$/);
      expect(id2).toMatch(/^el-\d+$/);
      expect(id1).not.toBe(id2);
    });

    it('should respect seedUniqueId to prevent collisions', () => {
      seedUniqueId([{ id: 'el-10' }, { id: 'el-5' }]);
      const newId = uniqueId();
      expect(newId).toBe('el-11');
      const nextId = uniqueId();
      expect(nextId).toBe('el-12');
    });
  });
});
