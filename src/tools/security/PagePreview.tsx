import { useEffect, useState } from 'preact/hooks';
import { Lock } from 'lucide-preact';
import { reportError } from '../../lib/errorReport.ts';
import styles from './PdfSecurityTool.module.css';
import type { planPreview } from './previewPlan.js';

type Plan = NonNullable<ReturnType<typeof planPreview>>;

/** Page 1 of `source` as a data URL, or null while it is not drawn (or could not be). A stale render is dropped. */
function usePageImage(source: Blob | null): string | null {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    setImage(null);
    if (!source) return undefined;
    let current = true;
    (async () => {
      try {
        const { renderComparePreview } = await import('../../lib/thumbnails.js');
        const url = await renderComparePreview(source);
        if (current) setImage(url);
      } catch (err) {
        // The placeholder stays; the preview is never worth an error in the person's way.
        if (current) reportError('pdf_tool_run', err, 'security_preview');
      }
    })();
    return () => { current = false; };
  }, [source]);
  return image;
}

/** The loaded state's centre: the document's first page on a sunken ground, with a small tag for its state. */
export default function PagePreview({ plan, source }: { plan: Plan; source: Blob | null }) {
  const image = usePageImage(source);
  return (
    <section class={styles.result} data-security-preview aria-label="First page">
      <span class={styles.tag} data-preview-tag>
        {plan.protectedDone && <Lock size={12} aria-hidden="true" />}
        {plan.tag}
      </span>
      {image ? (
        <img class={styles.page} src={image} alt="" />
      ) : (
        <div class={`${styles.page} ${styles.placeholder}`} aria-hidden="true">
          {plan.locked && <Lock size={48} />}
        </div>
      )}
    </section>
  );
}
