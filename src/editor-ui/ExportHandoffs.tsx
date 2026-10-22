import type { LucideIcon } from 'lucide-preact';
import styles from './ExportHandoffs.module.css';

/** One quiet next-tool verb under an editor's finish pair ("Compress it"). */
export interface ExportHandoffItem {
  /** The receiving tool's hand-off key, as saveHandoff takes it. */
  tool: string;
  label: string;
  Icon: LucideIcon;
  /** A quiet note after the label, e.g. the current size ("45.2 KB"). */
  detail?: string;
}

export interface ExportHandoffsProps {
  items: ExportHandoffItem[];
  busy: boolean;
  onHandoff(tool: string): void;
}

/**
 * The row of next-tool verbs under Sign's and Redact's finish pair, shown once
 * an export exists (Merge's done state is the model, tools-and-shell.md). Two
 * equal halves, never in front of Download, never a sales row. The failure
 * line and when the row shows stay with each tool, which owns its own export.
 */
export default function ExportHandoffs({ items, busy, onHandoff }: ExportHandoffsProps) {
  return (
    <div class={styles['handoff-row']}>
      {items.map(({ tool, label, Icon, detail }) => (
        <button key={tool} type="button" class={styles['handoff-button']} disabled={busy} onClick={() => onHandoff(tool)}>
          <Icon size={16} aria-hidden="true" />
          {label}
          {detail && <span class={styles.detail}>{detail}</span>}
        </button>
      ))}
    </div>
  );
}
