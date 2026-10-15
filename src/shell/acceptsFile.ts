/**
 * Whether a file matches an `<input accept>` string: comma-separated tokens,
 * each a ".ext", a "type/*" wildcard or an exact MIME type. A picker enforces
 * this itself; a drop or paste does not, so the shell checks it before it asks
 * whether to replace the open file.
 */
export function acceptsFile(file: { name: string; type: string }, accept: string): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith('.')) return name.endsWith(token);
      if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
      return type === token;
    });
}
