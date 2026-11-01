import { describe, expect, it } from 'vitest';
import { closeLayer, initialLayers, layersOf, openColors, openCustom, pickedColor, scrolledPast } from './toolbarLayers.ts';

describe('toolbarLayers', () => {
  it('starts with only the toolbar', () => {
    expect(layersOf(initialLayers)).toEqual(['toolbar']);
  });
  it('lists layers bottom to top', () => {
    expect(layersOf(openColors(initialLayers))).toEqual(['toolbar', 'colors']);
    expect(layersOf(openCustom(initialLayers))).toEqual(['toolbar', 'colors', 'custom']);
  });
  it('Esc closes the custom panel, then the colors', () => {
    let l = openCustom(initialLayers);
    l = closeLayer(l, 'custom');
    expect(layersOf(l)).toEqual(['toolbar', 'colors']);
    l = closeLayer(l, 'colors');
    expect(layersOf(l)).toEqual(['toolbar']);
  });
  it('closing the colors closes the custom panel with them', () => {
    expect(layersOf(closeLayer(openCustom(initialLayers), 'colors'))).toEqual(['toolbar']);
  });
  it('closing the toolbar layer or a closed layer changes nothing here', () => {
    expect(closeLayer(initialLayers, 'toolbar')).toBe(initialLayers);
    expect(closeLayer(initialLayers, 'custom')).toBe(initialLayers);
  });
  it('picking a swatch folds the colors away', () => {
    expect(layersOf(pickedColor(openColors(initialLayers)))).toEqual(['toolbar']);
  });
});

describe('scrolledPast', () => {
  it('is true only beyond 24 px either way', () => {
    expect(scrolledPast(100, 124)).toBe(false);
    expect(scrolledPast(100, 125)).toBe(true);
    expect(scrolledPast(100, 75)).toBe(true);
    expect(scrolledPast(100, 76)).toBe(false);
  });
});
