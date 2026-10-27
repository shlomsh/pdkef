import { useRef, useEffect } from 'preact/hooks';
import { uniqueId } from '../../../editor/model/ids.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { startGesture } from '../../../lib/gestures/controller.ts';
import usePdfCoordinates from '../../../editor-ui/hooks/usePdfCoordinates.js';
import type { PercentBox } from '../../../editor-ui/whiteout/pageColor.ts';
import { formatMessage } from '../../../lib/formatMessage.ts';
import type { CommittedStroke } from '../components/BrushLayer.tsx';
import type { RedactElement } from '../lib/redactElements.ts';
import type { RedactAction, RedactState } from '../state/redactState.ts';
import type { RedactCommands } from './useRedactCommands.ts';
import { englishRedactMessages as t } from '../messages.ts';
import styles from '../PdfRedactTool.module.css';

export type RedactPointerEvent = (MouseEvent | TouchEvent) & { currentTarget: HTMLElement };

/**
 * Drawing a box by dragging on a page, and committing a brush stroke. The drag
 * mutates the preview element during the gesture and commits once on release,
 * through the gesture controller.
 */
export default function useRedactDrawing({ state, dispatch, setAnnouncement, disarmTool, brushKind, samplePage, add }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
  setAnnouncement: (message: string) => void;
  disarmTool: () => void;
  brushKind: 'blur' | 'whiteout' | null;
  samplePage: (pageIndex: number, box: PercentBox) => string | null | undefined;
  add: RedactCommands<RedactElement>['add'];
}) {
  const { activeStyle, activeBlurStrength } = state.tool;
  const { getPointerPercent } = usePdfCoordinates();
  const drawingPreviewRef = useRef<HTMLDivElement | null>(null);
  const cancelDrawingRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelDrawingRef.current?.(), []);

  const handlePointerDown = (e: RedactPointerEvent, pageIndex: number) => {
    // No tool armed: a press on the page is a scroll or a deselect, never a new
    // box. Delete mode has its own click targets (DeletableObjectOverlay
    // below) and never draws one either, so it may not start the drag
    // gesture this function owns.
    if (!activeStyle || activeStyle === 'delete') return;
    // A brush paints through BrushLayer, which owns the press.
    if (brushKind) return;

    const target = e.target as Element | null;
    if (target?.closest(`.${styles['redact-box']}`)) {
      return; // Ignore clicks on an existing box or its floating toolbar
    }

    e.preventDefault();
    const container = e.currentTarget;
    const origin = getPointerPercent(e, container);
    const type = activeStyle;
    const color = type === 'blackout' ? '#000000' : undefined;
    const strength = type === 'blur' ? activeBlurStrength : undefined;
    // Clicking blank page area deselects/hides any box's controls as the draw begins.
    dispatch({ type: 'DRAW_STARTED', drawing: { pageIndex, startX: origin.x, startY: origin.y, type, color, strength } });
    cancelDrawingRef.current?.();
    cancelDrawingRef.current = startGesture({
      computePatch: (moveEvent) => {
        if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        const point = getPointerPercent(moveEvent, container);
        const x = Math.max(0, Math.min(100, point.x));
        const y = Math.max(0, Math.min(100, point.y));
        return { left: Math.min(origin.x, x), top: Math.min(origin.y, y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y) };
      },
      writeDOM: (patch) => {
        const preview = drawingPreviewRef.current;
        if (!preview) return;
        preview.style.left = `${patch.left}%`;
        preview.style.top = `${patch.top}%`;
        preview.style.width = `${patch.width}%`;
        preview.style.height = `${patch.height}%`;
      },
      commit: (patch) => {
        cancelDrawingRef.current = null;
        dispatch({ type: 'DRAW_ENDED' });
        // A press that drew nothing has not spent the tool's one placement, so
        // it stays armed - otherwise a mistimed tap would silently disarm and
        // the next real drag would do nothing at all.
        if (!patch || patch.width <= 1 || patch.height <= 1) return;
        const id = uniqueId();
        // RED-51: a whiteout takes the page's own colour (a synchronous read of
        // the canvas, inside this one-shot commit) and keeps following it.
        const element: RedactElement = {
          id, pageIndex, ...patch, type,
          ...(type === 'whiteout' ? { color: samplePage(pageIndex, patch) ?? '#ffffff', colorMode: 'auto' as const } : {}),
          ...(type === 'blackout' ? { color } : {}),
          ...(type === 'blur' ? { strength: activeBlurStrength } : {}),
        };
        add([element], { type: `ADD_${type.toUpperCase()}`, description: formatMessage(t.addedBox, { type }) });
        recordAction('place_mark');
        setAnnouncement(formatMessage(t.addedBoxAnnounce, { type }));
        disarmTool();
      },
      cancel: () => {
        cancelDrawingRef.current = null;
        dispatch({ type: 'DRAW_ENDED' });
      },
    });
  };

  // RED-32: one stroke, one history entry. The brush stays armed afterwards
  // (no disarmTool): painting is several strokes in a row.
  const addStroke = (stroke: CommittedStroke) => {
    const word = stroke.type === 'blurStroke' ? t.strokeBlur : t.strokeWhiteout;
    add([stroke as RedactElement], { type: 'ADD_STROKE', description: formatMessage(t.paintedStroke, { kind: word }) });
    recordAction('place_mark');
    setAnnouncement(formatMessage(t.paintedStrokeAnnounce, { kind: word }));
  };

  return { handlePointerDown, addStroke, drawingPreviewRef };
}
