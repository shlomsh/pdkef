/**
 * SITE-42: decides where files picked on the home dropzone go. The toolbar's
 * chooser calls this with the picked files and gets back either one tool to
 * open straight away, a short list of tools to choose from, or the reason
 * nothing can be done with them. Pure on purpose: no DOM, no draft store, so
 * the rule is testable on its own and the toolbar stays a thin renderer.
 */

export type ToolSlug =
  | 'sign' | 'redact' | 'merge' | 'pdf-to-image' | 'image-to-pdf'
  | 'split' | 'compress' | 'compress-image' | 'unlock' | 'edit-pdf';

/** Tools that take a PDF, in src/data/tools.js order. */
export const PDF_TOOLS: readonly ToolSlug[] = ['sign', 'redact', 'merge', 'pdf-to-image', 'split', 'compress', 'unlock', 'edit-pdf'];
/** Tools that take photos. */
export const IMAGE_TOOLS: readonly ToolSlug[] = ['image-to-pdf', 'compress-image'];

export type FileRoute =
  | { kind: 'open'; tool: ToolSlug; files: File[]; skipped: File[] }
  | { kind: 'choose'; tools: ToolSlug[]; files: File[]; skipped: File[] }
  | { kind: 'none'; reason: 'mixed' | 'unsupported'; skipped: File[] };

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isPhoto = (f: File) => f.type === 'image/jpeg' || f.type === 'image/png' || /\.(jpe?g|png)$/i.test(f.name);

export function routeFiles(files: readonly File[]): FileRoute {
  const pdfs: File[] = [];
  const photos: File[] = [];
  const unsupported: File[] = [];
  for (const f of files) (isPdf(f) ? pdfs : isPhoto(f) ? photos : unsupported).push(f);

  if (pdfs.length && photos.length) return { kind: 'none', reason: 'mixed', skipped: unsupported };
  if (!pdfs.length && !photos.length) return { kind: 'none', reason: 'unsupported', skipped: unsupported };

  const picked = pdfs.length ? pdfs : photos;
  if (picked.length > 1) {
    // Merge and Image to PDF are the only tools that take several files.
    return { kind: 'open', tool: pdfs.length ? 'merge' : 'image-to-pdf', files: picked, skipped: unsupported };
  }
  return { kind: 'choose', tools: [...(pdfs.length ? PDF_TOOLS : IMAGE_TOOLS)], files: picked, skipped: unsupported };
}

/** The draft-store hand-off key a tool page collects under. Compress Image is the Compress island in image mode. */
export function handoffKeyFor(slug: string): string {
  return slug === 'compress-image' ? 'compress' : slug;
}
