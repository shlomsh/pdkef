import { DEFAULT_HIGHLIGHT_COLOR } from './highlightColors.ts';

/** READ-03: an underline is drawn in its band color, darkened by this share. @testSeam */
export const UNDERLINE_DARKEN = 0.28;

/** The ink of an underline for a band color, as `#RRGGBB`. A value that is not a hex color falls back to the default highlight color. */
export function underlineInk(hex: string): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) ?? /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(DEFAULT_HIGHLIGHT_COLOR)!;
  const channel = (part: string) => Math.max(0, Math.round(parseInt(part, 16) * (1 - UNDERLINE_DARKEN))).toString(16).padStart(2, '0');
  return `#${channel(match[1])}${channel(match[2])}${channel(match[3])}`.toUpperCase();
}

/** READ-04: an underline's line width in PDF points: the default, and the range the reader can pick from. */
export const UNDERLINE_WIDTH = { default: 3, min: 1, max: 4, step: 0.5 } as const;

/** READ-04: points between an underline's bottom edge and the band's bottom edge, so the line sits just above the band's foot instead of on it. */
export const UNDERLINE_LIFT = 1;
