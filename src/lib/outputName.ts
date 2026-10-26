import { sanitizeOutputName } from './sanitizeOutputName.ts';

/**
 * ARCH-38: the one place a tool's output file name is built from its source's name. Eight tools used
 * to carry a copy of the base-name regex each, in six conventions (`merged_x`, `extracted_x`,
 * `x-compressed`, `x_modified`, `x_unlocked`, `signed_x`). Which convention is right is the product
 * owner's open question (docs/architecture-debt-review-2026-10-26.md); this helper keeps every name
 * byte-identical to what shipped and is pinned by src/test/cross-tool/outputNames.test.ts, so the
 * day he decides it is one edit here.
 *
 * The strip modes are the old regexes, kept apart only where they gave different names for an odd
 * input (a bare ".pdf", "a.", ".hidden"); they collapse when a convention is picked.
 */
export type StripMode =
  /** Drop a trailing ".pdf" (any case) and nothing else. */
  | 'pdf'
  /** Drop the last extension: a dot followed by at least one character. */
  | 'extension'
  /** Drop the last extension, or a bare trailing dot ("a." becomes "a"). */
  | 'extension-or-bare-dot'
  /** Drop everything from the last dot, unless that dot starts the name (".hidden" stays). */
  | 'extension-keep-dotfile';

export function stripExtension(name: string, mode: StripMode): string {
  switch (mode) {
    case 'pdf':
      return name.replace(/\.pdf$/i, '');
    case 'extension':
      return name.replace(/\.[^./\\]+$/, '');
    case 'extension-or-bare-dot':
      return name.replace(/\.[^./\\]*$/, '');
    case 'extension-keep-dotfile': {
      const lastDot = name.lastIndexOf('.');
      return lastDot <= 0 ? name : name.slice(0, lastDot);
    }
  }
}

export interface OutputBaseOptions {
  strip?: StripMode;
  /** Typed-name rules (no path separators or "+", no control characters, capped length), for names that may be typed too. */
  sanitize?: boolean;
  /** Used when nothing is left of the name. */
  fallback?: string;
}

/** The source's name without its extension: what every output name is built around. */
export function outputBase(sourceName: string, { strip = 'pdf', sanitize = false, fallback = '' }: OutputBaseOptions = {}): string {
  const stripped = stripExtension(sourceName, strip);
  return (sanitize ? sanitizeOutputName(stripped) : stripped) || fallback;
}

export interface AffixOptions {
  prefix?: string;
  suffix?: string;
  /** The file extension without the dot; 'pdf' by default, null for a title that has none yet. */
  ext?: string | null;
  /** Collapse a run of repeated prefixes at the start of the base into the first, as written ("redacted_redacted_x" is "redacted_x"). */
  dedupePrefix?: boolean;
}

/** `<prefix><base><suffix>.<ext>`: the one shape every convention is a choice of. */
export function withAffixes(base: string, { prefix = '', suffix = '', ext = 'pdf', dedupePrefix = false }: AffixOptions = {}): string {
  let name = base;
  let lead = prefix;
  if (dedupePrefix && prefix) {
    const run = name.match(new RegExp(`^(?:${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})+`, 'i'))?.[0];
    if (run) {
      lead = name.slice(0, prefix.length);
      name = name.slice(run.length);
    }
  }
  return `${lead}${name}${suffix}${ext === null ? '' : `.${ext}`}`;
}

/** Source name to output name in one call: `outputBase` then `withAffixes`. */
export function outputName(sourceName: string, options: OutputBaseOptions & AffixOptions = {}): string {
  const { strip, sanitize, fallback, ...affixes } = options;
  return withAffixes(outputBase(sourceName, { strip, sanitize, fallback }), affixes);
}
