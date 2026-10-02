import { useState } from 'preact/hooks';
import { FileLock2 } from 'lucide-preact';
import { FileActions } from './ToolShell.tsx';
import pdfToolStyles from './PdfTool.module.css';
import { useNavigatingAway } from '../lib/useNavigatingAway.ts';
import shellStyles from './ToolShell.module.css';
import styles from './NeedsUnlock.module.css';

export type NeedsUnlockKind = 'needs-password' | 'owner-restricted';

/** Every string the state shows, so a localized tool (Sign's /he/ page) can pass its own. */
export interface NeedsUnlockMessages {
  title: string;
  body: string;
  unlockIt: string;
  handoffFailed: string;
}

function englishCopy(kind: NeedsUnlockKind, toolName: string, verb: string): NeedsUnlockMessages {
  const shared = {
    unlockIt: 'Unlock it',
    handoffFailed: "Couldn't open Unlock with this file. Open Unlock and choose it there.",
  };
  return kind === 'needs-password'
    ? { ...shared, title: 'This PDF has a password', body: `Unlock opens it on your device, then you can ${verb} it.` }
    : {
      ...shared,
      title: 'This PDF is protected',
      body: `It opens without a password, but ${toolName} can't change it as it is. Unlock takes the protection off on your device, then you can ${verb} it.`,
    };
}

/**
 * One quiet state in the place of a tool's workspace for a protected PDF: what it is, and two ways on.
 * "Unlock it" parks the file for Unlock with `from` set to the sending tool (the detour contract,
 * docs/ux-design-guidelines.md section 13: Unlock's done state then leads with "Continue in <tool>")
 * and goes there; the shell's Replace chooses another file. Rendered inside BasePdfTool, so
 * FileActions is in reach.
 *
 * `from` is the sending tool's key ('redact', 'sign', 'compress'), `toolName` its name in a sentence
 * ("Redact can't change it") and `verb` what the person came to do ("then you can redact it").
 * `messages` replaces the English copy whole, for a localized page.
 * `replace` is false when the tool's file card already shows Replace.
 */
export default function NeedsUnlock({ kind, file, bytes, from, toolName, verb, messages, replace = true }: {
  kind: NeedsUnlockKind;
  file: File | null;
  bytes: ArrayBuffer | null;
  from: string;
  toolName: string;
  verb: string;
  messages?: NeedsUnlockMessages;
  replace?: boolean;
}) {
  const [busy, setBusy] = useNavigatingAway();
  const [failed, setFailed] = useState(false);
  const { title, body, unlockIt, handoffFailed } = messages ?? englishCopy(kind, toolName, verb);

  const unlock = async () => {
    if (busy || !file || !bytes) return;
    setBusy(true);
    setFailed(false);
    try {
      const { saveHandoff } = await import('../lib/drafts/draftStore.js');
      const saved = await saveHandoff('unlock', { fileName: file.name, fileType: 'application/pdf', fileBytes: bytes, from });
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
    <div class={styles.state} data-needs-unlock={kind}>
      <h2 class={styles.title}>{title}</h2>
      <p class={styles.body}>{body}</p>
      <div class={styles.actions}>
        <button type="button" class={`${shellStyles.action} ${styles.lead}`} disabled={busy} onClick={() => { void unlock(); }}>
          <FileLock2 size={12} stroke-width={1.5} aria-hidden="true" />
          {unlockIt}
        </button>
        {replace && <FileActions />}
      </div>
      {failed && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {handoffFailed}
        </p>
      )}
    </div>
  );
}
