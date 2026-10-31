import { useEffect, useRef } from 'preact/hooks';
import type { PercentBox } from '../../lib/highlight/commentCards.ts';
import { cropPlan } from '../../lib/highlight/passageCrop.ts';
import styles from './CommentRail.module.css';

/** SIGN-44: the start of the highlighted passage at reading size, copied from the page's rendered canvas. Decorative. */
export function PassageCrop({ pageIndex, band, direction = 'ltr', lineHeightEm = 1.7 }: { pageIndex: number; band: PercentBox; direction?: 'ltr' | 'rtl'; lineHeightEm?: number }) {
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
      // The head row holds the color dot (10px) and its 8px gap beside the crop.
      const maxWidth = Math.max(40, (crop.parentElement?.clientWidth || 178) - 18);
      const emPx = parseFloat(getComputedStyle(crop).fontSize) || 14;
      const plan = cropPlan({ left, top, width, height }, source, maxWidth, window.devicePixelRatio || 1, lineHeightEm * emPx, direction);
      crop.width = plan.dw;
      crop.height = plan.dh;
      crop.style.width = `${plan.cssWidth}px`;
      crop.style.height = `${plan.cssHeight}px`;
      ctx.drawImage(source, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.dw, plan.dh);
    };
    draw();
    surface?.addEventListener('page-painted', draw);
    return () => surface?.removeEventListener('page-painted', draw);
  }, [pageIndex, left, top, width, height, direction, lineHeightEm]);
  return <canvas ref={ref} class={styles.crop} aria-hidden="true" />;
}
