import { useEffect, useState } from 'preact/hooks';
import styles from './RatingPrompt.module.css';
import { onAction } from '../lib/actionTrail.ts';
import { markAsked, markRated, reportRating, shouldAsk, type RatingStorage } from '../lib/ratingReport.ts';
import type { RatingTool, Stars } from '../lib/ratingSchema.ts';
import { STARS } from '../lib/ratingSchema.ts';
import { englishShellMessages, formatMessage, type ShellMessages } from '../i18n/toolMessages';

type RatingMessages = Pick<
  ShellMessages,
  'ratingQuestion' | 'ratingThanksHigh' | 'ratingShare' | 'ratingShareCopied' | 'ratingStarGithub' | 'ratingThanksLow' | 'ratingTellMe' | 'ratingStarOne' | 'ratingStarOther'
>;

// Same value as GITHUB_REPO_URL in src/data/organizationSchema.js; src/shell does not import src/data.
const GITHUB_REPO_URL = 'https://github.com/shlomsh/pdkef';
const SHOW_DELAY_MS = 1500;

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

function pageUrl(): string {
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  return canonical || location.origin + location.pathname;
}

type Phase = 'hidden' | 'asking' | 'high' | 'low';
type ShareState = 'idle' | 'copied' | 'link';

/**
 * SEO-46: a quiet support ask under a finished download. Appears ~1.5s after the first download
 * on a device not asked in the last 14 days; one tap sends `{tool, stars}`, remembers it, and
 * swaps the content inside the same fixed-height row. Never modal, never takes focus.
 */
export default function RatingPrompt({ tool, downloaded, messages = englishShellMessages }: { tool: RatingTool; downloaded: boolean; messages?: RatingMessages }) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [share, setShare] = useState<ShareState>('idle');
  useEffect(() => {
    if (!downloaded || phase !== 'hidden') return;
    const timer = setTimeout(() => {
      const store = localStore();
      const now = Date.now();
      if (!shouldAsk(store, tool, now)) return;
      markAsked(store, now);
      setPhase('asking');
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [downloaded, tool]);

  if (phase === 'hidden') return null;

  const rate = (stars: Stars) => {
    reportRating(tool, stars);
    markRated(localStore(), tool);
    setPhase(stars >= 4 ? 'high' : 'low');
  };

  const onShare = async () => {
    const url = pageUrl();
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: document.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShare('copied');
      setTimeout(() => setShare('idle'), 2500);
    } catch {
      // expected: a dismissed share sheet rejects with AbortError; with no share and no clipboard we offer a plain link
      if (typeof navigator.share !== 'function') setShare('link');
    }
  };

  return (
    <div class={styles.rating} role="group" aria-label={messages.ratingQuestion}>
      {phase === 'asking' ? (
        <>
          <p class={styles.text}>{messages.ratingQuestion}</p>
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
      ) : phase === 'high' ? (
        <p class={styles.text} role="status">
          {messages.ratingThanksHigh}{' '}
          {share === 'link' ? (
            <a class={styles.link} href={pageUrl()}>{messages.ratingShare}</a>
          ) : (
            <button type="button" class={styles.link} onClick={onShare}>
              {share === 'copied' ? messages.ratingShareCopied : messages.ratingShare}
            </button>
          )}{' '}
          <a class={styles.link} href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">{messages.ratingStarGithub}</a>
        </p>
      ) : (
        <p class={styles.text} role="status">
          {messages.ratingThanksLow}{' '}
          <a class={styles.link} href={`${GITHUB_REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">{messages.ratingTellMe}</a>
        </p>
      )}
    </div>
  );
}
