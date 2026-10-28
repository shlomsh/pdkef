import styles from '../PdfCompressTool.module.css';
import pdfToolStyles from '#shell/PdfTool.module.css';
import DownloadElement from '#shell/DownloadElement.tsx';
import FinishRow from '#shell/pageWorkspace/FinishRow.tsx';
import type { PreparedOutput } from '#lib/output/usePreparedOutput.ts';
import type { useDownloadFlow, HandoffTool } from '#shell/pageWorkspace/useDownloadFlow.ts';
import type { CompressMessages } from '../messages';

interface ResultSheetProps {
  t: CompressMessages;
  flow: ReturnType<typeof useDownloadFlow>;
  prepared: Pick<PreparedOutput, 'status' | 'url' | 'progress' | 'prepareNow'>;
  fileName: string;
  /** The compressed size, or the closest-achievable text. */
  detail: string | undefined;
  /** Which hand-offs follow Share; none for a photo. */
  handoffTools: HandoffTool[];
  /** Whether there is a result to deliver (hidden while idle and for a passthrough). */
  shown: boolean;
  warmBuild: () => void;
  retry: () => void;
}

/** The rail's finish block: Download (which is Try again after a failure), Share and the hand-offs, in flow. */
export default function ResultSheet({ t, flow, prepared, fileName, detail, handoffTools, shown, warmBuild, retry }: ResultSheetProps) {
  return (
    <div class={styles['result-action']} data-result-action data-result-sheet={shown || undefined} hidden={!shown}>
      {shown && (
        <>
        <DownloadElement
          state={flow.downloadState}
          href={prepared.status === 'ready' ? prepared.url : null}
          fileName={fileName}
          detail={detail}
          renderedCount={Math.round(prepared.progress * 100)}
          totalCount={100}
          progress={prepared.progress}
          errorMessage={t.tryAgain}
          messages={t}
          onPreparingTap={flow.onRowPreparingTap}
          onErrorTap={retry}
          onWarm={warmBuild}
          onDownloadClick={flow.onDownloadTap}
        />
        <FinishRow
          ready={prepared.status === 'ready'}
          shareReady={flow.shareReady}
          onShare={flow.handleShare}
          busy={flow.handoffBusy}
          onHandoff={handoffTools.length > 0 ? (tool) => { void flow.requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ } : undefined}
          onWarm={warmBuild}
          labels={{ share: t.shareLabel, sign: t.handoffSign, merge: t.handoffMerge }}
          tools={handoffTools}
        />
        {flow.handoffFailed && (
          <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
        )}
        </>
      )}
    </div>
  );
}
