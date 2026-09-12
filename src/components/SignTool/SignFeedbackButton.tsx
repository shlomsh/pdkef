import { Bug } from 'lucide-preact';

// Only static prompts go into the URL; no document text, filename, signature,
// or browser details are collected or attached automatically.
const FEEDBACK_URL = `https://github.com/shlomsh/pdkef/issues/new?${new URLSearchParams({
  title: '[Sign & Fill PDF] Bug report or feedback',
  body: `## What would you like to report or suggest?

Describe your bug, idea, or feedback about the Sign & Fill PDF tool.

## If something went wrong (optional)

- What were you trying to do?
- What happened, and what did you expect?
- How can we reproduce it?

## Helpful details (optional)

Browser and device, the feature involved (text, signatures, shapes, download, etc.), and language or font if relevant.

Please leave out private documents, signatures, and personal information. GitHub issues are public.
`,
})}`;

const FEEDBACK_TITLE = 'Report a bug or share feedback about Sign & Fill PDF (opens GitHub)';

// LOC-09 stage 1: label/title/lang/dir default to this file's own long-standing
// English literals, so any caller that passes none of these (there is
// currently only the one, SignToolbar.tsx, but the defaults keep this
// component safe to mount on its own, e.g. in a test) is unaffected.
// SignToolbar.tsx passes its own catalogue's feedbackButton/feedbackTitle/
// lang/dir from src/i18n/toolMessages.ts's SignMessages.
export default function SignFeedbackButton({
  className,
  labelClassName,
  label = 'Feedback',
  title = FEEDBACK_TITLE,
  lang = 'en',
  dir = 'ltr',
}: {
  className: string;
  labelClassName: string;
  label?: string;
  title?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <a
      className={className}
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={title}
      title={title}
      data-label-priority="1"
      data-optional-control="feedback"
      dir={dir}
      lang={lang}
    >
      <Bug size={18} strokeWidth={2.2} aria-hidden="true" />
      <span className={labelClassName}>{label}</span>
    </a>
  );
}
