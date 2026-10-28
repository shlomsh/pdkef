import { withAffixes } from '../../../lib/output/outputName.ts';

// The name a redacted copy is saved under. One `redacted_` prefix, never chained,
// so exporting an already redacted file keeps its name, and a file saved twice
// before the rule existed (`redacted_redacted_x.pdf`) comes out as `redacted_x.pdf`.
// The first prefix stays as it was written (`Redacted_x.pdf` stays), the repeats go.
export function redactedFileName(name: string): string {
  return withAffixes(name, { prefix: 'redacted_', ext: null, dedupePrefix: true });
}
