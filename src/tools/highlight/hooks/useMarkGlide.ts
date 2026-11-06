import { useEffect } from 'preact/hooks';
import { glideFor } from '../lib/marker/glide.ts';

const findBoard = () => document.querySelector<HTMLElement>('[data-lamp-part="board"]');

/** Glides the page down just enough that the picked mark stays in view under the panel and its open menu. */
export function useMarkGlide(markId: string | null, menu: 'more' | 'look' | null, panelRef: { current: HTMLElement | null }): void {
  useEffect(() => {
    const board = findBoard();
    if (!board) return;
    if (!markId) { board.style.translate = ''; return; }
    let second = 0;
    // The menu's popover is placed asynchronously, so measure after it settles.
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const mark = document.querySelector<HTMLElement>(`[data-editor-element-id="${CSS.escape(markId)}"]`);
        const panel = panelRef.current;
        if (!mark || !panel) return;
        // Count a move still in flight, so the answer does not grow.
        const moved = parseFloat(getComputedStyle(board).translate.split(' ')[1] ?? '') || 0;
        let cover = panel.getBoundingClientRect().bottom;
        if (menu) {
          const pop = document.querySelector('[data-editor-popover]');
          if (pop) cover = Math.max(cover, pop.getBoundingClientRect().bottom);
        }
        const by = glideFor(mark.getBoundingClientRect().top - moved, cover);
        board.style.translate = by ? `0 ${by}px` : '';
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [markId, menu]);

  useEffect(() => () => {
    const board = findBoard();
    if (board) board.style.translate = '';
  }, []);
}
