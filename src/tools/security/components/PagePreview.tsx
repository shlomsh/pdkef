import { useEffect, useRef, useState } from 'preact/hooks';
import { FileText, Lock } from 'lucide-preact';
import { reportError } from '#lib/telemetry/errorReport.ts';
import styles from '../PdfSecurityTool.module.css';
import type { planPreview } from '../lib/previewPlan.js';

type Plan = NonNullable<ReturnType<typeof planPreview>>;

/**
 * Page 1 of `source` as a data URL. The previous image stays until the next one lands (or the next
 * render fails and there is none to keep), so a source change never blinks the page away. `busy` is
 * true from a source change until its render settles. `quiet()` says a failure is already reported.
 */
function usePageImage(source: Blob | null, quiet: () => boolean): { image: string | null; busy: boolean } {
  const [image, setImage] = useState<string | null>(null);
  const [settled, setSettled] = useState<Blob | null>(null);
  useEffect(() => {
    if (!source) {
      setImage(null);
      setSettled(null);
      return undefined;
    }
    let current = true;
    (async () => {
      try {
        const { renderComparePreview } = await import('#lib/pdf/thumbnails.js');
        const url = await renderComparePreview(source);
        if (current) { setImage(url); setSettled(source); }
      } catch (err) {
        // The old image or the placeholder stays; the preview is never worth an error in the person's way.
        if (!current) return;
        if (!quiet()) reportError('pdf_render', err, 'render_security_preview');
        setSettled(source);
      }
    })();
    return () => { current = false; };
  }, [source]);
  return { image, busy: source !== null && settled !== source };
}

/** The loaded state's centre: the document's first page on a sunken ground, with a small tag for its state. */
export default function PagePreview({ plan, source, failed = false, pending = false, label }: {
  plan: Plan;
  source: Blob | null;
  /** The tool's own run failed for this file: a preview failure is the same fault, not a second report. */
  failed?: boolean;
  /** No source yet because the file is still being checked. */
  pending?: boolean;
  /** The section's accessible name. */
  label: string;
}) {
  const failedRef = useRef(failed);
  failedRef.current = failed;
  const { image, busy: rendering } = usePageImage(source, () => failedRef.current);
  const busy = rendering || pending;
  return (
    <section class={styles.result} data-security-preview aria-label={label}>
      <span class={styles.tag} data-preview-tag>
        {plan.protectedDone && <Lock size={12} aria-hidden="true" />}
        {plan.tag}
      </span>
      <div class={styles.frame} data-page-frame aria-busy={busy ? 'true' : undefined}>
        {image ? (
          <img class={styles.page} src={image} alt="" />
        ) : (
          <div class={`${styles.placeholder}${busy ? ` ${styles.pulse}` : ''}`} aria-hidden="true">
            {plan.locked ? <Lock size={48} /> : <FileText size={48} />}
          </div>
        )}
      </div>
    </section>
  );
}
