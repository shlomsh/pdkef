import NeedsUnlock from '#shell/NeedsUnlock.tsx';
import BasePdfTool from '#shell/BasePdfTool.tsx';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import ToolShell, { FileActions } from '#shell/ToolShell.tsx';
import CompressVerb from './verb/CompressVerb.tsx';
import styles from './PdfCompressTool.module.css';
import LevelPicker, { TargetSizePanel } from './components/LevelPicker.tsx';
import ResultSection from './components/ResultSection.tsx';
import ResultSheet from './components/ResultSheet.tsx';
import ResultNotes, { hasResultNotes } from './components/ResultNotes.tsx';
import StripSizes from './components/StripSizes.tsx';
import PhoneFinish from '#shell/pageWorkspace/PhoneFinish.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import layoutStyles from '#shell/loadedLayout.module.css';
import { compressHandoffTools } from './lib/handoffs.ts';
import { IMAGE_TARGET_SIZE_PRESETS_KB, useCompressTool, type PdfCompressToolProps } from './hooks/useCompressTool.ts';
import { analyticsStatus, compareCaption, needsPdfjs, needsUnlockMessages, showCompare, statusAttr } from './lib/islandView.ts';
import BatchWorkspace from './components/BatchWorkspace.tsx';
import IntakeNotes from './components/IntakeNotes.tsx';

export default withIslandBoundary(function PdfCompressTool(props: PdfCompressToolProps = {}) {
  const { shellMessages, emptyStateMessage, pickMany } = props;
  const {
    t, analyticsTool, compare, prepared, last, flow, batch, batchName, handleFilesAdded,
    actions: { warmBuild, handleLevelChange, handleFlattenChange, handleTargetKBChange, retry },
    file, level, targetKB, flatten, rejectedFiles, needsUnlockBytes, announcement, analysis,
    runCount, retryTap, fresh, meta, passthrough, unchanged, dimensions, rasterBytes, compressedSize,
    status, kind, isImageMode, targetSizePresets, hasFiles, isDone, view, finishShown, handoffs, detail, note, arrow, sizes,
  } = useCompressTool(props);

  const stripNoteNode = isImageMode ? undefined : <span data-compress-note>{note.kind === 'title' ? <strong>{note.text}</strong> : note.kind === 'text' ? note.text : null}</span>;
  const sizesExtra = sizes && <StripSizes t={t} arrow={arrow} {...sizes} />;
  const intakeNotes = (className?: string) => <IntakeNotes t={t} rejected={rejectedFiles} leftOutPdfs={batch.leftOutPdfs} className={className} />;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={handleFilesAdded}
      intake={{ multiple: false, pickMany, accept: 'application/pdf,image/jpeg,image/png', needsPdfjs: needsPdfjs(isImageMode, batch.active) }}
      identity={batch.active ? { file: batch.cover, label: batchName, metaExtra: sizesExtra, hidden: true } : { file, label: file?.name, metaExtra: sizesExtra, note: stripNoteNode, hidden: true }}
      empty={{ art: <CompressVerb subject={analyticsTool === 'compress-image' ? 'photo' : 'page'} />, message: emptyStateMessage ?? t.dropHint }}
      analytics={{ tool: analyticsTool, status: analyticsStatus(batch.active, batch.phase, status, flow.tap, retryTap) }}
      shellMessages={shellMessages}
    >
      {!batch.active && intakeNotes()}

      {needsUnlockBytes ? (
        <NeedsUnlock
          kind="needs-password"
          file={file}
          bytes={needsUnlockBytes}
          from="compress"
          toolName="Compress"
          verb="compress"
          messages={needsUnlockMessages(t)}
        />
      ) : batch.active ? (
        <BatchWorkspace t={t} batch={batch} compare={compare} flow={flow} notes={intakeNotes} name={batchName} targetKB={targetKB} presets={IMAGE_TARGET_SIZE_PRESETS_KB} onTargetKBChange={handleTargetKBChange} arrow={arrow} />
      ) : hasFiles && file ? (
        <div class={layoutStyles['finish-frame']}>
          {/* ARCH-41: the phone's sticky bar spans the whole loaded state (the frame), not one grid cell. */}
          {finishShown && (
            <div class={workspaceStyles['chip-bar']}>
              <PhoneFinish
                flow={flow}
                prepared={{ status: prepared.status, url: prepared.url, prepareNow: warmBuild }}
                fileName={meta?.filename ?? ''}
                detail={detail ?? ''}
                handoffs={handoffs}
                labels={{ download: t.downloadShort, ready: t.readyAnnouncement, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed }}
              />
            </div>
          )}
        <div
          data-fills-stage
          class={`${styles['loaded-layout']}${hasResultNotes({ view, isDone, passthrough }) ? ` ${styles['has-notes']}` : ''}`}
          data-compress-status={statusAttr(status, fresh)}
          data-compress-run={runCount}
        >
          {/* The shell's own strip, placed here rather than above the card so a
              desktop shows it in the rail beside the result (UX guidelines §18
              rule 3). Its content still comes from the props above. */}
          <div class={styles.strip} data-strip>
            <ToolShell flush>
              <FileActions />
            </ToolShell>
          </div>
          <ResultSection
            t={t}
            compare={compare}
            file={file}
            lastBlob={last?.blob ?? null}
            status={status}
            kind={kind}
            arrow={arrow}
            isDone={isDone}
            showCompare={showCompare(isDone, passthrough)}
            passthrough={passthrough}
            unchanged={unchanged}
            rasterBytes={rasterBytes}
            dimensions={dimensions}
            compressedSize={compressedSize}
            compareCaption={compareCaption(kind, analysis, t)}
            view={view}
          />
          <div class={styles.controls} data-controls>
            {isImageMode ? (
              <TargetSizePanel
                t={t}
                targetKB={targetKB}
                presets={targetSizePresets}
                onChange={handleTargetKBChange}
                inputId="image-target-size-input"
                min={5}
                step={5}
              />
            ) : (
              <LevelPicker
                value={level}
                onChange={handleLevelChange}
                t={t}
                targetKB={targetKB}
                onTargetKBChange={handleTargetKBChange}
                presets={targetSizePresets}
              />
            )}
            {view.showFlatten && (
              <label class={styles['flatten-switch']} data-flatten-switch>
                <input type="checkbox" checked={flatten} onChange={(e) => handleFlattenChange(e.currentTarget.checked)} />
                <span><strong>{t.flattenLabel}</strong> {analysis?.hasText !== false ? t.flattenHint : t.flattenHintNoText}</span>
              </label>
            )}
          </div>
          <ResultNotes view={view} isDone={isDone} passthrough={passthrough} />
          <ResultSheet
            t={t}
            flow={flow}
            prepared={prepared}
            fileName={meta?.filename ?? ''}
            detail={detail}
            handoffTools={compressHandoffTools(kind)}
            shown={finishShown}
            warmBuild={warmBuild}
            retry={retry}
          />
        </div>
        </div>
      ) : null}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
});
