import { useCallback, useRef } from 'preact/hooks';
import { openThumbnailSource } from '../../lib/pdf/thumbnails.js';

interface ThumbnailSource {
  pageCount: number;
  /** Every page's width / height, read without rendering. */
  aspects?: () => Promise<number[]>;
  render: (pageIndex: number, opts: { width?: number; type?: string; quality?: number; signal?: AbortSignal }) => Promise<string>;
  destroy: () => Promise<void>;
}

/* One pdf.js document per file, opened the first time a page or an aspect needs it. */
export function useThumbnailSources() {
  const sources = useRef(new Map<number, { source: Promise<ThumbnailSource>; controller: AbortController }>());
  const sourceFor = useCallback((entry: { id: number; file: File }) => {
    let held = sources.current.get(entry.id);
    if (!held) {
      const controller = new AbortController();
      held = { source: openThumbnailSource(entry.file) as Promise<ThumbnailSource>, controller };
      sources.current.set(entry.id, held);
    }
    return held;
  }, []);
  return { sources, sourceFor };
}
