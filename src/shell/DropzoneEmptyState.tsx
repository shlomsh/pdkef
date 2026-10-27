import { useEffect, useState } from 'preact/hooks';
import { dropHasDirectory, filesFromDataTransfer } from './dropFiles.js';
import type { ComponentChild, Ref } from 'preact';
import styles from './Dropzone.module.css';
import { englishShellMessages, type ShellMessages } from './shellMessages';
import { isAndroidDevice, isIOSDevice } from '../lib/platform.ts';
import { reportError } from '../lib/errorReport.ts';

interface DropzoneEmptyStateProps {
  multiple?: boolean;
  accept?: string;
  message?: string;
  inputRef?: Ref<HTMLInputElement>;
  onFiles: (files: File[] | FileList, source?: 'pick' | 'drop') => void;
  messages?: ShellMessages;
  /** MOBI-09: opt-in only (the Sign tool page sets this; every other
   * BasePdfTool caller leaves it unset). Whether the notice actually shows
   * still depends on the mount-effect iOS check below - this only says
   * "this tool is allowed to show it at all". */
  showIosFilesHint?: boolean;
  /** MERGE-18: opt-in. Phones only (iOS or Android), same mount-effect rule. */
  showCloudDriveHint?: boolean;
  /** The tool's verb, drawn in place of the file-plus icon. */
  art?: ComponentChild;
  /** Replaces `message` as the sheet's heading. */
  heading?: string;
  /** Replaces the default privacy line under the heading. */
  body?: string;
  /** An extra action directly under the pick button (Scan's "Take a photo"). */
  action?: ComponentChild;
}

/** Empty-state file picker shared by the PDF tool pages. */
export default function DropzoneEmptyState({
  multiple = true,
  accept = 'application/pdf',
  message,
  inputRef,
  onFiles,
  messages = englishShellMessages,
  showIosFilesHint = false,
  showCloudDriveHint = false,
  art,
  heading,
  body,
  action,
}: DropzoneEmptyStateProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  // `false` on the server and on this component's first client render, same
  // agreement `recents` makes in FileDropzone.tsx and for the same reason:
  // the server has no `navigator` to check, so deciding this from the render
  // body (or a useState initializer that reads it) would make the client's
  // first render disagree with the server's markup, and Preact repairs that
  // mismatch by keeping the server's node and appending its own rather than
  // replacing it. Only the mount effect below may read `navigator`.
  const [isIOS, setIsIOS] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (!showIosFilesHint) return;
    setIsIOS(isIOSDevice(typeof navigator === 'undefined' ? undefined : navigator));
  }, [showIosFilesHint]);

  useEffect(() => {
    if (!showCloudDriveHint) return;
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    setIsPhone(isIOSDevice(nav) || isAndroidDevice(nav));
  }, [showCloudDriveHint]);

  const defaultHeading = message ?? (multiple ? messages.dropHereMany : messages.dropHereOne);
  // A tool's drag-and-paste wording only suits widths that have a pointer and a
  // keyboard; phones keep the plain message. Both are server-rendered and CSS
  // shows one, so nothing is read twice and no JS decides.
  const twoWidths = (phone: string, desktop: string | undefined) =>
    desktop === undefined || desktop === phone ? (
      phone
    ) : (
      <>
        <span class={styles['empty-phone']}>{phone}</span>
        <span class={styles['empty-desktop']}>{desktop}</span>
      </>
    );

  const onInputChange = (event: Event) => {
    // Read the list out before resetting the input - `value = ''` empties a
    // live FileList in place in a real browser, so the order here matters
    // (see CLAUDE.md's FileList note).
    const target = event.currentTarget as HTMLInputElement;
    const files = Array.from(target.files || []);
    target.value = '';
    onFiles(files);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    if (!event.dataTransfer) return;
    // MERGE-10: a dropped folder yields its files (walked, sorted by name);
    // a plain drop keeps the synchronous path.
    if (dropHasDirectory(event.dataTransfer)) {
      filesFromDataTransfer(event.dataTransfer)
        .then((files) => onFiles(files, 'drop'))
        .catch((err) => reportError('pdf_tool_run', err, 'read_dropped_folder'));
      return;
    }
    onFiles(event.dataTransfer.files, 'drop');
  };

  // The input is visually hidden, not `hidden`: display:none takes it out
  // of the tab order, so a keyboard could never reach the picker and the
  // `:has(input:focus-visible)` ring below could never match (QUAL-22).
  // Enter and Space on a focused file input open the picker natively.
  const pickerEl = (
    <label class={styles['file-picker-button']}>
      {multiple ? messages.chooseFilesMany : messages.chooseFileOne}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={onInputChange}
        class={styles['file-input']}
      />
    </label>
  );

  return (
    <div
      class={`${styles.dropzone}${isDragOver ? ` ${styles['is-dragover']}` : ''}`}
      // Marks this as the real "add a file" invitation, as opposed to
      // BasePdfTool's own checking-draft placeholder (which also uses
      // .dropzone for the box styling but must never be hidden by it) - see
      // the `html[data-draft-hint]` rule in Dropzone.module.css.
      data-empty-state
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
    >
      {art ?? (
        <svg
          class={styles['dropzone-icon']}
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
        >
          <rect x="9" y="4" width="24" height="32" rx="3" class={styles['dz-page']} />
          <path d="M27 4v8h8" class={styles['dz-fold']} />
          <rect x="16" y="26" width="22" height="16" rx="3" class={`${styles['dz-page']} ${styles['dz-page-front']}`} />
          <path d="M23 30v8M27 34h-8" class={styles['dz-plus']} />
        </svg>
      )}

      <p class={styles['dropzone-text']}>
        <strong class={styles['drag-heading']}>{twoWidths(defaultHeading, heading)}</strong>
        {/* Shown instead of the heading while a file is dragged over the page
            (BasePdfTool's `data-dragging`), by CSS alone. */}
        <strong class={styles['drag-caption']}>
          {multiple ? messages.dragCaptionMany : messages.dragCaptionOne}
        </strong>
      </p>

      {/* A tool's extra way in (Scan's "Take a photo") is an equal choice: one row, side by side. */}
      {action ? <div class={styles['pick-row']}>{pickerEl}{action}</div> : pickerEl}

      <p class={styles['privacy-line']}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path
            d="M9 12.5l2 2 4-4.5"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {twoWidths(messages.privacyLine, body)}
      </p>

      {isIOS && (
        <p class={styles['ios-files-hint']}>{messages.iosFilesHint}</p>
      )}

      {isPhone && (
        <p class={styles['ios-files-hint']}>{messages.cloudDriveHint}</p>
      )}

      {/* The sheet's last child: its presence means the whole sheet has been parsed. */}
      <i class={styles['sheet-end']} hidden />
    </div>
  );
}
