import PhoneFinish from '#shell/pageWorkspace/PhoneFinish.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import type { useDownloadFlow } from '#shell/pageWorkspace/useDownloadFlow.ts';
import ToolShell, { FileActions } from '#shell/ToolShell.tsx';
import layoutStyles from '#shell/loadedLayout.module.css';
import type { useImageBatch } from '../hooks/useImageBatch.ts';
import { formatBytes } from '../lib/resultView.ts';
import type { CompressMessages } from '../messages';
import styles from '../PdfCompressTool.module.css';
import BatchList from './BatchList.tsx';
import { TargetSizePanel, type OnTargetChange } from './LevelPicker.tsx';
import ResultSheet from './ResultSheet.tsx';

interface BatchWorkspaceProps {
  t: CompressMessages;
  batch: ReturnType<typeof useImageBatch>;
  flow: ReturnType<typeof useDownloadFlow>;
  /** "12 photos": the set's name in the strip, the Download element and the phone bar. */
  name: string;
  targetKB: number;
  /** The single photo's presets. */
  presets: number[];
  /** The field's own state; the batch's target trails it while a typed value settles. */
  onTargetKBChange: (kb: number) => void;
  arrow: string;
}

/** COMP-04: the loaded state for several photos, on the single photo's grid: strip, target, rows, Download. */
export default function BatchWorkspace({ t, batch, flow, name, targetKB, presets, onTargetKBChange, arrow }: BatchWorkspaceProps) {
  const { prepared } = batch;
  const onTargetChange: OnTargetChange = (kb, options) => {
    onTargetKBChange(kb);
    batch.setTarget(kb, options);
  };
  const detail = prepared.parts ? formatBytes(prepared.parts.reduce((total, part) => total + part.blob.size, 0)) : undefined;
  return (
    <div class={layoutStyles['finish-frame']}>
      <div class={workspaceStyles['chip-bar']}>
        <PhoneFinish
          flow={flow}
          prepared={prepared}
          fileName={name}
          detail={detail ?? ''}
          handoffs={[]}
          labels={{ download: t.downloadShort, ready: t.readyAnnouncement, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed }}
        />
      </div>
      <div data-fills-stage class={`${styles['loaded-layout']} ${styles['batch-layout']}`} data-compress-status={batch.phase} data-compress-batch>
        <div class={styles.strip} data-strip>
          <ToolShell flush>
            <FileActions />
          </ToolShell>
        </div>
        <BatchList
          t={t}
          rows={batch.state.rows}
          summary={batch.summary}
          targetKB={batch.state.targetKB}
          arrow={arrow}
          urlFor={batch.urlFor}
          onRowSaved={flow.onPartSaved}
        />
        <div class={styles.controls} data-controls>
          <TargetSizePanel
            t={t}
            targetKB={targetKB}
            presets={presets}
            onChange={onTargetChange}
            inputId="image-target-size-input"
            min={5}
            step={5}
          />
        </div>
        <ResultSheet
          t={t}
          flow={flow}
          prepared={prepared}
          fileName={name}
          detail={detail}
          handoffTools={[]}
          shown
          warmBuild={prepared.prepareNow}
          retry={batch.retry}
        />
      </div>
    </div>
  );
}
