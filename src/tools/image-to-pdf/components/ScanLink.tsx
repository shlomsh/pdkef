import pdfToolStyles from '#shell/PdfTool.module.css';
import type { ImageToPdfMessages } from '../messages';
import styles from '../PdfImageToPdfTool.module.css';

interface ScanLinkProps {
  t: ImageToPdfMessages;
  busy: boolean;
  failed: boolean;
  onScan: () => void;
}

/** The images themselves go to Scan to PDF: a quiet text link under the hand-offs, with its failure line. */
export default function ScanLink({ t, busy, failed, onScan }: ScanLinkProps) {
  return (
    <>
      <button type="button" class={styles['scan-link']} disabled={busy} onClick={onScan}>
        {t.scanHandoff}
      </button>
      {failed && <p class={pdfToolStyles['hint-message']} role="status">{t.scanHandoffFailed}</p>}
    </>
  );
}
