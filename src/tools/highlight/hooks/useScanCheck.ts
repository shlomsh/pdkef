import { useEffect, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { beaconMaintenanceTransport, highlightScanCheck, reportMaintenanceEvent } from '#lib/telemetry/maintenanceTelemetry.ts';
import { isAbortError } from '#lib/output/abort.js';
import type { ScanVerdict } from '../lib/enhance/scanCheck.ts';

/** Where the browser has no idle callback, the first page gets this long to paint before the check starts. */
const PAINT_DELAY_MS = 1000;
/** The longest a busy page may keep the check waiting for an idle moment. */
const IDLE_TIMEOUT_MS = 3000;

/** Runs `task` once the page has had time to paint; the returned function cancels it. */
function afterPaint(task: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(task, PAINT_DELAY_MS);
  return () => clearTimeout(timer);
}

/**
 * Whether the opened file is a crooked scan (PE-06), for what PE-07 offers. Checked silently after the first page
 * has painted and never waited on by the open; null until it is known, and for good if the check fails. The
 * verdict is reported once per document, as itself and nothing else.
 */
export function useScanCheck(pdfDocument: PDFDocumentProxy | null): ScanVerdict | null {
  const [verdict, setVerdict] = useState<ScanVerdict | null>(null);

  useEffect(() => {
    setVerdict(null);
    if (!pdfDocument) return;
    let live = true;
    const controller = new AbortController();
    const check = async () => {
      const { readScan } = await import('../lib/enhance/readScan.ts');
      const result = await readScan(pdfDocument, () => live, controller.signal);
      if (!live || !result) return;
      setVerdict(result);
      reportMaintenanceEvent(highlightScanCheck(result), beaconMaintenanceTransport);
    };
    const cancel = afterPaint(() => {
      check().catch((err) => { if (live && !isAbortError(err)) reportError('pdf_tool_run', err, 'scan_check'); });
    });
    return () => { live = false; controller.abort(); cancel(); };
  }, [pdfDocument]);

  return verdict;
}
