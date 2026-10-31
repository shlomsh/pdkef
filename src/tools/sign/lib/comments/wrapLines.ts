// SIGN-44: greedy line wrapping for the comments page. Pure: the caller supplies the width measure.

/** Breaks `text` into lines no wider than `maxWidth`: at spaces, keeping explicit newlines, hard-breaking a word that alone is too wide. */
export function wrapLines(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const char of Array.from(word)) {
        if (line && measure(line + char) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
