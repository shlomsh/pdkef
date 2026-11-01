import type { ComponentChildren } from 'preact';
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { capsuleReducer, initialCapsule } from './capsuleState.ts';
import { englishCapsuleLabels, foldedItems, type CapsuleLabels } from './capsuleItems.ts';
import styles from './ReadingCapsule.module.css';

/** @testSeam */
export interface ReadingCapsuleProps {
  fileName: string;
  page: number;
  pageCount: number;
  onJumpToPage(page: number): void;
  zoomSlot?: ComponentChildren;
  markerSlot?: ComponentChildren;
  onUndo(): void;
  onRedo(): void;
  canUndo: boolean;
  canRedo: boolean;
  onPrint?(): void;
  onDownload(): void;
  moreItems: { label: string; onSelect(): void }[];
  /** Required for the floating variant. */
  onExit?(): void;
  /** Required for the bar variant: the way into the Reading lamp. */
  onEnter?(): void;
  /** 'floating' dozes over the page; 'bar' is the same controls, always awake, in the flow. */
  variant?: 'floating' | 'bar';
  /** The workspace feeds scroll deltas. */
  scrollEvents: { subscribe(fn: (dy: number) => void): () => void };
  pagePressEvents: { subscribe(fn: () => void): () => void };
  labels?: CapsuleLabels;
}

const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;
const UndoIcon = () => <svg {...svg}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>;
const RedoIcon = () => <svg {...svg}><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" /></svg>;
const PrintIcon = () => <svg {...svg}><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>;
const DownloadIcon = () => <svg {...svg}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>;
const MoreIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
const ExitIcon = () => <svg {...svg}><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>;

/**
 * The Reading lamp (READ-05): a quiet floating capsule over the page. Whether it is awake is the pure
 * reducer's call (capsuleState.ts); this component only reports what happened to it and shows the result
 * through `data-mode`, which the CSS keys off.
 */
export default function ReadingCapsule(p: ReadingCapsuleProps) {
  const labels = p.labels ?? englishCapsuleLabels;
  const bar = p.variant === 'bar';
  const [state, dispatch] = useReducer(capsuleReducer, initialCapsule);
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
  const [menu, setMenu] = useState<'jump' | 'more' | null>(null);
  const [jump, setJump] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => (bar ? undefined : p.scrollEvents.subscribe((dy) => dispatch({ type: 'scroll', dy }))), [bar, p.scrollEvents]);
  useEffect(() => (bar ? undefined : p.pagePressEvents.subscribe(() => dispatch({ type: 'pagePress' }))), [bar, p.pagePressEvents]);

  const openMenu = (m: 'jump' | 'more') => {
    if (menu === m) return closeMenu();
    setMenu(m);
    if (m === 'jump') setJump(String(p.page));
    dispatch({ type: 'menuOpen' });
  };
  const closeMenu = () => {
    if (menu) dispatch({ type: 'menuClose' });
    setMenu(null);
  };
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) closeMenu(); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });

  const folded = foldedItems(width).filter((id) => !(bar && id === 'file'));
  const shows = (id: Parameters<typeof folded.includes>[0]) => !folded.includes(id);
  const pageLabel = formatMessage(labels.page, { n: p.page, count: p.pageCount });

  const go = (e: Event) => {
    e.preventDefault();
    const n = Math.round(Number(jump));
    if (Number.isFinite(n) && n >= 1 && n <= p.pageCount) {
      p.onJumpToPage(n);
      closeMenu();
    }
  };
  const pick = (fn: () => void) => () => { closeMenu(); fn(); };

  const foldedEntries: { id: string; label: string; onSelect?: () => void }[] = [
    ...(folded.includes('file') ? [{ id: 'file', label: p.fileName }] : []),
    ...(folded.includes('redo') && p.canRedo ? [{ id: 'redo', label: labels.redo, onSelect: p.onRedo }] : []),
    ...(folded.includes('print') && p.onPrint ? [{ id: 'print', label: labels.print, onSelect: p.onPrint }] : []),
    ...(folded.includes('download') ? [{ id: 'download', label: labels.download, onSelect: p.onDownload }] : []),
  ];

  return (
    <div
      ref={rootRef}
      class={`${styles.capsule} ${bar ? styles.bar : ''}`}
      role="toolbar"
      aria-label={labels.toolbar}
      data-mode={bar ? 'awake' : state.mode}
      onPointerEnter={() => dispatch({ type: 'pointerEnter' })}
      onPointerLeave={() => dispatch({ type: 'pointerLeave' })}
      onFocusIn={() => dispatch({ type: 'focusIn' })}
      onFocusOut={(e) => { if (!rootRef.current?.contains(e.relatedTarget as Node | null)) dispatch({ type: 'focusOut' }); }}
      onKeyDown={(e) => { if (e.key === 'Escape' && menu) { e.stopPropagation(); closeMenu(); } }}
    >
      <div class={styles.inner}>
        {!bar && shows('file') && <span class={styles.file} title={p.fileName}>{p.fileName}</span>}
        <span class={styles.menuWrap}>
          <button type="button" class={styles.page} aria-haspopup="menu" aria-expanded={menu === 'jump'} aria-label={pageLabel} title={labels.jump} onClick={() => openMenu('jump')}>
            {p.page} / {p.pageCount}
          </button>
          {menu === 'jump' && (
            <form class={`${styles.menu} ${styles.jump}`} role="group" aria-label={labels.jump} onSubmit={go}>
              <input class={styles.number} type="number" inputMode="numeric" min={1} max={p.pageCount} value={jump} aria-label={labels.jump} onInput={(e) => setJump((e.target as HTMLInputElement).value)} autoFocus />
              <button type="submit" class={styles.go}>{labels.go}</button>
            </form>
          )}
        </span>
        {p.zoomSlot}
        {p.markerSlot}
        <button type="button" class={styles.button} aria-label={labels.undo} title={labels.undo} aria-disabled={!p.canUndo} onClick={() => p.canUndo && p.onUndo()}><UndoIcon /></button>
        {shows('redo') && <button type="button" class={styles.button} aria-label={labels.redo} title={labels.redo} aria-disabled={!p.canRedo} onClick={() => p.canRedo && p.onRedo()}><RedoIcon /></button>}
        {shows('print') && p.onPrint && <button type="button" class={styles.button} aria-label={labels.print} title={labels.print} onClick={p.onPrint}><PrintIcon /></button>}
        {shows('download') && <button type="button" class={styles.button} aria-label={labels.download} title={labels.download} onClick={p.onDownload}><DownloadIcon /></button>}
        <span class={styles.menuWrap}>
          <button type="button" class={styles.button} aria-haspopup="menu" aria-expanded={menu === 'more'} aria-label={labels.more} title={labels.more} onClick={() => openMenu('more')}><MoreIcon /></button>
          {menu === 'more' && (
            <div class={`${styles.menu} ${styles.more}`} role="menu" aria-label={labels.more}>
              {foldedEntries.map((it) =>
                it.onSelect ? (
                  <button key={it.id} type="button" role="menuitem" class={styles.item} onClick={pick(it.onSelect)}>{it.label}</button>
                ) : (
                  <div key={it.id} role="none" class={styles.itemText}>{it.label}</div>
                ),
              )}
              {p.moreItems.map((it) => (
                <button key={it.label} type="button" role="menuitem" class={styles.item} onClick={pick(it.onSelect)}>{it.label}</button>
              ))}
            </div>
          )}
        </span>
        {bar ? (
          <button type="button" class={styles.button} aria-label={labels.enter} title={labels.enter} onClick={p.onEnter}><ReadingLampIcon /></button>
        ) : (
          <button type="button" class={styles.button} aria-label={labels.exit} title={labels.exit} onClick={p.onExit}><ExitIcon /></button>
        )}
      </div>
    </div>
  );
}

/**
 * READ-05: the Reading lamp's own icon, a small desk lamp leaning in to read. Its head nods and its bulb
 * warms when the button it sits in is hovered or focused (not under reduced motion).
 */
export function ReadingLampIcon({ size = 18 }: { size?: number }) {
  return (
    <svg class={styles.lamp} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3.5 21.5h8" />
      <path d="M4.8 21.4a2.7 1.9 0 0 1 5.4 0" fill="currentColor" />
      <path d="M7.5 19.6 5 12.3l6.4-6.1" />
      <circle cx="5" cy="12.3" r="1.1" fill="currentColor" />
      <g transform="translate(12.2 5.4)">
        <g class={styles.lampHead}>
          <path class={styles.lampBeam} d="M-4.2 5.4 L-5.6 10.6 L5.6 10.6 L4.2 5.4 Z" stroke="none" />
          <path d="M-1.3 0 C-3.6 0.5 -4.8 2.9 -4.8 5 Q0 6.7 4.8 5 C4.8 2.9 3.6 0.5 1.3 0 Z" fill="currentColor" />
          <circle class={styles.lampBulb} cx="0" cy="5.5" r="1.5" stroke="none" />
        </g>
        <circle cx="0" cy="0" r="1" fill="currentColor" />
      </g>
    </svg>
  );
}
