import type { ComponentChildren, ComponentProps, ComponentType, RefObject } from 'preact';
import type { Dispatch } from 'preact/hooks';
import ToolShellBridge from '../../../shell/ToolShellBridge.tsx';
import PageWorkspace from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import type { PageGridProps } from '../../../shell/pageGrid/PageGrid.tsx';
import type { useDownloadFlow } from '../../../shell/pageWorkspace/useDownloadFlow.ts';
import type { ShellMessages } from '../../../shell/shellMessages';
import type { FileEntry, SortMode } from '../lib/mergeModel.ts';
import type { PreparedMerge } from '../hooks/usePreparedMerge.ts';
import type { MergeMessages } from '../messages';
import type { MergeAction, MergeState } from '../state/mergeState.ts';
import type { FailedFile } from '../lib/mergeView.ts';
import MergeChipBar from './MergeChipBar.tsx';
import MergePhoneControls, { type SortOption } from './MergePhoneControls.tsx';
import { MergeHeading, MergeHeaderStatus } from './MergeHeading.tsx';
import MergeRailContent from './MergeRailContent.tsx';
import MergeRailPinned from './MergeRailPinned.tsx';
import MergeNotices from './MergeNotices.tsx';

export interface MergeWorkspaceProps extends FailedFile {
  entries: FileEntry[];
  plan: PageGridProps['plan'];
  sortMode: SortMode;
  sortOptions: SortOption[];
  state: MergeState;
  dispatch: Dispatch<MergeAction>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPlanChange: PageGridProps['onPlanChange'];
  announce: (message: string) => void;
  PageGrid: ComponentType<PageGridProps> | null;
  workspaceReady: boolean;
  layoutRef: (el: HTMLDivElement | null) => void;
  documentRef: RefObject<HTMLDivElement>;
  chipListRef: RefObject<HTMLUListElement>;
  listRef: RefObject<HTMLUListElement>;
  stripRef: RefObject<HTMLUListElement>;
  grouped: boolean;
  rearranged: boolean;
  showSortControls: boolean;
  canReorderFiles: boolean;
  title: string;
  fileName: string;
  detail: string;
  outputCount: number;
  downloadFlow: ReturnType<typeof useDownloadFlow>;
  prepared: PreparedMerge;
  rating: ComponentChildren;
  lockedView: boolean;
  needsUnlock: ComponentProps<typeof MergeNotices>['needsUnlock'];
  probeSettled: boolean;
  otherError: boolean;
  unlockHref: string;
  draftStatusLabel: string | null;
  onRemove: (id: number) => void;
  onRowKeyDown: (event: KeyboardEvent, id: number) => void;
  onRowClick: (id: number) => void;
  onSortChange: (value: string) => void;
  onResetOrder: () => void;
  onStartAgain: () => void;
  onRename: (next: string) => void;
  onPageNumbersChange: (event: Event) => void;
  onRenderedCountChange: (count: number) => void;
  onFirstKeyboardFocus: () => void;
  onInstall: () => void;
  t: MergeMessages;
  sm: ShellMessages;
}

/** The loaded workspace: phone chrome, heading, the rail and the page grid. Presentational only. */
export default function MergeWorkspace(p: MergeWorkspaceProps) {
  const { state, entries, plan, t, sm, PageGrid } = p;
  const renderTotal = plan.length;
  return (
    <ToolShellBridge>
      {({ requestReplace, requestClear }) => (
        <PageWorkspace
          rootAttrs={{
            'data-merge-workspace-ready': p.workspaceReady ? '' : undefined,
            'data-merge-restored-workspace': state.isRestoredWorkspace || undefined,
          }}
          layoutRef={p.layoutRef}
          documentRef={p.documentRef}
          phoneBar={(
            <MergeChipBar
              entries={entries}
              chipListRef={p.chipListRef}
              onRemove={p.onRemove}
              downloadFlow={p.downloadFlow}
              prepared={p.prepared}
              fileName={p.fileName}
              detail={p.detail}
              t={t}
              rating={p.rating}
            />
          )}
          phoneControls={(
            <MergePhoneControls
              fileCount={entries.length}
              rearranged={p.rearranged}
              sortMode={p.sortMode}
              sortOptions={p.sortOptions}
              onSortChange={p.onSortChange}
              onResetOrder={p.onResetOrder}
              onAdd={requestReplace}
              onClear={requestClear}
              t={t}
              sm={sm}
            />
          )}
          /* Coarse pointer only (CSS-gated, PageWorkspace.module.css): the
             chip row and the page grid below both drag on press-and-hold
             (SortableJS's delayOnTouchOnly), with no grip icon standing in
             for the gesture the way the desktop rail's handle does, so
             nothing tells a phone that dragging works at all. Gated on
             having something worth reordering, same threshold as the
             desktop rail's own Sort control. */
          touchHint={(entries.length > 1 || p.outputCount > 1) && t.touchDragHint}
          heading={p.lockedView ? null : (
            <MergeHeading
              title={p.title}
              outputCount={p.outputCount}
              skippedCount={plan.length - p.outputCount}
              stillRendering={renderTotal > 0 && state.renderedCount < renderTotal}
              renderedCount={state.renderedCount}
              onRename={p.onRename}
              onRenamingChange={(renaming) => p.dispatch({ type: 'RENAMING_CHANGED', renaming })}
              t={t}
              sm={sm}
            />
          )}
          headerStatus={p.lockedView ? null : (
            <MergeHeaderStatus
              canUndo={p.canUndo}
              canRedo={p.canRedo}
              onUndo={p.onUndo}
              onRedo={p.onRedo}
              showPickedUp={state.showPickedUpSentence}
              showShortcuts={state.showShortcutsHint}
              isRestoredWorkspace={state.isRestoredWorkspace}
              onStartFresh={requestClear}
              t={t}
            />
          )}
          railContent={(
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
          )}
          railPinned={(
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
              renderTotal={renderTotal}
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
          )}
        >
          <MergeNotices
            needsUnlock={p.needsUnlock}
            probeSettled={p.probeSettled}
            failedEntry={p.failedEntry}
            failedReason={p.failedReason}
            otherError={p.otherError}
            unlockHref={p.unlockHref}
            onRemove={p.onRemove}
            t={t}
          />

          {!p.needsUnlock && PageGrid && plan.length > 0 && (
            <PageGrid
              sources={entries}
              plan={plan}
              onPlanChange={p.onPlanChange}
              announce={p.announce}
              messages={t}
              labelledBy="page-grid-heading"
              grouped={p.grouped}
              labelSources
              gridRef={p.stripRef}
              onRenderedCountChange={p.onRenderedCountChange}
              onFirstKeyboardFocus={p.onFirstKeyboardFocus}
            />
          )}
        </PageWorkspace>
      )}
    </ToolShellBridge>
  );
}
