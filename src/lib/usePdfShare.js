import { useCallback, useEffect, useState } from 'preact/hooks';

function canShareFiles(files) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;

  try {
    return typeof navigator.canShare !== 'function' || navigator.canShare({ files });
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
  const [preparedFiles, setPreparedFiles] = useState([]);

  useEffect(() => {
    if (typeof File === 'undefined') return;
    const probe = new File([''], 'document.pdf', { type: 'application/pdf' });
    setCanSharePdf(canShareFiles([probe]));
  }, []);

  const prepareFiles = useCallback((items) => {
    if (typeof File === 'undefined') return false;
    const files = items.map(({ blob, filename, type = blob.type || 'application/octet-stream' }) =>
      new File([blob], filename, { type }),
    );
    if (files.length === 0 || !canShareFiles(files)) return false;
    setPreparedFiles(files);
    return true;
  }, []);

  const prepare = useCallback((blob, filename) =>
    prepareFiles([{ blob, filename, type: 'application/pdf' }]), [prepareFiles]);

  const clearPrepared = useCallback(() => setPreparedFiles([]), []);

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
    if (preparedFiles.length !== 1) return false;
    download(preparedFiles[0], preparedFiles[0].name);
    return true;
  }, [download, preparedFiles]);

  const sharePrepared = useCallback(async () => {
    if (preparedFiles.length === 0) return { status: 'unavailable' };

    try {
      await navigator.share({
        title: preparedFiles.length === 1 ? preparedFiles[0].name : `${preparedFiles.length} files`,
        files: preparedFiles,
      });
      return { status: 'shared' };
    } catch (error) {
      return { status: error?.name === 'AbortError' ? 'canceled' : 'error', error };
    }
  }, [preparedFiles]);

  return {
    canSharePdf,
    shareReady: preparedFiles.length > 0,
    prepare,
    prepareFiles,
    clearPrepared,
    download,
    downloadPrepared,
    sharePrepared
  };
}
