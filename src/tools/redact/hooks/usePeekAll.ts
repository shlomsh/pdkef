import { useEffect, useState } from 'preact/hooks';

/** Space must not peek while the person is typing (or on a control Space activates). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true || el.getAttribute?.('contenteditable') === 'true';
}

/**
 * View state for "show what is under every box": held by the toolbar's Peek
 * button (`setPeekAll`) or the Space key. Never written to elements, history
 * or the draft. Space is released when the window loses focus, since the
 * keyup would never arrive.
 */
export default function usePeekAll() {
  const [peekAll, setPeekAll] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if ((e.target as HTMLElement | null)?.tagName !== 'BUTTON') e.preventDefault();
      setPeekAll(true);
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setPeekAll(false); };
    const release = () => setPeekAll(false);
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, []);
  return { peekAll, setPeekAll };
}
