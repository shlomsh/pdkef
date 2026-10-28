import type { ComponentChildren, RefObject } from 'preact';
import { Shrink, FileSignature, LockKeyhole, X as XIcon } from 'lucide-preact';
import { formatMessage } from '../../../lib/text/formatMessage';
import { formatFileSize } from '../../../lib/text/format.js';
import FileName from '../../../shell/FileName.tsx';
import PhoneFinish from '../../../shell/pageWorkspace/PhoneFinish.tsx';
import { workspaceStyles } from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import docStyles from './MergeDocument.module.css';
import { tagStyle } from './tagStyle.ts';
import type { FileEntry } from '../lib/mergeModel.ts';
import type { MergeMessages } from '../messages';
import type { PreparedMerge } from '../hooks/usePreparedMerge.ts';
import type { useDownloadFlow } from '../../../shell/pageWorkspace/useDownloadFlow.ts';

interface MergeChipBarProps {
  entries: FileEntry[];
  chipListRef: RefObject<HTMLUListElement>;
  onRemove: (id: number) => void;
  downloadFlow: ReturnType<typeof useDownloadFlow>;
  prepared: PreparedMerge;
  fileName: string;
  detail: string;
  t: MergeMessages;
  /** The rating prompt, shown inside the finish strip. */
  rating: ComponentChildren;
}

/* Phone and tablet chip row: replaces the rail's file list below 1024px. The
   controls that used to sit behind "..." remain visible in the compact
   toolbar below. */
export default function MergeChipBar({ entries, chipListRef, onRemove, downloadFlow, prepared, fileName, detail, t, rating }: MergeChipBarProps) {
  return (
    <>
      <p class="sr-only" id="reorder-hint">{t.reorderHint}</p>
      <div class={workspaceStyles['chip-bar']} data-chip-bar>
        <ul
          data-testid="chip-row"
          class={docStyles['chip-row']}
          ref={chipListRef}
        >
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              class={docStyles.chip}
              data-chip
              data-id={entry.id}
              data-locked={entry.error === 'encrypted' ? '' : undefined}
            >
              <span class={docStyles['chip-pill']}>
                <span class={docStyles['chip-tag']} style={tagStyle(index)} aria-hidden="true" />
                <FileName name={entry.file.name} className={docStyles['chip-name']} extension={false} />
                {entry.error === 'encrypted' ? (
                  <span
                    data-testid="chip-pages"
                    class={docStyles['chip-pages']}
                    title={t.protectedOwnerOnlyTitle}
                  >
                    <LockKeyhole size={12} aria-hidden="true" />
                    <span class="sr-only">{t.protectedOwnerOnlyTitle}</span>
                  </span>
                ) : (
                  <span
                    data-testid="chip-pages"
                    class={docStyles['chip-pages']}
                  >{entry.pageCount ?? '…'}</span>
                )}
                <button
                  type="button"
                  class={docStyles['chip-remove']}
                  data-chip-remove
                  aria-label={formatMessage(t.removeLabel, { name: entry.file.name })}
                  onClick={() => onRemove(entry.id)}
                >
                  <XIcon size={14} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        {/* MERGE-24 (2026-10-23): the quiet Download at the sticky bar's
            inline end, doing exactly what the completion row's Download
            element does in each state (same link, same handlers). */}
        <PhoneFinish
          flow={downloadFlow}
          prepared={prepared}
          fileName={fileName}
          detail={detail}
          handoffs={[
            { tool: 'compress', label: t.handoffCompress, Icon: Shrink, ...(prepared.blob ? { detail: formatFileSize(prepared.blob.size) } : {}) },
            { tool: 'sign', label: t.handoffSign, Icon: FileSignature },
          ]}
          labels={{ download: t.downloadShort, ready: t.mergedReady, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed, nothing: t.allSkipped }}
          stripAttrs={{ 'data-merge-done-strip': true }}
        >
          {rating}
        </PhoneFinish>
      </div>
    </>
  );
}
