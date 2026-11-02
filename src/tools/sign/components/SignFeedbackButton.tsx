import FeedbackButton from '#editor-ui/FeedbackButton.tsx';
import type { ComponentProps } from 'preact';

/** Sign's issue template for the shared Feedback button. Static prompts only (see FeedbackButton). */
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

/** The shared Feedback button, with Sign's name and issue template. */
export default function SignFeedbackButton(props: Omit<ComponentProps<typeof FeedbackButton>, 'tool'>) {
  return <FeedbackButton tool={SIGN_FEEDBACK} {...props} />;
}
