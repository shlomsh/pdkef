import type { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { hasPdfHeader } from './pdfHeader.ts';

type Protection = Awaited<ReturnType<typeof probeEncryption>>;

/** What a picked PDF does once the encryption probe has answered: leave the tool, wait for a password, or run. */
type IntakeDecision = 'skip' | 'needs-password' | 'run';

/**
 * Neither reader can open a file with no `%PDF-` in it, so a run could only fail: skip it like any
 * other non-PDF. A file WITH a header that pdf.js rejects carries on and reports, because a valid
 * file the library cannot read looks like a broken one.
 */
export function decideAfterProbe(protection: Protection, bytes: Uint8Array): IntakeDecision {
  if (protection === 'unreadable' && !hasPdfHeader(bytes)) return 'skip';
  return protection === 'needs-password' ? 'needs-password' : 'run';
}
