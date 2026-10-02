import { useState } from 'preact/hooks';
import { FileLock2 } from 'lucide-preact';
import { FileActions } from '../../shell/ToolShell.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';
import styles from './NeedsUnlock.module.css';

export type NeedsUnlockKind = 'needs-password' | 'owner-restricted';

// Plain English, like the rest of the Redact island (not a localized tool).
const COPY: Record<NeedsUnlockKind, { title: string; body: string }> = {
  'needs-password': {
    title: 'This PDF has a password',
    body: 'Unlock opens it on your device, then you can redact it.',
  },
  'owner-restricted': {
    title: 'This PDF is protected',
    body: "It opens without a password, but Redact can't change it as it is. Unlock takes the protection off on your device, then you can redact it.",
  },
};

/**
 * One quiet state in the place of the editor for a protected PDF: what it is, and two ways on. "Unlock it"
 * parks the file for Unlock (the same one-shot baton the done-state hand-offs use) and goes there; the
 * shell's Replace chooses another file. Rendered inside BasePdfTool, so FileActions is in reach.
 */
export default function NeedsUnlock({ kind, file, bytes }: { kind: NeedsUnlockKind; file: File | null; bytes: ArrayBuffer | null }) {
  const [busy, setBusy] = useNavigatingAway();
  const [failed, setFailed] = useState(false);
  const { title, body } = COPY[kind];

  const unlock = async () => {
    if (busy || !file || !bytes) return;
    setBusy(true);
    setFailed(false);
    try {
      const { saveHandoff } = await import('../../lib/drafts/draftStore.js');
      const saved = await saveHandoff('unlock', { fileName: file.name, fileType: 'application/pdf', fileBytes: bytes, from: 'redact' });
      if (!saved) throw new Error('handoff');
      window.location.href = '/unlock/';
    } catch (err) {
      // expected: saveHandoff reports its own failure, this shows the quiet hint line
      console.error(err);
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div class={styles.state} data-redact-needs-unlock={kind}>
      <h2 class={styles.title}>{title}</h2>
      <p class={styles.body}>{body}</p>
      <div class={styles.actions}>
        <button type="button" class={styles['unlock-button']} disabled={busy} onClick={() => { void unlock(); }}>
          <FileLock2 size={16} aria-hidden="true" />
          Unlock it
        </button>
        <FileActions />
      </div>
      {failed && (
        <p class={pdfToolStyles['hint-message']} role="status">
          Couldn't open Unlock with this file. Open Unlock and choose it there.
        </p>
      )}
    </div>
  );
}
