import { LockKeyhole } from 'lucide-preact';
import { formatMessage } from '../../../lib/text/formatMessage';
import { isolateName } from '../../../lib/text/format.js';
import ErrorMessage from '../../../shell/ErrorMessage.tsx';
import NeedsUnlock from '../../../shell/NeedsUnlock.tsx';
import pdfToolStyles from '../../../shell/PdfTool.module.css';
import { workspaceStyles } from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import docStyles from './MergeDocument.module.css';
import type { FileEntry } from '../lib/mergeModel.ts';
import type { MergeMessages } from '../messages';
import type { NeedsUnlockView } from '../hooks/useLockedProbe.ts';

interface MergeNoticesProps {
  needsUnlock: NeedsUnlockView | null;
  probeSettled: boolean;
  failedEntry: FileEntry | null;
  failedReason: 'encrypted' | 'unreadable' | null;
  otherError: boolean;
  unlockHref: string;
  onRemove: (id: number) => void;
  t: MergeMessages;
}

/** What replaces or precedes the page grid when a file cannot take part. */
export default function MergeNotices({ needsUnlock, probeSettled, failedEntry, failedReason, otherError, unlockHref, onRemove, t }: MergeNoticesProps) {
  return (
    <>
      {needsUnlock && (
        <NeedsUnlock
          kind={needsUnlock.kind}
          file={needsUnlock.file}
          bytes={needsUnlock.bytes}
          from="merge"
          toolName="Merge"
          verb="merge"
          replace={false}
          messages={{
            title: needsUnlock.kind === 'needs-password' ? t.protectedNeedsPasswordTitle : t.protectedOwnerOnlyTitle,
            body: needsUnlock.kind === 'needs-password' ? t.protectedNeedsPasswordBody : t.protectedOwnerOnlyBody,
            unlockIt: t.protectedUnlockIt,
            handoffFailed: t.protectedHandoffFailed,
          }}
        />
      )}

      {!needsUnlock && probeSettled && failedEntry && failedReason === 'encrypted' && (
        <div class={docStyles['locked-notice']} role="status" data-locked-notice>
          <LockKeyhole size={18} aria-hidden="true" stroke-width={2} />
          <div>
            <p>{formatMessage(t.errorEncrypted, { name: isolateName(failedEntry.file.name, t.dir) })}</p>
            <div class={docStyles['locked-notice-actions']}>
              <a class={docStyles['locked-notice-unlock']} href={unlockHref}>
                <LockKeyhole size={16} aria-hidden="true" />
                {t.unlockLink}
              </a>
              <button type="button" class={workspaceStyles['quiet-button']} onClick={() => onRemove(failedEntry.id)}>
                {t.removeAndMergeRest}
              </button>
            </div>
          </div>
        </div>
      )}

      {!needsUnlock && probeSettled && failedEntry && failedReason === 'unreadable' && (
        <ErrorMessage>
          {formatMessage(t.errorUnreadable, { name: isolateName(failedEntry.file.name, t.dir) })}
          {' '}
          <button type="button" class={pdfToolStyles['quiet-link']} onClick={() => onRemove(failedEntry.id)}>
            {t.removeAndMergeRest}
          </button>
        </ErrorMessage>
      )}

      {!needsUnlock && otherError && <ErrorMessage>{t.errorTooLarge}</ErrorMessage>}
    </>
  );
}
