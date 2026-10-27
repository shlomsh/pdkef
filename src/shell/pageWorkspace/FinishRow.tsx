import { Eraser, FileSignature, Merge, Shrink, type LucideIcon } from 'lucide-preact';
import PdfShareButton from '../PdfShareButton.tsx';
import type { HandoffTool } from './useDownloadFlow.ts';
import styles from './PageWorkspace.module.css';

interface FinishRowProps {
  /** The output is built (`prepared.status === 'ready'`): Share appears, hand-offs enable. */
  ready: boolean;
  shareReady: boolean;
  onShare: () => void;
  /** A hand-off is already under way. */
  busy?: boolean;
  /** Absent for a tool with no hand-offs: the row is then just Share. */
  onHandoff?: (tool: HandoffTool) => void;
  /** Hover, focus or press anywhere in the row: build now. */
  onWarm: () => void;
  labels: { share: string } & Partial<Record<HandoffTool, string>>;
  /** Which hand-offs follow Share. Split's one PDF per page passes none. */
  tools?: HandoffTool[];
}

const ICONS: Partial<Record<HandoffTool, LucideIcon>> = { compress: Shrink, sign: FileSignature, merge: Merge, redact: Eraser };
const DEFAULT_TOOLS: HandoffTool[] = ['compress', 'sign'];

/** The rail's finish row: Share, then hand-offs (Compress and Sign unless `tools` says otherwise). */
export default function FinishRow({ ready, shareReady, onShare, busy = false, onHandoff, onWarm, labels, tools = DEFAULT_TOOLS }: FinishRowProps) {
  // How many buttons render: the CSS lays four out as two columns.
  const count = (ready && shareReady ? 1 : 0) + (onHandoff ? tools.filter((tool) => labels[tool] && ICONS[tool]).length : 0);
  return (
    <div class={styles['handoff-row']} data-count={count} onPointerOver={onWarm} onFocusIn={onWarm} onPointerDown={onWarm}>
      {ready && <PdfShareButton visible={shareReady} onShare={onShare} label={labels.share} className={styles['handoff-button']} />}
      {onHandoff && tools.map((tool) => {
        const Icon = ICONS[tool];
        if (!labels[tool] || !Icon) return null;
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
