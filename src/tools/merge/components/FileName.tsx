import styles from './FileName.module.css';

/* Direction A, wave 5: a file name that keeps its end. A name cut with a plain
   text-overflow loses whatever sits at its logical end, which for a Hebrew
   tax form is the form number and ".pdf" ("דוח מס הכנסה 2025 טופס 1301.pdf"
   became "…דוח מס הכנסה 2025"). Finder and Explorer cut in the middle
   instead, so the head and the tail both stay: the tail here is the
   extension plus the few characters before it, kept whole, and the head
   takes the ellipsis. `dir="auto"` on the container resolves the direction
   from the name's own first strong character, so a Hebrew name lays its
   tail out on the left and an English one on the right, and each half is
   `unicode-bidi: plaintext` so mixed digits and letters inside it read in
   their own order. Every place a merge file is named goes through here (the
   rail row, the caption, the cell tag, the phone chip), so the four can
   never disagree. */
const TAIL_BEFORE_EXTENSION = 5;

export function splitFileName(name: string, options: { extension?: boolean } = {}): { head: string; tail: string } {
  const keepExtension = options.extension !== false;
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0 && name.length - dot <= 6;
  const base = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension && keepExtension ? name.slice(dot) : '';
  // Without the extension there is nothing at the end worth keeping whole,
  // and a middle cut in a narrow tag ("In…March") reads worse than an end
  // cut ("Invoice M…"): the tag and the chip take the plain name.
  if (!keepExtension || base.length <= TAIL_BEFORE_EXTENSION + 2) return { head: base + extension, tail: '' };
  return { head: base.slice(0, -TAIL_BEFORE_EXTENSION), tail: base.slice(-TAIL_BEFORE_EXTENSION) + extension };
}

export default function FileName({ name, className, extension = true }: { name: string; className?: string; extension?: boolean }) {
  const { head, tail } = splitFileName(name, { extension });
  return (
    <span class={`${styles.name}${className ? ` ${className}` : ''}`} dir="auto" title={name}>
      <span class={styles.head}>{head}</span>
      {tail && <span class={styles.tail}>{tail}</span>}
    </span>
  );
}
