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
  /** "18 pages", already localized by the parent through the shell catalogue. */
  countLabel: string;
  /** Touch only: per-page controls show after Edit pages is tapped (MERGE-11). */
  editing: boolean;
  onToggleEditing: () => void;
  /** The parent's drag-over listener paints the MERGE-10 insertion line on
   * this element, so it owns the ref. */
  stripRef: RefObject<HTMLUListElement>;
}

interface ThumbnailSource {
  pageCount: number;
  render: (pageIndex: number, opts: { width?: number; type?: string; quality?: number; signal?: AbortSignal }) => Promise<string>;
  destroy: () => Promise<void>;
}

/* MERGE-08's budget: 150 px PNG on desktop (15 to 25 KB a page), 96 px JPEG
   at 0.7 under 768 px (2 to 3 KB), so a 400-page set stays under 10 MB of
   data URLs on desktop and around 1 MB on a phone. Only pages near the
   viewport render (an IntersectionObserver over the strip's own items:
   nothing here is hidden first, so the home-page rule does not apply), one
   at a time, yielding between pages. */
function thumbnailOptions() {
  const phone = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;
  return phone ? { width: 96, type: 'image/jpeg', quality: 0.7 } : { width: 150, type: 'image/png' };
}

export default function PageStrip({
  entries,
  plan,
  onPlanChange,
  announce,
  messages: t,
  countLabel,
  editing,
  onToggleEditing,
  stripRef,
}: PageStripProps) {
  const [, bump] = useState(0);
  const thumbnails = useRef(new Map<string, string>());
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
        } catch {
          // A page that will not render stays a placeholder; the merge itself
          // reports a broken file through inspectPdf, not through here.
        }
        // Yield so a long strip never freezes scrolling.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      rendering.current = false;
    }
  }, []);

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
  }, [entries, releaseFile]);

  useEffect(() => () => {
    for (const fileId of Array.from(sources.current.keys())) releaseFile(fileId);
    observer.current?.disconnect();
  }, [releaseFile]);

  // Observe every card; render as it nears the viewport.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    observer.current?.disconnect();
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        const key = (record.target as HTMLElement).dataset.key;
        if (key) enqueue(key);
      }
    }, { root: strip, rootMargin: '0px 240px 0px 240px' });
    observer.current = io;
    for (const card of Array.from(strip.querySelectorAll('[data-key]'))) io.observe(card);
    return () => io.disconnect();
  }, [plan, enqueue, stripRef]);

  // SortableJS owns the DOM during a drag; the plan is committed once in onEnd.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    const sortable = Sortable.create(strip, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      draggable: `.${styles.page}`,
      filter: `.${styles.divider}, .${styles.action}, .${styles['open-preview']}`,
      preventOnFilter: false,
      // A swipe pans the strip; a press-and-hold picks a page up. Without the
      // delay every horizontal scroll on a phone would start a drag instead.
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      ghostClass: styles['is-ghost'],
      chosenClass: styles['is-chosen'],
      dragClass: styles['is-dragging'],
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex == null || evt.newIndex == null || evt.oldIndex === evt.newIndex) return;
        const { oldIndex, newIndex } = evt;
        onPlanChange((current) => moveEntry(current, oldIndex, newIndex));
        announce(formatMessage(t.pageMoved, { position: newIndex + 1, total: planRef.current.length }));
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
    onPlanChange((current) => rotateEntry(current, key, 90));
    const before = planRef.current.find((p) => p.key === key)?.rotation ?? 0;
    announce(formatMessage(t.pageRotated, { number: position, degrees: (before + 90) % 360 }));
  }, [onPlanChange, announce, t.pageRotated]);

  const toggleSkip = useCallback((key: string, position: number) => {
    const entry = planRef.current.find((p) => p.key === key);
    if (!entry) return;
    onPlanChange((current) => {
      const live = current.find((p) => p.key === key);
      return live ? updateEntry(current, key, { skipped: !live.skipped }) : current;
    });
    announce(formatMessage(entry.skipped ? t.pageIncluded : t.pageSkipped, { number: position }));
  }, [onPlanChange, announce, t.pageIncluded, t.pageSkipped]);

  const move = useCallback((index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= planRef.current.length) return;
    focusKey.current = planRef.current[index].key;
    onPlanChange((current) => moveEntry(current, index, target));
    announce(formatMessage(t.pageMoved, { position: target + 1, total: planRef.current.length }));
  }, [onPlanChange, announce, t.pageMoved]);

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
  const items: JSX.Element[] = [];
  plan.forEach((entry, index) => {
    const file = fileById(entry.fileId);
    if (!file) return;
    const position = index + 1;
    if (index > 0 && plan[index - 1].fileId !== entry.fileId) {
      items.push(<li key={`divider-${entry.key}`} class={styles.divider} role="presentation" aria-hidden="true" />);
    }
    const thumbnail = thumbnails.current.get(entry.key);
    const label = formatMessage(t.pageItemLabel, {
      number: position,
      total: plan.length,
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
        tabIndex={0}
        aria-label={label}
        onKeyDown={(event) => onCardKeyDown(event, index, entry.key)}
        onFocus={() => { focusKey.current = entry.key; }}
      >
        <span class={styles.tag} aria-hidden="true">{formatMessage(t.fileTag, { number: filePosition.get(entry.fileId) ?? 0 })}</span>
        {entry.skipped && <span class={styles['skipped-badge']} aria-hidden="true">{t.skippedBadge}</span>}
        <span class={styles['thumb-box']}>
          {thumbnail ? <img class={styles.thumb} src={thumbnail} alt="" loading="lazy" /> : null}
          <button
            type="button"
            class={styles['open-preview']}
            aria-label={formatMessage(t.openPreview, { number: position })}
            onClick={() => openPreview(index)}
          />
        </span>
        <span class={styles.number}>{position}</span>
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
        </span>
      </li>,
    );
  });
  const skippedCount = plan.length - outputPageCount(plan);

  return (
    <section class={styles.section} aria-labelledby="merge-pages-heading">
      <div class={styles.header}>
        <h2 class={styles.heading} id="merge-pages-heading">{t.pagesHeading}</h2>
        <span class={styles.count}>
          {countLabel}
          {skippedCount > 0 ? ` · ${skippedCount} ${t.skippedBadge.toLowerCase()}` : ''}
        </span>
        <button type="button" class={styles['edit-toggle']} aria-pressed={editing} onClick={onToggleEditing}>
          {editing ? t.doneEditing : t.editPages}
        </button>
      </div>
      <p class="sr-only" id="merge-strip-hint">{t.stripHint}</p>
      <ul
        class={styles.strip}
        ref={stripRef}
        aria-describedby="merge-strip-hint"
        data-editing={editing || undefined}
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
