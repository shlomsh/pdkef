import { Info } from 'lucide-preact';
import styles from '../PdfCompressTool.module.css';
import type { ResultView } from '../lib/resultView.ts';

interface ResultNotesProps {
  view: ResultView;
  isDone: boolean;
  passthrough: boolean;
}

/** What to know about the file that downloads, beside Download on a desktop and under the preview on a phone.
 *  A passthrough result keeps its note in the result column, where it stands in for the comparison. */
export function hasResultNotes({ view, isDone, passthrough }: ResultNotesProps): boolean {
  const { resultTitle, resultNotice, closestWarning, targetMissedNotice } = view;
  return Boolean(closestWarning || targetMissedNotice || (isDone && !passthrough && (resultTitle || resultNotice)));
}

export default function ResultNotes(props: ResultNotesProps) {
  const { view, isDone, passthrough } = props;
  if (!hasResultNotes(props)) return null;
  const { resultTitle, resultNotice, closestWarning, targetMissedNotice } = view;
  const own = isDone && !passthrough;
  return (
    <div class={styles['result-notes']} data-result-notes>
      <Info class={styles['result-notes-icon']} size={16} aria-hidden="true" />
      <div class={styles['result-notes-body']}>
        {own && resultTitle && <p class={styles['result-notes-title']} data-stats-title>{resultTitle}</p>}
        {closestWarning && <p class={styles['result-note']} data-compress-warning>{closestWarning}</p>}
        {own && resultNotice && <p class={styles['result-note']} data-compress-warning>{resultNotice}</p>}
        {targetMissedNotice && <p class={styles['result-note']} data-compress-warning>{targetMissedNotice}</p>}
      </div>
    </div>
  );
}
