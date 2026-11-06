import { useRef, useState } from 'preact/hooks';
import type { RatingTool, Stars } from '#lib/telemetry/ratingSchema.ts';
import { STARS } from '#lib/telemetry/ratingSchema.ts';
import { markRated, reportRating, reportRatingComment, type RatingStorage } from '#lib/telemetry/ratingReport.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { ShellMessages } from './shellMessages';
import { useModalDialog } from './useModalDialog.ts';
import RatingWords, { type RatingWordsMessages } from './RatingWords.tsx';
import dialogStyles from './Dialog.module.css';
import styles from './RatingModal.module.css';

export type RatingModalMessages = Pick<
  ShellMessages,
  | 'ratingModalTitle' | 'ratingModalIntro' | 'ratingNotNow' | 'ratingExplainTitle' | 'ratingExplainBody' | 'ratingExplainLabel' | 'ratingExplainHint'
  | 'ratingBack' | 'ratingSendFailed' | 'ratingThanksTitle' | 'ratingThanksHigh' | 'ratingThanksLowModal' | 'ratingDone'
  | 'ratingShare' | 'ratingShareCopied' | 'ratingStarGithub' | 'ratingCommentSend' | 'ratingStarOne' | 'ratingStarOther'
  | 'ratingHelpPrompt' | 'ratingReportBug' | 'ratingSuggestIdea'
> & RatingWordsMessages;

/** A low rating needs a real reason: this many characters once trimmed, about a short sentence. Send stays off below it. */
const MIN_REASON_LENGTH = 20;

type Step = 'pick' | 'explain' | 'thanks';

/** Beside the reason: a bug or an idea has a place where a person can be answered, which this anonymous box is not. */
function ReasonHelp({ githubUrl, messages }: { githubUrl: string; messages: RatingModalMessages }) {
  return (
    <div class={styles.help}>
      <p class={styles.helpText}>{messages.ratingHelpPrompt}</p>
      <div class={styles.helpLinks}>
        <a class={styles.helpLink} href={`${githubUrl}/issues/new?template=bug_report.md`} target="_blank" rel="noopener noreferrer">{messages.ratingReportBug}</a>
        <a class={styles.helpLink} href={`${githubUrl}/discussions/categories/ideas`} target="_blank" rel="noopener noreferrer">{messages.ratingSuggestIdea}</a>
      </div>
    </div>
  );
}

/**
 * The rating ask as a modal, opened by RatingPrompt after a finished download. Five stars send at once, then may leave words;
 * one to four stars ask what happened first and send the rating and the words together, so a low vote
 * always arrives with its reason. Not now, Escape and the backdrop all leave without sending anything.
 * `showModal()` through useModalDialog, so it also shows over a fullscreen editor.
 */
export default function RatingModal({
  tool,
  messages,
  storage,
  githubUrl,
  onShare,
  shareState,
  shareLink,
  onClose,
}: {
  tool: RatingTool;
  messages: RatingModalMessages;
  storage: RatingStorage | null;
  githubUrl: string;
  onShare: (event: Event) => void;
  shareState: 'idle' | 'copied' | 'link';
  shareLink: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [stars, setStars] = useState<Stars | null>(null);
  const [words, setWords] = useState('');
  const [failed, setFailed] = useState(false);
  useModalDialog(dialogRef, true, onClose, { escape: 'cancel' });

  const pick = (n: Stars) => {
    setStars(n);
    if (n === 5) {
      reportRating(tool, n);
      markRated(storage, tool);
      setStep('thanks');
    } else {
      setStep('explain');
    }
  };

  const send = (event: Event) => {
    event.preventDefault();
    const text = words.trim();
    if (stars === null || text.length < MIN_REASON_LENGTH) return;
    // The words go first: if they cannot be sent the rating stays unsent too, so a low vote never lands without its reason.
    if (!reportRatingComment(tool, stars, text)) {
      setFailed(true);
      return;
    }
    reportRating(tool, stars);
    markRated(storage, tool);
    setFailed(false);
    setStep('thanks');
  };

  const longEnough = words.trim().length >= MIN_REASON_LENGTH;
  const title = step === 'pick' ? messages.ratingModalTitle : step === 'explain' ? messages.ratingExplainTitle : messages.ratingThanksTitle;
  const starLabel = (n: number) => (n === 1 ? messages.ratingStarOne : formatMessage(messages.ratingStarOther, { count: String(n) }));

  return (
    <dialog
      ref={dialogRef}
      class={`${dialogStyles.dialog} ${dialogStyles.narrow}`}
      aria-labelledby="rating-modal-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div class={dialogStyles.header}>
        <h3 id="rating-modal-title">{title}</h3>
      </div>
      <div class={`${dialogStyles.body} ${styles.body}`}>
        {step === 'pick' && (
          <>
            <p class={styles.text}>{messages.ratingModalIntro}</p>
            <div class={styles.stars}>
              {STARS.map((n) => (
                <button key={n} type="button" class={styles.star} aria-label={starLabel(n)} onClick={() => pick(n)}>
                  <svg width="34" height="34" viewBox="0 0 24 24" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.6l6.1-.8z" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 'explain' && (
          <form id="rating-explain" onSubmit={send}>
            <p class={styles.text}>{messages.ratingExplainBody}</p>
            <textarea
              class={styles.words}
              name="words"
              rows={4}
              maxLength={500}
              value={words}
              aria-label={messages.ratingExplainLabel}
              placeholder={messages.ratingExplainLabel}
              onInput={(event) => { setWords((event.currentTarget as HTMLTextAreaElement).value); setFailed(false); }}
            />
            {!longEnough && <p class={styles.hint}>{messages.ratingExplainHint}</p>}
            {failed && <p class={styles.error} role="alert">{messages.ratingSendFailed}</p>}
          </form>
        )}
        {step === 'explain' && <ReasonHelp githubUrl={githubUrl} messages={messages} />}
        {step === 'thanks' && (
          <>
            <p class={styles.text} role="status">{stars === 5 ? messages.ratingThanksHigh : messages.ratingThanksLowModal}</p>
            {stars === 5 && (
              <div class={styles.actions}>
                {shareState === 'link' ? (
                  <a class={styles.link} href={shareLink}>{messages.ratingShare}</a>
                ) : (
                  <button type="button" class={styles.link} onClick={onShare}>
                    {shareState === 'copied' ? messages.ratingShareCopied : messages.ratingShare}
                  </button>
                )}
                <a class={styles.link} href={githubUrl} target="_blank" rel="noopener noreferrer">{messages.ratingStarGithub}</a>
              </div>
            )}
            {stars === 5 && <RatingWords tool={tool} stars={stars} messages={messages} />}
          </>
        )}
      </div>
      <div class={dialogStyles.footer}>
        {step === 'pick' && (
          <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary}`} onClick={onClose}>{messages.ratingNotNow}</button>
        )}
        {step === 'explain' && (
          <>
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary}`} onClick={onClose}>{messages.ratingNotNow}</button>
            <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary}`} onClick={() => setStep('pick')}>{messages.ratingBack}</button>
            <button type="submit" form="rating-explain" class={`${dialogStyles.button} ${dialogStyles.primary} ${styles.send}`} disabled={!longEnough}>{messages.ratingCommentSend}</button>
          </>
        )}
        {step === 'thanks' && (
          <button type="button" class={`${dialogStyles.button} ${dialogStyles.primary}`} onClick={onClose}>{messages.ratingDone}</button>
        )}
      </div>
    </dialog>
  );
}
