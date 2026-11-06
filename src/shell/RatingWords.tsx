import { useState } from 'preact/hooks';
import type { RatingTool, Stars } from '#lib/telemetry/ratingSchema.ts';
import { reportRatingComment } from '#lib/telemetry/ratingReport.ts';
import type { ShellMessages } from './shellMessages';
import dialogStyles from './Dialog.module.css';
import styles from './RatingModal.module.css';

export type RatingWordsMessages = Pick<
  ShellMessages,
  'ratingWordsLabel' | 'ratingWordsPlaceholder' | 'ratingWordsShare' | 'ratingCommentSend' | 'ratingCommentThanks' | 'ratingSendFailed'
>;

/**
 * Optional words after a high rating (SEO-56). The stars have already gone, so leaving sends nothing more.
 * The words stay private unless the person ticks the box; only a tick puts `share` on the wire.
 */
export default function RatingWords({ tool, stars, messages }: { tool: RatingTool; stars: Stars; messages: RatingWordsMessages }) {
  const [words, setWords] = useState('');
  const [share, setShare] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = (event: Event) => {
    event.preventDefault();
    const ok = reportRatingComment(tool, stars, words, share);
    setSent(ok);
    setFailed(!ok);
  };

  if (sent) return <p class={styles.text} role="status">{messages.ratingCommentThanks}</p>;

  return (
    <form class={styles.form} onSubmit={send}>
      <label class={styles.label}>
        {messages.ratingWordsLabel}
        <textarea
          class={styles.words}
          name="words"
          rows={3}
          maxLength={500}
          value={words}
          placeholder={messages.ratingWordsPlaceholder}
          onInput={(event) => { setWords((event.currentTarget as HTMLTextAreaElement).value); setFailed(false); }}
        />
      </label>
      <label class={styles.consent}>
        <input type="checkbox" name="share" checked={share} onChange={(event) => setShare((event.currentTarget as HTMLInputElement).checked)} />
        <span>{messages.ratingWordsShare}</span>
      </label>
      {failed && <p class={styles.error} role="alert">{messages.ratingSendFailed}</p>}
      <button type="submit" class={`${dialogStyles.button} ${dialogStyles.secondary} ${styles.send}`} disabled={words.trim() === ''}>{messages.ratingCommentSend}</button>
    </form>
  );
}
