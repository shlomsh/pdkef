import { useEffect, useReducer, useRef } from 'preact/hooks';
import { renderThumbnail } from '#lib/pdf/thumbnails.js';

/** Twice a grid tile's widest square, so a photo stays sharp on a 2x screen. */
const THUMBNAIL_WIDTH = 320;

/**
 * COMP-04: a small picture of each photo in a set, drawn from the original as soon as the set is picked,
 * one photo at a time. It depends only on the files, so a new target never redraws a single one. `enqueue` is
 * the compression's own queue, so a picture is never decoded while a photo is compressing.
 */
export function usePhotoThumbnails(files: File[], enqueue: (job: () => Promise<void>) => void): Map<File, string> {
  const drawnRef = useRef(new Map<File, string>());
  const askedRef = useRef(new Set<File>());
  const filesRef = useRef(files);
  filesRef.current = files;
  const aliveRef = useRef(true);
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    // A photo that left the set lets go of its picture.
    const current = new Set(files);
    for (const file of askedRef.current) {
      if (current.has(file)) continue;
      askedRef.current.delete(file);
      drawnRef.current.delete(file);
    }
    for (const file of files) {
      if (askedRef.current.has(file)) continue;
      askedRef.current.add(file);
      enqueue(async () => {
        if (!aliveRef.current || !filesRef.current.includes(file)) return;
        try {
          const url = await renderThumbnail(file, { width: THUMBNAIL_WIDTH, type: 'image/jpeg', quality: 0.8 });
          if (!aliveRef.current || !askedRef.current.has(file)) return;
          drawnRef.current.set(file, url);
          redraw(0);
        } catch { // expected: a file the browser cannot decode; its compression fails too and its tile says so
        }
      });
    }
  });
  useEffect(() => () => { aliveRef.current = false; }, []);

  return drawnRef.current;
}
