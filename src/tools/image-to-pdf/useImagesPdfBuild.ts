import { useEffect, useRef, useState } from 'preact/hooks';
import { createQuietPreparer, type QuietPolicy } from '../../lib/quietPrepare.ts';
import { useObjectUrls } from '../../lib/useObjectUrls.js';
import { reportError } from '../../lib/errorReport.ts';
import { imagesToPdf } from './imageToPdf.js';
import { orderKey } from './pageOrder.js';

export interface ImageEntry {
  id: number;
  file: File;
  thumbnail: string;
}

/**
 * Builds the PDF for the current page order in the background, once the
 * person has gone quiet (guideline 2). The first build after the first pick
 * starts at once; later changes wait. `urgent` (a tap on Download is waiting)
 * also skips the wait. A result for an order that is no longer on screen is
 * dropped, and going back to an order already built is a cache hit.
 */
export function useImagesPdfBuild(entries: ImageEntry[], urgent: boolean, quietPolicy?: QuietPolicy) {
  const key = orderKey(entries);
  const keyRef = useRef(key);
  keyRef.current = key;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const urgentRef = useRef(urgent);
  urgentRef.current = urgent;
  const startedRef = useRef(false);
  const runningRef = useRef(0);
  const preparerRef = useRef<ReturnType<typeof createQuietPreparer<Blob>> | null>(null);
  const [ready, setReady] = useState<{ key: string; blob: Blob } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [building, setBuilding] = useState(false);
  const { url, setBlob } = useObjectUrls();

  useEffect(() => {
    const preparer = createQuietPreparer<Blob>({
      policy: quietPolicy,
      build: async (k, signal) => {
        const byId = new Map(entriesRef.current.map((entry) => [String(entry.id), entry.file]));
        const files = k.split(',').map((id) => byId.get(id)).filter((file): file is File => !!file);
        runningRef.current += 1;
        setBuilding(true);
        setProgress(0);
        try {
          return await imagesToPdf(files, (value: number) => { if (!signal.aborted) setProgress(value); }, signal);
        } finally {
          runningRef.current -= 1;
          setBuilding(runningRef.current > 0);
        }
      },
      onReady: (k, blob) => {
        if (k !== keyRef.current) return;
        setBlob(blob);
        setReady({ key: k, blob });
        setFailedKey(null);
      },
      onError: (k, err: any) => {
        // expected: a superseded build is aborted on purpose and is not a failure
        if (err?.name === 'AbortError' || k !== keyRef.current) return;
        reportError('pdf_tool_run', err, 'build_pdf_from_images');
        console.error(err);
        setFailedKey(k);
      },
    });
    preparerRef.current = preparer;
    return () => {
      preparer.dispose();
      preparerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const preparer = preparerRef.current;
    if (!preparer) return;
    if (key === '') {
      preparer.dispose();
      startedRef.current = false;
      setReady(null);
      setFailedKey(null);
      setBlob(null);
      return;
    }
    setFailedKey(null);
    preparer.change(key);
    if (!startedRef.current || urgentRef.current) {
      startedRef.current = true;
      preparer.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fresh = ready !== null && ready.key === key;
  return {
    fresh,
    blob: fresh ? ready.blob : null,
    url,
    failed: failedKey === key,
    progress,
    building,
    buildNow: () => preparerRef.current?.now(),
    retry: () => {
      setFailedKey(null);
      preparerRef.current?.change(key);
      preparerRef.current?.now();
    },
  };
}
