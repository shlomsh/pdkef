import { useCallback, useEffect, useState } from 'preact/hooks';

function canShareFile(file) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;

  try {
    return typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Reusable local-PDF sharing object.
 *
 * A PDF is generated asynchronously, while navigator.share() needs a fresh
 * tap. `prepare()` keeps the generated File and `sharePrepared()` opens the
 * native sheet from the user's next tap.
 */
export function usePdfShare() {
  const [canSharePdf, setCanSharePdf] = useState(false);
  const [preparedFile, setPreparedFile] = useState(null);

  useEffect(() => {
    if (typeof File === 'undefined') return;
    const probe = new File([''], 'document.pdf', { type: 'application/pdf' });
    setCanSharePdf(canShareFile(probe));
  }, []);

  const prepare = useCallback((blob, filename) => {
    if (typeof File === 'undefined') return false;
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (!canShareFile(file)) return false;
    setPreparedFile(file);
    return true;
  }, []);

  const clearPrepared = useCallback(() => setPreparedFile(null), []);

  const download = useCallback((blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const downloadPrepared = useCallback(() => {
    if (!preparedFile) return false;
    download(preparedFile, preparedFile.name);
    return true;
  }, [download, preparedFile]);

  const sharePrepared = useCallback(async () => {
    if (!preparedFile) return { status: 'unavailable' };

    try {
      await navigator.share({ title: preparedFile.name, files: [preparedFile] });
      return { status: 'shared' };
    } catch (error) {
      return { status: error?.name === 'AbortError' ? 'canceled' : 'error', error };
    }
  }, [preparedFile]);

  return {
    canSharePdf,
    shareReady: !!preparedFile,
    prepare,
    clearPrepared,
    download,
    downloadPrepared,
    sharePrepared
  };
}
