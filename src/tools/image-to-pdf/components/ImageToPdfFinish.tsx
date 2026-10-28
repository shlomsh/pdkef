import { FileSignature, Shrink } from 'lucide-preact';
import DownloadElement from '#shell/DownloadElement.tsx';
import FinishRow from '#shell/pageWorkspace/FinishRow.tsx';
import PhoneFinish from '#shell/pageWorkspace/PhoneFinish.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import type { useDownloadFlow, HandoffTool } from '#shell/pageWorkspace/useDownloadFlow.ts';
import type { PreparedOutput } from '#lib/output/usePreparedOutput.ts';
import pdfToolStyles from '#shell/PdfTool.module.css';
import type { ImageToPdfMessages } from '../messages';
import styles from '../PdfImageToPdfTool.module.css';
import ScanLink from './ScanLink.tsx';

type Flow = ReturnType<typeof useDownloadFlow>;

interface FinishProps {
  t: ImageToPdfMessages;
  flow: Flow;
  prepared: Pick<PreparedOutput, 'status' | 'url' | 'prepareNow'>;
  fileName: string;
  /** "N pages · size", already formatted. */
  detail: string;
}

const handoffItems = (t: ImageToPdfMessages) => [
  { tool: 'compress' as HandoffTool, label: t.handoffCompress, Icon: Shrink },
  { tool: 'sign' as HandoffTool, label: t.handoffSign, Icon: FileSignature },
];

/** The phone's sticky bar: the quiet Download, then the done strip with the hand-offs. */
export function ImageToPdfPhoneBar({ t, flow, prepared, fileName, detail }: FinishProps) {
  return (
    <div class={workspaceStyles['chip-bar']}>
      <PhoneFinish
        flow={flow}
        prepared={prepared}
        fileName={fileName}
        detail={detail}
        handoffs={handoffItems(t)}
        labels={{ download: t.downloadShort, ready: t.readyAnnouncement, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed, nothing: t.allSkipped }}
      />
    </div>
  );
}

interface RailProps extends FinishProps {
  imageCount: number;
  onReadyTap: () => void;
  onEarlyTap: () => void;
  onShare: () => void;
  scanBusy: boolean;
  scanFailed: boolean;
  onScan: () => void;
}

/** The finish block: Download, Share and the hand-offs, then the quiet scan link. */
export function ImageToPdfFinish({ t, flow, prepared, fileName, detail, imageCount, onReadyTap, onEarlyTap, onShare, scanBusy, scanFailed, onScan }: RailProps) {
  const fresh = prepared.status === 'ready';
  return (
    <div class={styles.finish}>
      <DownloadElement
        state={flow.downloadState}
        href={fresh ? prepared.url : null}
        fileName={fileName}
        detail={detail}
        renderedCount={imageCount}
        totalCount={imageCount}
        pageCount={imageCount}
        progress={(prepared as PreparedOutput).progress}
        errorMessage={t.buildFailed}
        messages={t}
        onPreparingTap={onEarlyTap}
        onErrorTap={prepared.prepareNow}
        onWarm={prepared.prepareNow}
        onDownloadClick={onReadyTap}
      />
      <FinishRow
        ready={fresh}
        shareReady={flow.shareReady}
        onShare={onShare}
        busy={flow.handoffBusy}
        onHandoff={(tool) => { void flow.requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
        onWarm={prepared.prepareNow}
        labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign }}
      />
      {flow.handoffFailed && (
        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
      )}
      <ScanLink t={t} busy={scanBusy} failed={scanFailed} onScan={onScan} />
    </div>
  );
}
