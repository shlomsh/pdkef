import type { PageBox } from './fit.ts';

/**
 * A page's box as it is shown after `turns` clockwise quarter turns: an odd count swaps width and height. The ink
 * bounds are fractions of the upright page's width, so they carry over for none or a half turn (mirrored for the
 * half) and a sideways page counts its whole width as text.
 */
export function turnedPageBox(size: { width: number; height: number }, turns: number, ink: { left: number; right: number } | null): PageBox {
  const odd = turns % 2 === 1;
  const width = odd ? size.height : size.width;
  const height = odd ? size.width : size.height;
  if (!ink || odd) return { width, height, textLeft: 0, textRight: width };
  return turns === 2
    ? { width, height, textLeft: (1 - ink.right) * width, textRight: (1 - ink.left) * width }
    : { width, height, textLeft: ink.left * width, textRight: ink.right * width };
}
