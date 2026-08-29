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

export default function SignFeedbackButton({ className, labelClassName }: { className: string; labelClassName: string }) {
  return (
    <a
      className={className}
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={FEEDBACK_TITLE}
      title={FEEDBACK_TITLE}
      data-label-priority="1"
      data-optional-control="feedback"
    >
      <Bug size={18} strokeWidth={2.2} aria-hidden="true" />
      <span className={labelClassName}>Feedback</span>
    </a>
  );
}
