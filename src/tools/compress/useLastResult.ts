import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { PreparedOutput } from '../../lib/usePreparedOutput.ts';
import { useObjectUrls } from '../../lib/useObjectUrls.js';

/** The last output that landed, with a link that stays valid while a newer one builds. */
export interface LastResult<M> { blob: Blob; meta: M; url: string | null }

/**
 * Guideline §2, "Quiet means quiet": `usePreparedOutput` withdraws its blob the moment an option
 * changes, but Compress keeps showing the last result, silently, until the new one lands. This holds
 * that last landed { blob, meta } and an object URL of its own (the prepared one is revoked on
 * withdrawal). `forget` drops it, for a new file, so one file's result never shows for the next.
 */
export function useLastResult<M>(prepared: Pick<PreparedOutput<M>, 'status' | 'blob' | 'meta' | 'url' | 'generation'>) {
  const { status, blob, meta, url, generation } = prepared;
  const heldRef = useRef<{ blob: Blob; meta: M; generation: number } | null>(null);
  // A result at or below this generation belongs to a file that was dropped; it is never held.
  const floorRef = useRef(-1);
  const generationRef = useRef(generation);
  generationRef.current = generation;
  const { url: heldUrl, setBlob } = useObjectUrls();

  if (status === 'ready' && blob && meta && generation > floorRef.current) {
    if (heldRef.current?.generation !== generation) heldRef.current = { blob, meta, generation };
  } else if (status === 'error' || status === 'idle') {
    heldRef.current = null;
  }
  const held = heldRef.current;

  useEffect(() => { setBlob(held?.blob ?? null); }, [held?.blob]);

  const forget = useCallback(() => {
    floorRef.current = generationRef.current;
    heldRef.current = null;
    setBlob(null);
  }, []);

  const last: LastResult<M> | null = held ? { blob: held.blob, meta: held.meta, url: status === 'ready' ? url : heldUrl } : null;
  return { last, forget };
}
