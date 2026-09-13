import { useEffect, useRef, useState } from 'preact/hooks';
import { renderThumbnail } from '../lib/thumbnails.js';
// Shared with PdfCompressTool.tsx's own kind dispatch: a strict `file.type`
// check here once meant a File with an empty type (some drag sources hand
// one over with no type at all) got no thumbnail even though Compress's own
// extension fallback happily accepted the same file - the two checks had
// drifted apart.
import { deriveFileKind } from '../lib/fileKind.js';
import toolShellStyles from './ToolShell.module.css';
import styles from './FilePreview.module.css';

// Twice the CSS box's desktop size (96px, see `.icon`'s 1024px rule in
// ToolShell.module.css) so the render holds up on a retina screen at the
// size it now actually shows at; renderThumbnail's default is tuned for the
// Merge list's own 150px thumbnails, not this slot. The same render is reused
// at the smaller mobile box too - oversized there, never undersized.
const PDF_PREVIEW_WIDTH = 192;

interface FilePreviewProps {
  file?: File | null;
}

/**
 * The identity row's icon slot: a generic document glyph by default, or -
 * once the tool knows which file is loaded - a real thumbnail of it, so the
 * "a file is loaded" state actually looks like the user's file (Shlomi,
 * 2026-09-12, from the /compress-image/ pass: "the 'armed' user visual is not
 * significant enough. A person who just dropped a photo sees a document icon
 * and a name; nothing on screen looks like their file").
 *
 * Renders inside ToolShell's own `.icon` box (imported here, not redeclared)
 * so the slot never resizes between the glyph and a loaded preview - see
 * `.icon-loaded` in ToolShell.module.css for the loaded-state fill and ring.
 *
 * `image/jpeg` and `image/png` get an instant `URL.createObjectURL`, revoked
 * on change/unmount. `application/pdf` gets a lazy page-1 render via
 * `renderThumbnail` (src/lib/thumbnails.js, which itself lazy-loads pdf.js),
 * kicked off from an effect so it only ever happens after the file has
 * landed. A broken or encrypted PDF rejects that render; the glyph stays -
 * this box must never break the identity row. Anything else (no file, or a
 * type neither branch claims) is the glyph too.
 */
export default function FilePreview({ file }: FilePreviewProps) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setPreviewSrc(null);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!file) return undefined;

    const kind = deriveFileKind(file);

    if (kind === 'image') {
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setPreviewSrc(url);
      return undefined;
    }

    if (kind === 'pdf') {
      let cancelled = false;
      renderThumbnail(file, { width: PDF_PREVIEW_WIDTH })
        .then((dataUrl) => {
          if (!cancelled) setPreviewSrc(dataUrl);
        })
        .catch(() => {
          // Keep the glyph - a preview is a nicety, never a hard requirement.
        });
      return () => {
        cancelled = true;
      };
    }

    return undefined;
  }, [file]);

  // Belt and braces alongside the effect's own per-run cleanup above: the
  // object URL created for one file must not outlive the component even if
  // the very last run never gets a chance to clean up after itself.
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  return (
    <span class={`${toolShellStyles.icon}${previewSrc ? ` ${toolShellStyles['icon-loaded']}` : ''}`} aria-hidden="true">
      {previewSrc ? (
        <img src={previewSrc} alt="" class={styles.thumbnail} />
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 3.5h8l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5A1.5 1.5 0 0 1 6.5 3.5Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <path d="M14 3.5V8a1 1 0 0 0 1 1h4.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
        </svg>
      )}
    </span>
  );
}
