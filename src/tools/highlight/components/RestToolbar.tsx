import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import HighlightSwatches from '#editor-ui/highlight/HighlightSwatches.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { inkEnd, placeBar } from '../lib/marker/inkEnd.ts';
import { keyAction } from '../lib/marker/keys.ts';
import { HIGHLIGHT_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { markOf } from '../lib/marker/markEdit.ts';
import { nextFocusIndex } from '../lib/marker/roving.ts';
import {
  closeLayer, initialLayers, layersOf, openColors, openCustom, pickedColor, scrolledPast, type Layers,
} from '../lib/marker/toolbarLayers.ts';
import type { HintAnchor } from '../hooks/useRestToolbar.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import styles from './RestToolbar.module.css';

/** R3: the colors open after this long a rest on Highlight, so a quick pass toward Delete never opens them. */
const INTENT_MS = 450;
const SIX = HIGHLIGHT_COLORS.length;

const icon = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;
const UnderlineIcon = () => <svg {...icon}><path d="M6 4v7a6 6 0 0 0 12 0V4" /><path d="M4 21h16" /></svg>;
const TrashIcon = () => <svg {...icon}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>;

const isTyping = (el: Element | null) => !!el && ((el as HTMLElement).isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * The toolbar a highlight opens on a rest or a tap: Highlight | Underline, Delete. Resting on Highlight (or
 * clicking it) opens the six colors and a plus, and the plus opens a color input and an opacity slider.
 * It is placed once on open, inside the page wrapper, and every change is the caller's to apply.
 */
export default function RestToolbar({ mark, onChange, onDelete, onClose }: {
  mark: HighlightElement;
  onChange(change: Partial<Marker>): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [layers, setLayers] = useState<Layers>(initialLayers);
  const rootRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLButtonElement>(null);
  const intent = useRef(0);
  const focusColors = useRef(false);
  const refocusHighlight = useRef(false);
  const rtl = mark.direction === 'rtl';
  const look = markOf(mark);
  const underline = look.style === 'underline';
  const percent = Math.round(look.opacity * 100);

  // The latest of everything the document listeners need, so they subscribe once.
  const live = useRef({ layers, mark, onChange, onDelete, onClose, look });
  live.current = { layers, mark, onChange, onDelete, onClose, look };

  const openRow = (fromKeyboard: boolean) => {
    window.clearTimeout(intent.current);
    focusColors.current = fromKeyboard;
    setLayers(openColors);
  };
  const foldRow = () => {
    refocusHighlight.current = !!rootRef.current?.contains(document.activeElement) && document.activeElement !== document.body;
    setLayers(pickedColor);
  };
  const pickColor = (color: string) => {
    live.current.onChange({ color });
    foldRow();
  };
  const toggleUnderline = () => live.current.onChange({ style: live.current.look.style === 'underline' ? 'highlight' : 'underline' });

  // Placed once, before paint: beside the end of the last band, off the line, inside the screen.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const parent = root?.offsetParent as HTMLElement | null;
    if (!root || !parent) return;
    const box = parent.getBoundingClientRect();
    const end = inkEnd(live.current.mark);
    const cell = parseFloat(getComputedStyle(root).getPropertyValue('--cell')) || 32;
    const barW = root.offsetWidth;
    const placed = placeBar({
      x: box.left + (end.x / 100) * box.width,
      lineTop: box.top + (end.top / 100) * box.height,
      lineBottom: box.top + (end.bottom / 100) * box.height,
      barW,
      barMaxW: barW - (hlRef.current?.offsetWidth ?? 0) + (SIX + 1) * cell,
      barH: root.offsetHeight,
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      topMin: 8,
      rtl,
    });
    root.dataset.side = placed.side;
    root.style.top = `${placed.top - box.top}px`;
    if (placed.align === 'left') {
      root.style.left = `${placed.edge - box.left}px`;
      root.style.right = 'auto';
    } else {
      root.style.right = `${box.right - placed.edge}px`;
      root.style.left = 'auto';
    }
  }, []);

  // Focus follows the Highlight half when it turns into the colors and back.
  useEffect(() => {
    if (layers.colors && focusColors.current) {
      focusColors.current = false;
      const root = rootRef.current;
      (root?.querySelector<HTMLElement>('[data-highlight-swatch][aria-pressed="true"]') ?? root?.querySelector<HTMLElement>('[data-highlight-swatch]'))?.focus();
    } else if (!layers.colors && refocusHighlight.current) {
      refocusHighlight.current = false;
      hlRef.current?.focus();
    }
  }, [layers.colors]);

  useEffect(() => () => window.clearTimeout(intent.current), []);

  // R9: keys, a press elsewhere, and a scroll of more than 24 px.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { layers: current, onChange: change, onDelete: del, onClose: close } = live.current;
      const action = keyAction(e, { typing: isTyping(e.target as Element | null), layers: layersOf(current) });
      if (!action) return;
      if (action.type === 'color') {
        e.preventDefault();
        change({ color: HIGHLIGHT_COLORS[action.index].hex });
        foldRow();
      } else if (action.type === 'underline') {
        e.preventDefault();
        toggleUnderline();
      } else if (action.type === 'delete') {
        e.preventDefault();
        del();
      } else if (action.type === 'closeLayer') {
        e.preventDefault();
        if (action.layer === 'custom' || action.layer === 'colors') setLayers((l) => closeLayer(l, action.layer as 'custom' | 'colors'));
        else close();
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (rootRef.current?.contains(target)) return;
      if (target?.closest?.(`[data-element-id="${live.current.mark.id}"]`)) return;
      live.current.onClose();
    };
    const workspace = rootRef.current?.closest<HTMLElement>('[data-workspace]') ?? null;
    const start = { win: window.scrollY, ws: workspace?.scrollTop ?? 0 };
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target === document) {
        if (scrolledPast(start.win, window.scrollY)) live.current.onClose();
      } else if (target === workspace && workspace && scrolledPast(start.ws, workspace.scrollTop)) {
        live.current.onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  const onArrow = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'BUTTON') return;
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    const next = nextFocusIndex(buttons.indexOf(target), e.key, buttons.length, rtl);
    if (next === null) return;
    e.preventDefault();
    buttons[next].focus();
  };

  const inSix = HIGHLIGHT_COLORS.some((c) => c.hex.toLowerCase() === look.color.toLowerCase());

  return (
    <div
      ref={rootRef} class={styles.bar} role="toolbar" aria-label={t.markToolbar} dir={rtl ? 'rtl' : 'ltr'}
      data-rest-toolbar data-side="above" onKeyDown={onArrow}
    >
      <div class={styles.seg}>
        {layers.colors ? (
          <div class={styles.row} role="group" aria-label={t.markColors}>
            <HighlightSwatches color={look.color} t={englishSignMessages} onChange={({ color }) => pickColor(color)} />
            <button
              type="button" class={styles.plus} aria-label={t.markCustom} aria-haspopup="true" aria-expanded={layers.custom}
              onClick={() => setLayers((l) => (l.custom ? closeLayer(l, 'custom') : openCustom(l)))}
            >
              <i class={`${styles.plusMark} ${inSix ? '' : styles.plusCustom}`} style={inSix ? undefined : { '--c': look.color }} />
            </button>
          </div>
        ) : (
          <button
            ref={hlRef} type="button" class={styles.hl} aria-label={t.markHighlight} aria-pressed={!underline} aria-haspopup="true" aria-expanded={false}
            aria-keyshortcuts="1 2 3 4 5 6" title={t.markHighlight}
            onClick={(e) => {
              if (underline) live.current.onChange({ style: 'highlight' });
              openRow(e.detail === 0);
            }}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return;
              window.clearTimeout(intent.current);
              intent.current = window.setTimeout(() => openRow(false), INTENT_MS);
            }}
            onPointerLeave={() => window.clearTimeout(intent.current)}
          >
            <i class={styles.dot} style={{ background: look.color, opacity: Math.max(0.35, look.opacity) }} />
            {t.markHighlight}
          </button>
        )}
        <button
          type="button" class={styles.ul} aria-label={t.markUnderline} aria-pressed={underline} aria-keyshortcuts="U" title={t.markUnderline}
          onClick={toggleUnderline}
        >
          <UnderlineIcon />
          {t.markUnderline}
        </button>
      </div>
      <button
        type="button" class={`${styles.icon} ${styles.delete}`} aria-label={t.markDelete} aria-keyshortcuts="Delete" title={t.markDelete}
        onClick={() => live.current.onDelete()}
      >
        <TrashIcon />
      </button>
      {layers.custom && (
        <div class={styles.panel} role="group" aria-label={t.markCustom}>
          <div class={styles.prow}>
            <span>{t.markColors}</span>
            <input
              type="color" class={styles.pick} aria-label={t.markColorInput} value={look.color.toLowerCase()}
              onInput={(e) => live.current.onChange({ color: (e.target as HTMLInputElement).value.toUpperCase() })}
            />
          </div>
          <div class={styles.prow}>
            <span>{t.markOpacity}</span>
            <input
              type="range" class={styles.range} min={30} max={100} step={5} value={percent} aria-label={t.markOpacity}
              onInput={(e) => live.current.onChange({ opacity: Number((e.target as HTMLInputElement).value) / 100 })}
            />
            <span class={styles.val} aria-hidden="true">{percent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** R8: a quiet pill beside the end of the first mark's ink, never over the line being read. */
export function MarkHint({ anchor, text }: { anchor: HintAnchor; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept inside the screen, once, as it appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const shift = r.left < 8 ? 8 - r.left : r.right > vw - 8 ? vw - 8 - r.right : 0;
    if (shift) el.style.translate = `${shift}px 0`;
  }, []);
  return (
    <div
      ref={ref} data-mark-hint class={`${styles.hint} ${anchor.rtl ? styles.hintRtl : ''}`}
      style={{ left: `${anchor.x}%`, top: `${anchor.bottom}%` }}
    >
      {text}
    </div>
  );
}
