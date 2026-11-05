import { useRef } from 'preact/hooks';
import { ScanWork } from '../state/scanWork.ts';

/** The island's instance values: the work object (state/scanWork.ts) and the elements it measures and focuses. */
export function useScanRefs() {
  const workRef = useRef<ScanWork | null>(null);
  workRef.current ??= new ScanWork();
  const editorRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLParagraphElement | null>(null);
  /** Async work that finishes after the island is gone makes no object URLs and sets no state. */
  const unmountedRef = useRef(false);
  return { work: workRef.current, editorRef, headingRef, unmountedRef };
}
