import { cloneElement } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import {
  useFloating,
  useInteractions,
  useClick,
  useDismiss,
  useRole,
  offset,
  flip,
  shift,
  autoUpdate
} from '@floating-ui/react';
import type { Middleware } from '@floating-ui/react';

export function createPopoverMiddleware(offsetValue = 5, stablePosition = false, crossAxisOffset = 0) {
  return [
    offset({ mainAxis: offsetValue, crossAxis: crossAxisOffset }),
    ...(stablePosition ? [] : [flip({ fallbackAxisSideDirection: 'end' })]),
    // A stable picker must retain its top edge while its result list changes
    // height. Keep horizontal collision handling, but never shift or flip it
    // vertically; the list itself owns scrolling in that mode.
    shift(stablePosition ? { mainAxis: false, crossAxis: true, padding: 5 } : { padding: 5 }),
  ];
}

export default function Popover({
  trigger,
  content,
  placement = 'bottom',
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  offset: offsetValue = 5,
  crossAxisOffset = 0,
  stablePosition = false,
  middleware,
  anchorClosest,
}: {
  trigger: any;
  content: any;
  placement?: any;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  offset?: number;
  crossAxisOffset?: number;
  stablePosition?: boolean;
  /** SNG-17: a full middleware list that replaces `createPopoverMiddleware(...)`
   * entirely when given - `offset`/`crossAxisOffset`/`stablePosition` are then
   * unused. Passed in rather than composed here because `src/shell` must not
   * import from `src/editor-ui` (module boundaries), so a caller that needs an
   * editor-ui middleware (e.g. `visualViewportClamp`) builds its own list. */
  middleware?: Middleware[];
  /** SNG-17: positions the floating element against the trigger's closest
   * ancestor matching this selector, instead of the trigger itself. Falls
   * back to the trigger when no ancestor matches. Interactions (click,
   * dismiss) still bind to the trigger; only the position reference moves. */
  anchorClosest?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setUncontrolledOpen;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: middleware ?? createPopoverMiddleware(offsetValue, stablePosition, crossAxisOffset),
  });

  const [triggerEl, setTriggerEl] = useState<Element | null>(null);
  const setTriggerRef = useCallback((node: Element | null) => {
    refs.setReference(node);
    setTriggerEl(node);
  }, [refs]);

  useEffect(() => {
    if (!anchorClosest || !triggerEl) return;
    const anchor = triggerEl.closest(anchorClosest);
    refs.setPositionReference(anchor ?? triggerEl);
  }, [anchorClosest, triggerEl, refs]);

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role
  ]);

  const [portalTarget, setPortalTarget] = useState(
    typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      setPortalTarget(document.fullscreenElement || document.body);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <>
      {/* The trigger's own props go THROUGH getReferenceProps, not around it.
          Called empty, it returns Floating UI's handlers alone, and spreading
          those over the trigger replaces any onClick the trigger already had
          rather than running both. Passed the trigger's props, it composes them:
          the trigger's handler runs, then the open/close one. */}
      {cloneElement(trigger, {
        ref: setTriggerRef,
        ...getReferenceProps(trigger.props)
      })}
      
      {open && portalTarget &&
        createPortal(
          <div
            ref={refs.setFloating}
            data-editor-popover
            style={{
              ...floatingStyles,
              zIndex: 9999,
            }}
            {...getFloatingProps()}
          >
            {content}
          </div>,
          portalTarget
        )}
    </>
  );
}
