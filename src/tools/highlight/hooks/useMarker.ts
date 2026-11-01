import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DetailEdits } from '#editor/registry/draftValidation.ts';
import { DEFAULT_MARKER, rearm as rearmMarker, type Marker } from '../lib/marker/markerState.ts';
import { initialMarker, parseMarker, sameMarker, serializeMarker } from '../lib/marker/markerMemory.ts';

/** The marker in the hand (R1). Every change a reader makes on a highlight re-arms it (R5). */
export function useMarker() {
  const [marker, setMarker] = useState<Marker>(DEFAULT_MARKER);
  const rearm = useCallback((change: Partial<Marker>) => setMarker((m) => rearmMarker(m, change)), []);
  return { marker, rearm };
}

const STORE_KEY = 'pdkef:highlight:marker-default';

function storedDefault(): string | null {
  // expected: blocked storage reads as no remembered default
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}
function storeDefault(marker: Marker) {
  // expected: storage is optional, the choice still applies to this visit
  try { localStorage.setItem(STORE_KEY, serializeMarker(marker)); } catch { /* nothing to keep */ }
}

/**
 * The marker is remembered per document, in the draft's details, and the last one used becomes the default
 * for documents opened later (the way the zoom setting is kept). `restore` is called when a document opens;
 * `changed` is true once the reader has picked something since then.
 */
export function useMarkerMemory({ marker, rearm }: { marker: Marker; rearm(change: Partial<Marker>): void }) {
  const baseline = useRef<Marker>(DEFAULT_MARKER);
  const changedRef = useRef(false);
  const [own, setOwn] = useState(false);
  const [changed, setChanged] = useState(false);

  /** A document just opened: its own marker beats the remembered default. */
  const restore = useCallback((details: DetailEdits | undefined) => {
    const saved = details?.marker;
    const fromDraft = saved?.action === 'alter' ? saved.value : undefined;
    const next = initialMarker(fromDraft, storedDefault());
    baseline.current = next;
    changedRef.current = false;
    setOwn(parseMarker(fromDraft) !== null);
    setChanged(false);
    rearm(next);
  }, [rearm]);

  useEffect(() => {
    if (!changedRef.current && sameMarker(marker, baseline.current)) return;
    changedRef.current = true;
    setChanged(true);
    setOwn(true);
    storeDefault(marker);
  }, [marker]);

  const details = useMemo<DetailEdits>(() => {
    const edits: DetailEdits = {};
    if (own) edits.marker = { action: 'alter', value: serializeMarker(marker) };
    return edits;
  }, [own, marker]);

  return { restore, changed, details };
}
