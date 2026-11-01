import { useCallback, useState } from 'preact/hooks';
import { DEFAULT_MARKER, rearm as rearmMarker, type Marker } from '../lib/marker/markerState.ts';

/** The marker in the hand (R1). Every change a reader makes on a highlight re-arms it (R5). */
export function useMarker() {
  const [marker, setMarker] = useState<Marker>(DEFAULT_MARKER);
  const rearm = useCallback((change: Partial<Marker>) => setMarker((m) => rearmMarker(m, change)), []);
  return { marker, rearm };
}
