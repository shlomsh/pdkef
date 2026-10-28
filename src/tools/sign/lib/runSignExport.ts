import type { EditorElement } from '../../../editor/model/editorModel.ts';
import type { SignMessages } from '../../../editor/registry/messages';
import { recordAction } from '../../../lib/telemetry/actionTrail.ts';
import { isEncryptedPdfError } from '../../../lib/pdf/encryptedPdfError.ts';
import { reportError } from '../../../lib/telemetry/errorReport.ts';
import { formatMessage } from '../../../lib/text/formatMessage';
import {
  beaconMaintenanceTransport,
  reportMaintenanceEvent,
  signExportFailed,
  signExportSucceeded,
} from '../../../lib/telemetry/maintenanceTelemetry.ts';
import { reportToolLifecycleEvent } from '../../../lib/telemetry/productAnalytics.ts';
import type { LatestRun } from '../../../lib/hooks/useLatestRun.ts';
import { describeUnrepresentableText } from '../components/textMessages.ts';
import type { SignLifecycleAction } from '../state/signState.ts';
import { signedFileName } from './signedFileName.ts';

// Recoverable export failures keep the editor open. Name unsupported text
// precisely; other failures explain that the user can retry without losing
// their edits. Document-load errors use the workspace's separate default copy.
/** @testSeam */
export function describeSignFailure(err: unknown, t: SignMessages): string {
  if (err instanceof Error && err.name === 'UnrepresentableTextError') {
    // Worded by src/tools/sign/components/textMessages.ts, the same UI message module the
    // while-typing warning
    // reads from, so the heads-up and the refusal can never name different
    // characters or point at different pages.
    const coverageError = err as Error & { characters: string[]; pageNumbers?: number[] };
    return describeUnrepresentableText(coverageError.characters, coverageError.pageNumbers ?? [], { saving: true }, t);
  }
  if (err instanceof Error && err.name === 'FontUnavailableError') {
    const family = (err as Error & { family?: string }).family;
    return family && family !== 'Arimo'
      ? formatMessage(t.fontNotReadyTemplate, { family })
      : t.defaultFontUnavailable;
  }
  return t.exportGenericFailure;
}

/** @testSeam */
export interface RunSignExportDeps {
  /** The picked file; its name makes the signed copy's name. */
  file: File;
  /** DEBT-51: the bytes read at load time, so a file moved on disk after picking cannot fail the export. */
  fileBytes: ArrayBuffer | null;
  elements: EditorElement[];
  exportRun: LatestRun;
  /** Whether the export `exportRun` tracks is a background speculative one (see useExportRun). */
  activeExportSpeculativeRef: { current: boolean };
  lifecycleDispatch: (action: SignLifecycleAction) => void;
  messages: SignMessages;
}

/**
 * Signs the PDF and hands the result to `onSigned`, which decides what to do
 * with it (share vs. plain download). Status/progress/error handling lives here
 * once so the export actions can't drift on how a failure recovers.
 *
 * `speculative` (MOBI-07) drives a background pre-generation run: it must
 * never surface as the "signing" UI, never emit signExportSucceeded/
 * signExportFailed maintenance telemetry (SIGN-13's export-duration signal
 * is a real-export-only measurement), and a failure stays silent since the
 * user never asked for this run - they'll get the honest error if they
 * later tap an export button themselves.
 */
export async function runSignExport(
  deps: RunSignExportDeps,
  onSigned: (signedBlob: Blob, filename: string) => void,
  { speculative = false }: { speculative?: boolean } = {},
): Promise<void> {
  const { file, elements, exportRun, activeExportSpeculativeRef, lifecycleDispatch, messages: t } = deps;
  const sourceBytes = deps.fileBytes ?? file;
  const ticket = exportRun.begin();
  activeExportSpeculativeRef.current = speculative;
  if (!speculative) {
    lifecycleDispatch({ type: 'EXPORT_STARTED', announcement: t.writingSignaturesIntoPdf });
    reportToolLifecycleEvent('tool_operation_started', 'sign');
    recordAction('export');
  }
  const exportStartedAt = performance.now();
  // beaconMaintenanceTransport sends only in production builds (the gate is in sendBeacon).
  const telemetryTransport = beaconMaintenanceTransport;

  try {
    const { signPdf } = await import('./sign.js');
    const signedBlob = await signPdf(sourceBytes, elements, (p: number) => {
      if (!speculative && ticket.isCurrent()) lifecycleDispatch({ type: 'EXPORT_PROGRESSED', progress: p });
    });
    if (!ticket.isCurrent()) return;
    ticket.settle();
    if (!speculative) {
      reportMaintenanceEvent(signExportSucceeded(performance.now() - exportStartedAt), telemetryTransport);
      reportToolLifecycleEvent('tool_result_ready', 'sign');
    }
    onSigned(signedBlob, signedFileName(file.name));
  } catch (err) {
    if (!ticket.isCurrent()) return;
    ticket.settle();
    if (speculative) {
      console.error(err);
      return;
    }
    reportError('sign_export', err, 'export');
    reportMaintenanceEvent(signExportFailed(performance.now() - exportStartedAt, err), telemetryTransport);
    reportToolLifecycleEvent('tool_operation_failed', 'sign');
    console.error(err);
    // ENC-07: the load gate should have caught a protected file, so this is reported above (a gate
    // miss), but the person gets the way on rather than a retry that can never work.
    if (isEncryptedPdfError(err)) {
      lifecycleDispatch({ type: 'EXPORT_NEEDS_UNLOCK', announcement: t.protectedOwnerOnlyTitle });
      return;
    }
    const detail = describeSignFailure(err, t);
    lifecycleDispatch({ type: 'EXPORT_FAILED', detail, announcement: `${t.signingStoppedLabel} ${detail}` });
  }
}
