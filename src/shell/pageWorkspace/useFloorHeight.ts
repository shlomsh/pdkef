import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

const DESKTOP = '(min-width: 1024px)';
const px = (value: string) => parseFloat(value) || 0;

/* The loaded card's first-screen floor (PdfTool.module.css) and its bottom padding. The floor is
   the card's top plus its MIN-height, never its content height, so what is sized to it can never
   feed back into the measurement. No card or no min-height (jsdom has no layout): null. */
export function cardFloor(el: Element): { floor: number; paddingBottom: number } | null {
  const card = el.closest<HTMLElement>('[data-tool-loaded]');
  if (!card) return null;
  const style = getComputedStyle(card);
  const minHeight = px(style.minHeight);
  if (minHeight <= 0) return null;
  return { floor: card.getBoundingClientRect().top + minHeight, paddingBottom: px(style.paddingBottom) };
}

function measure(el: HTMLElement): number | null {
  const card = cardFloor(el);
  return card ? Math.max(0, Math.floor(card.floor - el.getBoundingClientRect().top - card.paddingBottom)) : null;
}

/* Px from the element's top to the card's floor on a desktop viewport, null elsewhere: a tool that
   fills the first screen (Scan's photo and pages) sizes itself to it, the way the page grid's cells
   do (useStageFit.ts). Re-measures when the element, the card, anything above it or the window
   resizes, coalesced to one frame. `active` is whether the element is rendered. */
export function useFloorHeight(ref: RefObject<HTMLElement>, active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  // Before paint: the first frame already has its fitted size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window.matchMedia !== 'function') return;
    const next = window.matchMedia(DESKTOP).matches ? measure(el) : null;
    setHeight((current) => (current === next ? current : next));
  }, [active]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DESKTOP);
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = query.matches ? measure(el) : null;
      setHeight((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const card = el.closest('[data-tool-loaded]');
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (card) observer?.observe(card);
    // Anything above that changes height (an error line, the heading) moves the element down
    // without resizing it: watch every earlier sibling on the way up to the card.
    for (let node: Element | null = el; node && node !== card; node = node.parentElement) {
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) observer?.observe(sibling);
    }
    window.addEventListener('resize', schedule);
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [active]);

  return height;
}
