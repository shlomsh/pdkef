import type { Layer } from './keys.ts';

/** Which of the toolbar's inner layers are open. The toolbar itself is open whenever this exists. */
export interface Layers { colors: boolean; custom: boolean }

export const initialLayers: Layers = { colors: false, custom: false };

const SCROLL_CLOSE_PX = 24;

export const openColors = (l: Layers): Layers => (l.colors ? l : { ...l, colors: true });
/** The "+" lives at the end of the color row, so the custom panel opens the row too. */
export const openCustom = (l: Layers): Layers => (l.custom ? l : { colors: true, custom: true });
/** A swatch was picked: the colors fold away (the custom panel stays while its sliders are used). */
export const pickedColor = (l: Layers): Layers => (l.colors ? { colors: false, custom: l.custom } : l);

/** R9: Esc closes one layer at a time. Closing the colors takes the custom panel with them. */
export function closeLayer(l: Layers, layer: Layer): Layers {
  if (layer === 'custom') return l.custom ? { ...l, custom: false } : l;
  if (layer === 'colors') return l.colors || l.custom ? { colors: false, custom: false } : l;
  return l;
}

/** Bottom to top, the order `keyAction` reads. */
export function layersOf(l: Layers): Layer[] {
  return ['toolbar', ...(l.colors ? ['colors' as const] : []), ...(l.custom ? ['custom' as const] : [])];
}

/** R9: a scroll of more than 24 px closes the toolbar. */
export const scrolledPast = (startY: number, nowY: number): boolean => Math.abs(nowY - startY) > SCROLL_CLOSE_PX;
