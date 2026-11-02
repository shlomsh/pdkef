import { outputBase } from './outputName.ts';

export interface OutputNameParts {
  /** The fixed lead the tool puts before the name (`signed_`), shown but not editable. */
  prefix: string;
  /** The editable part: the source's own name, or what the person typed in its place. */
  base: string;
  /** What Download saves it as: `<prefix><base>.pdf`. */
  fileName: string;
}

/** The leading run of repeated `prefix` copies in `text`, as written ('' when there is none). */
function prefixRun(text: string, prefix: string): string {
  if (!prefix) return '';
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`^(?:${escaped})+`, 'i'))?.[0] ?? '';
}

const withoutPrefixRun = (text: string, prefix: string) => text.slice(prefixRun(text, prefix).length);

/**
 * The one answer to "what is this tool's output called": a fixed prefix plus an editable base that
 * falls back to the source's name. `dedupePrefix` keeps a source that already starts with the prefix
 * from chaining it (`redacted_x` stays `redacted_x`); the first prefix stays as it was written.
 */
export function outputNameParts(sourceName: string, { prefix, custom = null, dedupePrefix = false }: {
  prefix: string;
  custom?: string | null;
  dedupePrefix?: boolean;
}): OutputNameParts {
  let lead = prefix;
  let base = outputBase(sourceName);
  const run = dedupePrefix ? prefixRun(base, prefix) : '';
  if (run) {
    lead = base.slice(0, prefix.length);
    base = base.slice(run.length);
  }
  if (custom !== null) {
    lead = prefix;
    base = dedupePrefix ? withoutPrefixRun(custom, prefix) : custom;
  }
  return { prefix: lead, base, fileName: `${lead}${base}.pdf` };
}
