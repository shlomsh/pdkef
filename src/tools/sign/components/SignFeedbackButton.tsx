import { feedbackUrl } from '#editor-ui/FeedbackButton.tsx';

/** Sign's issue template for the Feedback link. Static prompts only (see FeedbackButton). */
const SIGN_FEEDBACK = {
  name: 'Sign & Fill PDF',
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
};

/** The prefilled GitHub issue address, for a link that is not the button (the form-field status line). */
export function signFeedbackUrl(detectionFailure: string | null): string {
  return feedbackUrl(SIGN_FEEDBACK, detectionFailure);
}
