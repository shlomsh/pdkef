import { useEffect, useRef, useState } from 'preact/hooks';
import styles from './RatingPrompt.module.css';
import { onAction } from '#lib/telemetry/actionTrail.ts';
import { markAsked, markRated, reportRating, reportRatingComment, shouldAsk, type RatingStorage } from '#lib/telemetry/ratingReport.ts';
import type { RatingTool, Stars } from '#lib/telemetry/ratingSchema.ts';
import { STARS } from '#lib/telemetry/ratingSchema.ts';
import { englishShellMessages, type ShellMessages } from './shellMessages';
import { formatMessage } from '#lib/text/formatMessage.ts';

type RatingMessages = Pick<
  ShellMessages,
  'ratingQuestion' | 'ratingThanksHigh' | 'ratingShare' | 'ratingShareCopied' | 'ratingStarGithub' | 'ratingThanksLow' | 'ratingTellMe' | 'ratingStarOne' | 'ratingStarOther' | 'ratingCommentLabel' | 'ratingCommentSend' | 'ratingCommentThanks'
>;

// Same value as GITHUB_REPO_URL in src/data/organizationSchema.js; src/shell does not import src/data.
const GITHUB_REPO_URL = 'https://github.com/shlomsh/pdkef';
const SHOW_DELAY_MS = 1500;
const FOLLOW_UP_SETTLE_MS = 500;

function localStore(): RatingStorage | null {
  try {
    return localStorage;
  } catch {
    // expected: blocked storage, nobody is asked
    return null;
  }
}

/**
 * True once the person took the result on this page: a download, or a completed share (tools call
 * `recordAction('share')` only once the share sheet reports it shared). On iPhone, Download replaces
 * the page with the PDF, so Share PDF is the moment the ask can actually be seen there.
 */
export function useDownloaded(): boolean {
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => onAction((name) => { if (name === 'download' || name === 'share') setDownloaded(true); }), []);
  return downloaded;
}

function pageUrl(): string {
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  return canonical || location.origin + location.pathname;
}

type Phase = 'hidden' | 'asking' | 'high' | 'low';
type ShareState = 'idle' | 'copied' | 'link';

// The live phase per tool for this page load. A host may move one <RatingPrompt> between tree positions
// (an unmount and a fresh mount); markAsked is already written by then, so without this the ask is lost.
const livePhase = new Map<RatingTool, Phase>();
// The stars tapped, kept the same way so a comment after such a move still carries them.
const liveStars = new Map<RatingTool, Stars>();
const liveCommented = new Set<RatingTool>();
export function resetRatingPromptForTests(): void {
  livePhase.clear();
  liveStars.clear();
  liveCommented.clear();
}

/**
 * SEO-46: a quiet support ask under a finished download. Appears ~1.5s after the first download
 * on a device not asked in the last 14 days; one tap sends `{tool, stars}`, remembers it, and
 * swaps the content inside the same fixed-height row. Never modal, never takes focus.
 */
export default function RatingPrompt({ tool, downloaded, messages = englishShellMessages }: { tool: RatingTool; downloaded: boolean; messages?: RatingMessages }) {
  const [phase, setPhaseState] = useState<Phase>(() => (downloaded ? livePhase.get(tool) : undefined) ?? 'hidden');
  const setPhase = (next: Phase) => {
    livePhase.set(tool, next);
    setPhaseState(next);
  };
  const [stars, setStars] = useState<Stars | null>(() => liveStars.get(tool) ?? null);
  const [commented, setCommented] = useState(() => liveCommented.has(tool));
  const [share, setShare] = useState<ShareState>('idle');
  // When the follow-up was swapped in. On iPhone the same tap that rated was also delivered to the
  // link that took the star's place, so for a moment the follow-up ignores activation.
  const swappedAt = useRef(0);
  const settling = (event: Event): boolean => {
    if (Date.now() - swappedAt.current >= FOLLOW_UP_SETTLE_MS) return false;
    event.preventDefault();
    return true;
  };
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
    swappedAt.current = Date.now();
    liveStars.set(tool, stars);
    setStars(stars);
    setPhase(stars >= 4 ? 'high' : 'low');
  };

  const onShare = async (event: Event) => {
    if (settling(event)) return;
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

  const onComment = (event: Event) => {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).elements.namedItem('comment') as HTMLInputElement;
    if (stars === null || input.value.trim() === '') return;
    // Not sent (too long once encoded, or no beacon): the form stays, so the words are not silently lost.
    if (!reportRatingComment(tool, stars, input.value)) return;
    liveCommented.add(tool);
    setCommented(true);
  };

  const commentForm = commented ? (
    <p class={styles.text} role="status">{messages.ratingCommentThanks}</p>
  ) : (
    <form class={styles.comment} onSubmit={onComment}>
      <input class={styles.commentInput} name="comment" type="text" maxLength={500} aria-label={messages.ratingCommentLabel} placeholder={messages.ratingCommentLabel} />
      <button type="submit" class={`${styles.link} ${styles.action}`} onClick={settling}>{messages.ratingCommentSend}</button>
    </form>
  );

  return (
    <div class={`${styles.rating} ${phase === 'asking' ? '' : styles.followUp}`} role="group" aria-label={messages.ratingQuestion}>
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
        <>
          <p class={styles.text} role="status">{messages.ratingThanksHigh}</p>
          {/* Two separate targets, never adjacent inline text: on a phone a thumb landed on the wrong one. */}
          <div class={styles.actions}>
            {share === 'link' ? (
              <a class={`${styles.link} ${styles.action}`} href={pageUrl()} onClick={settling}>{messages.ratingShare}</a>
            ) : (
              <button type="button" class={`${styles.link} ${styles.action}`} onClick={onShare}>
                {share === 'copied' ? messages.ratingShareCopied : messages.ratingShare}
              </button>
            )}
            <a class={`${styles.link} ${styles.action}`} href={GITHUB_REPO_URL} onClick={settling} target="_blank" rel="noopener noreferrer">{messages.ratingStarGithub}</a>
          </div>
          {commentForm}
        </>
      ) : (
        <>
          <p class={styles.text} role="status">
            {messages.ratingThanksLow}{' '}
            <a class={styles.link} href={`${GITHUB_REPO_URL}/issues`} onClick={settling} target="_blank" rel="noopener noreferrer">{messages.ratingTellMe}</a>
          </p>
          {commentForm}
        </>
      )}
    </div>
  );
}
