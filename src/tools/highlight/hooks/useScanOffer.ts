import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { sourceIdForBytes } from '#lib/drafts/draftSourceId.ts';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ScanVerdict } from '../lib/enhance/scanCheck.ts';
import { claimScanOffer, isCrooked, type CrookedVerdict } from '../lib/enhance/scanOffer.ts';
import { useScanCheck } from './useScanCheck.ts';

interface ScanOfferInput {
  /** null while unknown; goes null when a new document opens. */
  verdict: ScanVerdict | null;
  file: File | null;
  bytes: () => ArrayBuffer | null;
  hasMarks: boolean;
  /** The line has just appeared, for the page's announcement. */
  onOffer?: (verdict: CrookedVerdict) => void;
}

/** localStorage can throw on access itself (blocked site data); this hands the claim a store that does so inside its own try. */
const safeStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

/**
 * PE-07: offers Scan once, the first time a crooked scan opens, as long as nothing is marked yet.
 * The claim is spent even when marks hide the line, so that file has had its one offer.
 * @testSeam
 */
export function useScanOffer({ verdict, file, bytes, hasMarks, onOffer }: ScanOfferInput) {
  const [offered, setOffered] = useState<CrookedVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasMarksRef = useRef(hasMarks);
  hasMarksRef.current = hasMarks;
  const bytesRef = useRef(bytes);
  bytesRef.current = bytes;
  const onOfferRef = useRef(onOffer);
  onOfferRef.current = onOffer;

  useEffect(() => {
    setOffered(null);
    setBusy(false);
    setFailed(false);
    if (!isCrooked(verdict)) return;
    let live = true;
    const claim = async () => {
      const id = await sourceIdForBytes(bytesRef.current());
      if (!live || !id) return;
      const first = claimScanOffer(id, safeStorage);
      if (!first || hasMarksRef.current) return;
      setOffered(verdict);
      onOfferRef.current?.(verdict);
    };
    claim().catch((err) => { if (live) reportError('pdf_tool_run', err, 'scan_offer'); });
    return () => { live = false; };
  }, [verdict]);

  // A mark hides the line for good: the verdict effect is the only way back, and it does not rerun on undo.
  useEffect(() => { if (hasMarks) setOffered(null); }, [hasMarks]);

  const keepAsIs = useCallback(() => setOffered(null), []);

  const straighten = useCallback(() => {
    const data = bytesRef.current();
    if (busy || !file || !data) return;
    setBusy(true);
    setFailed(false);
    sendHandoff('scan-to-pdf', { fileName: file.name, fileType: 'application/pdf', fileBytes: data, from: 'highlight-pdf' })
      // Back from Scan can restore this very page, so it must not come back stuck on busy.
      .then(() => setBusy(false))
      .catch(() => {
        // expected: the hand-off store already reported it; the person just sees the quiet failure line
        setFailed(true);
        setBusy(false);
      });
  }, [busy, file]);

  return { verdict: offered, busy, failed, straighten, keepAsIs };
}

/** The silent check on the open document, and what Highlight offers from its verdict. */
export function useOpenScanOffer(pdfDocument: PDFDocumentProxy | null, input: Omit<ScanOfferInput, 'verdict'>) {
  return useScanOffer({ ...input, verdict: useScanCheck(pdfDocument) });
}
