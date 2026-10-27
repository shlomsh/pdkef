import { useCallback, useEffect, useRef } from 'preact/hooks';

interface HeldSource {
  source: Promise<{ aspects?: () => Promise<number[]> }>;
  controller: AbortController;
}

interface AspectEntry {
  id: number;
  error: unknown;
  pageCount: number | null;
}

/* Page aspects come from the PDF's own page sizes, read for every file, rather
   than from the first thumbnail: a thumbnail that arrives after the fit has
   settled changes a span and refits every cell (DEBT-65, 0.05 of layout
   shift on a throttled run). Photos and unreadable files simply have none.
   `aspects` is keyed `${fileId}:${pageIndex}`; `reading()` is true while any
   file has not reported yet; `forget` lets a removed file be read again. */
export function usePageAspects(
  entries: AspectEntry[],
  sourceFor: (entry: any) => HeldSource,
  rerender: () => void,
) {
  const aspects = useRef(new Map<string, number>());
  const probed = useRef(new Set<number>());
  const probing = useRef(0);

  useEffect(() => {
    for (const entry of entries.filter((e) => !e.error && e.pageCount != null && !probed.current.has(e.id))) {
      probed.current.add(entry.id);
      probing.current += 1;
      const held = sourceFor(entry);
      void (async () => { // reason: the body catches every failure itself
        try {
          const list = await (await held.source).aspects?.();
          if (!list || held.controller.signal.aborted) return;
          list.forEach((aspect, pageIndex) => {
            if (Number.isFinite(aspect) && aspect > 0) aspects.current.set(`${entry.id}:${pageIndex}`, aspect);
          });
        } catch {
          // expected: an unreadable file has no sizes; its thumbnail path reports the error
        } finally {
          probing.current -= 1;
          rerender();
        }
      })();
    }
  }, [entries, sourceFor]);

  const reading = () => entries.some((e) => !e.error && !probed.current.has(e.id)) || probing.current > 0;
  const forget = useCallback((fileId: number) => { probed.current.delete(fileId); }, []);
  return { aspects, reading, forget };
}
