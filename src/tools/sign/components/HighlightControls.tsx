import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import styles from '#editor-ui/EditorControls.module.css';
import { PAGE_HEIGHT_DEFAULT_PTS } from '#editor/model/signGeometry.js';
import { flipChanges } from '#editor/highlight/flip.ts';
import { createSwipeReader } from '#lib/pageLayout/swipeReader.ts';
import HighlightSwatches from './HighlightSwatches.tsx';
import DirectionButton from './DirectionButton.tsx';

type HighlightChanges = { color?: string; direction?: 'ltr' | 'rtl' } & Partial<Pick<HighlightElement, 'left' | 'top' | 'width' | 'height' | 'bands'>>;

/** SIGN-44: a selected highlight's toolbar group: colors, then the reading direction. */
export default function HighlightControls({ element, onChange, t }: { element: HighlightElement; onChange: (changes: HighlightChanges) => void; t: SignMessages }) {
  const direction = element.direction ?? 'ltr';
  // The page's own pixels give the new first and last rows, so the canvas is found from the highlight's node.
  const flip = () => {
    const node = document.querySelector(`[data-editor-element-id="${CSS.escape(element.id)}"]`);
    const canvas = node?.closest('[data-page-wrapper]')?.querySelector<HTMLCanvasElement>('canvas') ?? null;
    const reader = createSwipeReader(canvas, PAGE_HEIGHT_DEFAULT_PTS, direction === 'rtl' ? 'ltr' : 'rtl');
    onChange(flipChanges(element, reader ? (a, b) => reader.bandsBetween(a, b) : undefined));
  };
  return (
    <>
      <HighlightSwatches color={element.color} onChange={onChange} t={t} />
      <DirectionButton direction={direction} onFlip={flip} t={t} className={styles['element-button']} />
      <div className={styles.divider} />
    </>
  );
}
