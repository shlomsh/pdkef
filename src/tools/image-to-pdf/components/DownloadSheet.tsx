import { ScanLine } from 'lucide-preact';
import PdfShareButton from '#shell/PdfShareButton.tsx';
import ProgressRing from '#shell/ProgressRing.tsx';
import ErrorMessage from '#shell/ErrorMessage.tsx';
import DownloadButton from '#shell/DownloadButton.tsx';
import pdfToolStyles from '#shell/PdfTool.module.css';
import type { ImageToPdfMessages } from '../messages';
import styles from '../PdfImageToPdfTool.module.css';

interface DownloadSheetProps {
  t: ImageToPdfMessages;
  failed: boolean;
  fresh: boolean;
  downloadUrl: string | null | undefined;
  fileName: string;
  detail: string | undefined;
  progress: number;
  busy: boolean;
  shareVisible: boolean;
  scanBusy: boolean;
  scanFailed: boolean;
  onPrepare: () => void;
  onDownloadClick: (event: MouseEvent) => void;
  onShare: () => void;
  onScan: () => void;
}

export default function DownloadSheet(props: DownloadSheetProps) {
  const { t, failed, fresh, downloadUrl, fileName, detail, progress, busy, shareVisible, scanBusy, scanFailed } = props;
  return (
    <div
      class={styles.sheet}
      onPointerEnter={props.onPrepare}
      onFocusIn={props.onPrepare}
      onPointerDown={props.onPrepare}
    >
      {failed ? (
        <>
          <ErrorMessage>{t.buildFailed}</ErrorMessage>
          <button type="button" class={pdfToolStyles['tool-primary-action']} onClick={props.onPrepare}>
            {t.tryAgain}
          </button>
        </>
      ) : (
        <>
          {/* Silent until a tap: while a change waits for quiet the sheet keeps its shape, with the
              last size shown and Share still there (inert until the new PDF lands). */}
          <DownloadButton
            autoFocus={false}
            href={fresh && downloadUrl ? downloadUrl : '#'}
            download={fileName}
            label={t.downloadLabel}
            detail={detail}
            onClick={props.onDownloadClick}
            busy={busy ? <ProgressRing progress={progress} label={t.preparing} /> : undefined}
          />
          <PdfShareButton visible={shareVisible} onShare={props.onShare} label={t.shareLabel} />
        </>
      )}
      <button type="button" class={styles['scan-button']} disabled={scanBusy} onClick={props.onScan}>
        <ScanLine size={16} aria-hidden="true" />
        {t.scanHandoff}
      </button>
      {scanFailed && <p class={pdfToolStyles['hint-message']} role="status">{t.scanHandoffFailed}</p>}
    </div>
  );
}
