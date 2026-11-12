import { Bug } from 'lucide-preact';

// Only static prompts go into the URL; no document text, filename, signature,
// or browser details are collected or attached automatically. FORM-11 adds the
// single exception below, and it is an error name, never document content.
// Each tool brings its own issue template (`tool.body`); this file only places it.

/** What a tool says about itself: its name (issue title, tooltip) and its issue template. */
interface FeedbackTool {
  name: string;
  body: string;
}

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
export function feedbackUrl(tool: FeedbackTool, detectionFailure: string | null): string {
  const body = detectionFailure
    ? `${tool.body}
## Added automatically

The form-field check did not finish on this device. This line is a technical
error name, added by the tool, with nothing from your document in it:

\`\`\`
${detectionFailure}
\`\`\`
`
    : tool.body;
  return `https://github.com/shlomsh/pdkef/issues/new?${new URLSearchParams({
    title: `[${tool.name}] Bug report or feedback`,
    body,
  })}`;
}


// LOC-09 stage 1: label/title/lang/dir default to English literals, so a caller
// that passes none of them is unaffected. Sign passes its catalogue's strings.
export default function FeedbackButton({
  tool,
  className,
  labelClassName,
  label = 'Feedback',
  title = `Report a bug or share feedback about ${tool.name} (opens GitHub)`,
  lang = 'en',
  dir = 'ltr',
  detectionFailure = null,
}: {
  tool: FeedbackTool;
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
      href={feedbackUrl(tool, detectionFailure)}
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
