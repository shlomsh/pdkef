/**
 * Fill mode's shared state (SNG-15), provided once by PdfSignTool and read by the
 * workspace, the gestures and the toolbar. It holds only what several pieces must
 * agree on; each decision stays in its own pure module.
 */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { PagePoint, TextFillProps } from './fillTypes.ts';

export interface FillContextValue {
  /** `?next=1`. When false every other field is inert and production runs unchanged. */
  enabled: boolean;
  /** A coarse pointer: gates `nativeFocus` in DraggableWrapper, which skips the synchronous-focus dance for a fill input since a tap there is already native focus. */
  coarse: boolean;
  /** The target a tap would reach for the armed tool, shown with the droppable look. */
  aimedKey: string | null;
  setAimedKey: (key: string | null) => void;
  /**
   * Where a tap opened the one free slot (nothing detected there), or null. The
   * workspace builds the slot from it with the typography a new text box takes.
   */
  freeAt: PagePoint | null;
  /** Opens the free slot at `at` and sets the pending focus key to its key. */
  openFreeSlot: (at: PagePoint) => void;
  closeFreeSlot: () => void;
  /** A fill input to focus once it renders; set together with focusing the proxy. */
  pendingFocusKey: string | null;
  setPendingFocusKey: (key: string | null) => void;
  /**
   * The focus proxy: a hidden input focused inside the touch handler so iOS raises the
   * keyboard (MOBI-24) before the field it is for exists; the field takes focus from it
   * once rendered, with the keyboard already up.
   */
  proxyRef: RefObject<HTMLInputElement>;
}

const noop = () => {};

export const FILL_OFF: FillContextValue = {
  enabled: false,
  coarse: false,
  aimedKey: null,
  setAimedKey: noop,
  freeAt: null,
  openFreeSlot: noop,
  closeFreeSlot: noop,
  pendingFocusKey: null,
  setPendingFocusKey: noop,
  proxyRef: { current: null },
};

export const FillContext = createContext<FillContextValue>(FILL_OFF);

export function useFill(): FillContextValue {
  return useContext(FillContext);
}

/**
 * Per text element: FillLayer wraps each text element it renders in this provider, and
 * TextNode and DraggableWrapper read it. A context rather than a renderer prop keeps the
 * editor core's renderer map free of a Sign-only concept. Null outside fill mode.
 */
export const TextFillContext = createContext<TextFillProps | null>(null);

export function useTextFill(): TextFillProps | null {
  return useContext(TextFillContext);
}
