import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { computePosition, autoUpdate, offset, flip, shift } from '@floating-ui/dom';

// Shared open/close + Floating UI positioning for the small toolbar popovers
// (color palette, font list) that hang off a single trigger button inside
// the per-element floating toolbar.
//
// This hook is the SINGLE SOURCE OF TRUTH for a popover's position — the CSS
// must never set `position`/`top`/`left`/`transform` on the menu and expect it
// to win. History: positioning used to be split between a CSS default
// (`.sign-dropdown-menu { position: absolute; left: 50%; ... }`) and JS that
// set `position: fixed` inline only *after* the async computePosition resolved.
// That split bit us twice (color menu, then font menu):
//   1. Each popover had to remember a `position: fixed` CSS override whose
//      specificity beat the base rule, or it silently fell back to absolute.
//   2. Floating UI reads the menu's *current* offsetParent when measuring. If
//      the menu was still `position: absolute` at measure time, coords came out
//      relative to the tiny `.sign-tool-dropdown-container`, then got applied as
//      `fixed` (viewport) coords — flinging the menu to the top-left corner.
// So we now set `position: fixed` synchronously (in a layout effect, before
// paint) *before* measuring, hide the menu until the first placement lands (no
// flash), and let autoUpdate keep it anchored through scroll/resize.
export function useDropdownMenu({ placement = 'bottom-start' } = {}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!open || !trigger || !menu) return;

    // Own every positioning property outright, synchronously, before the menu
    // is painted or measured — inline styles beat any CSS rule regardless of
    // order/specificity, and `position: fixed` is now in place before Floating
    // UI reads the offsetParent. Hidden until the first computePosition lands.
    Object.assign(menu.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      margin: '0',
      transform: 'none',
      visibility: 'hidden'
    });

    const update = () =>
      computePosition(trigger, menu, {
        strategy: 'fixed',
        placement,
        middleware: [offset(8), flip(), shift({ padding: 8 })]
      }).then(({ x, y }) => {
        Object.assign(menu.style, {
          left: `${x}px`,
          top: `${y}px`,
          visibility: 'visible'
        });
      });

    // autoUpdate runs `update` once immediately, then on scroll/resize/layout
    // shifts, and returns its own teardown — no manual cancelled flag needed.
    return autoUpdate(trigger, menu, update);
  }, [open, placement]);

  return { open, setOpen, containerRef, triggerRef, menuRef };
}
