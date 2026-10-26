import { FileSignature, Merge, Shrink } from 'lucide-preact';
import PdfShareButton from '../PdfShareButton.tsx';
import type { HandoffTool } from './useDownloadFlow.ts';
import styles from './PageWorkspace.module.css';

interface FinishRowProps {
  /** The output is built (`prepared.status === 'ready'`): Share appears, hand-offs enable. */
  ready: boolean;
  shareReady: boolean;
  onShare: () => void;
  /** A hand-off is already under way. */
  busy: boolean;
  onHandoff: (tool: HandoffTool) => void;
  /** Hover, focus or press anywhere in the row: build now. */
  onWarm: () => void;
  labels: { share: string; compress: string; sign: string; merge?: string };
  /** Which hand-offs follow Share. Split's one PDF per page passes none. */
  tools?: HandoffTool[];
}

const ICONS = { compress: Shrink, sign: FileSignature, merge: Merge };
const DEFAULT_TOOLS: HandoffTool[] = ['compress', 'sign'];

/** The rail's finish row: Share, then hand-offs (Compress and Sign unless `tools` says otherwise). */
export default function FinishRow({ ready, shareReady, onShare, busy, onHandoff, onWarm, labels, tools = DEFAULT_TOOLS }: FinishRowProps) {
  // How many buttons render: the CSS lays four out as two columns.
  const count = (ready && shareReady ? 1 : 0) + tools.filter((tool) => labels[tool]).length;
  return (
    <div class={styles['handoff-row']} data-count={count} onPointerOver={onWarm} onFocusIn={onWarm} onPointerDown={onWarm}>
      {ready && <PdfShareButton visible={shareReady} onShare={onShare} label={labels.share} className={styles['handoff-button']} />}
      {tools.map((tool) => {
        if (!labels[tool]) return null;
        const Icon = ICONS[tool];
        return (
          <button
            key={tool}
            type="button"
            class={styles['handoff-button']}
            disabled={busy || !ready}
            onClick={() => onHandoff(tool)}
          >
            <Icon size={16} aria-hidden="true" />
            {labels[tool]}
          </button>
        );
      })}
    </div>
  );
}
