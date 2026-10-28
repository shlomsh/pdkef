import { useState } from 'preact/hooks';
import { FileText, LockKeyhole } from 'lucide-preact';
import FileName from './FileName.tsx';
import ReplaceFileLine from './pageWorkspace/ReplaceFileLine.tsx';
import pdfToolStyles from './PdfTool.module.css';
import { useNavigatingAway } from '#lib/hooks/useNavigatingAway.ts';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
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
 * One state in the place of a tool's workspace for a protected PDF: a locked page, what it is, which
 * file, and two ways on, with Unlock as the primary action (Shlomi, 2026-10-26: the old one-line
 * heading at the top of an empty card was easy to miss).
 * "Unlock it" parks the file for Unlock with `from` set to the sending tool (the detour contract,
 * docs/ux-design-guidelines.md section 13: Unlock's done state then leads with "Continue in <tool>")
 * and goes there; the quiet Replace line (the one the loaded page tools show, UX guideline 20)
 * chooses another file. Rendered inside BasePdfTool, so the shell context is in reach.
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
      await sendHandoff('unlock', { fileName: file.name, fileType: 'application/pdf', fileBytes: bytes, from });
    } catch (err) {
      // expected: saveHandoff reports its own failure, this shows the quiet hint line
      console.error(err);
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div class={styles.state} data-needs-unlock={kind}>
      <div class={styles.art} aria-hidden="true">
        <span class={styles.sheet} />
        <span class={styles.badge}><LockKeyhole size={22} stroke-width={2} /></span>
      </div>
      <h2 class={styles.title}>{title}</h2>
      {file && (
        <div class={styles.file} data-file-chip>
          <FileText size={14} stroke-width={1.75} aria-hidden="true" />
          <FileName name={file.name} className={styles.name} />
        </div>
      )}
      <p class={styles.body}>{body}</p>
      <div class={styles.actions}>
        <button type="button" class={styles.unlock} data-unlock disabled={busy} onClick={() => { void unlock(); /* reason: unlock catches its own failure and shows it */ }}>
          <LockKeyhole size={18} stroke-width={2} aria-hidden="true" />
          {unlockIt}
        </button>
      </div>
      {replace && <ReplaceFileLine />}
      {failed && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {handoffFailed}
        </p>
      )}
    </div>
  );
}
