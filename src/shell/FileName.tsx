import styles from './FileName.module.css';
import { isRtlPage } from './pageDirection.ts';

/* Direction A, wave 5: a file name that keeps its end. A name cut with a plain
   text-overflow loses whatever sits at its logical end, which for a Hebrew
   tax form is the form number and ".pdf" ("דוח מס הכנסה 2025 טופס 1301.pdf"
   became "…דוח מס הכנסה 2025"). Finder and Explorer cut in the middle
   instead, so the head and the tail both stay: the tail here is the few
   characters before the extension plus the extension, kept whole, and the
   head takes the ellipsis. Each half is `unicode-bidi: plaintext` so mixed
   digits and letters inside it read in their own order.

   The line follows the page. On a left-to-right page the whole name runs left
   to right: the stem resolves its own direction (`dir="auto"`, so a Hebrew stem
   still reads from its right) and ".pdf" follows it on the right, whatever the
   name's script. On a right-to-left page `dir="auto"` on the container takes
   the direction from the name, so a Hebrew name ends on the left, and the
   extension stays in the last run, where it keeps "1301.pdf" together. Every
   place a file is named goes through here (the rail row, the caption, the cell
   tag, the phone chip), so they can never disagree. */
const TAIL_BEFORE_EXTENSION = 5;

export function splitFileName(name: string, options: { extension?: boolean } = {}): { head: string; tail: string; extension: string } {
  const keepExtension = options.extension !== false;
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0 && name.length - dot <= 6;
  const base = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension && keepExtension ? name.slice(dot) : '';
  // Without the extension there is nothing at the end worth keeping whole,
  // and a middle cut in a narrow tag ("In…March") reads worse than an end
  // cut ("Invoice M…"): the tag and the chip take the plain name.
  if (!keepExtension || base.length <= TAIL_BEFORE_EXTENSION + 2) return { head: base, tail: '', extension };
  return { head: base.slice(0, -TAIL_BEFORE_EXTENSION), tail: base.slice(-TAIL_BEFORE_EXTENSION), extension };
}

export default function FileName({ name, className, extension = true }: { name: string; className?: string; extension?: boolean }) {
  const { head, tail, extension: end } = splitFileName(name, { extension });
  const rtlPage = isRtlPage();
  const inLastRun = rtlPage ? end : '';
  return (
    <span class={`${styles.name}${className ? ` ${className}` : ''}`} dir={rtlPage ? 'auto' : 'ltr'} title={name} data-file-name>
      <span class={styles.stem} dir={rtlPage ? undefined : 'auto'}>
        <span class={styles.head}>{tail ? head : head + inLastRun}</span>
        {tail && <span class={styles.tail}>{tail + inLastRun}</span>}
      </span>
      {!rtlPage && end && <span class={styles.extension}>{end}</span>}
    </span>
  );
}
