import { useState } from 'preact/hooks';
import { Check } from 'lucide-preact';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import type { Spine } from '#lib/pageEnhance/spine.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import splitStyles from './ScanSplitView.module.css';
import SplitLine from './SplitLine.tsx';

interface ScanSplitViewProps {
  selected: ScanPage;
  /** The photo as shown (turned), null while a turned preview is being made. */
  photo: string | null;
  shownAspect: number;
  /** The split is being made: both answers wait. */
  splitting: boolean;
  /** The last try at this sheet failed. */
  failed: boolean;
  /** Keep the sheet as one page. */
  onOnePage: () => void;
  /** Make two pages along this line. */
  onTwoPages: (spine: Spine) => void;
}

/** The screen that asks "One page or two?": the photo with a line to fit the gap, then the two answers. */
export default function ScanSplitView({ selected, photo, shownAspect, splitting, failed, onOnePage, onTwoPages }: ScanSplitViewProps) {
  // Keyed by page in the parent's tree: a new page starts from its own question's line.
  const [spine, setSpine] = useState<Spine>(selected.question!.spine);
  return (
    <>
      <div class={styles['photo-area']}>
        {photo === null ? (
          <div class={styles['corners-wait']} style={{ aspectRatio: String(shownAspect), width: `min(100%, calc(var(--scan-view-h) * ${shownAspect}))` }} />
        ) : (
          <SplitLine
            src={photo}
            aspect={selected.aspect === null ? undefined : shownAspect}
            spine={spine}
            onCommit={setSpine}
            labels={{ group: t.splitLineGroup, top: t.splitLineTop, bottom: t.splitLineBottom }}
          />
        )}
      </div>
      <div class={splitStyles['bar']}>
        <p class={splitStyles['question']}>{t.splitQuestion}</p>
        <p class={splitStyles['hint']} role="status">{failed ? t.splitFailed : t.splitHint}</p>
        <div class={styles['corners-actions']}>
          <button type="button" class={workspaceStyles['quiet-button']} disabled={splitting} onClick={onOnePage}>
            {t.splitOne}
          </button>
          <button type="button" class={`${workspaceStyles['quiet-button']} ${styles['done-button']}`} disabled={splitting} onClick={() => onTwoPages(spine)}>
            <Check size={18} aria-hidden="true" />
            {t.splitTwo}
          </button>
        </div>
      </div>
    </>
  );
}
