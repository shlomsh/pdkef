/**
 * SITE-42: decides where files picked on the home dropzone go. The toolbar's
 * chooser calls this with the picked files and gets back either one tool to
 * open straight away, a short list of tools to choose from, or the reason
 * nothing can be done with them. Pure on purpose: no DOM, no draft store, so
 * the rule is testable on its own and the toolbar stays a thin renderer.
 */

import { deriveFileKind } from '../lib/fileKind.js';
import { FILE_CAPABILITIES, handoffKeyOf, type FileKind, type TOOL_PAGES } from '../lib/toolIds.ts';

/**
 * The pages the home dropzone can route a file to: the registry rows that declare `accepts`.
 * @testSeam
 */
export type ToolSlug = Extract<(typeof TOOL_PAGES)[number], { accepts: object }>['slug'];

type Kind = FileKind;

/** What each tool takes, in src/data/tools.js order: the kinds of file, and whether it takes several.
    Merge takes photos too, but the toolbar offers it for photos only alongside a PDF: photos alone
    belong to Image to PDF, which says what the person came to do (Shlomi, 2026-10-12).
    The data is the registry's `accepts` (src/lib/toolIds.ts). */
const CAPABILITIES = FILE_CAPABILITIES as readonly { slug: ToolSlug; kinds: readonly Kind[]; several: boolean; needsPdf?: boolean }[];

export type FileRoute =
  | { kind: 'open'; tool: ToolSlug; files: File[]; skipped: File[] }
  | { kind: 'choose'; tools: ToolSlug[]; files: File[]; skipped: File[] }
  | { kind: 'none'; reason: 'unsupported'; skipped: File[] };

export function routeFiles(files: readonly File[]): FileRoute {
  const kinds = new Set<Kind>();
  const picked: File[] = [];
  const skipped: File[] = [];
  for (const f of files) {
    const kind = deriveFileKind(f);
    if (kind) { kinds.add(kind); picked.push(f); } else skipped.push(f);
  }
  if (!picked.length) return { kind: 'none', reason: 'unsupported', skipped };

  const fitting = CAPABILITIES
    .filter(c => [...kinds].every(k => c.kinds.includes(k)) && (c.several || picked.length === 1)
      && (!c.needsPdf || kinds.has('pdf')))
    .map(c => c.slug);
  if (fitting.length === 1) return { kind: 'open', tool: fitting[0], files: picked, skipped };
  return { kind: 'choose', tools: fitting, files: picked, skipped };
}

/** The draft-store hand-off key a tool page collects under: its island's id (src/data/tools.js `toolId`).
    Compress Image is the Compress island in image mode, but rates and reports as itself, so it keeps its own toolId. */
export function handoffKeyFor(slug: string): string {
  return handoffKeyOf(slug);
}
