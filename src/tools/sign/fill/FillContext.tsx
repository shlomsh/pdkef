/**
 * Fill mode's shared state (SNG-15), provided once by PdfSignTool and read by the
 * workspace, the gestures and the toolbar. It holds only what several pieces must
 * agree on; each decision stays in its own pure module.
 */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { FillSlot, PagePoint } from './fillTypes.ts';

export interface FillContextValue {
  /** `?next=1`. When false every other field is inert and production runs unchanged. */
  enabled: boolean;
  /** A coarse pointer: the platform's bar above the keyboard is the control while typing. */
  coarse: boolean;
  /** A fill input has focus (useFillFocus). */
  filling: boolean;
  /** The target a tap would reach for the armed tool, shown with the droppable look. */
  aimedKey: string | null;
  setAimedKey: (key: string | null) => void;
  /** The one free slot a tap opened where nothing was detected, or null. */
  freeSlot: FillSlot | null;
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
  filling: false,
  aimedKey: null,
  setAimedKey: noop,
  freeSlot: null,
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
