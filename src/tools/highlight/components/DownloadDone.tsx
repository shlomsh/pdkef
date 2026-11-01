import { useState } from 'preact/hooks';
import DoneStrip from '#shell/DoneStrip.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import styles from './DownloadDone.module.css';

interface Saved { name: string; file: unknown; revision: number }

/** The strip shows while the file on disk still matches what is on screen: same document, same marks, not closed. */
export function isDownloadDoneVisible(saved: Saved | null, file: unknown, revision: number): boolean {
  return !!saved && saved.file === file && saved.revision === revision;
}

/** What the last download saved, and whether the strip for it still stands. */
export function useDownloadDone(file: unknown, revision: number) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const visible = isDownloadDoneVisible(saved, file, revision);
  return {
    name: visible ? saved!.name : null,
    /** Record a download made at `atRevision` of `atFile`. */
    record: (name: string, atFile: unknown, atRevision: number) => setSaved({ name, file: atFile, revision: atRevision }),
    close: () => setSaved(null),
  };
}

/** The done strip under the tool row: one line saying where the marks went. */
export default function DownloadDone({ name, onClose }: { name: string; onClose(): void }) {
  return (
    <DoneStrip label={t.downloadDoneLabel} closeLabel={t.downloadDoneClose} onClose={onClose} data-download-done>
      <p class={styles.line}>{formatMessage(t.downloadDone, { name })}</p>
    </DoneStrip>
  );
}
