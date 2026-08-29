import { cloneElement } from 'preact';
import { useState, useEffect } from 'preact/hooks';
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

export function createPopoverMiddleware(offsetValue = 5, stablePosition = false) {
  return [
    offset(offsetValue),
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
  stablePosition = false,
}: {
  trigger: any;
  content: any;
  placement?: any;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  offset?: number;
  stablePosition?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setUncontrolledOpen;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: createPopoverMiddleware(offsetValue, stablePosition)
  });

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
        ref: refs.setReference,
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
