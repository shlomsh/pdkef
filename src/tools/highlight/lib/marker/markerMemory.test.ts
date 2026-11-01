import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKER } from './markerState.ts';
import { initialMarker, parseMarker, sameMarker, serializeMarker } from './markerMemory.ts';

const pink = { color: '#FF8FCF', style: 'underline', opacity: 0.6 } as const;

describe('serializeMarker', () => {
  it('writes color, style and opacity as JSON the parser reads back', () => {
    expect(parseMarker(serializeMarker(pink))).toEqual(pink);
  });

  it('writes the same text for the same marker', () => {
    expect(serializeMarker({ opacity: 0.6, style: 'underline', color: '#FF8FCF' })).toBe(serializeMarker(pink));
  });
});

describe('parseMarker', () => {
  it('reads a stored marker', () => {
    expect(parseMarker('{"color":"#9CF27A","style":"highlight","opacity":1}')).toEqual({ color: '#9CF27A', style: 'highlight', opacity: 1 });
  });

  it('writes the color in capitals, as the custom color input does', () => {
    expect(parseMarker('{"color":"#9cf27a","style":"highlight","opacity":1}')?.color).toBe('#9CF27A');
  });

  it.each([
    ['not a string', 42],
    ['null', null],
    ['not JSON', '{nope'],
    ['not an object', '"yellow"'],
    ['an array', '[1,2,3]'],
    ['a color that is not a hex', '{"color":"yellow","style":"highlight","opacity":1}'],
    ['a short hex', '{"color":"#FFF","style":"highlight","opacity":1}'],
    ['an unknown style', '{"color":"#FFF34D","style":"strike","opacity":1}'],
    ['an opacity below 30%', '{"color":"#FFF34D","style":"highlight","opacity":0.1}'],
    ['an opacity above 100%', '{"color":"#FFF34D","style":"highlight","opacity":1.5}'],
    ['an opacity that is not a number', '{"color":"#FFF34D","style":"highlight","opacity":"1"}'],
    ['a missing opacity', '{"color":"#FFF34D","style":"highlight"}'],
  ])('rejects %s', (_, value) => {
    expect(parseMarker(value)).toBeNull();
  });

  it('accepts the opacity limits', () => {
    expect(parseMarker('{"color":"#FFF34D","style":"highlight","opacity":0.3}')?.opacity).toBe(0.3);
    expect(parseMarker('{"color":"#FFF34D","style":"highlight","opacity":1}')?.opacity).toBe(1);
  });
});

describe('initialMarker', () => {
  const draft = serializeMarker(pink);
  const remembered = serializeMarker({ color: '#7FDBFF', style: 'highlight', opacity: 0.5 });

  it("the document's own marker beats the remembered default", () => {
    expect(initialMarker(draft, remembered)).toEqual(pink);
  });

  it('the remembered default comes next', () => {
    expect(initialMarker(undefined, remembered)).toEqual({ color: '#7FDBFF', style: 'highlight', opacity: 0.5 });
  });

  it('a draft that does not validate falls through to the default', () => {
    expect(initialMarker('{"color":"nope"}', remembered).color).toBe('#7FDBFF');
  });

  it('falls back to the yellow marker when neither is usable', () => {
    expect(initialMarker(undefined, null)).toEqual(DEFAULT_MARKER);
    expect(initialMarker('x', 'y')).toEqual(DEFAULT_MARKER);
  });
});

describe('sameMarker', () => {
  it('compares by value', () => {
    expect(sameMarker(pink, { ...pink })).toBe(true);
    expect(sameMarker(pink, { ...pink, opacity: 1 })).toBe(false);
    expect(sameMarker(pink, { ...pink, style: 'highlight' })).toBe(false);
    expect(sameMarker(pink, { ...pink, color: '#FF8080' })).toBe(false);
  });
});
