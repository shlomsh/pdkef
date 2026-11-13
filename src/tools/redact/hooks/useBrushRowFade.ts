import { useEffect, useState } from 'preact/hooks';

/**
 * Choosing a tool is step one, drawing is step two: once a press lands on the
 * work (anywhere outside the toolbar and the row itself), the row fades so it is
 * not in the way. A press on the toolbar, or arming a different tool, brings it
 * back so it can be changed.
 */
export default function useBrushRowFade(shown: boolean, activeStyle: string | null): boolean {
  const [faded, setFaded] = useState(false);
  useEffect(() => { setFaded(false); }, [activeStyle]);
  useEffect(() => {
    if (!shown) return undefined;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      setFaded(!target?.closest('[data-brush-controls], [data-editor-toolbar]'));
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [shown]);
  return faded;
}
