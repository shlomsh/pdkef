import { useEffect, useState } from 'preact/hooks';

/** READ-13: which element the pencil outline surrounds (`openId`) and which one the pointer's card points at (`hoverId`). */
export interface OpenMarks { openId: string | null; hoverId: string | null }

const NONE: OpenMarks = { openId: null, hoverId: null };
const idOf = (node: Element | null | undefined) => node?.getAttribute('data-editor-element-id') ?? null;

/**
 * The open mark, read from the page itself: its note is open (`data-comment-focus`, set by the comments view), it is the one
 * picked on touch, or the keyboard has focus on it. One DOM read, so the three states stay one indicator. @testSeam
 */
export function readOpenMarks(root: ParentNode, pickedId: string | null): OpenMarks {
  const active = document.activeElement;
  const focused = active && root.contains(active) && active.matches('[data-editor-element-id]:focus-visible') ? idOf(active) : null;
  const openId = idOf(root.querySelector('[data-comment-focus]')) ?? pickedId ?? focused;
  const hoverId = idOf(root.querySelector('[data-comment-hover]:not([data-comment-focus])'));
  return { openId, hoverId: hoverId === openId ? null : hoverId };
}

/** Re-reads `readOpenMarks` whenever an attribute it looks at changes or focus moves; the state only changes when the answer does. */
export function useOpenMarks(rootRef: { current: HTMLElement | null }, pickedId: string | null): OpenMarks {
  const [marks, setMarks] = useState<OpenMarks>(NONE);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const read = () => {
      const next = readOpenMarks(root, pickedId);
      setMarks((was) => (was.openId === next.openId && was.hoverId === next.hoverId ? was : next));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-comment-focus', 'data-comment-hover'] });
    root.addEventListener('focusin', read);
    root.addEventListener('focusout', read);
    return () => {
      observer.disconnect();
      root.removeEventListener('focusin', read);
      root.removeEventListener('focusout', read);
    };
  }, [rootRef, pickedId]);
  return marks;
}
