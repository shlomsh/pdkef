// The name a redacted copy is saved under. One `redacted_` prefix, never chained,
// so exporting an already redacted file keeps its name.
const PREFIX = 'redacted_';

export function redactedFileName(name: string): string {
  return name.toLowerCase().startsWith(PREFIX) ? name : `${PREFIX}${name}`;
}
