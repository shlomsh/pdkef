import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentType, JSX, RefObject } from 'preact';
import Sortable from 'sortablejs';
import styles from './PageStrip.module.css';
import { moveEntry, outputPageCount, rotateEntry, updateEntry, type PlanEntry } from '../../lib/mergePlan.ts';
import { openThumbnailSource } from '../../lib/thumbnails.js';
import { formatMessage, type MergeMessages } from '../../i18n/toolMessages';
import type { PreviewTarget } from './PagePreviewDialog.tsx';

export interface StripFile {
  id: number;
  file: File;
  pageCount: number | null;
  error: 'encrypted' | 'unreadable' | null;
}

export interface PageStripProps {
  entries: StripFile[];
  plan: PlanEntry[];
  /** Commits a plan update, exactly once per gesture (drop, key press, tap).
   * An updater over the current plan, not a value, so two commits in one
   * frame (R then Delete on a key repeat) compose instead of the second
   * overwriting the first. */
  onPlanChange: (update: (current: PlanEntry[]) => PlanEntry[]) => void;
  announce: (message: string) => void;
  messages: MergeMessages;
  /** Whether every file's pages still sit in one contiguous run
   * (mergePlan.isGrouped) - captions render only while this holds; once a
   * page crosses a file boundary the per-page tag dot takes over. */
  grouped: boolean;
  /** Touch only: per-page controls show after Edit pages is tapped (MERGE-11).
   * The toggle control itself is rendered by the parent now (wave 3), in the
   * document heading row; this only drives the grid's `data-editing`. */
  editing: boolean;
  /** The parent's drag-over listener paints the MERGE-10 insertion line on
   * this element, so it owns the ref. */
  stripRef: RefObject<HTMLUListElement>;
  /** Direction A: how many thumbnails have rendered, for the document
   * heading ("18 pages, 16 rendered") and the Download element's preparing
   * detail. Fired whenever the count changes, not on every render. */
  onRenderedCountChange?: (count: number) => void;
  /** A page action (skip, rotate, move) registers one undo with the parent's
   * single Undo-chip slot, snapshotting the plan from just before the
   * change. */
  onRegisterUndo?: (message: string, perform: () => void) => void;
  /** Direction A wave 2 (Shlomi): fired the first time a page cell receives
   * keyboard focus (Tab, not a pointer click), so the parent can show the
   * shortcuts line once, briefly, instead of it sitting in the header
   * permanently. May fire more than once across the mount; the parent is
   * the one that only acts on the first call. */
  onFirstKeyboardFocus?: () => void;
}

interface ThumbnailSource {
  pageCount: number;
  render: (pageIndex: number, opts: { width?: number; type?: string; quality?: number; signal?: AbortSignal }) => Promise<string>;
  destroy: () => Promise<void>;
}

/* MERGE-08's budget: 150 px PNG on desktop (15 to 25 KB a page), 96 px JPEG
   at 0.7 under 768 px (2 to 3 KB), so a 400-page set stays under 10 MB of
   data URLs on desktop and around 1 MB on a phone. Only pages near the
   viewport render (an IntersectionObserver over the document's own scroll,
   since the grid no longer scrolls itself - root: null), one at a time,
   yielding between pages. */
function isPhoneViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;
}

function thumbnailOptions() {
  const phone = isPhoneViewport();
  return phone ? { width: 96, type: 'image/jpeg', quality: 0.7 } : { width: 150, type: 'image/png' };
}

/* Direction A wave 2 (Shlomi): 96 to 110px cells on desktop and phone alike
   (a 104px portrait cell, its real-aspect landscape swap at the same area);
   the phone board asks for "as many columns as fit at 96px minimum" - a
   fixed 96px base on narrow viewports gets close to that without a second
   layout engine (CSS grid `auto-fill`) for what is otherwise a flex row
   mixing page cells and inline captions. */
function baseCellSize(): { w: number; h: number } {
  return isPhoneViewport() ? { w: 96, h: 127 } : { w: 104, h: 138 };
}

export default function PageStrip({
  entries,
  plan,
  onPlanChange,
  announce,
  messages: t,
  grouped,
  editing,
  stripRef,
  onRenderedCountChange,
  onRegisterUndo,
  onFirstKeyboardFocus,
}: PageStripProps) {
  // A plain keyboard/pointer heuristic (not :focus-visible, which some jsdom
  // versions don't implement): a keydown anywhere sets "keyboard modality"
  // until the next pointer interaction clears it, mirroring how most
  // focus-visible polyfills work.
  const keyboardActiveRef = useRef(false);
  useEffect(() => {
    const setKeyboard = () => { keyboardActiveRef.current = true; };
    const clearKeyboard = () => { keyboardActiveRef.current = false; };
    window.addEventListener('keydown', setKeyboard, true);
    window.addEventListener('mousedown', clearKeyboard, true);
    window.addEventListener('pointerdown', clearKeyboard, true);
    return () => {
      window.removeEventListener('keydown', setKeyboard, true);
      window.removeEventListener('mousedown', clearKeyboard, true);
      window.removeEventListener('pointerdown', clearKeyboard, true);
    };
  }, []);
  const [, bump] = useState(0);
  const thumbnails = useRef(new Map<string, string>());
  const aspects = useRef(new Map<string, number>());
  const sources = useRef(new Map<number, { source: Promise<ThumbnailSource>; controller: AbortController }>());
  const queue = useRef<string[]>([]);
  const queued = useRef(new Set<string>());
  const rendering = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const focusKey = useRef<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [PreviewDialog, setPreviewDialog] = useState<ComponentType<{
    target: PreviewTarget | null; onClose: () => void; onStep: (delta: 1 | -1) => void; messages: MergeMessages;
  }> | null>(null);

  const fileById = (id: number) => entriesRef.current.find((e) => e.id === id);

  const releaseFile = useCallback((fileId: number) => {
    const held = sources.current.get(fileId);
    if (held) {
      held.controller.abort();
      held.source.then((s) => s.destroy()).catch(() => {});
      sources.current.delete(fileId);
    }
    for (const key of Array.from(thumbnails.current.keys())) {
      if (key.startsWith(`${fileId}:`)) thumbnails.current.delete(key);
    }
    queue.current = queue.current.filter((key) => !key.startsWith(`${fileId}:`));
    for (const key of Array.from(queued.current)) if (key.startsWith(`${fileId}:`)) queued.current.delete(key);
  }, []);

  // Reports the rendered count up to the parent whenever it actually moves -
  // the document heading and the Download element's "N of M rendered" both
  // read it, without either owning the thumbnail cache itself.
  const reportRenderedCount = useCallback(() => {
    if (!onRenderedCountChange) return;
    let count = 0;
    for (const entry of planRef.current) if (thumbnails.current.has(entry.key)) count += 1;
    onRenderedCountChange(count);
  }, [onRenderedCountChange]);

  const processQueue = useCallback(async () => {
    if (rendering.current) return;
    rendering.current = true;
    try {
      while (queue.current.length > 0) {
        const key = queue.current.shift() as string;
        queued.current.delete(key);
        if (thumbnails.current.has(key)) continue;
        const [fileIdText, pageIndexText] = key.split(':');
        const fileId = Number(fileIdText);
        const pageIndex = Number(pageIndexText);
        const entry = fileById(fileId);
        if (!entry || entry.error) continue;
        let held = sources.current.get(fileId);
        if (!held) {
          const controller = new AbortController();
          held = { source: openThumbnailSource(entry.file) as Promise<ThumbnailSource>, controller };
          sources.current.set(fileId, held);
        }
        try {
          const source = await held.source;
          if (held.controller.signal.aborted) continue;
          const dataUrl = await source.render(pageIndex, { ...thumbnailOptions(), signal: held.controller.signal });
          if (held.controller.signal.aborted) continue;
          thumbnails.current.set(key, dataUrl);
          bump((n) => n + 1);
          reportRenderedCount();
        } catch {
          // A page that will not render stays a placeholder; the merge itself
          // reports a broken file through inspectPdf, not through here.
        }
        // Yield so a long grid never freezes scrolling.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      rendering.current = false;
    }
  }, [reportRenderedCount]);

  const enqueue = useCallback((key: string) => {
    if (thumbnails.current.has(key) || queued.current.has(key)) return;
    queued.current.add(key);
    queue.current.push(key);
    void processQueue();
  }, [processQueue]);

  // Release thumbnails and cancel pending renders for files that left the list.
  useEffect(() => {
    const present = new Set(entries.map((e) => e.id));
    for (const fileId of Array.from(sources.current.keys())) if (!present.has(fileId)) releaseFile(fileId);
    for (const key of Array.from(thumbnails.current.keys())) {
      if (!present.has(Number(key.split(':')[0]))) thumbnails.current.delete(key);
    }
    reportRenderedCount();
  }, [entries, releaseFile, reportRenderedCount]);

  useEffect(() => () => {
    for (const fileId of Array.from(sources.current.keys())) releaseFile(fileId);
    observer.current?.disconnect();
  }, [releaseFile]);

  // Observe every card; render as it nears the viewport. The grid no longer
  // scrolls itself (it wraps in the page's own flow), so the observer root
  // is the viewport, not the grid element.
  useEffect(() => {
    const grid = stripRef.current;
    if (!grid) return undefined;
    observer.current?.disconnect();
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        const key = (record.target as HTMLElement).dataset.key;
        if (key) enqueue(key);
      }
    }, { root: null, rootMargin: '400px 0px 400px 0px' });
    observer.current = io;
    for (const card of Array.from(grid.querySelectorAll('[data-key]'))) io.observe(card);
    return () => io.disconnect();
  }, [plan, enqueue, stripRef]);

  // SortableJS owns the DOM during a drag; the plan is committed once in onEnd.
  useEffect(() => {
    const grid = stripRef.current;
    if (!grid) return undefined;
    const sortable = Sortable.create(grid, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      draggable: `.${styles.page}`,
      filter: `.${styles.caption}, .${styles.action}, .${styles['row-break']}`,
      preventOnFilter: false,
      // A swipe pans the page; a press-and-hold picks a page up. Without the
      // delay every vertical scroll on a phone would start a drag instead.
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      ghostClass: styles['is-ghost'],
      chosenClass: styles['is-chosen'],
      dragClass: styles['is-dragging'],
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) return;
        const { oldIndex, newIndex } = evt;
        const snapshot = planRef.current;
        onPlanChange((current) => moveEntry(current, oldIndex, newIndex));
        announce(formatMessage(t.pageMoved, { position: newIndex + 1, total: planRef.current.length }));
        onRegisterUndo?.(formatMessage(t.pageMovedUndo, { number: newIndex + 1 }), () => onPlanChange(() => snapshot));
      },
    });
    return () => sortable.destroy();
  }, [stripRef, onPlanChange]);

  // Keep focus on the page that was just moved by keyboard, even though its
  // node changed position in the DOM.
  useEffect(() => {
    const key = focusKey.current;
    if (!key || !stripRef.current) return;
    // Keys are `${fileId}:${pageIndex}`, digits and a colon, safe inside quotes.
    const card = stripRef.current.querySelector<HTMLElement>(`[data-key="${key}"]`);
    if (card && document.activeElement !== card) card.focus({ preventScroll: false });
  }, [plan, stripRef]);

  const rotate = useCallback((key: string, position: number) => {
    const snapshot = planRef.current;
    onPlanChange((current) => rotateEntry(current, key, 90));
    const before = planRef.current.find((p) => p.key === key)?.rotation ?? 0;
    announce(formatMessage(t.pageRotated, { number: position, degrees: (before + 90) % 360 }));
    onRegisterUndo?.(formatMessage(t.pageRotatedUndo, { number: position }), () => onPlanChange(() => snapshot));
  }, [onPlanChange, announce, t.pageRotated, t.pageRotatedUndo, onRegisterUndo]);

  const toggleSkip = useCallback((key: string, position: number) => {
    const entry = planRef.current.find((p) => p.key === key);
    if (!entry) return;
    const snapshot = planRef.current;
    onPlanChange((current) => {
      const live = current.find((p) => p.key === key);
      return live ? updateEntry(current, key, { skipped: !live.skipped }) : current;
    });
    announce(formatMessage(entry.skipped ? t.pageIncluded : t.pageSkipped, { number: position }));
    if (!entry.skipped) {
      onRegisterUndo?.(formatMessage(t.pageSkippedUndo, { number: position }), () => onPlanChange(() => snapshot));
    }
  }, [onPlanChange, announce, t.pageIncluded, t.pageSkipped, t.pageSkippedUndo, onRegisterUndo]);

  const move = useCallback((index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= planRef.current.length) return;
    const snapshot = planRef.current;
    focusKey.current = planRef.current[index].key;
    onPlanChange((current) => moveEntry(current, index, target));
    announce(formatMessage(t.pageMoved, { position: target + 1, total: planRef.current.length }));
    onRegisterUndo?.(formatMessage(t.pageMovedUndo, { number: target + 1 }), () => onPlanChange(() => snapshot));
  }, [onPlanChange, announce, t.pageMoved, t.pageMovedUndo, onRegisterUndo]);

  const openPreview = useCallback((index: number) => {
    setPreviewIndex(index);
    if (!PreviewDialog) {
      import('./PagePreviewDialog.tsx').then((module) => setPreviewDialog(() => module.default)).catch(() => {});
    }
  }, [PreviewDialog]);

  const onCardKeyDown = (event: KeyboardEvent, index: number, key: string) => {
    const rtl = typeof getComputedStyle === 'function' && getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === backward) {
      event.preventDefault();
      move(index, -1);
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      rotate(key, index + 1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      toggleSkip(key, index + 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openPreview(index);
    }
  };

  const previewTarget: PreviewTarget | null = (() => {
    if (previewIndex == null) return null;
    const entry = plan[previewIndex];
    const file = entry ? fileById(entry.fileId) : undefined;
    if (!entry || !file) return null;
    return { file: file.file, pageIndex: entry.pageIndex, rotation: entry.rotation, position: previewIndex + 1, total: plan.length };
  })();

  const filePosition = new Map(entries.map((e, i) => [e.id, i + 1]));
  // Numbers are output positions: what the page will be in the merged file
  // (and what "Add page numbers" would stamp). A skipped page shows the
  // number it would take, struck, so the pages behind it keep the numbers
  // they will really get.
  const outputTotal = outputPageCount(plan);
  let outputCounter = 0;
  const items: JSX.Element[] = [];
  plan.forEach((entry, index) => {
    const file = fileById(entry.fileId);
    if (!file) return;
    if (!entry.skipped) outputCounter += 1;
    const position = entry.skipped ? outputCounter + 1 : outputCounter;

    // A file's run starts a caption LABEL while the plan is still grouped -
    // colour tag, name (bidi plaintext), page range, nothing else (Shlomi's
    // reduction: no size, no rule, no actions - remove lives in the rail row,
    // rotate all is gone). Once pages are interleaved across files the
    // caption disappears for the whole grid (the parent's rail shows the
    // note instead) and the per-page tag dot (always in the DOM, see below)
    // becomes visible. A run of two pages or fewer sits inline beside its
    // own cells (one flex row) instead of claiming a full-width row above
    // them - `data-inline` switches the CSS between the two.
    if (grouped && (index === 0 || plan[index - 1].fileId !== entry.fileId)) {
      const runStart = position;
      // Walk the file's own contiguous slice to find its last output
      // position and how many pages the run has.
      let end = runStart;
      let counter = outputCounter - 1;
      let runLength = 0;
      for (let i = index; i < plan.length && plan[i].fileId === entry.fileId; i += 1) {
        runLength += 1;
        if (!plan[i].skipped) counter += 1;
        end = plan[i].skipped ? end : counter;
      }
      const tagIndex = ((filePosition.get(entry.fileId) ?? 1) - 1) % 6;
      const tagStyle = { '--tag-color': `var(--color-tag-${tagIndex + 1})` } as any;
      const inline = runLength <= 2;
      // An inline label sits beside its own 1-2 cells on one flex line, but
      // flex-wrap has no notion of "keep this item and the next two
      // together" - without help the label can land mid-row after the
      // previous run, pushing its own cells to split across the wrap. A
      // zero-height, full-width, presentational item forces a fresh row
      // right before the label; excluded from SortableJS (`filter`, same as
      // `.caption`) and from the insertion-line painter (no `data-key`).
      if (inline) {
        items.push(
          <li key={`break-${entry.fileId}`} class={styles['row-break']} aria-hidden="true" />,
        );
      }
      items.push(
        <li
          key={`caption-${entry.fileId}`}
          class={styles.caption}
          data-caption-for={entry.fileId}
          data-inline={inline || undefined}
        >
          <span class={styles['tag-square']} style={tagStyle} aria-hidden="true" />
          <span class={styles['caption-name']} dir="auto">{file.file.name}</span>
          <span class={styles['caption-meta']}>
            {formatMessage(t.captionPages, { from: runStart, to: end })}
          </span>
        </li>,
      );
    }

    const thumbnail = thumbnails.current.get(entry.key);
    const aspect = aspects.current.get(entry.key);
    const rotated90 = entry.rotation === 90 || entry.rotation === 270;
    const sourceLandscape = aspect != null && aspect >= 1;
    const finalLandscape = rotated90 ? !sourceLandscape : sourceLandscape;
    const base = baseCellSize();
    const cellStyle = {
      '--cell-w': `${finalLandscape ? base.h : base.w}px`,
      '--cell-h': `${finalLandscape ? base.w : base.h}px`,
    } as any;
    const thumbStyle = rotated90
      ? { width: 'var(--cell-h)', height: 'var(--cell-w)', transform: `rotate(${entry.rotation}deg)` }
      : entry.rotation === 180 ? { transform: 'rotate(180deg)' } : undefined;
    const tagIndex = ((filePosition.get(entry.fileId) ?? 1) - 1) % 6;
    const dotStyle = { '--tag-color': `var(--color-tag-${tagIndex + 1})` } as any;
    const label = formatMessage(t.pageItemLabel, {
      number: position,
      total: outputTotal,
      file: file.file.name,
      state: entry.skipped ? t.skippedState : '',
    });
    items.push(
      <li
        key={entry.key}
        class={styles.page}
        data-key={entry.key}
        data-rotation={entry.rotation || undefined}
        data-skipped={entry.skipped || undefined}
        style={cellStyle}
        tabIndex={0}
        aria-label={label}
        onKeyDown={(event) => onCardKeyDown(event, index, entry.key)}
        onFocus={() => {
          focusKey.current = entry.key;
          if (keyboardActiveRef.current) onFirstKeyboardFocus?.();
        }}
      >
        <span class={styles['tag-dot']} style={dotStyle} aria-hidden="true" />
        <span class={styles['thumb-box']}>
          {thumbnail ? (
            <img
              class={styles.thumb}
              src={thumbnail}
              alt=""
              loading="lazy"
              style={thumbStyle}
              onLoad={(event) => {
                const img = event.currentTarget as HTMLImageElement;
                if (img.naturalWidth && img.naturalHeight) {
                  aspects.current.set(entry.key, img.naturalWidth / img.naturalHeight);
                  bump((n) => n + 1);
                }
              }}
            />
          ) : file.error ? (
            <span class={styles['lock-glyph']} aria-hidden="true">L</span>
          ) : null}
        </span>
        <span class={styles.number}>{position}</span>
        {entry.skipped && <span class={styles['skipped-word']}>{t.skippedBadge.toLowerCase()}</span>}
        <span class={styles.actions}>
          <button
            type="button"
            class={styles.action}
            aria-label={formatMessage(t.rotatePage, { number: position })}
            onClick={() => rotate(entry.key, position)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M13 8a5 5 0 1 1-1.5-3.6" />
              <path d="M13 2v3h-3" />
            </svg>
          </button>
          <button
            type="button"
            class={styles.action}
            aria-pressed={entry.skipped}
            aria-label={formatMessage(entry.skipped ? t.includePage : t.skipPage, { number: position })}
            onClick={() => toggleSkip(entry.key, position)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              {entry.skipped ? <path d="M3 8.5l3 3 7-7" /> : <path d="M2 2l12 12M4 4.5h8M4 8h8M4 11.5h8" />}
            </svg>
          </button>
          <button
            type="button"
            class={styles.action}
            aria-label={formatMessage(t.openPreview, { number: position })}
            onClick={() => openPreview(index)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.3 10.3L14 14" />
            </svg>
          </button>
        </span>
      </li>,
    );
  });

  return (
    <section class={styles.section} aria-labelledby="merge-pages-heading">
      {/* Direction A wave 3: the Edit pages toggle now lives in the document
          heading row (PdfMergeTool.tsx), beside the heading itself, so the
          two share one line on a phone instead of the toggle dropping to a
          line of its own. This section keeps `editing`/`onToggleEditing`
          only to drive the grid's own `data-editing` attribute. */}
      <p class="sr-only" id="merge-strip-hint">{t.stripHint}</p>
      <ul
        class={styles.grid}
        ref={stripRef}
        aria-describedby="merge-strip-hint"
        data-editing={editing || undefined}
        data-grouped={grouped || undefined}
      >
        {items}
      </ul>
      {PreviewDialog && (
        <PreviewDialog
          target={previewTarget}
          onClose={() => setPreviewIndex(null)}
          onStep={(delta) => setPreviewIndex((current) => (current == null ? null : Math.max(0, Math.min(plan.length - 1, current + delta))))}
          messages={t}
        />
      )}
    </section>
  );
}
