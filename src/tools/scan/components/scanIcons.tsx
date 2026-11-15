/**
 * Scan's own copies of four lucide icons (lucide-preact v1.67.0, ISC license, https://lucide.dev), drawn the same way
 * lucide draws them. Every icon imported from `lucide-preact` lands in the shared `ui` bundle that /open/ also loads;
 * these four are used only by Scan, so they live here and ride in Scan's own bundle instead.
 */
import type { JSX } from 'preact';

type Shape = ['path', { d: string }] | ['circle', { cx: string; cy: string; r: string }];

interface IconProps extends Omit<JSX.SVGAttributes<SVGSVGElement>, 'size'> {
  size?: number;
}

function icon(name: string, shapes: Shape[]) {
  return function ScanIcon({ size = 24, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        data-icon={name}
        {...rest}
      >
        {shapes.map(([tag, attrs], i) => (tag === 'path' ? <path key={i} {...attrs} /> : <circle key={i} {...attrs} />))}
      </svg>
    );
  };
}

export const Undo2 = icon('undo-2', [
  ['path', { d: 'M9 14 4 9l5-5' }],
  ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }],
]);

export const Redo2 = icon('redo-2', [
  ['path', { d: 'm15 14 5-5-5-5' }],
  ['path', { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' }],
]);

export const Spline = icon('spline', [
  ['circle', { cx: '19', cy: '5', r: '2' }],
  ['circle', { cx: '5', cy: '19', r: '2' }],
  ['path', { d: 'M5 17A12 12 0 0 1 17 5' }],
]);

export const VectorSquare = icon('vector-square', [
  ['path', { d: 'M17.055 4.533a24 24 0 00-10.11 0' }],
  ['path', { d: 'M19.467 17.055a24 24 0 000-10.11' }],
  ['path', { d: 'M4.533 6.945a24 24 0 000 10.11' }],
  ['path', { d: 'M6.945 19.467a24 24 0 0010.11 0' }],
  ['circle', { cx: '19', cy: '19', r: '2' }],
  ['circle', { cx: '19', cy: '5', r: '2' }],
  ['circle', { cx: '5', cy: '19', r: '2' }],
  ['circle', { cx: '5', cy: '5', r: '2' }],
]);
