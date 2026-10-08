import { DETAILS_REVIEW } from '../check/checkCopy.ts';
import styles from './Details.module.css';

/** RED-59: one muted line under the last page saying what the file says about itself. */
export function DetailsFooter({ summary, onReview }: { summary: string[]; onReview: () => void }) {
  if (summary.length === 0) return null;
  return (
    <p data-details-footer class={styles.footer}>
      <span class={styles.summary}>
        {summary.map((piece, i) => (
          <>
            {i > 0 && ' · '}
            <bdi>{piece}</bdi>
          </>
        ))}
      </span>
      <button type="button" class={styles.review} onClick={onReview}>{DETAILS_REVIEW}</button>
    </p>
  );
}
