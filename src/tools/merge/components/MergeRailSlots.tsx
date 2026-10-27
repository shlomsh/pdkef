import type { MergeWorkspaceProps } from './MergeWorkspace.tsx';
import MergeRailContent from './MergeRailContent.tsx';
import MergeRailPinned from './MergeRailPinned.tsx';

interface SlotProps {
  p: MergeWorkspaceProps;
  requestReplace: () => void;
}

/** The desktop rail's file list, wired from the workspace props. Presentational only. */
export function MergeRailContentSlot({ p, requestReplace, requestClear }: SlotProps & { requestClear: () => void }) {
  const { state, entries, t, sm } = p;
  return (
    <MergeRailContent
      entries={entries}
      listRef={p.listRef}
      canReorderFiles={p.canReorderFiles}
      rearranged={p.rearranged}
      showSortControls={p.showSortControls}
      sortMode={p.sortMode}
      sortOptions={p.sortOptions}
      draftStatusLabel={p.draftStatusLabel}
      showDraftRetentionHint={state.draftSaveState !== 'error' && state.draftSaveState !== 'conflict'}
      showPickedUpSentence={state.showPickedUpSentence}
      isRestoredWorkspace={state.isRestoredWorkspace}
      onRemove={p.onRemove}
      onRowKeyDown={p.onRowKeyDown}
      onRowClick={p.onRowClick}
      onSortChange={p.onSortChange}
      onResetOrder={p.onResetOrder}
      onAdd={requestReplace}
      onClear={requestClear}
      t={t}
      sm={sm}
    />
  );
}

/** The desktop rail's pinned footer (options and download), wired from the workspace props. */
export function MergeRailPinnedSlot({ p, requestReplace }: SlotProps) {
  const { state, entries, t, sm } = p;
  return (
    <MergeRailPinned
      fileCount={entries.length}
      addPageNumbers={state.addPageNumbers}
      onPageNumbersChange={p.onPageNumbersChange}
      lockedView={p.lockedView}
      downloadFlow={p.downloadFlow}
      prepared={p.prepared}
      fileName={p.fileName}
      detail={p.detail}
      renderedCount={state.renderedCount}
      renderTotal={p.plan.length}
      outputCount={p.outputCount}
      hasFailedEntry={!!p.failedEntry}
      isOutputNameBeingRenamed={state.isRenamingOutputName}
      onChooseFiles={requestReplace}
      onStartAgain={p.onStartAgain}
      showInstallLine={state.showInstallLine}
      installPrompt={state.installPrompt}
      onIos={state.onIos}
      onInstall={p.onInstall}
      t={t}
      sm={sm}
    />
  );
}
