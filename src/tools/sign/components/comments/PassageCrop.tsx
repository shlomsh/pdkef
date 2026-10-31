import { useEffect, useRef } from 'preact/hooks';
import type { PercentBox } from '../../lib/highlight/commentCards.ts';
import { cropPlan } from '../../lib/highlight/passageCrop.ts';
import styles from './CommentRail.module.css';

/** SIGN-44: the highlighted passage, copied from the page's rendered canvas. Decorative. */
export function PassageCrop({ pageIndex, band, maxHeightEm = 2.6 }: { pageIndex: number; band: PercentBox; maxHeightEm?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { left, top, width, height } = band;
  useEffect(() => {
    const crop = ref.current;
    if (!crop) return;
    const surface = document.querySelector<HTMLElement>(`[data-sign-page-surface="${pageIndex}"]`);
    const draw = () => {
      const source = surface?.querySelector<HTMLCanvasElement>('canvas');
      const ctx = crop.getContext?.('2d');
      if (!source || !ctx || !source.width || !source.height) return;
      const cssWidth = crop.clientWidth || 160;
      const emPx = parseFloat(getComputedStyle(crop).fontSize) || 14;
      const plan = cropPlan({ left, top, width, height }, source, cssWidth, window.devicePixelRatio || 1, maxHeightEm * emPx);
      crop.width = plan.dw;
      crop.height = plan.dh;
      crop.style.height = `${plan.cssHeight}px`;
      ctx.drawImage(source, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.dw, plan.dh);
    };
    draw();
    surface?.addEventListener('page-painted', draw);
    return () => surface?.removeEventListener('page-painted', draw);
  }, [pageIndex, left, top, width, height, maxHeightEm]);
  return <canvas ref={ref} class={styles.crop} aria-hidden="true" />;
}
