import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import type { ComponentChild, ComponentChildren } from 'preact';
import styles from './Dropzone.module.css';
import pdfToolStyles from './PdfTool.module.css';
import dialogStyles from './Dialog.module.css';
import ConfirmDialog from './ConfirmDialog.tsx';
import DropzoneEmptyState from './DropzoneEmptyState.tsx';
import ToolShell, { FileActions, ToolShellContext } from './ToolShell.tsx';
import { unsupportedBrowser, type UnsupportedBrowser } from '../lib/browserSupport.ts';
import { installUncaughtErrorReporting } from '../lib/errorReport.ts';
import { reportToolLifecycleEvent, type AnalyticsTool } from '../lib/productAnalytics.ts';
import { markArrival } from '../lib/fileArrival.ts';
import type { FileSource } from '../lib/usageEventSchema.ts';
import { useWindowFileDrop, leftWindow } from './useWindowFileDrop.ts';
import { acceptsFile } from './acceptsFile.ts';
import { isFileDrag, nextDragDepth } from './fileDragDepth.ts';
import { dropHasDirectory, filesFromDataTransfer, filesFromPaste } from './dropFiles.js';
import { englishShellMessages, formatMessage, type ShellMessages } from '../i18n/toolMessages';

/* Splits a formatted sentence on the \u0000key\u0000 markers left in place of
   the file names and renders those names as marked spans, so a localized
   template can put them anywhere in the sentence while they keep the
   .confirm-file styling. */
function renderTemplate(text: string, values: Record<string, string>, className: string) {
  return text.split('\u0000').map((part, index) =>
    index % 2 === 1 ? <span key={index} class={className}>{values[part] ?? ''}</span> : part,
  );
}

// Loosely typed on purpose (see TODO.md "Type the interactive shell"): the
// per-tool callbacks below carry domain shapes (elements, actions) that
// aren't modeled yet, so they stay `any` rather than inventing types nothing
// else uses.
interface BasePdfToolProps {
  hasFiles: boolean;
  onFilesAdded: (files: File[]) => void;
  children?: ComponentChildren;
  multiple?: boolean;
  accept?: string;
  emptyStateMessage?: string;
  fileLabel?: string;
  fileMeta?: string;
  /** Optional tool content after the file meta, and a note under it (the shell strip's slots). */
  fileMetaExtra?: ComponentChildren;
  fileNote?: ComponentChildren;
  /** The loaded file itself, for a single-file tool that already holds it in
   * its own state (see PdfCompressTool.tsx for the shape - `fileLabel`/
   * `fileMeta` derived alongside it). Passed straight through to the shell
   * context so ToolShell can show a real thumbnail (FilePreview.tsx) instead
   * of the generic glyph. Optional: a tool that doesn't pass it, or a
   * `multiple` tool (dropped below regardless - Merge has its own
   * thumbnails), gets today's icon unchanged. */
  file?: File | null;
  draftSaveState?: 'idle' | 'pending' | 'saved' | 'error' | 'conflict' | 'unpersisted';
  onClearAll?: () => void;
  clearSummary?: string;
  ownsShell?: boolean;
  checkingDraft?: boolean;
  /** Optional anonymous lifecycle reporting for this tool. */
  analyticsTool?: AnalyticsTool;
  analyticsStatus?: string;
  /** The shell's own strings (dropzone, file actions, confirmations) for a
   * localized page; every key not given keeps its English default. */
  shellMessages?: Partial<ShellMessages>;
  /** MOBI-09: opt-in per tool page (currently the Sign tool only - see its
   * ticket for why the Files-app notice is scoped there rather than shown
   * shell-wide). Forwarded to DropzoneEmptyState, which still gates the
   * actual notice on a mount-effect iOS check; this only says the tool is
   * allowed to show it. */
  showIosFilesHint?: boolean;
  showCloudDriveHint?: boolean;
  /** The tool's verb, drawn in the empty-state sheet in place of the file-plus icon. */
  emptyArt?: ComponentChild;
  /** The sheet's heading and the line under it (default: the shell's drop
   * message and privacy line). */
  emptyHeading?: string;
  emptyBody?: string;
  /** Direction A (Merge): a tool whose loaded state replaces the identity
   * row and file actions with its own add bar (AddBar.tsx) sets this so
   * BasePdfTool never mounts <ToolShell><FileActions/></ToolShell> on top
   * of it. Every other tool leaves this false and is unaffected. */
  hideIdentity?: boolean;
  /** A file dropped anywhere on the window is taken (default on), and the card
   * carries `data-dragging` while one is over it. With a single file open, a
   * drop still goes through the replace confirmation. */
  dropAnywhere?: boolean;
}

/**
 * The shell every tool is built on: the empty-state dropzone, the loaded-state
 * identity + control row, the file input behind both, and the confirmation any
 * destructive file action goes through.
 *
 * It owns all of that on purpose. Nine tools each deciding for themselves what
 * "start over" meant is what produced two class names, two labels and two
 * behaviours for one action, plus three hand-copied confirmation dialogs and
 * three tools out of nine that quietly threw the user's work away. What differs
 * between tools is declared here as configuration - one file or many, what work
 * a replacement would cost - not re-implemented per tool.
 */
export default function BasePdfTool({
  hasFiles,
  onFilesAdded,
  children,
  multiple = true,
  accept = 'application/pdf',
  emptyStateMessage,
  fileLabel,
  fileMeta,
  fileMetaExtra,
  fileNote,
  file = null,
  draftSaveState = 'idle',
  /* List tools only. Its presence is what puts a Clear all beside Add files:
     for a list those are two genuinely different intents, not the drift this
     shell exists to remove. */
  onClearAll,
  clearSummary,
  /* Sign and Redact mount <ToolShell> themselves, inside the element that goes
     full screen - a toolbar rendered out here would disappear the moment full
     screen started. They still take every other decision from this component
     through the context below. */
  ownsShell = false,
  /* True while a tool with draft persistence is still checking IndexedDB for a
     saved draft on mount (see useDraftPersistence.js's `isRestoring`). Renders
     a brief neutral placeholder instead of the "drop a file here" empty state,
     so a returning visitor with a draft never sees an invitation to add a file
     for the split second before their file loads over it. Tools without draft
     persistence never set this, so their empty state is unaffected. */
  checkingDraft = false,
  analyticsTool,
  analyticsStatus,
  shellMessages,
  showIosFilesHint = false,
  showCloudDriveHint = false,
  emptyArt,
  emptyHeading,
  emptyBody,
  hideIdentity = false,
  dropAnywhere = true,
}: BasePdfToolProps) {
  const sm: ShellMessages = { ...englishShellMessages, ...shellMessages };
  const [isDraggingOverWorkspace, setIsDraggingOverWorkspace] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [confirmPickerOpen, setConfirmPickerOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  // Set when the user has already agreed to a replacement and the picker is
  // being opened on the strength of that agreement, so the file coming back is
  // not put through the gate a second time.
  const agreedRef = useRef(false);
  const previouslyHadFilesRef = useRef(false);
  const previousFileRef = useRef<File | null>(null);
  const previousAnalyticsStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    installUncaughtErrorReporting();
  }, []);

  // Null on the server and on the first client render (no navigator to read),
  // so hydration matches. It is only shown once a file is added: an old
  // browser can still read the page, it is the PDF library that cannot run.
  const [oldBrowser, setOldBrowser] = useState<UnsupportedBrowser | null>(null);
  useEffect(() => {
    setOldBrowser(unsupportedBrowser(typeof navigator === 'undefined' ? undefined : navigator));
  }, []);

  // This is intentionally based on a tool's coarse public state, never its
  // file, options, error object, or local draft. See ANALYTICS.md.
  useEffect(() => {
    if (analyticsTool) reportToolLifecycleEvent('tool_page_viewed', analyticsTool);
  }, [analyticsTool]);

  useEffect(() => {
    if (!analyticsTool) return;
    // A replacement keeps hasFiles true, so a single-file tool's new `file` is the signal.
    const replaced = hasFiles && previouslyHadFilesRef.current && !multiple
      && file !== null && previousFileRef.current !== null && file !== previousFileRef.current;
    if ((hasFiles && !previouslyHadFilesRef.current) || replaced) {
      reportToolLifecycleEvent('tool_file_accepted', analyticsTool);
    }
    previouslyHadFilesRef.current = hasFiles;
    previousFileRef.current = file;
  }, [analyticsTool, hasFiles, file, multiple]);

  useEffect(() => {
    if (!analyticsTool || !analyticsStatus) return;
    if (analyticsStatus === previousAnalyticsStatusRef.current) return;
    previousAnalyticsStatusRef.current = analyticsStatus;

    if (['processing', 'merging', 'converting'].includes(analyticsStatus)) {
      reportToolLifecycleEvent('tool_operation_started', analyticsTool);
    } else if (analyticsStatus === 'done') {
      reportToolLifecycleEvent('tool_result_ready', analyticsTool);
    } else if (analyticsStatus === 'error') {
      reportToolLifecycleEvent('tool_operation_failed', analyticsTool);
    }
  }, [analyticsStatus, analyticsTool]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !hasFiles && fileInputRef.current) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('action') === 'open') {
        url.searchParams.delete('action');
        window.history.replaceState({}, '', url.toString());
        // Attempt to auto-open the file dialog. Some browsers may block this without a direct user gesture.
        fileInputRef.current.click();
      }
    }
    // checkingDraft is a dep, not just hasFiles: while it's true the empty-state
    // dropzone (and its input ref) hasn't mounted yet, so this has to re-run once
    // checking settles and the real ref becomes available - hasFiles alone never
    // changes across that transition.
  }, [hasFiles, checkingDraft]);

  // MEM-03: replacing a single loaded file always asks now, whether or not
  // there is work on it to lose - the dialog no longer protects work, it
  // just catches an unintended click and says the file isn't gone, only
  // closed (see replaceOpening/replaceChoosing below). Adding to a list
  // still costs nothing: `!multiple` is the only gate left.
  const costsSomething = hasFiles && !multiple;

  // A dropped file arrives already chosen, so this is the earliest the user can
  // be asked - and because the file is in hand, the question can name it.
  // Says how the files got here, right before the tool is handed them. A second file in a
  // single-file tool is a replacement whatever the gesture was.
  const handOn = useCallback((files: File[], source: FileSource) => {
    markArrival(hasFiles && !multiple ? 'replace' : source);
    onFilesAdded(files);
  }, [hasFiles, multiple, onFilesAdded]);

  const receiveFiles = useCallback((fileList: FileList | File[] | null | undefined, source: FileSource = 'pick') => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    // Already agreed to, one step ago, in order to get the picker open at all.
    if (agreedRef.current) {
      agreedRef.current = false;
      handOn(incoming, source);
      return;
    }
    if (!costsSomething) {
      handOn(incoming, source);
      return;
    }
    // A picker only offers what `accept` allows; a drop or paste can carry
    // anything. Ask about the files the tool would take. When there are none,
    // skip the question and let the tool say it can't open them, as it does
    // for any rejected file - a dialog that ends in "no" is noise.
    // A file with no type is never ruled out: a real PDF from some sources has
    // none, and only the question stands between it and the open document.
    const acceptable = incoming.filter((file) => !file.type || acceptsFile(file, accept));
    if (acceptable.length === 0) {
      handOn(incoming, source);
      return;
    }
    setPendingFiles(acceptable);
  }, [costsSomething, handOn, accept]);

  const onInputChange = (event: Event) => {
    // Copy the FileList out before clearing the input. `value = ''` resets the
    // selection, and `files` is a live list, so it empties underneath you - in
    // a real browser only. jsdom's stubbed `files` survives it, so this reads
    // as working in unit tests and does nothing at all in the built app.
    const target = event.currentTarget as HTMLInputElement;
    const files = Array.from(target.files || []);
    target.value = '';
    receiveFiles(files, 'pick');
  };

  // Once a file is loaded, the small dropzone is gone, so the whole tool
  // area becomes the drop target instead (with an overlay while dragging).
  const onWorkspaceDragEnter = (event: DragEvent) => {
    if (!hasFiles || !isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current = nextDragDepth(dragDepthRef.current, 'enter');
    setIsDraggingOverWorkspace(true);
  };

  const onWorkspaceDragOver = (event: DragEvent) => {
    if (!hasFiles || !isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
  };

  const onWorkspaceDragLeave = (event: DragEvent) => {
    if (!hasFiles || !isFileDrag(event.dataTransfer)) return;
    // Leaving the window resets: an enter whose node was removed mid-drag
    // would otherwise leave the overlay stuck on.
    dragDepthRef.current = nextDragDepth(
      dragDepthRef.current,
      leftWindow(event, window.innerWidth, window.innerHeight) ? 'reset' : 'leave',
    );
    if (dragDepthRef.current === 0) setIsDraggingOverWorkspace(false);
  };

  // MERGE-10: a dropped folder arrives as one directory entry and no files;
  // walking it is async, so only that case leaves the synchronous path.
  const receiveDrop = (dataTransfer: DataTransfer | null | undefined) => {
    if (dropHasDirectory(dataTransfer)) {
      void filesFromDataTransfer(dataTransfer).then((files) => receiveFiles(files, 'drop'));
      return;
    }
    receiveFiles(dataTransfer?.files, 'drop');
  };

  const onWorkspaceDrop = (event: DragEvent) => {
    if (!hasFiles || !isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current = nextDragDepth(dragDepthRef.current, 'drop');
    setIsDraggingOverWorkspace(false);
    receiveDrop(event.dataTransfer);
  };

  // A drop on the window that no element handler took (the hook skips
  // defaultPrevented drops, so the sheet and the workspace never run twice).
  const windowDragging = useWindowFileDrop({ enabled: dropAnywhere && !checkingDraft, onDrop: receiveDrop });

  // MERGE-10: Cmd/Ctrl+V with files on the clipboard adds them, in every tool,
  // through the same gate a drop goes through. Text pastes are left alone.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = filesFromPaste(event);
      if (files.length === 0) return;
      event.preventDefault();
      receiveFiles(files, 'paste');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [receiveFiles]);

  const openPicker = () => fileInputRef.current?.click();

  // Pressing Replace asks BEFORE opening the picker. Asking afterwards let the
  // question name the incoming file, but it made the user walk through the OS
  // picker to find out that the swap was going to cost them their work - the
  // warning arrived after the only step they might have wanted to skip.
  const requestReplace = useCallback(() => {
    agreedRef.current = false;
    if (costsSomething) setConfirmPickerOpen(true);
    else openPicker();
  }, [costsSomething]);

  const requestClear = useCallback(() => setConfirmClearOpen(true), []);
  const cancelClear = useCallback(() => setConfirmClearOpen(false), []);
  const cancelReplace = useCallback(() => {
    setPendingFiles(null);
    setConfirmPickerOpen(false);
  }, []);

  const confirmReplace = () => {
    if (pendingFiles) {
      const files = pendingFiles;
      setPendingFiles(null);
      handOn(files, 'pick');
      return;
    }
    setConfirmPickerOpen(false);
    agreedRef.current = true;
    openPicker();
  };

  const confirmClear = () => {
    setConfirmClearOpen(false);
    onClearAll?.();
  };

  // A thumbnail is only ever the right call for a single loaded file - Merge
  // and any other `multiple` tool has its own list of thumbnails, so `file`
  // is dropped here regardless of what a tool passes in, rather than trusting
  // every call site to gate it itself.
  const shell = { fileLabel, fileMeta, metaExtra: fileMetaExtra, note: fileNote, file: multiple ? null : file, draftSaveState, multiple, requestReplace, requestClear, messages: sm };

  return (
    <ToolShellContext.Provider value={shell}>
    <div
      class={pdfToolStyles['tool-card']}
      /* Direction A reduction: the "has a file" signal for a tool that hides
         ToolShell (`hideIdentity`), so the page-level `:has()` gate in
         ToolPageLayout.astro (the two-column grid applies only while neither
         `[data-tool-loaded]` nor `[data-tool-shell]` is present) still has
         something to key off. Every other tool already has this in
         `[data-tool-shell]`; this is additive and harmless on them too. */
      data-tool-loaded={hasFiles || undefined}
      // Direction A wave 3: a phone padding rule (PdfTool.module.css) for the
      // tools that place their own strip (Merge; Compress, which renders the
      // shell's ToolShell in its rail) keys off `hideIdentity`, reflected onto
      // the card rather than adding a tool-name attribute nothing else reads.
      data-hide-identity={hideIdentity || undefined}
      data-dragging={windowDragging || undefined}
      onDragEnter={onWorkspaceDragEnter}
      onDragOver={onWorkspaceDragOver}
      onDragLeave={onWorkspaceDragLeave}
      onDrop={onWorkspaceDrop}
    >
      {!hasFiles && (
        checkingDraft ? (
          // Same dropzone box, so nothing resizes when this resolves either way -
          // just a neutral holding message instead of "drop a file here", which
          // would be actively misleading the moment before a draft loads over it.
          <div class={styles.dropzone} aria-busy="true">
            <p class={styles['dropzone-text']}>{sm.checkingDraft}</p>
          </div>
        ) : (
          <DropzoneEmptyState
            multiple={multiple}
            accept={accept}
            message={emptyStateMessage}
            inputRef={fileInputRef}
            onFiles={receiveFiles}
            messages={sm}
            showIosFilesHint={showIosFilesHint}
            showCloudDriveHint={showCloudDriveHint}
            art={emptyArt}
            heading={emptyHeading}
            body={emptyBody}
          />
        )
      )}

      {hasFiles && (
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
          // Dismissing the OS picker has to retract the agreement that opened
          // it, or it would still be standing next time a file arrived by some
          // other route and that one would skip the question.
          onCancel={() => { agreedRef.current = false; }}
          hidden
        />
      )}

      {hasFiles && !ownsShell && !hideIdentity && (
        <ToolShell>
          <FileActions />
        </ToolShell>
      )}

      {hasFiles && isDraggingOverWorkspace && (
        <div class={styles['drop-overlay']} aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 3.5h7l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V3.5Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <path d="M9.5 13.5h5M12.5 11l2.5 2.5-2.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <p>{multiple ? sm.dropToAddMore : sm.dropToReplace}</p>
        </div>
      )}

      {hasFiles && oldBrowser && (
        <p class={styles['old-browser-notice']} role="status">
          {formatMessage(sm.oldBrowserNotice, { browser: oldBrowser.browser, version: String(oldBrowser.minimum) })}
        </p>
      )}

      {children}

      {/* MEM-03: replacing a single loaded file always asks now - not to
          protect work about to be lost (nothing is; the current file moves
          to recents, it doesn't close for good), but to catch an unintended
          click. The copy says so: it names what's closing and where it
          goes, never "discards" or "can't be undone".

          Two ways in, asked at whichever point comes first. Pressing Replace
          asks before the picker opens, so nobody hunts through their filesystem
          only to be told at the end what it costs; a dropped file is already
          chosen, so that one can name it. */}
      <ConfirmDialog
        open={!!pendingFiles || confirmPickerOpen}
        titleId="confirm-replace-title"
        title={sm.replaceDialogTitle}
        confirmLabel={pendingFiles ? sm.replaceConfirmFile : sm.replaceConfirmChoose}
        cancelLabel={sm.cancel}
        closeLabel={sm.closeDialog}
        onCancel={cancelReplace}
        onConfirm={confirmReplace}
      >
        {/* The sentence is one template so a translator can reorder it; the
            file names are re-inserted as marked spans after formatting. The
            picker path never had a file to name, so it interpolates only
            {current}. */}
        {renderTemplate(
          formatMessage(pendingFiles ? sm.replaceOpening : sm.replaceChoosing, {
            file: '\u0000file\u0000',
            current: '\u0000current\u0000',
          }),
          { file: pendingFiles?.[0]?.name ?? '', current: fileLabel || sm.theCurrentPdf },
          dialogStyles['confirm-file'],
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClearOpen}
        titleId="confirm-clear-title"
        title={sm.clearDialogTitle}
        confirmLabel={sm.clearConfirm}
        cancelLabel={sm.cancel}
        closeLabel={sm.closeDialog}
        onCancel={cancelClear}
        onConfirm={confirmClear}
      >
        {formatMessage(sm.clearBody, { of: clearSummary ? formatMessage(sm.clearOf, { summary: clearSummary }) : '' })}
      </ConfirmDialog>
    </div>
    </ToolShellContext.Provider>
  );
}
