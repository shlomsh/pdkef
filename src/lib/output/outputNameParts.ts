import { outputBase } from './outputName.ts';

export interface OutputNameParts {
  /** The fixed lead the tool puts before the name (`signed_`), shown but not editable. */
  prefix: string;
  /** The editable part: the source's own name, or what the person typed in its place. */
  base: string;
  /** What Download saves it as: `<prefix><base>.pdf`. */
  fileName: string;
}

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
  if (dedupePrefix && prefix) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const run = base.match(new RegExp(`^(?:${escaped})+`, 'i'))?.[0];
    if (run) {
      lead = base.slice(0, prefix.length);
      base = base.slice(run.length);
    }
  }
  if (custom !== null) {
    lead = prefix;
    base = custom;
  }
  return { prefix: lead, base, fileName: `${lead}${base}.pdf` };
}
