import { Download as DownloadIcon } from 'lucide-preact';
import type { DownloadElementState } from '../DownloadElement.tsx';
import styles from './PageWorkspace.module.css';

interface QuietDownloadProps {
  /** The Download element's state; the quiet one mirrors it. */
  state: DownloadElementState;
  /** The output is a ready blob with a link (`downloadLinkReady`). */
  linkReady: boolean;
  href: string | null;
  fileName: string;
  label: string;
  onDownloadTap: () => void;
  onPreparingTap: () => void;
  /** Hover or focus: build now. */
  onWarm: () => void;
}

/**
 * The phone bar's quiet Download, at the bar's inline end: a link once the
 * output is ready, otherwise a button doing what the Download element does in
 * that state (nothing in 'error' and 'nothing', where it is disabled).
 * Absent while the tool is waiting for more files.
 */
export default function QuietDownload({
  state, linkReady, href, fileName, label, onDownloadTap, onPreparingTap, onWarm,
}: QuietDownloadProps) {
  if (state === 'one-file') return null;
  if (linkReady) {
    return (
      <a class={styles['chip-download']} data-quiet-download href={href ?? undefined} download={fileName} onClick={onDownloadTap}>
        <DownloadIcon size={16} aria-hidden="true" />
        {label}
      </a>
    );
  }
  const inert = state === 'error' || state === 'nothing';
  return (
    <button
      type="button"
      class={styles['chip-download']}
      data-quiet-download
      aria-disabled={inert || state === 'preparing' || undefined}
      onClick={inert ? undefined : onPreparingTap}
      onPointerEnter={onWarm}
      onFocus={onWarm}
    >
      <DownloadIcon size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
