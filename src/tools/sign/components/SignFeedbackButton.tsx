import { Bug } from 'lucide-preact';

// Only static prompts go into the URL; no document text, filename, signature,
// or browser details are collected or attached automatically. FORM-11 adds the
// single exception below, and it is an error name, never document content.
const FEEDBACK_BODY = `## What would you like to report or suggest?

Describe your bug, idea, or feedback about the Sign & Fill PDF tool.

## If something went wrong (optional)

- What were you trying to do?
- What happened, and what did you expect?
- How can we reproduce it?

## Helpful details (optional)

Browser and device, the feature involved (text, signatures, shapes, download, etc.), and language or font if relevant.

Please leave out private documents, signatures, and personal information. GitHub issues are public.
`;

/**
 * The report, plus - only when the on-open form-field check threw - the one
 * sanitised line naming what it threw (FORM-11).
 *
 * This is the whole reason the failure is captured at all. Detection failing
 * is invisible by design (`useFormFieldRegions.ts`), the device it fails on
 * may be one nobody here can reproduce, and asking a person to open a console
 * is asking them not to report it. The line is already safe to publish before
 * it gets here: `formDetectionDetail.ts` keeps an error's message only for the
 * errors the JS engine itself throws and reduces everything a PDF library
 * built to its name, so no label, filename or page text can reach this URL.
 * It is said out loud in the body too, because text appearing in a report
 * somebody is about to publish should never be a surprise.
 *
 * English, like the rest of this template, in every locale: it is the language
 * the repository's issues are written in.
 */
function feedbackUrl(detectionFailure: string | null): string {
  const body = detectionFailure
    ? `${FEEDBACK_BODY}
## Added automatically

The form-field check did not finish on this device. This line is a technical
error name, added by the tool, with nothing from your document in it:

\`\`\`
${detectionFailure}
\`\`\`
`
    : FEEDBACK_BODY;
  return `https://github.com/shlomsh/pdkef/issues/new?${new URLSearchParams({
    title: '[Sign & Fill PDF] Bug report or feedback',
    body,
  })}`;
}

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
  detectionFailure = null,
}: {
  className: string;
  labelClassName: string;
  label?: string;
  title?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl';
  /** FORM-11: one already-sanitised line from `formDetectionDetail.ts`, or
   * null whenever the form-field check ran normally - which is almost always,
   * and is the only state this component had before. */
  detectionFailure?: string | null;
}) {
  return (
    <a
      className={className}
      href={feedbackUrl(detectionFailure)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={title}
      title={title}
      data-icon-only
      data-optional-control="feedback"
      dir={dir}
      lang={lang}
    >
      <Bug size={18} strokeWidth={2.2} aria-hidden="true" />
      <span className={labelClassName}>{label}</span>
    </a>
  );
}
