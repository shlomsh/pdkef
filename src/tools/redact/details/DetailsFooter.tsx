import { DETAILS_REVIEW } from '../check/checkCopy.ts';
import styles from './Details.module.css';

/** RED-59: one muted line under the last page saying what the file says about itself. */
export function DetailsFooter({ summary, onReview }: { summary: string; onReview: () => void }) {
  if (summary === '') return null;
  return (
    <p data-details-footer class={styles.footer}>
      <bdi class={styles.summary}>{summary}</bdi>
      <button type="button" class={styles.review} onClick={onReview}>{DETAILS_REVIEW}</button>
    </p>
  );
}
