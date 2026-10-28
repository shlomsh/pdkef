import type { ComponentChildren } from 'preact';
import ExportHandoffs, { type ExportHandoffItem } from '../ExportHandoffs.tsx';
import type { PreparedOutput } from '../../lib/output/usePreparedOutput.ts';
import DoneStrip from '../DoneStrip.tsx';
import FileName from '../FileName.tsx';
import pdfToolStyles from '../PdfTool.module.css';
import QuietDownload from './QuietDownload.tsx';
import type { HandoffTool, useDownloadFlow } from './useDownloadFlow.ts';
import styles from './PageWorkspace.module.css';

interface PhoneFinishProps {
  flow: ReturnType<typeof useDownloadFlow>;
  prepared: Pick<PreparedOutput, 'status' | 'url' | 'prepareNow'>;
  fileName: string;
  /** The result line under the name: "N pages · size". */
  detail: string;
  handoffs: ExportHandoffItem[];
  labels: { download: string; ready: string; closeStrip: string; handoffFailed: string; /** Why Download cannot run when every page is skipped; absent, no note. */ nothing?: string };
  /** Attributes for the done strip (a tool's test and e2e hook). */
  stripAttrs?: Record<string, string | boolean>;
  /** Under the hand-offs, inside the strip (Merge's rating prompt). */
  children?: ComponentChildren;
}

/**
 * The phone bar's finish block, at the bar's inline end: the quiet Download,
 * and once it has delivered the done strip with the result, the hand-offs to
 * the next tool and the hand-off failure line. A tool's chips stay its own.
 */
const NOTE_ID = 'quiet-download-note';

export default function PhoneFinish({ flow, prepared, fileName, detail, handoffs, labels, stripAttrs, children }: PhoneFinishProps) {
  const note = flow.downloadState === 'nothing' ? labels.nothing : undefined;
  return (
    <>
      <QuietDownload
        state={flow.downloadState}
        linkReady={flow.downloadLinkReady}
        href={prepared.url}
        fileName={fileName}
        label={labels.download}
        onDownloadTap={flow.onQuietDownloadTap}
        onPreparingTap={flow.onQuietPreparingTap}
        onWarm={prepared.prepareNow}
        describedBy={note ? NOTE_ID : undefined}
      />
      {note && <p id={NOTE_ID} class={styles['chip-note']} data-quiet-note>{note}</p>}
      {flow.showStrip && (
        <DoneStrip
          {...stripAttrs}
          label={labels.ready}
          closeLabel={labels.closeStrip}
          onClose={flow.closeStrip}
          className={styles['done-strip']}
        >
          <p class={styles['done-strip-result']}>
            <FileName name={fileName} className={styles['done-strip-name']} />
            <span class={styles['done-strip-detail']}>{detail}</span>
          </p>
          <ExportHandoffs
            items={handoffs}
            busy={flow.handoffBusy || prepared.status !== 'ready'}
            onHandoff={(tool) => { void flow.requestHandoff(tool as HandoffTool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
          />
          {flow.handoffFailed && (
            <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{labels.handoffFailed}</p>
          )}
          {children}
        </DoneStrip>
      )}
    </>
  );
}
