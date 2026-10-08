import { useEffect, useState } from 'preact/hooks';
import type { DocumentTraces } from '../../../editor/adapters/pdf/documentTraces.js';
import { reportError } from '../../../lib/errorReport.ts';
import { readDetails } from './readDetails.ts';

/** The file's details, read when the file changes. Null while reading, with no file, or when the read fails. */
export function useDocumentDetails(file: File | Blob | null): DocumentTraces | null {
  const [traces, setTraces] = useState<DocumentTraces | null>(null);
  useEffect(() => {
    setTraces(null);
    if (!file) return;
    let current = true;
    readDetails(file).then(
      (read) => { if (current) setTraces(read); },
      (err) => { reportError('redact', err, 'details_read'); if (current) setTraces(null); },
    );
    return () => { current = false; };
  }, [file]);
  return traces;
}
