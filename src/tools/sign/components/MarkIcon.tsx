import type { MarkGlyph } from '#editor/model/editorModel.ts';

/** The glyph for one mark. Drawn by the placed mark's own switch and by
 * the toolbar's Mark button, so both always show the same shapes. Kebab-case
 * attributes: raw Preact ignores camelCase SVG ones. */
export default function MarkIcon({
  mark,
  size = 14,
  strokeWidth = 3,
}: {
  mark: MarkGlyph;
  size?: number;
  strokeWidth?: number;
}) {
  if (mark === 'dot') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" data-mark={mark}>
        <circle cx="12" cy="12" r="7" />
      </svg>
    );
  }
  if (mark === 'x') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" aria-hidden="true" data-mark={mark}>
        <line x1="5" y1="5" x2="19" y2="19" />
        <line x1="19" y1="5" x2="5" y2="19" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-mark={mark}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
