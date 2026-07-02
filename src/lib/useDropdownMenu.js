import { useState, useRef, useEffect } from 'preact/hooks';
import { computePosition, offset, flip, shift } from '@floating-ui/dom';

// Shared open/close + Floating UI positioning for the small toolbar popovers
// (color palette, font list) that hang off a single trigger button inside
// the per-element floating toolbar. Centralizing this avoids re-deriving the
// same anchor-vs-own-rect positioning logic per popover — see the flip()
// comment in DraggableOverlayElement.jsx for why that matters.
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

  useEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    let cancelled = false;
    computePosition(triggerRef.current, menuRef.current, {
      strategy: 'fixed',
      placement,
      middleware: [offset(8), flip(), shift({ padding: 8 })]
    }).then(({ x, y }) => {
      if (cancelled) return;
      menuRef.current.style.position = 'fixed';
      menuRef.current.style.left = `${x}px`;
      menuRef.current.style.top = `${y}px`;
      menuRef.current.style.transform = 'none';
    });
    return () => { cancelled = true; };
  }, [open, placement]);

  return { open, setOpen, containerRef, triggerRef, menuRef };
}
