import type { ComponentChildren } from 'preact';
import FilePreview from '../../../shell/FilePreview';
import { englishShellMessages } from '../../../i18n/toolMessages';
import { useToolShell } from '../../../shell/ToolShell';
import styles from './CompressStrip.module.css';

interface CompressStripProps {
  file: File;
  dir: 'ltr' | 'rtl';
  originalLabel: string;
  resultLabel: string | null;
  processing: boolean;
  processingLabel: string;
  savedLabel: string | null;
  note?: ComponentChildren;
}

/**
 * Compress's loaded-state strip: thumbnail, name, before -> after sizes, and a
 * quiet Replace. The note line always reserves its height so the strip never
 * changes size when a note arrives.
 */
export default function CompressStrip({
  file,
  dir,
  originalLabel,
  resultLabel,
  processing,
  processingLabel,
  savedLabel,
  note,
}: CompressStripProps) {
  const { requestReplace, messages = englishShellMessages } = useToolShell();
  const replaceLabel = messages.replaceShort || messages.replaceLabel;
  const after = processing ? processingLabel : resultLabel;

  return (
    <div class={styles.strip} data-compress-strip>
      <span class={styles.thumb}>
        <FilePreview file={file} />
      </span>
      <div class={styles.text}>
        <span class={styles.name} dir="auto" title={file.name}>
          {file.name}
        </span>
        <span class={styles.sizes} data-compress-sizes>
          <bdi class={styles.before}>{originalLabel}</bdi>
          {after && (
            <>
              <span aria-hidden="true">{dir === 'rtl' ? '←' : '→'}</span>
              <b>
                <bdi>{after}</bdi>
              </b>
            </>
          )}
          {savedLabel && !processing && <span class={styles.saved}>{savedLabel}</span>}
        </span>
        <span class={styles.note} data-compress-note>
          {note}
        </span>
      </div>
      <button type="button" class={styles.replace} onClick={requestReplace}>
        {replaceLabel}
      </button>
    </div>
  );
}
