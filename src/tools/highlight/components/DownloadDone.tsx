import { useState } from 'preact/hooks';
import DoneStrip from '#shell/DoneStrip.tsx';
import SaveToDriveButton from '#shell/pageWorkspace/SaveToDriveButton.tsx';
import type { useSaveToDrive } from '#shell/pageWorkspace/useSaveToDrive.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import styles from './DownloadDone.module.css';

interface Saved { name: string; blob: Blob | null; file: unknown; revision: number }

/** The strip shows while the file on disk still matches what is on screen: same document, same marks, not closed. @testSeam */
export function isDownloadDoneVisible(saved: Saved | null, file: unknown, revision: number): boolean {
  return !!saved && saved.file === file && saved.revision === revision;
}

/** What the last download saved, and whether the strip for it still stands. */
export function useDownloadDone(file: unknown, revision: number) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const visible = isDownloadDoneVisible(saved, file, revision);
  return {
    name: visible ? saved!.name : null,
    blob: visible ? saved!.blob : null,
    /** Record a download made at `atRevision` of `atFile`. */
    record: (name: string, atFile: unknown, atRevision: number, blob: Blob | null = null) => setSaved({ name, blob, file: atFile, revision: atRevision }),
    close: () => setSaved(null),
  };
}

/** The done strip under the tool row: one line saying where the marks went. */
export default function DownloadDone({ name, onClose, drive }: { name: string; onClose(): void; drive?: ReturnType<typeof useSaveToDrive> }) {
  return (
    <DoneStrip label={t.downloadDoneLabel} closeLabel={t.downloadDoneClose} onClose={onClose} data-download-done>
      <p class={styles.line}>{formatMessage(t.downloadDone, { name })}</p>
      {drive && <SaveToDriveButton drive={drive} />}
    </DoneStrip>
  );
}
