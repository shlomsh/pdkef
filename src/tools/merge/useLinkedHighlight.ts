import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

/* MERGE-24: a rail row and the pages of the same file light up together.
   Pure attribute toggling on the layout root, driven by delegated hover and
   focus events - no pointermove, no Preact state. The page CSS reads
   `data-linking="row" | "page"` on the root and `data-linked` on every
   element that carries the hovered file's `data-file-id`. */

export type LinkKind = 'row' | 'page';

/** A rail row carries `data-link-row`; anything else with a file id is a page. */
export function linkKind(source: Element): LinkKind {
  return source.hasAttribute('data-link-row') ? 'row' : 'page';
}

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches;
}

function sourceOf(root: HTMLElement, target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const source = target.closest<HTMLElement>('[data-file-id]');
  return source && root.contains(source) ? source : null;
}

function clearLinks(root: HTMLElement): void {
  delete root.dataset.linking;
  root.querySelectorAll('[data-linked]').forEach((el) => el.removeAttribute('data-linked'));
}

function applyLinks(root: HTMLElement, source: HTMLElement): void {
  clearLinks(root);
  root.dataset.linking = linkKind(source);
  const id = source.getAttribute('data-file-id') ?? '';
  root.querySelectorAll(`[data-file-id="${CSS.escape(id)}"]`).forEach((el) => el.setAttribute('data-linked', ''));
}

export function useLinkedHighlight(rootRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const blocked = () => document.documentElement.hasAttribute('data-merge-page-dragging');

    const enter = (event: Event, isPointer: boolean) => {
      if (blocked() || (isPointer && matches('(hover: none)'))) return;
      const source = sourceOf(root, event.target);
      if (source) applyLinks(root, source);
    };
    const leave = (event: Event) => {
      const source = sourceOf(root, event.target);
      if (!source) return;
      const next = (event as MouseEvent | FocusEvent).relatedTarget;
      if (next instanceof Node && source.contains(next)) return;
      clearLinks(root);
    };

    const onOver = (e: Event) => enter(e, true);
    const onIn = (e: Event) => enter(e, false);
    root.addEventListener('pointerover', onOver);
    root.addEventListener('focusin', onIn);
    root.addEventListener('pointerout', leave);
    root.addEventListener('focusout', leave);
    return () => {
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('focusin', onIn);
      root.removeEventListener('pointerout', leave);
      root.removeEventListener('focusout', leave);
      clearLinks(root);
    };
  }, [rootRef]);
}

const MOMENT_MS = 2000;

/** The download moment: `data-merge-moment` on the root for 2s. Returns the trigger. */
export function useMergeMoment(rootRef: RefObject<HTMLElement>): () => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    rootRef.current?.removeAttribute('data-merge-moment');
  }, [rootRef]);

  return useCallback(() => {
    const root = rootRef.current;
    if (!root || matches('(prefers-reduced-motion: reduce)')) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    root.setAttribute('data-merge-moment', '');
    timerRef.current = setTimeout(() => {
      root.removeAttribute('data-merge-moment');
      timerRef.current = null;
    }, MOMENT_MS);
  }, [rootRef]);
}
