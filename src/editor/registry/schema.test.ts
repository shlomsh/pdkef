import { describe, expect, it } from 'vitest';
import { getElementDefinition } from './index.ts';
import { createElementRenderers } from './renderers.ts';

const elementRenderers = createElementRenderers({
  text: () => null,
  rectangle: () => null,
  ellipse: () => null,
  line: () => null,
  symbol: () => null,
  signature: () => null,
  whiteout: () => null,
} as any);

const validElements = {
  text: { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' },
  symbol: { id: 'symbol-1', type: 'symbol', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  signature: { id: 'signature-1', type: 'signature', pageIndex: 0, left: 10, top: 20, width: 5, height: 5, dataUrl: 'data:image/png;base64,AA==' },
  rectangle: { id: 'rectangle-1', type: 'rectangle', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  ellipse: { id: 'ellipse-1', type: 'ellipse', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  whiteout: { id: 'whiteout-1', type: 'whiteout', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  blackout: { id: 'blackout-1', type: 'blackout', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  blur: { id: 'blur-1', type: 'blur', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  line: { id: 'line-1', type: 'line', pageIndex: 0, x1: 10, y1: 20, x2: 15, y2: 25 },
} as const;

describe('element registry schemas', () => {
  const types = Object.keys(validElements) as (keyof typeof validElements)[];
  const external = types.filter((type) => getElementDefinition(type).creation.mode === 'external');
  const created = types.filter((type) => getElementDefinition(type).creation.mode !== 'external');

  it('splits the types into those a tool creates and those made elsewhere', () => {
    expect(external.length).toBeGreaterThan(0);
    expect(created.length).toBeGreaterThan(0);
    expect([...external, ...created].sort()).toEqual([...types].sort());
  });

  it.each(external)('exposes the complete module seam for %s', (type) => {
    const definition = getElementDefinition(type);
    expect(typeof definition.schema).toBe('function');
    expect(typeof elementRenderers[type]).toBe('function');
    expect(typeof definition.serialize).toBe('function');
    expect(definition.creation.create).toBeUndefined();
  });

  it.each(created)('exposes the complete module seam for %s', (type) => {
    const definition = getElementDefinition(type);
    expect(typeof definition.schema).toBe('function');
    expect(typeof elementRenderers[type]).toBe('function');
    expect(typeof definition.serialize).toBe('function');
    expect(typeof definition.creation.create).toBe('function');
  });

  it.each(Object.entries(validElements))('accepts a valid %s element', (type, element) => {
    expect(getElementDefinition(type as keyof typeof validElements).schema(element)).toBe(true);
  });

  it.each(Object.entries(validElements))('rejects a %s element without an id', (type, element) => {
    const { id: _id, ...withoutId } = element;
    expect(getElementDefinition(type as keyof typeof validElements).schema(withoutId)).toBe(false);
  });

  it('rejects non-finite geometry', () => {
    expect(getElementDefinition('rectangle').schema({ ...validElements.rectangle, width: Infinity })).toBe(false);
  });

  it('accepts a blur with no strength, or a recognized strength', () => {
    expect(getElementDefinition('blur').schema(validElements.blur)).toBe(true);
    expect(getElementDefinition('blur').schema({ ...validElements.blur, strength: 'medium' })).toBe(true);
    expect(getElementDefinition('blur').schema({ ...validElements.blur, strength: 0.25 })).toBe(true);
  });

  it('rejects a blur with an unrecognized strength', () => {
    expect(getElementDefinition('blur').schema({ ...validElements.blur, strength: 'bogus' })).toBe(false);
    expect(getElementDefinition('blur').schema({ ...validElements.blur, strength: Infinity })).toBe(false);
  });

  it('lets Redact ask each destructive type for its page-flatten instruction', () => {
    const context = { redaction: true } as any;
    expect(getElementDefinition('blackout').serialize(validElements.blackout, context)).toMatchObject({
      kind: 'solid', element: validElements.blackout,
    });
    expect(getElementDefinition('blur').serialize(validElements.blur, context)).toMatchObject({
      kind: 'blur', element: validElements.blur,
    });
    expect(getElementDefinition('whiteout').serialize(validElements.whiteout, context)).toMatchObject({
      kind: 'solid', element: validElements.whiteout,
    });
  });
});
