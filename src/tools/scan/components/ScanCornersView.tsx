import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Maximize, Minimize2, Redo2, RotateCw, Spline, Trash2, Undo2, WandSparkles } from 'lucide-preact';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { englishScanMessages as t } from '../messages.ts';
import { useHistoryShortcuts } from '#lib/history/useHistoryShortcuts.js';
import { type Quad } from '#lib/pageEnhance/quad.ts';
import type { Point } from '#lib/pageEnhance/quad.ts';
import type { Pins, Sides } from '../lib/edges/follow.ts';
import { FULL_QUAD, pinsKey, quadKey, turnedPoint, turnedQuad, unturnedPoint, unturnedQuad } from '../lib/quad.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import CornerEditor from './CornerEditor.tsx';
import { useCornerHistory } from '../hooks/useCornerHistory.ts';
import { useCornerZoom } from '../hooks/useCornerZoom.ts';

interface ScanCornersViewProps {
  selected: ScanPage;
  /** The photo the corner editor shows: null while a turned preview is being made. */
  photo: string | null;
  shownAspect: number;
  /** The one line over the photo: what to do here, or what is happening to the page. */
  hint: string;
  finding: number | null;
  /** The photo could not be read (the scan state's failedIds), not merely still waiting for its preview. */
  unreadable: boolean;
  onCommit: (id: number, quad: Quad, pins?: Pins | null, fine?: boolean) => void;
  onFind: (page: ScanPage) => void;
  onRotate: () => void;
  /** The page's real border for the quad given (the photo's own frame); null when it cannot be traced. */
  onTrace?: (id: number, quad: Quad, pins?: Pins | null) => Promise<Sides | null>;
  /** Use these corners: back to the page. */
  onApprove: () => void;
  onRemove: (id: number) => void;
}

/** The closed outline the editor draws: each corner, then its side's points, in the turned photo's frame. */
function outline(quad: Quad, sides: Sides, turns: number): Point[] {
  return sides.flatMap((side, s) => [quad[s], ...side].map((p) => turnedPoint(p, turns)));
}

/** The pins left when the corners at `moved` changed: corner i touches sides i and (i + 3) % 4, which lose theirs. */
function pinsAfterMove(pins: Pins | null, before: Quad, after: Quad): Pins | null {
  if (!pins) return null;
  const next = pins.map((side) => side) as Pins;
  after.forEach((p, i) => {
    if (p.x === before[i].x && p.y === before[i].y) return;
    next[i] = [];
    next[(i + 3) % 4] = [];
  });
  return next.some((side) => side.length > 0) ? next : null;
}

/** One pin set into another: side `s`'s pin `k` set to `at`, or removed when `at` is null; null when none remain. */
function withPin(pins: Pins | null, s: number, k: number, at: Point | null): Pins | null {
  const next = (pins ?? [[], [], [], []]).map((side) => side.filter((p) => p.k !== k)) as Pins;
  if (at) next[s] = [...next[s], { k, at }].sort((a, b) => a.k - b.k);
  return next.some((side) => side.length > 0) ? next : null;
}

/** The corners view under the editor head: the photo's panel (its hint and history over the photo and its corners),
 * then one bar of choices. */
export default function ScanCornersView({ selected, photo, shownAspect, hint, finding, unreadable, onCommit, onFind, onRotate, onTrace, onApprove, onRemove }: ScanCornersViewProps) {
  // The trace waits with the page and the quad it was computed for; one for any other is not shown.
  const [traced, setTraced] = useState<{ id: number; key: string; sides: Sides } | null>(null);
  const history = useCornerHistory(selected.id, { quad: selected.quad, pins: selected.pins, fine: selected.fine }, (shape) => onCommit(selected.id, shape.quad, shape.pins, shape.fine));
  useHistoryShortcuts(history.undo, history.redo);
  const areaRef = useRef<HTMLDivElement | null>(null);
  // Zooming is by wheel, pinch and keys (the hook); the one control is the way back, shown only while zoomed.
  const zoom = useCornerZoom(areaRef, `${selected.id}|${selected.turns}`);
  const key = `${quadKey(selected.quad)}#${pinsKey(selected.pins)}`;
  useEffect(() => {
    // The border is traced only while the person has Fine-tune edges on.
    if (!onTrace || !selected.fine) return;
    let live = true;
    const quad = selected.quad;
    const pins = selected.pins;
    // reason: onTrace never rejects; a trace that fails is reported where it ran and resolves null.
    void onTrace(selected.id, quad, pins).then((sides) => {
      if (live && sides) setTraced({ id: selected.id, key: `${quadKey(quad)}#${pinsKey(pins)}`, sides });
    });
    return () => { live = false; };
    // onTrace is deliberately not a dependency: a new function identity is not a new page or quad.
  }, [selected.id, key, selected.fine]);
  const trace = selected.fine && traced && traced.id === selected.id && traced.key === key
    ? outline(selected.quad, traced.sides, selected.turns)
    : null;
  const whole = quadKey(selected.quad) === quadKey(FULL_QUAD);
  const quiet = workspaceStyles['quiet-button'];
  return (
    <div class={styles['corners-view']}>
      <div class={styles['photo-panel']}>
        <div class={styles['panel-strip']}>
          <p class={styles['panel-hint']} role="status">{hint}</p>
          {!unreadable && (
            <div class={styles['panel-history']}>
              <button type="button" class={quiet} disabled={!history.canUndo} aria-label={t.undo} title={t.undo} onClick={history.undo}>
                <Undo2 size={18} aria-hidden="true" />
              </button>
              <button type="button" class={quiet} disabled={!history.canRedo} aria-label={t.redo} title={t.redo} onClick={history.redo}>
                <Redo2 size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <div class={styles['photo-area']} ref={areaRef} data-photo-area>
          {photo === null ? (
            // The photo's own shape and size, so nothing moves when its preview lands. The hint over it says what it waits for.
            <div
              class={styles['corners-wait']}
              style={{ aspectRatio: String(shownAspect), width: `min(100%, calc(var(--scan-view-h) * ${shownAspect}))` }}
            />
          ) : (
            // On a turned page the photo, its shape and its corners are all shown turned (quad.ts).
            <CornerEditor
              key={`${selected.id}|${selected.turns}`}
              src={photo}
              aspect={selected.aspect === null ? undefined : shownAspect}
              quad={turnedQuad(selected.quad, selected.turns)}
              trace={trace}
              pinned={selected.fine && selected.pins ? selected.pins.flatMap((side, s) => side.map((p) => s * 16 + p.k + 1)) : []}
              onCommit={(shown) => {
                const quad = unturnedQuad(shown, selected.turns);
                history.commit({ quad, pins: pinsAfterMove(selected.pins, selected.quad, quad), fine: selected.fine });
              }}
              onPin={selected.fine ? (index, atShown) => {
                history.commit({ quad: selected.quad, pins: withPin(selected.pins, Math.floor(index / 16), (index % 16) - 1, unturnedPoint(atShown, selected.turns)), fine: true });
              } : undefined}
              onUnpin={selected.fine ? (index) => {
                history.commit({ quad: selected.quad, pins: withPin(selected.pins, Math.floor(index / 16), (index % 16) - 1, null), fine: true });
              } : undefined}
              labels={{ group: t.cornersGroup, corners: t.corners, pin: t.pinLabel }}
            />
          )}
        </div>
        {photo !== null && zoom.canZoomOut && (
          // Zoomed in, the corners may be out of view: the way back to the whole photo is always on screen.
          <button type="button" class={`${quiet} ${styles['fit-chip']}`} data-fit-page onClick={zoom.fit}>
            <Minimize2 size={16} aria-hidden="true" />
            {t.fitPage}
          </button>
        )}
      </div>
      {unreadable ? (
        // An unreadable photo has nothing to straighten: the one thing to do is take it out.
        <div class={styles['corners-bar']}>
          <button type="button" class={`${quiet} ${styles['done-button']}`} onClick={() => onRemove(selected.id)}>
            <Trash2 size={18} aria-hidden="true" />
            {t.removePhoto}
          </button>
        </div>
      ) : (
        // Like a scanner app's bottom bar: the quiet tools, then the one that moves on. One row where it fits; on a
        // narrow screen the tools are a row of four and the one that moves on takes the full width under them.
        <div class={styles['corners-bar']}>
          <div class={styles['corners-tools']}>
            <button type="button" class={quiet} disabled={finding !== null || selected.preview === null} onClick={() => { history.remember(); onFind(selected); }}>
              <WandSparkles size={18} aria-hidden="true" />
              {t.findPage}
            </button>
            <button type="button" class={quiet} disabled={whole} onClick={() => history.commit({ quad: FULL_QUAD, pins: null, fine: false })}>
              <Maximize size={18} aria-hidden="true" />
              {t.wholePhoto}
            </button>
            <button type="button" class={quiet} disabled={selected.preview === null} onClick={onRotate}>
              <RotateCw size={18} aria-hidden="true" />
              {t.rotate}
            </button>
            <button
              type="button"
              class={quiet}
              aria-pressed={selected.fine}
              disabled={selected.preview === null || whole}
              onClick={() => history.commit({ quad: selected.quad, pins: selected.pins, fine: !selected.fine })}
            >
              <Spline size={18} aria-hidden="true" />
              {t.fineTune}
            </button>
          </div>
          <button type="button" class={`${quiet} ${styles['done-button']}`} disabled={selected.preview === null} onClick={onApprove}>
            <Check size={18} aria-hidden="true" />
            {t.useCorners}
          </button>
        </div>
      )}
    </div>
  );
}
