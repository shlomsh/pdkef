import { useEffect, useLayoutEffect } from 'preact/hooks';
import type { RefObject } from 'preact';
import { recordAction } from '../../../lib/actionTrail.ts';
import { relativeBox } from '../lib/flattenAnimation.ts';
import { turnedQuad, type Quad } from '../lib/quad.ts';
import type { reduceScan } from '../state/scanState.ts';
import type { ScanPage, ScanWork } from '../state/scanWork.ts';

type ScanDispatch = (event: Parameters<typeof reduceScan>[1]) => void;

interface FullScreenInput {
  editorRef: RefObject<HTMLElement>;
  work: ScanWork;
  dispatch: ScanDispatch;
  full: 'native' | 'layer' | null;
  view: 'corners' | 'result';
  /** The page whose flatten starts once approved full screen is back on the card (state.landing). */
  landing: { quad: Quad; turns: number } | null;
}

/** The corners full screen (state.full): the browser's own, on the editor (Sign's pattern, PdfSignTool),
 * or a fixed full-page layer where it has none for an element (iPhone Safari). Also the hand-off to the result. */
export function useScanFullScreen({ editorRef, work, dispatch, full, view, landing }: FullScreenInput) {
  useEffect(() => {
    const onChange = () => dispatch({ type: 'fullscreenChanged', native: document.fullscreenElement === editorRef.current });
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const enterFull = () => {
    recordAction('fullscreen');
    const el = editorRef.current;
    if (el?.requestFullscreen && document.fullscreenEnabled !== false) {
      // expected: element full screen is optional, the layer stands in
      el.requestFullscreen()?.catch(() => dispatch({ type: 'fullLayerEntered' }));
    } else dispatch({ type: 'fullLayerEntered' });
  };
  const exitFull = () => {
    // The browser's own: `full` follows its fullscreenchange, once the card is back on screen.
    if (document.fullscreenElement === editorRef.current && document.exitFullscreen) {
      // expected: the browser may already have left full screen (Esc), nothing to undo
      document.exitFullscreen()?.catch(() => dispatch({ type: 'fullExited' }));
    } else dispatch({ type: 'fullExited' });
  };
  const captureFlatten = (page: { quad: Quad; turns: number }) => {
    const host = editorRef.current;
    const frame = host?.querySelector('[data-corner-frame]');
    // The editor's own photo, already decoded: the flatten paints from it on its first frame.
    const photo = frame?.querySelector<HTMLImageElement>('img');
    if (!host || !frame || !photo) return;
    work.flattenFrom = {
      photo,
      frame: relativeBox(frame.getBoundingClientRect(), host.getBoundingClientRect()),
      quad: turnedQuad(page.quad, page.turns),
    };
  };
  /** Approved full screen: the result waits for the card, and the flatten starts from the photo where
   * the card shows it. Measured full screen, the page flew in from full-screen coordinates (2026-10-27). */
  const showResult = (page: ScanPage) => {
    if (full) {
      dispatch({ type: 'resultAfterFullQueued', landing: { quad: page.quad, turns: page.turns } });
      exitFull();
      return;
    }
    captureFlatten(page);
    dispatch({ type: 'resultShown' });
  };
  useLayoutEffect(() => {
    const page = landing;
    if (full || !page) return;
    captureFlatten(page);
    dispatch({ type: 'resultAfterFullShown' });
  }, [full]);
  // Full screen belongs to the view it was opened on (the corners, or the page as it downloads): a
  // view change brings the card back.
  useEffect(() => {
    exitFull();
  }, [view]);
  useEffect(() => () => {
    // expected: leaving the page while full screen, nothing to report
    if (document.fullscreenElement && document.fullscreenElement === editorRef.current) document.exitFullscreen?.()?.catch(() => {});
  }, []);
  // The layer: the page behind keeps still, and Esc leaves it as it leaves the browser's own.
  useEffect(() => {
    if (full !== 'layer') return undefined;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dispatch({ type: 'fullExited' }); };
    document.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [full]);
  return { enterFull, exitFull, showResult };
}
