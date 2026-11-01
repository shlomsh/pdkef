// READ-06: the paper is the page. Without a size the browser prints each sheet on its default paper and the
// rest of that paper is a blank margin. Pure: sheet sizes in points in, @page rules and one page name per sheet out.

interface Size { width: number; height: number }

const round = (n: number) => Math.round(n * 100) / 100;

export function pageSizes(sheets: readonly Size[]): { names: string[]; rules: string[] } {
  if (sheets.length === 0) return { names: [], rules: [] };
  const rule = (name: string, s: Size) => `@page ${name ? `${name} ` : ''}{ size: ${round(s.width)}pt ${round(s.height)}pt; margin: 0; }`;
  const keys: string[] = [];
  const names = sheets.map((s) => {
    const key = `${round(s.width)}x${round(s.height)}`;
    if (!keys.includes(key)) keys.push(key);
    return `pdkef-sheet-${keys.indexOf(key)}`;
  });
  const firstOf = (i: number) => sheets[names.indexOf(`pdkef-sheet-${i}`)];
  return { names, rules: [rule('', sheets[0]), ...keys.map((_, i) => rule(`pdkef-sheet-${i}`, firstOf(i)))] };
}
