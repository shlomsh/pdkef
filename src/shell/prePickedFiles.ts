import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

/** The files a server-rendered file input already holds, taken out of it. The input is real and
 * tappable from first paint, so on a slow phone a person can choose a file while the island's
 * script is still downloading: the browser fires `change` into a page with no handler, and the
 * file only waits in `files`. Copies the list out before clearing, as every change handler does
 * (`value = ''` empties a live FileList). */
export function takePrePickedFiles(input: HTMLInputElement | null | undefined): File[] {
  const files = Array.from(input?.files ?? []);
  if (input && files.length > 0) input.value = '';
  return files;
}

/** Once, when the island first mounts, hands `onFiles` whatever the input held before this
 * island could listen. `ready` holds the read back while the input is not the one the page
 * served (a draft check in progress swaps it for a placeholder). */
export function useAdoptPrePickedFiles(
  inputRef: RefObject<HTMLInputElement>,
  onFiles: (files: File[]) => void,
  ready = true,
) {
  const latest = useRef(onFiles);
  latest.current = onFiles;
  const adopted = useRef(false);
  useEffect(() => {
    if (!ready || adopted.current) return;
    adopted.current = true;
    const files = takePrePickedFiles(inputRef.current);
    if (files.length > 0) latest.current(files);
  }, [ready, inputRef]);
}
