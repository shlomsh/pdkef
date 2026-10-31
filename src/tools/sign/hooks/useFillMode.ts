import { useState, useRef, useCallback, useMemo, useEffect } from 'preact/hooks';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';
import { isFillMode } from '../lib/fill/fillMode.ts';
import { freeSlotKey } from '../lib/fill/fillSlots.ts';
import type { PagePoint } from '../lib/fill/fillTypes.ts';
import type { FillContextValue } from '../components/fill/FillContext.tsx';
import type { SignToolAction } from '../components/SignToolContext.tsx';
import { useFillDocumentEffects } from './fill/useFillDocumentEffects.ts';

const NO_TURNS: PageTurns = {};

/**
 * Fill mode (SNG-15), opt-in on `?next=1` alone (docs/sign-fill-mode.md): the
 * flag, the shared context value the workspace, its gestures and the toolbar
 * read through useFill(), and the two document-level effects fill mode owns.
 */
export function useFillMode(
  dispatch: (action: SignToolAction) => void,
  elements: EditorElement[],
  pageTurns: PageTurns = NO_TURNS,
): { enabled: boolean; fillContextValue: FillContextValue } {
  // Read once, lazily, rather than on every render: the island is
  // prerendered (output: 'static'), so `window` may not exist yet, and the
  // flag must not flip mid-session once a real `window.location.search` is
  // available on hydration.
  const [enabled] = useState(() => typeof window !== 'undefined' && isFillMode(window.location.search));
  const coarse = useCoarsePointer();
  const [aimedKey, setAimedKey] = useState<string | null>(null);
  const [freeAt, setFreeAt] = useState<PagePoint | null>(null);
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null);
  const proxyRef = useRef<HTMLInputElement>(null);
  const pageTurnsRef = useRef(pageTurns);
  pageTurnsRef.current = pageTurns;
  const turnsAtOpenRef = useRef(0);

  // The workspace builds the free slot from `freeAt` with the typography a new text
  // box takes; its key comes from the point alone, so focus can be queued now.
  const openFreeSlot = useCallback((at: PagePoint) => {
    turnsAtOpenRef.current = turnsOf(pageTurnsRef.current, at.pageIndex);
    setFreeAt(at);
    setPendingFocusKey(freeSlotKey(at));
  }, []);

  const closeFreeSlot = useCallback(() => setFreeAt(null), []);

  // SIGN-43: the free slot is a page-percent point; when its page turns it no longer
  // points at what the person tapped, so it closes.
  const freeTurns = freeAt ? turnsOf(pageTurns, freeAt.pageIndex) : 0;
  useEffect(() => {
    if (freeAt && freeTurns !== turnsAtOpenRef.current) setFreeAt(null);
  }, [freeAt, freeTurns]);

  useFillDocumentEffects(enabled, dispatch, elements);

  const fillContextValue = useMemo<FillContextValue>(() => ({
    enabled,
    coarse,
    aimedKey,
    setAimedKey,
    freeAt,
    openFreeSlot,
    closeFreeSlot,
    pendingFocusKey,
    setPendingFocusKey,
    proxyRef,
  }), [enabled, coarse, aimedKey, freeAt, openFreeSlot, closeFreeSlot, pendingFocusKey]);

  return { enabled, fillContextValue };
}
