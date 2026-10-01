// The name a redacted copy is saved under. One `redacted_` prefix, never chained,
// so exporting an already redacted file keeps its name, and a file saved twice
// before the rule existed (`redacted_redacted_x.pdf`) comes out as `redacted_x.pdf`.
const PREFIX = 'redacted_';
const PREFIXES = /^(?:redacted_)+/i;

export function redactedFileName(name: string): string {
  const run = name.match(PREFIXES)?.[0];
  // Keep the first prefix as it was written (`Redacted_x.pdf` stays), drop the repeats.
  return run ? name.slice(0, PREFIX.length) + name.slice(run.length) : `${PREFIX}${name}`;
}
