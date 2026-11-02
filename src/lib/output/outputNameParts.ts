import { outputBase } from './outputName.ts';

export interface OutputNameParts {
  /** The whole editable name, without the extension: the default (`signed_<source>`) or what the person typed in its place. */
  name: string;
  /** What Download saves it as: `<name>.pdf`. */
  fileName: string;
}

/**
 * The one answer to "what is this tool's output called". The prefix is only part of the default: until the
 * person types a name of their own it is `<prefix><source's name>`, and a typed name replaces all of it.
 * `dedupePrefix` keeps a source that already starts with the prefix from chaining it (`redacted_x` stays
 * `redacted_x`); the first prefix stays as it was written.
 */
export function outputNameParts(sourceName: string, { prefix, custom = null, dedupePrefix = false }: {
  prefix: string;
  custom?: string | null;
  dedupePrefix?: boolean;
}): OutputNameParts {
  const base = outputBase(sourceName);
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const run = dedupePrefix && prefix ? base.match(new RegExp(`^(?:${escaped})+`, 'i'))?.[0] : undefined;
  const name = custom ?? (run ? base.slice(0, prefix.length) + base.slice(run.length) : prefix + base);
  return { name, fileName: `${name}.pdf` };
}
