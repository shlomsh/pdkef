import { DETAILS_REVIEW } from '../../lib/check/checkCopy.ts';
import styles from './Details.module.css';

/**
 * RED-59: one muted line under the last page saying what the file says about itself.
 * RED-64: while the details are still being read it holds the line's height, so what sits
 * below (the finish row) does not move when the summary arrives.
 */
export function DetailsFooter({ summary, onReview, reading = false }: { summary: string[]; onReview: () => void; reading?: boolean }) {
  if (summary.length === 0) return reading ? <p data-details-reading aria-hidden="true" class={`${styles.footer} ${styles.reading}`} /> : null;
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
