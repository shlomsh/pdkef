import { useId } from 'preact/hooks';
import type { CrookedVerdict } from '../lib/enhance/scanOffer.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import styles from './ScanOffer.module.css';

interface Props {
  verdict: CrookedVerdict;
  busy: boolean;
  failed: boolean;
  onStraighten: () => void;
  onKeepAsIs: () => void;
}

/** The small sheet that squares itself up as the card arrives. */
const SquaringSheet = () => (
  <svg class={styles.sheet} viewBox="0 0 32 40" width="32" height="40" aria-hidden="true">
    <rect x="3" y="2" width="26" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="2" />
    <path d="M9 12h14M9 19h14M9 26h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
);

/** The card over page 1: what the check found, what Scan does about it, and the choice. */
export default function ScanOffer({ verdict, busy, failed, onStraighten, onKeepAsIs }: Props) {
  const o = t.scanOffer;
  const titleId = useId();
  return (
    <div class={styles.card} role="group" aria-labelledby={titleId} data-scan-offer>
      <div class={styles.body}>
        <SquaringSheet />
        <div>
          <p class={styles.title} id={titleId}>{o[verdict].title}</p>
          <p class={styles.detail}>{failed ? o.failed : o[verdict].detail}</p>
        </div>
      </div>
      <div class={styles.actions}>
        <button type="button" class={styles.straighten} aria-disabled={busy} onClick={onStraighten}>{o.straighten}</button>
        <button type="button" class={styles.keep} onClick={onKeepAsIs}>{o.keepAsIs}</button>
      </div>
    </div>
  );
}
