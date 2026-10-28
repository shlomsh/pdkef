import type { Ref } from 'preact';
import styles from '../PdfCompressTool.module.css';
import pdfToolStyles from '#shell/PdfTool.module.css';
import PdfShareButton from '#shell/PdfShareButton.tsx';
import ProgressRing from '#shell/ProgressRing.tsx';
import DownloadButton from '#shell/DownloadButton.tsx';
import type { CompressMessages } from '../messages';
import { compressedFileName as deriveDownloadName } from '../lib/outputName.ts';
import { formatBytes } from '../lib/resultView.ts';

interface ResultSheetProps {
  t: CompressMessages;
  file: File;
  sheetRef: Ref<HTMLDivElement>;
  status: 'idle' | 'processing' | 'done' | 'error';
  hasSheet: boolean;
  tappedBusy: boolean;
  awaitingFirst: boolean;
  isDone: boolean;
  passthrough: boolean;
  downloadUrl: string | null;
  outputType: string;
  downloadDetail: string | undefined;
  progress: number;
  shareVisible: boolean;
  warmBuild: () => void;
  retry: () => void;
  onDownloadClick: (event: MouseEvent) => void;
  onShare: () => Promise<void>;
}

/** The action sheet: Try again, the compressing ring, or Download and Share, whichever the run is at. */
export default function ResultSheet(props: ResultSheetProps) {
  const { t, file, sheetRef, status, hasSheet, tappedBusy, awaitingFirst, isDone, passthrough, downloadUrl, outputType,
    downloadDetail, progress, shareVisible, warmBuild, retry, onDownloadClick, onShare } = props;
  return (
    <div
      ref={sheetRef}
      class={`${styles['result-action']}${hasSheet ? ` ${styles['result-sheet']}` : ''}`}
      data-result-action
      data-result-sheet={hasSheet || undefined}
      hidden={!hasSheet}
      onPointerEnter={warmBuild}
      onFocusIn={warmBuild}
      onPointerDown={warmBuild}
    >
      {status === 'error' ? (
        <button type="button" class={pdfToolStyles['tool-primary-action']} onClick={retry}>
          {t.tryAgain}
        </button>
      ) : tappedBusy ? (
        <button type="button" class={`${pdfToolStyles['tool-primary-action']} ${pdfToolStyles['is-processing']}`} data-processing disabled>
          <ProgressRing progress={progress} label={t.compressing} />
        </button>
      ) : isDone && !passthrough && downloadUrl ? (
        <>
          <DownloadButton
            autoFocus={false}
            href={downloadUrl}
            download={deriveDownloadName(file.name, outputType)}
            label={t.downloadLabel}
            detail={downloadDetail}
            onClick={onDownloadClick}
          />
          <PdfShareButton visible={shareVisible} onShare={onShare} label={t.shareLabel} />
        </>
      ) : awaitingFirst ? (
        // No result yet: the ready look with the size it already knows. A tap here waits for the build.
        <DownloadButton
          autoFocus={false}
          href="#"
          download={deriveDownloadName(file.name, file.type)}
          label={t.downloadLabel}
          detail={formatBytes(file.size)}
          onClick={onDownloadClick}
        />
      ) : null}
    </div>
  );
}
