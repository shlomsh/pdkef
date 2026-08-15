import { cloneElement } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import {
  useFloating,
  useInteractions,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  offset,
  flip,
  shift,
  autoUpdate
} from '@floating-ui/react';
import styles from './SignTool/SignToolbar.module.css';

/**
 * How long a pointer must rest on a tool button before its tooltip appears.
 * Roughly a native `title`'s own delay, deliberately: this replaces one, and a
 * mouse crossing the toolbar to reach a different button brushes several of
 * these on the way, so anything much shorter fires bubbles at someone who was
 * only passing through. Closing is not delayed - once the pointer has actually
 * left, a lingering bubble is just in the way.
 *
 * Two paths skip it, and neither is a hover: keyboard focus (never accidental
 * the way a passing cursor is) and the once-per-session auto-show, which is an
 * introduction rather than a response to a pause.
 */
export const HOVER_OPEN_DELAY_MS = 1000;

function armHintText(label) {
  return `Double-click to keep ${label} on`;
}

/**
 * The one hover tooltip an armable tool button gets - what it does, and the
 * double-click shortcut to keep it on - replacing the button's native `title`
 * entirely rather than living alongside it. The two used to be separate: the
 * browser's own `title` bubble carried the action line, this carried the
 * shortcut, and because neither knows about the other, hovering could show
 * both at once, stacked, one delayed relative to the other.
 *
 * Portaled via Floating UI, the same pattern `Popover.jsx` already uses to get
 * the Shapes/Sign dropdowns out from under this exact toolbar - and for the
 * same reason: `.toolbar` has `container-type: inline-size` for its responsive
 * label-dropping, and per the CSS Containment spec that implies clipping of
 * anything inside it that overflows. That clip happens at the container, not
 * at any one button, so no amount of `overflow: visible` on the button fixes
 * it - the content has to leave the container's subtree entirely, which is
 * what portaling does. This was tried first as an absolutely-positioned
 * `<span>` inside the button and clipped exactly that way; don't repeat it.
 *
 * The hover delay (500ms) and the "stays open while focused" behavior come
 * from Floating UI's own `useHover`/`useFocus` rather than a CSS
 * transition-delay: a CSS-only version needed a hand-computed specificity
 * workaround so the once-per-session auto-show could skip the delay even
 * though a just-clicked button is by definition still under the pointer.
 * `useHover`'s delay governs only its own open calls, so the forced-open state
 * never fights it here.
 *
 * Gated on `(hover: hover) and (pointer: fine)`, computed once: double-click
 * and hover both do not exist on touch, so this must never be triggerable by
 * any path there, and the whole floating subtree is skipped rather than merely
 * hidden - keeping it out of the DOM and the accessibility tree on a device
 * that cannot act on it.
 *
 * `useRole(context, { role: 'tooltip' })` wires `aria-describedby` on the
 * trigger to the bubble's id, present only while the bubble is open, which is
 * the correct ARIA tooltip pattern - and the reason this file does not
 * hand-roll an id scheme.
 *
 * Renders the trigger untouched once the tool is locked: a locked tool has
 * nothing left to teach - the gesture that got it there is done - and its
 * action line is already in the always-visible status line above.
 *
 * `autoShowTool` (from `useAutoArmHint`) forces the bubble open once per
 * session, for the tool that was just armed, independent of hover.
 *
 * Every armable button gets this, Shapes and Sign included, with no special
 * case for the two that own a dropdown. Their menus open downward while this
 * opens upward, so the two never contend for the same space and both can be on
 * screen at once. An earlier arrangement had the tooltip opening downward too,
 * which did collide - and the escape hatch for that (suppressing the tooltip
 * whenever the menu was open) quietly cost those two buttons their tooltip
 * entirely, because the menu opens on the very hover the tooltip waits on. If
 * a future change moves either surface, check that they still open opposite
 * ways before reaching for suppression again.
 *
 * @param {string} props.tool - this button's tool id
 * @param {string} props.label - the button's own visible name, e.g. "Whiteout"
 * @param {string} props.action - what the tool does, e.g. "Draw a whiteout box to erase content."
 * @param {boolean} props.locked - true when there is nothing left to teach for this tool
 * @param {string|null} props.autoShowTool - the tool id to force-show for, or null
 * @param {import('preact').VNode} props.children - the single button (or wrapper) this hint belongs to
 */
export default function ArmHint({ tool, label, action, locked, autoShowTool, children }) {
  const [canHover] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
  );

  const [hoverOpen, setHoverOpen] = useState(false);
  const inert = locked || !canHover;
  const open = !inert && (hoverOpen || autoShowTool === tool);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setHoverOpen,
    // Above the button, deliberately opposite to the Shapes/Sign menus, which
    // drop down. Two reasons, and the second is the load-bearing one:
    // downward put the bubble over the top edge of page one - the thing you are
    // about to click, and the only thing on screen that is the user's own work -
    // and it put the tooltip on the same side as those menus, so the two had to
    // take turns. Opposite directions means they can simply coexist.
    placement: 'top',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ fallbackAxisSideDirection: 'end' }), shift({ padding: 8 })]
  });

  const hover = useHover(context, { delay: { open: HOVER_OPEN_DELAY_MS, close: 0 }, enabled: !inert });
  const focus = useFocus(context, { enabled: !inert });
  // bubbles.escapeKey: true - this is a tooltip, not a modal or a menu with its
  // own Escape-driven state to protect. Floating UI's default is to swallow the
  // keystroke that closed it (stopPropagation), which is right for something
  // like Popover.jsx's dropdowns but wrong here: it silently ate the Escape
  // press that PdfSignTool.jsx's/PdfRedactTool.jsx's own global handler uses to
  // clear the active tool and selection, whenever this hint's once-per-session
  // auto-show happened to still be open - exactly the moment right after
  // arming a tool, which is also exactly when these tests press Escape.
  const dismiss = useDismiss(context, { bubbles: { escapeKey: true } });
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  // Fullscreen re-scopes where a portal has to land, same as Popover.jsx: the
  // Fullscreen API renders its element on a separate top layer, so a bubble
  // portaled to `document.body` would paint behind it and never be seen.
  const [portalTarget, setPortalTarget] = useState(
    typeof document !== 'undefined' ? (document.fullscreenElement || document.body) : null
  );
  useEffect(() => {
    const onFullscreenChange = () => setPortalTarget(document.fullscreenElement || document.body);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  if (inert) return children;

  return (
    <>
      {cloneElement(children, {
        ref: refs.setReference,
        ...getReferenceProps(children.props)
      })}
      {open && portalTarget &&
        createPortal(
          <div
            ref={refs.setFloating}
            className={styles.hint}
            style={{ ...floatingStyles, zIndex: 9999 }}
            {...getFloatingProps()}
          >
            {action}
            <br />
            {armHintText(label)}
          </div>,
          portalTarget
        )}
    </>
  );
}
