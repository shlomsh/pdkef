import { useEffect, useState } from 'preact/hooks';
import styles from './RatingPrompt.module.css';
import { onAction } from '../lib/actionTrail.ts';
import { markRated, reportRating, shouldAsk, type RatingStorage } from '../lib/ratingReport.ts';
import type { RatingTool, Stars } from '../lib/ratingSchema.ts';
import { STARS } from '../lib/ratingSchema.ts';
import { englishShellMessages, formatMessage, type ShellMessages } from '../i18n/toolMessages';

type RatingMessages = Pick<ShellMessages, 'ratingQuestion' | 'ratingThanks' | 'ratingStarOne' | 'ratingStarOther'>;

function localStore(): RatingStorage | null {
  try {
    return localStorage;
  } catch {
    // expected: blocked storage, nobody is asked
    return null;
  }
}

/** True once a download was recorded on this page (every tool already calls `recordAction('download')`). */
export function useDownloaded(): boolean {
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => onAction((name) => { if (name === 'download') setDownloaded(true); }), []);
  return downloaded;
}

/**
 * SEO-46: one quiet "How did it go?" under a finished download. Shows nothing until a file was
 * downloaded and this device has not rated this tool; one tap sends `{tool, stars}`, remembers
 * it, and swaps to a thanks line in the same box. Never modal, never takes focus.
 */
export default function RatingPrompt({ tool, downloaded, messages = englishShellMessages }: { tool: RatingTool; downloaded: boolean; messages?: RatingMessages }) {
  const [phase, setPhase] = useState<'hidden' | 'asking' | 'thanked'>('hidden');
  useEffect(() => {
    if (downloaded && phase === 'hidden' && shouldAsk(localStore(), tool)) setPhase('asking');
  }, [downloaded, tool]);

  if (phase === 'hidden') return null;

  const rate = (stars: Stars) => {
    reportRating(tool, stars);
    markRated(localStore(), tool);
    setPhase('thanked');
  };

  return (
    <div class={styles.rating} role="group" aria-label={messages.ratingQuestion}>
      {phase === 'asking' ? (
        <>
          <p class={styles.question}>{messages.ratingQuestion}</p>
          <div class={styles.stars}>
            {STARS.map((n) => (
              <button
                key={n}
                type="button"
                class={styles.star}
                aria-label={n === 1 ? messages.ratingStarOne : formatMessage(messages.ratingStarOther, { count: String(n) })}
                onClick={() => rate(n)}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.6l6.1-.8z" />
                </svg>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p class={styles.thanks} role="status">{messages.ratingThanks}</p>
      )}
    </div>
  );
}
