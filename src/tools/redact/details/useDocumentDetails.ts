import { useEffect, useState } from 'preact/hooks';
import type { DocumentTraces } from '../../../editor/adapters/pdf/documentTraces.js';
import { reportError } from '../../../lib/errorReport.ts';
import { readDetails } from './readDetails.ts';

/**
 * The file's details, read when the file's bytes change. Null while reading, with no bytes, or when the read fails.
 * ENC-02: `opened` is "pdf.js opened the document and it is not protected"; until then nothing is read,
 * so a protected file (which pdf-lib refuses) never reaches PDFDocument.load.
 */
export function useDocumentDetails(bytes: ArrayBuffer | null, opened: boolean): DocumentTraces | null {
  const [traces, setTraces] = useState<DocumentTraces | null>(null);
  useEffect(() => {
    setTraces(null);
    if (!bytes || !opened) return;
    let current = true;
    readDetails(bytes).then(
      (read) => { if (current) setTraces(read); },
      (err) => { reportError('redact', err, 'details_read'); if (current) setTraces(null); },
    );
    return () => { current = false; };
  }, [bytes, opened]);
  return traces;
}
