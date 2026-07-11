import { cloneElement } from 'preact';
import { useState } from 'preact/hooks';
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

export default function Popover({
  trigger,
  content,
  placement = 'bottom',
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  offset: offsetValue = 5,
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen !== undefined ? setControlledOpen : setUncontrolledOpen;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(offsetValue),
      flip({ fallbackAxisSideDirection: 'end' }),
      shift({ padding: 5 })
    ]
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role
  ]);

  return (
    <>
      {cloneElement(trigger, {
        ref: refs.setReference,
        ...getReferenceProps()
      })}
      
      {open &&
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
          document.body
        )}
    </>
  );
}
