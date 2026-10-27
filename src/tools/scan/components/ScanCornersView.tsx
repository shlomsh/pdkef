import { Check, Maximize, Trash2, WandSparkles } from 'lucide-preact';
import { workspaceStyles } from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import { englishScanMessages as t } from '../messages.ts';
import { FULL_QUAD, quadKey, turnedQuad, unturnedQuad, type Quad } from '../lib/quad.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import CornerEditor from './CornerEditor.tsx';

interface ScanCornersViewProps {
  selected: ScanPage;
  /** The photo the corner editor shows: null while a turned preview is being made. */
  photo: string | null;
  shownAspect: number;
  finding: number | null;
  onCommit: (id: number, quad: Quad) => void;
  onFind: (page: ScanPage) => void;
  /** Use these corners, or Done once they are approved. */
  onApprove: () => void;
  onDone: () => void;
  onRemove: (id: number) => void;
}

/** The corners view under the editor head: the photo with its corners, then the bottom bar of choices. */
export default function ScanCornersView({ selected, photo, shownAspect, finding, onCommit, onFind, onApprove, onDone, onRemove }: ScanCornersViewProps) {
  const unreadable = selected.guessed && selected.preview === null;
  return (
    <>
      <div class={styles['photo-area']}>
        {photo === null ? (
          // The photo's own shape and size, so nothing moves when its preview lands.
          <div
            class={styles['corners-wait']}
            style={{ aspectRatio: String(shownAspect), width: `min(100%, calc(var(--scan-view-h) * ${shownAspect}))` }}
          >
            {/* The head already says a photo could not be read; the box stays quiet. */}
            {selected.preview !== null || selected.guessed ? '' : t.findingEdges}
          </div>
        ) : (
          // On a turned page the photo, its shape and its corners are all shown turned (quad.ts).
          <CornerEditor
            key={`${selected.id}|${selected.turns}`}
            src={photo}
            aspect={selected.aspect === null ? undefined : shownAspect}
            quad={turnedQuad(selected.quad, selected.turns)}
            onCommit={(quad) => onCommit(selected.id, unturnedQuad(quad, selected.turns))}
            labels={{ group: t.cornersGroup, corners: t.corners }}
          />
        )}
      </div>
      {unreadable && (
        // An unreadable photo has nothing to straighten: the one thing to do is take it out.
        <div class={styles['corners-actions']}>
          <button type="button" class={`${workspaceStyles['quiet-button']} ${styles['done-button']}`} onClick={() => onRemove(selected.id)}>
            <Trash2 size={18} aria-hidden="true" />
            {t.removePhoto}
          </button>
        </div>
      )}
      {!unreadable && (
        // Under the photo, like a scanner app's bottom bar: the quiet choices, then the one that moves on.
        // One row where it fits; on a phone the one that moves on takes a row of its own.
        <div class={styles['corners-actions']}>
          <button type="button" class={workspaceStyles['quiet-button']} disabled={finding !== null || selected.preview === null} onClick={() => onFind(selected)}>
            <WandSparkles size={18} aria-hidden="true" />
            {t.findPage}
          </button>
          <button
            type="button"
            class={workspaceStyles['quiet-button']}
            disabled={quadKey(selected.quad) === quadKey(FULL_QUAD)}
            onClick={() => onCommit(selected.id, FULL_QUAD)}
          >
            <Maximize size={18} aria-hidden="true" />
            {t.wholePhoto}
          </button>
          <button
            type="button"
            class={`${workspaceStyles['quiet-button']} ${styles['done-button']}`}
            disabled={selected.preview === null}
            onClick={selected.reviewed ? onDone : onApprove}
          >
            <Check size={18} aria-hidden="true" />
            {selected.reviewed ? t.cornersDone : t.useCorners}
          </button>
        </div>
      )}
    </>
  );
}
